/**
 * Public Verification Ledger Integrity Tests (src/lib/ledgerIntegrity.js)
 *
 * Instawards counts only real users with verifiable on-chain activity, and the GigPay Customer
 * Development Plan excludes team wallets from every count. These tests keep the ledger honest:
 *   - no placeholder hash or borrowed wallet is ever shown as evidence,
 *   - the same transaction is never listed twice,
 *   - rows that touch team/demo wallets are labeled as excluded from user counts.
 *
 * Command: node test/ledger_integrity.test.js
 */

import assert from 'node:assert';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const {
  isNonEvidenceHash,
  isTeamWallet,
  labelLedgerRecord,
  buildCompletedTaskLedgerRow,
  dedupeLedgerByTxHash
} = await import('../src/lib/ledgerIntegrity.js');
const ledgerMod = await import('../src/lib/ledgerIntegrity.js');
const { DEMO_FUND_TX_HASH, DEMO_RELEASE_TX_HASH, DEFAULT_FREELANCER_TESTNET_ADDRESS, DEMO_PUBLIC_KEY } =
  await import('../src/lib/stellar.js');

const { Keypair } = await import('@stellar/stellar-sdk');
// Fresh keys: stand-ins for outside users that are guaranteed not to be team or scripted wallets.
const OUTSIDE_CLIENT = Keypair.random().publicKey();
const OUTSIDE_FREELANCER = Keypair.random().publicKey();
const REAL_HASH = 'b'.repeat(64);

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; }
};

console.log('\n=== Public Verification Ledger Integrity ===\n');

test('Demo placeholders are not 64-hex hashes, so they can never resolve to a real transaction', () => {
  assert.ok(!/^[0-9a-f]{64}$/.test(DEMO_FUND_TX_HASH));
  assert.ok(!/^[0-9a-f]{64}$/.test(DEMO_RELEASE_TX_HASH));
  assert.strictEqual(isNonEvidenceHash(DEMO_FUND_TX_HASH), true);
  assert.strictEqual(isNonEvidenceHash('sim-tx-1730000000'), true);
  assert.strictEqual(isNonEvidenceHash('rel-18f3a'), true);
  assert.strictEqual(isNonEvidenceHash(REAL_HASH), false);
});

test('Completed demo task produces no ledger row (no borrowed hash or wallet)', () => {
  const row = buildCompletedTaskLedgerRow({ id: 't1', title: 'Logo', amount: '20', status: 'Completed', tx_hash: DEMO_FUND_TX_HASH, release_tx_hash: DEMO_RELEASE_TX_HASH });
  assert.strictEqual(row, null);
  const noHash = buildCompletedTaskLedgerRow({ id: 't2', title: 'Logo', amount: '20', status: 'Completed' });
  assert.strictEqual(noHash, null);
});

test('Completed on-chain task uses its own wallets and leaves unknown wallets empty', () => {
  const row = buildCompletedTaskLedgerRow({ id: 't3', title: 'Landing page', amount: '50', release_tx_hash: REAL_HASH, client_wallet: OUTSIDE_CLIENT });
  assert.strictEqual(row.txHash, REAL_HASH);
  assert.strictEqual(row.clientWallet, OUTSIDE_CLIENT);
  assert.strictEqual(row.freelancerWallet, null);
  assert.strictEqual(row.countsAsOutsideUser, false, 'unknown freelancer wallet must not count as an outside user');
});

test('Rows paying the team default wallet are labeled and excluded from user counts', () => {
  const teamRow = labelLedgerRecord({ txHash: REAL_HASH, clientWallet: OUTSIDE_CLIENT, freelancerWallet: DEFAULT_FREELANCER_TESTNET_ADDRESS });
  assert.strictEqual(teamRow.countsAsOutsideUser, false);
  assert.match(teamRow.walletNote, /excluded from user counts/);
  const outsideRow = labelLedgerRecord({ txHash: REAL_HASH, clientWallet: OUTSIDE_CLIENT, freelancerWallet: OUTSIDE_FREELANCER });
  assert.strictEqual(outsideRow.countsAsOutsideUser, true);
  assert.strictEqual(isTeamWallet(DEMO_PUBLIC_KEY), true);
  assert.strictEqual(isTeamWallet('GCBXZSKNCLTKTVRHBRZ2XCTFDVNHSBF3G6CIPLBRCK2XBXIGPQY5RBRN'), true, "founder's own wallet is a team wallet");
});

