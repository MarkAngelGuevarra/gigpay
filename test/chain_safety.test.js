/**
 * Chain safety: what GigPay does when Stellar's answer is unclear.
 *
 *  - A release that fails or stays pending asks the contract (get_task) whether the escrow is already paid
 *    out, and never sends a second release.
 *
 * Offline: every network step is an injected mock. Command: node test/chain_safety.test.js
 */
import assert from 'node:assert';
import fs from 'node:fs';

class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
// No real Friendbot/Horizon calls from this suite.
globalThis.fetch = async () => { throw new Error('offline test: network disabled'); };

const S = await import('@stellar/stellar-sdk');
const stellar = await import('../src/lib/stellar.js');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; }
};

// A practice wallet stored in this "browser", so releases sign locally without Freighter.
const client = S.Keypair.random();
localStorage.setItem('gigpay_ephemeral_pubkey', client.publicKey());
localStorage.setItem('gigpay_ephemeral_seckey', client.secret());
const freelancer = S.Keypair.random().publicKey();

const unsignedTx = () => new S.TransactionBuilder(new S.Account(client.publicKey(), '1'), { fee: '100', networkPassphrase: S.Networks.TESTNET })
  .addOperation(S.Operation.bumpSequence({ bumpTo: '2' })).setTimeout(30).build();
const onChainTask = (isApproved) => ({ client: client.publicKey(), freelancer, amount: 50000000n, token: stellar.NATIVE_SAC_CONTRACT_ID, is_funded: true, is_approved: isApproved });
const taskRecord = { id: 'b3c1e7a0-0000-4000-8000-000000000001', title: 'Logo', amount: '5', status: 'Under Review', on_chain_task_id: 12, client_wallet: client.publicKey(), freelancer_wallet: freelancer, tx_hash: 'a'.repeat(64) };
const hostError = () => { throw new Error('Soroban simulation failed: HostError: Error(WasmVm, InvalidAction) VM call trapped: UnreachableCodeReached'); };

console.log('\n=== Chain safety ===\n');

// ---------- 1. Release recovery ----------
await test('Release rejected by the contract + get_task says approved -> Completed (already released), no send', async () => {
  let sends = 0;
  const out = await stellar.submitApproveTask({ clientAddress: client.publicKey(), taskId: taskRecord }, {
    prepare: hostError,
    send: async () => { sends++; return { status: 'SUCCESS' }; },
    readTask: async (id) => { assert.strictEqual(id, 12); return onChainTask(true); }
  });
  assert.strictEqual(out.success, true);
  assert.strictEqual(out.alreadyReleased, true);
  assert.strictEqual(out.hash, null, 'no release hash may be invented');
  assert.strictEqual(out.explorerUrl, null);
  assert.strictEqual(sends, 0, 'never double-release');
});

await test('Release still pending + get_task says approved -> already released, not "pending"', async () => {
  const out = await stellar.submitApproveTask({ clientAddress: client.publicKey(), taskId: taskRecord }, {
    prepare: async () => ({ preparedTx: unsignedTx() }),
    send: async (tx) => ({ status: 'PENDING', hash: tx.hash().toString('hex') }),
    readTask: async () => onChainTask(true)
  });
  assert.strictEqual(out.alreadyReleased, true);
  assert.strictEqual(out.hash, null);
});

await test('Release pending + get_task says not approved -> pending error, task not marked paid', async () => {
  await assert.rejects(() => stellar.submitApproveTask({ clientAddress: client.publicKey(), taskId: taskRecord }, {
    prepare: async () => ({ preparedTx: unsignedTx() }),
    send: async (tx) => ({ status: 'PENDING', hash: tx.hash().toString('hex') }),
    readTask: async () => onChainTask(false)
  }), (e) => e.message === stellar.RELEASE_PENDING_MESSAGE);
});

await test('Release rejected + escrow not approved (or get_task unreachable) -> original error, no fake success', async () => {
  for (const readTask of [async () => onChainTask(false), async () => null, async () => { throw new Error('fetch failed'); }]) {
    await assert.rejects(() => stellar.submitApproveTask({ clientAddress: client.publicKey(), taskId: taskRecord }, { prepare: hostError, readTask }),
      (e) => /escrow contract rejected/.test(e.message));
  }
});

await test('get_task reads the escrow by simulation; a missing ID is null, an RPC error throws', async () => {
  const retval = S.nativeToScVal({
    amount: S.nativeToScVal(50000000n, { type: 'i128' }),
    client: S.Address.fromString(client.publicKey()),
    freelancer: S.Address.fromString(freelancer),
    is_approved: true,
    is_funded: true,
    token: S.Address.fromString(stellar.NATIVE_SAC_CONTRACT_ID)
  });
  let sent = null;
  const ok = await stellar.getOnChainTask(12, { server: { simulateTransaction: async (tx) => { sent = tx; return { result: { retval } }; } } });
  assert.strictEqual(ok.is_approved, true);
  assert.strictEqual(ok.freelancer, freelancer);
  assert.strictEqual(ok.amount, 50000000n);
  assert.strictEqual(sent.operations[0].func.invokeContract().functionName().toString(), 'get_task');
  assert.strictEqual(await stellar.getOnChainTask(99, { server: { simulateTransaction: async () => ({ error: 'HostError: Error(WasmVm, InvalidAction)' }) } }), null);
  await assert.rejects(() => stellar.getOnChainTask(12, { server: { simulateTransaction: async () => { throw new Error('fetch failed'); } } }));
  assert.strictEqual(await stellar.getOnChainTask(null), null);
});

await test('TaskContext marks an already-released escrow Completed and says no new payment was sent', async () => {
  const src = read('src/context/TaskContext.jsx');
  assert.match(src, /releaseResult\?\.alreadyReleased[\s\S]{0,80}markAlreadyReleased/);
  assert.match(src, /no new payment was sent/);
});

console.log(`\n  Chain safety: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
