// Rebuilds the on-chain escrow table in EVIDENCE_TABLE.md directly from Stellar Testnet.
//
//   node scripts/index_escrows.mjs            -> prints the markdown table
//   node scripts/index_escrows.mjs --write    -> replaces the traction and escrow tables in EVIDENCE_TABLE.md
//                                                and src/data/onchainEscrows.json (run it weekly)
//
// Sources (no app data, nothing hand-entered):
//   - GigPayEscrow.get_task(id) for each escrow: client, freelancer, amount, is_approved
//   - Horizon operations of every client wallet: successful fund_task / approve_task calls
// fund_task increments one global counter, so the Nth successful fund_task (by ledger order) created escrow #N.
// Where Soroban RPC still has the transaction, its return value is used to cross-check that mapping.

import * as S from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTRACT_ID = 'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3';
const READ_SOURCE = 'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3'; // any funded account works for read-only simulation
const rpc = new S.rpc.Server('https://soroban-testnet.stellar.org');
const hz = new S.Horizon.Server('https://horizon-testnet.stellar.org');

// Wallet classes (see src/lib/ledgerIntegrity.js for the reasoning behind each list)
const TEAM = {
  GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3: 'team default freelancer wallet',
  GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E: 'team QA client wallet',
  GCBXZSKNCLTKTVRHBRZ2XCTFDVNHSBF3G6CIPLBRCK2XBXIGPQY5RBRN: "founder's wallet",
  // Practice wallets on a team device (escrows #41-#46, Nov 5, 2026): team testing, not users.
  GDC2RIYOYD6A45E27FG5CAVHVPUN6URQDJLYBSBZDK7HMVG3JZSDOPAE: 'team device practice wallet (client)',
  GBX7C2H7IN3SRUQ5BWEC4IDXWNARPKVQVY5UTGURKPTZRF2N3P4YT6RI: 'team device practice wallet (freelancer)',
  // Testnet funding pool (fund-practice-wallet Edge Function). It only creates practice wallets.
  GAG74N2WUFBRSUP5JXQGGNZYO7VH73C72CZ3JTNEJDPICLWM7MNODYPZ: 'team Testnet funding pool'
};
const SCRIPTED = new Set([
  'GCACSSN7J2Q2ZKHHLQ2H33T6KDFNJAWTPOBWXH6PI4KDQ3ZAA77XV5VF', 'GBU2Y6WMLM37IPDJND7LBRZC4LAQYM6HS5LL5RSYCBM4OBUVQUSDMK3Q',
  'GCXDBNYDOJXS2IMQXEWHHFGIQCIMJWJEAD425K5EGLWQDP5KPP6AK3CU', 'GBI3QOLKJIHWCV5TDNHKKRR3JBN3OSRAAGEEDBMLYKWWVUEEVVL764S6',
  'GA3LTMJQEJYWEFPGVFRQBTG4ELFXYD2ATQAD2YB5FEECTBG7TCQQQRLJ', 'GA4L5IVCI3GQKQ3WKYUTAWYJPXLHR5E2BWJKD7SY2UO3B5XTPK5I2DKK',
  'GBCRI6UZHCPBA5HDIYQGHJNQH5APJP2R2JDK6DS75JJFKQCWH2CSUDXI', 'GDPGW5LDS2JBFWMLZUQBJUBIYAGAXBQXQPJBMDL2NYDPVMZ7CI3ZRHHK'
]);

const classify = (t) => {
  if (SCRIPTED.has(t.client) || SCRIPTED.has(t.freelancer)) return 'Scripted test (Nov 3, 2026)';
  if (TEAM[t.client] && TEAM[t.freelancer]) return `Team test (${TEAM[t.client]} → ${TEAM[t.freelancer]})`;
  if (TEAM[t.freelancer]) return 'Pays team wallet (test)';
  if (TEAM[t.client]) return `Team test (${TEAM[t.client]})`;
  return 'Outside wallet';
};

const short = (h) => `${h.slice(0, 10)}…`;
const txLink = (h) => (h ? `[\`${short(h)}\`](https://stellar.expert/explorer/testnet/tx/${h})` : '—');
const acct = (a) => `[\`${a.slice(0, 8)}…\`](https://stellar.expert/explorer/testnet/account/${a})`;

const source = await hz.loadAccount(READ_SOURCE);
const getTask = async (id) => {
  const tx = new S.TransactionBuilder(source, { fee: '100', networkPassphrase: S.Networks.TESTNET })
    .addOperation(new S.Contract(CONTRACT_ID).call('get_task', S.nativeToScVal(id, { type: 'u32' })))
    .setTimeout(30).build();
  const r = await rpc.simulateTransaction(tx);
  return S.rpc.Api.isSimulationError(r) ? null : S.scValToNative(r.result.retval);
};