test('Escrows from the Nov 3 scripted wallets are labeled and never count as outside users', () => {
  const row = labelLedgerRecord({ txHash: REAL_HASH, clientWallet: 'GCACSSN7J2Q2ZKHHLQ2H33T6KDFNJAWTPOBWXH6PI4KDQ3ZAA77XV5VF', freelancerWallet: 'GA3LTMJQEJYWEFPGVFRQBTG4ELFXYD2ATQAD2YB5FEECTBG7TCQQQRLJ' });
  assert.strictEqual(row.countsAsOutsideUser, false);
  assert.match(row.walletNote, /Scripted test wallet/);
});

test('Freelancers cannot accept a task whose escrow pays someone else', () => {
  const { describePayout } = ledgerMod;
  assert.strictEqual(describePayout({ freelancer_wallet: OUTSIDE_FREELANCER }, OUTSIDE_FREELANCER).canAccept, true);
  assert.strictEqual(describePayout({ freelancer_wallet: OUTSIDE_FREELANCER }, OUTSIDE_CLIENT).canAccept, false);
  assert.match(describePayout({ freelancer_wallet: DEFAULT_FREELANCER_TESTNET_ADDRESS }, OUTSIDE_CLIENT).text, /test wallet/);
  assert.strictEqual(describePayout({}, OUTSIDE_CLIENT).canAccept, true);
});

test('Total Earned counts only escrows released on-chain to this payout address', () => {
  const { onChainEarnings } = ledgerMod;
  const paid = { status: 'Completed', amount: '1.1', freelancer_wallet: OUTSIDE_FREELANCER, release_tx_hash: REAL_HASH };
  const tasks = [
    paid,
    { ...paid, amount: '458', release_tx_hash: DEMO_RELEASE_TX_HASH },          // demo release: never paid
    { ...paid, amount: '50', release_tx_hash: null },                           // marked Completed, no release tx
    { ...paid, amount: '7', freelancer_wallet: OUTSIDE_CLIENT },                // paid someone else's address
    { ...paid, amount: '9', is_simulated: true },                               // demo-funded task
    { ...paid, amount: '3', status: 'Under Review' }                            // not released yet
  ];
  assert.deepStrictEqual(onChainEarnings(tasks, OUTSIDE_FREELANCER), { total: 1.1, count: 1 });
  assert.deepStrictEqual(onChainEarnings(tasks, null), { total: 0, count: 0 });
});

test('Same transaction from two sources is listed once; placeholder rows are dropped', () => {
  const rows = dedupeLedgerByTxHash([
    { id: 'completed-task-a', txHash: REAL_HASH },
    { id: 'seed-table7-row', txHash: REAL_HASH },
    { id: 'demo-row', txHash: DEMO_RELEASE_TX_HASH },
    { id: 'other', txHash: 'c'.repeat(64) }
  ]);
  assert.deepStrictEqual(rows.map((r) => r.id), ['completed-task-a', 'other']);
});

// Fixture shaped like src/data/onchainEscrows.json #41-#46 and the Supabase tasks linked to them.
const H = (c) => c.repeat(64);
const ESCROWS = [41, 42, 43, 44, 45, 46].map((n, i) => ({
  onChainTaskId: n, amount: 0.1, clientWallet: OUTSIDE_CLIENT, freelancerWallet: OUTSIDE_FREELANCER,
  released: n !== 41 && n !== 44, fundTxHash: H('0123456789ab'[i * 2]), fundedAt: '2026-11-05T05:17:00Z',
  releaseTxHash: n !== 41 && n !== 44 ? H('0123456789ab'[i * 2 + 1]) : null, releasedAt: n !== 41 && n !== 44 ? '2026-11-05T05:21:25Z' : null,
  walletKind: 'Team test'
}));
const byId = (n) => ESCROWS.find((e) => e.onChainTaskId === n);

