/**
 * Chain safety: what GigPay does when Stellar's answer is unclear.
 *
 *  - A release that fails or stays pending asks the contract (get_task) whether the escrow is already paid
 *    out, and never sends a second release.
 *  - Money is locked only for a real, activated freelancer payout address; never a silent team wallet.
 *  - A "Confirming" escrow whose funding succeeded always resolves, even without an RPC return value.
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

// ---------- 2. Freelancer payout account check before funding ----------
await test('Payout account check: 404 stops funding, Horizon unreachable warns but allows, active passes', async () => {
  const notFound = await stellar.checkFreelancerPayoutAccount(freelancer, { getBalance: async () => ({ active: false, isDemo: false, raw: 0 }) });
  assert.deepStrictEqual(notFound, { ok: false, error: "This payout address isn't activated on Stellar Testnet yet. Ask the freelancer to open GigPay once so their practice wallet is funded." });
  const unknown = await stellar.checkFreelancerPayoutAccount(freelancer, { getBalance: async () => ({ active: false, unknown: true }) });
  assert.strictEqual(unknown.ok, true);
  assert.strictEqual(unknown.warning, stellar.FREELANCER_UNCHECKED_WARNING);
  assert.deepStrictEqual(await stellar.checkFreelancerPayoutAccount(freelancer, { getBalance: async () => ({ active: true }) }), { ok: true });
  // The message reaches the client unchanged through formatStellarError (ClientDashboard runs it on every error).
  assert.strictEqual(stellar.formatStellarError(new Error(stellar.FREELANCER_NOT_ACTIVATED_MESSAGE)), stellar.FREELANCER_NOT_ACTIVATED_MESSAGE);
});

await test('Real escrow: unactivated payout address is refused before anything is signed', async () => {
  const checked = [];
  await assert.rejects(() => stellar.submitFundTask({ clientAddress: client.publicKey(), freelancerAddress: freelancer, amount: '5' }, {
    checkPayout: async (addr) => { checked.push(addr); return { ok: false, error: stellar.FREELANCER_NOT_ACTIVATED_MESSAGE }; }
  }), (e) => e.message === stellar.FREELANCER_NOT_ACTIVATED_MESSAGE);
  assert.deepStrictEqual(checked, [freelancer]);
});

await test('Real escrow: a missing or placeholder payout address is refused, never replaced by a team wallet', async () => {
  let checks = 0;
  const checkPayout = async () => { checks++; return { ok: true }; };
  for (const missing of [undefined, '', '   ']) {
    await assert.rejects(() => stellar.submitFundTask({ clientAddress: client.publicKey(), freelancerAddress: missing, amount: '5' }, { checkPayout }),
      (e) => e.message === stellar.FREELANCER_ADDRESS_REQUIRED_MESSAGE);
  }
  await assert.rejects(() => stellar.submitFundTask({ clientAddress: client.publicKey(), freelancerAddress: 'GBDEMO_PLACEHOLDER', amount: '5' }, { checkPayout }),
    (e) => e.message === stellar.FREELANCER_ADDRESS_INVALID_MESSAGE);
  assert.strictEqual(checks, 0);
  const ctx = read('src/context/TaskContext.jsx');
  assert.ok(!ctx.includes('DEFAULT_FREELANCER_TESTNET_ADDRESS'), 'TaskContext must not fall back to the team wallet');
});

await test('Offline demo (no signer, nothing on-chain) keeps its explicit demo payout key', async () => {
  globalThis.GIGPAY_DISABLE_SIMULATOR_SIGNER = true;
  try {
    const out = await stellar.submitFundTask({ clientAddress: stellar.DEMO_PUBLIC_KEY, amount: '5' }, {
      checkPayout: async () => { throw new Error('demo path must not check Horizon'); }
    });
    assert.strictEqual(out.isDemo, true);
    assert.strictEqual(out.explorerUrl, null);
    assert.strictEqual(out.freelancerAddress, stellar.DEMO_FREELANCER_KEY);
  } finally {
    delete globalThis.GIGPAY_DISABLE_SIMULATOR_SIGNER;
  }
});

// ---------- 3. Confirming task whose funding succeeded without a return value ----------
const confirming = { id: 'c0nf0000-0000-4000-8000-000000000003', status: 'Confirming', amount: '5', client_wallet: client.publicKey(), freelancer_wallet: freelancer, tx_hash: 'b'.repeat(64), created_at: new Date().toISOString() };
const escrowList = (list) => async (id) => list[id - 1] || null;

await test('Confirming + SUCCESS with escrow ID -> Available with that ID (no lookup)', async () => {
  const fields = await stellar.resolveConfirmingFunding(confirming, { status: 'SUCCESS', onChainTaskId: 7 }, { findEscrowId: async () => { throw new Error('no lookup needed'); } });
  assert.deepStrictEqual(fields, { status: 'Available', on_chain_task_id: 7, is_simulated: false });
});

await test('Confirming + SUCCESS without return value -> escrow ID found by get_task (unique open match)', async () => {
  const other = { ...onChainTask(false), freelancer: S.Keypair.random().publicKey() };
  const releasedTwin = onChainTask(true);
  const readTask = escrowList([other, releasedTwin, onChainTask(false), other]);
  const fields = await stellar.resolveConfirmingFunding(confirming, { status: 'SUCCESS', onChainTaskId: null },
    { findEscrowId: (q) => stellar.findFundedEscrowId(q, { readTask }) });
  assert.deepStrictEqual(fields, { status: 'Available', on_chain_task_id: 3, is_simulated: false });
});

await test('Confirming + SUCCESS without return value, ambiguous match -> Available with no guessed ID (never stuck)', async () => {
  const readTask = escrowList([onChainTask(false), onChainTask(false)]);
  assert.strictEqual(await stellar.findFundedEscrowId({ clientWallet: client.publicKey(), freelancerWallet: freelancer, amount: '5' }, { readTask }), null);
  const fields = await stellar.resolveConfirmingFunding(confirming, { status: 'SUCCESS' }, { findEscrowId: (q) => stellar.findFundedEscrowId(q, { readTask }) });
  assert.deepStrictEqual(fields, { status: 'Available', is_simulated: false, escrowIdUnknown: true });
  // A list that never ends within maxId is not trusted either.
  assert.strictEqual(await stellar.findFundedEscrowId({ clientWallet: client.publicKey(), freelancerWallet: freelancer, amount: '5' }, { readTask: async () => onChainTask(false), maxId: 3 }), null);
});

await test('Confirming: RPC error during lookup is retried later; FAILED / expired -> Failed; fresh unknown waits', async () => {
  await assert.rejects(() => stellar.resolveConfirmingFunding(confirming, { status: 'SUCCESS' }, { findEscrowId: async () => { throw new Error('fetch failed'); } }));
  assert.deepStrictEqual(await stellar.resolveConfirmingFunding(confirming, { status: 'FAILED' }), { status: 'Failed' });
  const old = { ...confirming, created_at: new Date(Date.now() - 6 * 60 * 1000).toISOString() };
  assert.deepStrictEqual(await stellar.resolveConfirmingFunding(old, { status: 'NOT_FOUND' }), { status: 'Failed' });
  assert.strictEqual(await stellar.resolveConfirmingFunding(confirming, { status: 'NOT_FOUND' }), null);
  const ctx = read('src/context/TaskContext.jsx');
  assert.ok(ctx.includes('resolveConfirmingFunding(t, outcome)'), 'TaskContext resolves Confirming tasks through resolveConfirmingFunding');
  assert.ok(/escrowIdUnknown, \.\.\.dbFields/.test(ctx), 'the local escrowIdUnknown flag is not written to the database');
});

console.log(`\n  Chain safety: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
