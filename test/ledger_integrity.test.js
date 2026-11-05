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

console.log(`\n  Ledger integrity: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