const tasks = [];
for (let id = 1; ; id++) {
  const t = await getTask(id);
  if (!t) break;
  tasks.push({ id, client: t.client, freelancer: t.freelancer, amount: Number(t.amount) / 1e7, approved: t.is_approved });
}

const funds = [];
const approves = {};
for (const client of [...new Set(tasks.map((t) => t.client))]) {
  let page = await hz.operations().forAccount(client).order('asc').limit(200).call();
  while (page.records.length) {
    for (const op of page.records) {
      if (op.type !== 'invoke_host_function' || !op.transaction_successful) continue;
      let fn = null; let args = [];
      try {
        fn = S.scValToNative(S.xdr.ScVal.fromXDR(op.parameters[1].value, 'base64'));
        args = op.parameters.slice(2).map((p) => S.scValToNative(S.xdr.ScVal.fromXDR(p.value, 'base64')));
      } catch { continue; }
      if (fn === 'fund_task') funds.push({ hash: op.transaction_hash, at: op.created_at, pt: BigInt(op.paging_token), client });
      if (fn === 'approve_task') { const id = Number(args[0]); approves[id] ??= { hash: op.transaction_hash, at: op.created_at }; }
    }
    page = await page.next();
  }
}
funds.sort((a, b) => (a.pt < b.pt ? -1 : a.pt > b.pt ? 1 : 0));
if (funds.length !== tasks.length) throw new Error(`fund_task calls (${funds.length}) != escrows (${tasks.length}); index incomplete`);

let rpcChecked = 0;
tasks.forEach((t, i) => {
  if (funds[i].client !== t.client) throw new Error(`escrow #${t.id}: funding wallet mismatch`);
  t.fund = funds[i];
  t.release = approves[t.id] || null;
  t.kind = classify(t);
});
for (const t of tasks) {
  // Independent check: the fund tx must have moved exactly this escrow's amount out of the client wallet.
  const ops = await hz.operations().forTransaction(t.fund.hash).call();
  const moved = (ops.records[0].asset_balance_changes || [])
    .filter((c) => c.from === t.client).reduce((s, c) => s + Number(c.amount), 0);
  if (Math.abs(moved - t.amount) > 1e-7) throw new Error(`escrow #${t.id}: fund tx moved ${moved} XLM, escrow holds ${t.amount}`);
}
for (const t of tasks) {
  const tx = await rpc.getTransaction(t.fund.hash).catch(() => null);
  if (tx?.returnValue) {
    if (Number(S.scValToNative(tx.returnValue)) !== t.id) throw new Error(`escrow #${t.id}: RPC return value disagrees`);
    rpcChecked++;
  }
}

const outside = tasks.filter((t) => t.kind === 'Outside wallet');
// Rounded to 7 decimals (stroops): plain float sums printed "2587.2999999999997 XLM".
const sum = (xs) => Number(xs.reduce((s, t) => s + t.amount, 0).toFixed(7));
const generated = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

const lines = [];
lines.push(`<!-- BEGIN GENERATED ESCROW TABLE (scripts/index_escrows.mjs) -->`);
lines.push(`_Generated ${generated} from Stellar Testnet. ${tasks.length} escrows. Every funding transaction is matched to its escrow by ledger order and verified to have moved exactly that escrow's amount; ${rpcChecked} are also confirmed by the contract's return value on Soroban RPC._`);
lines.push('');
lines.push(`| | Count | Amount |`);
lines.push(`|:---|:---:|:---:|`);
for (const k of [...new Set(tasks.map((t) => t.kind))]) {
  const xs = tasks.filter((t) => t.kind === k);
  lines.push(`| ${k} | ${xs.length} | ${sum(xs)} XLM |`);
}
lines.push(`| **Released on-chain** | **${tasks.filter((t) => t.approved).length}** | **${sum(tasks.filter((t) => t.approved))} XLM** |`);
lines.push(`| **Escrows from outside wallets** | **${outside.length}** | ${sum(outside)} XLM |`);
lines.push('');
lines.push(`| # | Funded (UTC) | Client | Freelancer | Amount | Fund tx | Release tx | Released | Wallets |`);
lines.push(`|:---:|:---|:---|:---|:---:|:---|:---|:---:|:---|`);
for (const t of tasks) {
  lines.push(`| ${t.id} | ${t.fund.at.replace('T', ' ').replace('Z', '')} | ${acct(t.client)} | ${acct(t.freelancer)} | ${t.amount} XLM | ${txLink(t.fund.hash)} | ${txLink(t.release?.hash)} | ${t.approved ? 'Yes' : 'No'} | ${t.kind} |`);
}
lines.push(`<!-- END GENERATED ESCROW TABLE -->`);
const table = lines.join('\n');