test('Public ledger lists every on-chain escrow exactly once, even when DB rows share its hashes', () => {
  const { buildPublicLedger } = ledgerMod;
  const tasks = [
    { id: 'u42', title: 'Logo', on_chain_task_id: 42, tx_hash: byId(42).fundTxHash, release_tx_hash: byId(42).releaseTxHash, status: 'Completed' },
    { id: 'u43', title: 'Poster', tx_hash: byId(43).fundTxHash, release_tx_hash: byId(43).releaseTxHash, status: 'Completed' }
  ];
  const otherRecords = [
    buildCompletedTaskLedgerRow(tasks[0]),                                         // same release hash as onchain-42
    buildCompletedTaskLedgerRow(tasks[1]),                                         // same release hash as onchain-43
    { id: 'tx-fund-1', txHash: byId(45).fundTxHash, status: 'Escrow Locked' },     // fund hash of a released escrow
    { id: 'onchain-46', txHash: byId(46).fundTxHash }                              // context copy of the chain row
  ];
  const rows = buildPublicLedger({ escrows: ESCROWS, tasks, otherRecords });
  assert.deepStrictEqual(rows.map((r) => r.id), ESCROWS.map((e) => `onchain-${e.onChainTaskId}`));
  assert.ok(rows.every((r) => r.source === 'On-chain index'));
  assert.match(rows.find((r) => r.escrowId === 42).taskId, /^Escrow #42 — Logo/);
  assert.match(rows.find((r) => r.escrowId === 43).taskId, /Poster/, 'linked by hash when on_chain_task_id is missing');
  assert.strictEqual(rows.find((r) => r.escrowId === 42).txHash, byId(42).releaseTxHash);
});

test('A hash missing from the on-chain index is a labeled database-only row that never counts', () => {
  const { buildPublicLedger } = ledgerMod;
  const extra = labelLedgerRecord({ id: 'completed-task-x', txHash: H('f'), clientWallet: OUTSIDE_CLIENT, freelancerWallet: OUTSIDE_FREELANCER });
  assert.strictEqual(extra.countsAsOutsideUser, true);
  const rows = buildPublicLedger({ escrows: ESCROWS, tasks: [], otherRecords: [extra, { ...extra, id: 'tx-rel-1' }, { id: 'demo', txHash: DEMO_RELEASE_TX_HASH }], generatedAt: '2026-11-05 23:33 UTC' });
  const dbOnly = rows.filter((r) => r.source === 'Database only');
  assert.strictEqual(rows.length, ESCROWS.length + 1);
  assert.strictEqual(dbOnly.length, 1, 'same hash twice is one row; demo hashes are dropped');
  assert.strictEqual(dbOnly[0].countsAsOutsideUser, false);
  assert.match(dbOnly[0].walletNote, /Not in the on-chain index \(generated 2026-11-05 23:33 UTC\)/);
});

test('Ledger CSV has one line per row and escapes quotes and formula-like text', () => {
  const { buildPublicLedger, ledgerToCsv, LEDGER_CSV_HEADERS } = ledgerMod;
  const rows = buildPublicLedger({ escrows: ESCROWS, tasks: [{ on_chain_task_id: 44, title: '=HYPERLINK("x") "big" logo' }] });
  const lines = ledgerToCsv(rows).split('\n');
  assert.strictEqual(lines.length, 1 + ESCROWS.length);
  assert.strictEqual(lines[0].split(',').length, LEDGER_CSV_HEADERS.length);
  assert.ok(lines.some((l) => l.includes('"Escrow #44 — =HYPERLINK(""x"") ""big"" logo (Team test)"')));
  assert.strictEqual(new Set(lines.slice(1).map((l) => l.split(',')[0])).size, ESCROWS.length);
  assert.ok(ledgerToCsv([{ id: '=1+1' }]).includes(`"'=1+1"`), 'a cell starting with = is not run as a formula');
});

console.log(`\n  Ledger integrity: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
