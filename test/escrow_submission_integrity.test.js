/**
 * Escrow Submission Integrity Tests (src/lib/stellar.js)
 *
 * Guards three properties of the signing layer that the Soroban contract itself cannot enforce:
 *   1. A failed on-chain fund/release is reported as a failure, never as a simulated success.
 *   2. A release only ever targets the escrow ID that fund_task returned for that task.
 *   3. A Disputed task cannot be released (SOW Deliverable 3b), and the simulator wallet is Testnet-only.
 *
 * Command: node test/escrow_submission_integrity.test.js
 */

import assert from 'node:assert';
import * as StellarSdk from '@stellar/stellar-sdk';

class MemoryStorage {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const {
  resolveOnChainTaskId,
  isSimulatedTxHash,
  isEphemeralSignerAllowed,
  submitApproveTask,
  formatStellarError,
  DEMO_FUND_TX_HASH,
  DEMO_PUBLIC_KEY
} = await import('../src/lib/stellar.js');

// Silence the library's expected console.error/log noise so results stay readable.
const quiet = async (fn) => {
  const { log, error, warn } = console;
  console.log = console.error = console.warn = () => {};
  try { return await fn(); } finally { Object.assign(console, { log, error, warn }); }
};

// Provision a stored simulator signer without calling Friendbot.
const seedEphemeralSigner = () => {
  const kp = StellarSdk.Keypair.random();
  sessionStorage.setItem('gigpay_ephemeral_pubkey', kp.publicKey());
  sessionStorage.setItem('gigpay_ephemeral_seckey', kp.secret());
  return kp.publicKey();
};

const REAL_LOOKING_FUND_HASH = 'a'.repeat(64);

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}\n     ${err.message}`);
    failed++;
  }
};

console.log('\n=== Escrow Submission Integrity (stellar.js) ===\n');

await test('resolveOnChainTaskId never guesses: missing ID stays null even with a cached "last task"', () => {
  localStorage.setItem('gigpay_last_onchain_task_id', '7');
  assert.strictEqual(resolveOnChainTaskId({ id: '9f8e7d6c-5b4a-3210-fedc-ba9876543210' }), null);
  assert.strictEqual(resolveOnChainTaskId({ id: 'x', on_chain_task_id: null }), null);
  assert.strictEqual(resolveOnChainTaskId('9f8e7d6c-5b4a-3210-fedc-ba9876543210'), null);
  localStorage.removeItem('gigpay_last_onchain_task_id');
});

await test('resolveOnChainTaskId accepts only valid u32 IDs', () => {
  assert.strictEqual(resolveOnChainTaskId({ on_chain_task_id: 12 }), 12);
  assert.strictEqual(resolveOnChainTaskId({ on_chain_task_id: '12' }), 12);
  assert.strictEqual(resolveOnChainTaskId(3), 3);
  assert.strictEqual(resolveOnChainTaskId(2_000_000), 2_000_000); // above the old 1,000,000 cap
  assert.strictEqual(resolveOnChainTaskId(0), null);
  assert.strictEqual(resolveOnChainTaskId(-4), null);
  assert.strictEqual(resolveOnChainTaskId(1.5), null);
  assert.strictEqual(resolveOnChainTaskId(4294967296), null);
});

await test('isSimulatedTxHash separates demo placeholders from real hashes', () => {
  assert.strictEqual(isSimulatedTxHash(DEMO_FUND_TX_HASH), true);
  assert.strictEqual(isSimulatedTxHash('sim-tx-123'), true);
  assert.strictEqual(isSimulatedTxHash('demo_fund_abc'), true);
  assert.strictEqual(isSimulatedTxHash(undefined), true);
  assert.strictEqual(isSimulatedTxHash(REAL_LOOKING_FUND_HASH), false);
});

await test('Simulator wallet signer is Testnet-only', () => {
  assert.strictEqual(isEphemeralSignerAllowed('TESTNET'), true);
  assert.strictEqual(isEphemeralSignerAllowed('MAINNET'), false);
});

await test('Disputed task cannot be released, even with a demo wallet', async () => {
  await assert.rejects(
    () => quiet(() => submitApproveTask({
      clientAddress: DEMO_PUBLIC_KEY,
      taskId: { id: 'task-mock-9', status: 'Disputed', on_chain_task_id: 4 }
    })),
    /in dispute/
  );
});

await test('On-chain-funded task with a missing escrow ID is refused instead of releasing a guessed ID', async () => {
  const signer = seedEphemeralSigner();
  await assert.rejects(
    () => quiet(() => submitApproveTask({
      clientAddress: signer,
      taskId: { id: '11111111-2222-4333-8444-555555555555', status: 'Under Review', tx_hash: REAL_LOOKING_FUND_HASH }
    })),
    /nothing was released/
  );
});

await test('Demo-funded task (no on-chain escrow) completes as a labeled demo release', async () => {
  const signer = seedEphemeralSigner();
  const result = await quiet(() => submitApproveTask({
    clientAddress: signer,
    taskId: { id: '11111111-2222-4333-8444-666666666666', status: 'Under Review', tx_hash: DEMO_FUND_TX_HASH }
  }));
  assert.strictEqual(result.isDemo, true);
});

await test('Failed on-chain release rejects instead of returning a simulated success', async () => {
  // Unfunded random signer: Horizon returns 404 (or the network is unreachable). Either way the
  // release must reject. Before this fix it resolved { success: true, isDemo: true } with a reused hash.
  const signer = seedEphemeralSigner();
  let result;
  await assert.rejects(async () => {
    result = await quiet(() => submitApproveTask({
      clientAddress: signer,
      taskId: { id: '11111111-2222-4333-8444-777777777777', status: 'Under Review', on_chain_task_id: 999999, tx_hash: REAL_LOOKING_FUND_HASH }
    }));
  });
  assert.strictEqual(result, undefined);
});

await test('Error messages stay plain-language for non-crypto users', () => {
  assert.match(formatStellarError(new Error('HostError: Error(WasmVm) "Task already approved"')), /already released/);
  const notFound = new Error('Not Found');
  notFound.name = 'NotFoundError';
  assert.match(formatStellarError(notFound), /No money was moved/);
});

console.log(`\n  Escrow integrity: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