// ---- Sprint 2 traction (outside wallets only) ------------------------------------------------
// Follows the Customer Development Plan: team, QA, founder and scripted wallets are excluded, and an
// escrow counts only when BOTH sides are outside wallets. These are wallets, not people: one person
// can create several practice wallets, so pair these numbers with sign-up and feedback records.
const counted = tasks.filter((t) => t.kind === 'Outside wallet');
const weekOf = (iso) => {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday of that week
  return d.toISOString().slice(0, 10);
};
const appearances = new Map();
for (const t of counted) for (const w of [t.client, t.freelancer]) appearances.set(w, (appearances.get(w) || 0) + 1);
const repeatOf = (role) => new Set(counted.map((t) => t[role]).filter((w, i, a) => a.indexOf(w) !== i)).size;
const tr = [];
tr.push('<!-- BEGIN GENERATED TRACTION (scripts/index_escrows.mjs) -->');
tr.push(`_Generated ${generated} from the same on-chain data. Only escrows where both the client and the freelancer are outside wallets are counted. Counts are wallets, not verified people._`);
tr.push('');
tr.push('| SOW metric | On-chain count |');
tr.push('|:---|:---:|');
tr.push(`| Outside wallets with escrow activity (onboarded) | ${appearances.size} |`);
tr.push(`| Escrows funded between outside wallets | ${counted.length} |`);
tr.push(`| End-to-end workflows released on-chain (activated) | ${counted.filter((t) => t.approved).length} |`);
tr.push(`| Repeat wallets (2+ escrows) | ${[...appearances.values()].filter((n) => n >= 2).length} (clients: ${repeatOf('client')}, freelancers: ${repeatOf('freelancer')}) |`);
tr.push('');
tr.push('| Week of (Mon, UTC) | New outside wallets | Escrows funded | Released | Cumulative wallets |');
tr.push('|:---|:---:|:---:|:---:|:---:|');
const seen = new Set();
for (const wk of [...new Set(counted.map((t) => weekOf(t.fund.at)))].sort()) {
  const xs = counted.filter((t) => weekOf(t.fund.at) === wk);
  let fresh = 0;
  for (const t of xs) for (const w of [t.client, t.freelancer]) if (!seen.has(w)) { seen.add(w); fresh++; }
  tr.push(`| ${wk} | ${fresh} | ${xs.length} | ${xs.filter((t) => t.approved).length} | ${seen.size} |`);
}
if (!counted.length) tr.push('| — | 0 | 0 | 0 | 0 |');
tr.push('<!-- END GENERATED TRACTION -->');
const traction = tr.join('\n');

if (process.argv.includes('--write')) {
  // Snapshot read by the app's public verification ledger (src/context/TaskContext.jsx).
  const snapshot = tasks.map((t) => ({
    onChainTaskId: t.id,
    amount: t.amount,
    clientWallet: t.client,
    freelancerWallet: t.freelancer,
    released: t.approved,
    fundTxHash: t.fund.hash,
    fundedAt: t.fund.at,
    releaseTxHash: t.release?.hash || null,
    releasedAt: t.release?.at || null,
    walletKind: t.kind
  }));
  const dataFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'onchainEscrows.json');
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify({ contractId: CONTRACT_ID, generatedAt: generated, escrows: snapshot }, null, 2) + '\n');

  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'EVIDENCE_TABLE.md');
  const doc = fs.readFileSync(file, 'utf8');
  const re = /<!-- BEGIN GENERATED ESCROW TABLE[\s\S]*?<!-- END GENERATED ESCROW TABLE -->/;
  if (!re.test(doc)) throw new Error('markers not found in EVIDENCE_TABLE.md');
  const reTraction = /<!-- BEGIN GENERATED TRACTION[\s\S]*?<!-- END GENERATED TRACTION -->/;
  let next = doc.replace(re, table);
  next = reTraction.test(next)
    ? next.replace(reTraction, traction)
    : next.replace('## On-chain escrows', `## Sprint 2 on-chain traction\n\n${traction}\n\n## On-chain escrows`);
  fs.writeFileSync(file, next);
  console.log(`EVIDENCE_TABLE.md updated: ${tasks.length} escrows, ${outside.length} from outside wallets, ${appearances.size} outside wallets counted.`);
} else {
  console.log(`${traction}\n\n${table}`);
}
