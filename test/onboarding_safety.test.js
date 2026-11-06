/**
 * Onboarding safety (batch 1, before the BCC lab sessions): failures must never look like success.
 *
 *  - Unconfirmed transactions are "pending", never success; a busy network is a clear failure.
 *  - Each signed-in account gets its own practice wallet (shared lab PCs).
 *  - Failed actions roll back exactly; database rejections are reported.
 *  - Signed-out guide taps never create a fake shared account; roles are confirmed before money moves.
 *
 * Offline. Command: node test/onboarding_safety.test.js
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
// Keep provisioning offline: no real Friendbot calls from this suite.
globalThis.fetch = async () => new Response('{}', { status: 200 });

const S = await import('@stellar/stellar-sdk');
const stellar = await import('../src/lib/stellar.js');
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; }
};

const signedTx = () => {
  const kp = S.Keypair.random();
  const tx = new S.TransactionBuilder(new S.Account(kp.publicKey(), '1'), { fee: '100', networkPassphrase: S.Networks.TESTNET })
    .addOperation(S.Operation.bumpSequence({ bumpTo: '2' })).setTimeout(30).build();
  tx.sign(kp);
  return tx;
};

console.log('\n=== Onboarding safety ===\n');

await test('Busy network (TRY_AGAIN_LATER) is a clear failure: nothing sent, no fake success', async () => {
  const server = { sendTransaction: async () => ({ status: 'TRY_AGAIN_LATER' }) };
  await assert.rejects(() => stellar.sendAndConfirm(signedTx(), { server, poll: async () => ({ status: 'SUCCESS' }) }),
    (e) => e.message === stellar.NETWORK_BUSY_MESSAGE);
});

await test('Accepted but not confirmed in time is PENDING, never success', async () => {
  const server = { sendTransaction: async (tx) => ({ status: 'PENDING', hash: tx.hash().toString('hex') }) };
  const out = await stellar.sendAndConfirm(signedTx(), { server, poll: async (h) => ({ status: 'SUBMITTED', hash: h }) });
  assert.strictEqual(out.status, 'PENDING');
  assert.match(out.hash, /^[0-9a-f]{64}$/);
});

await test('Send timeout still confirms by the locally computed hash (no duplicate funding)', async () => {
  const tx = signedTx();
  const server = { sendTransaction: () => new Promise(() => {}) }; // never answers
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms, 5)); // make the 10s send timeout instant
  try {
    let polled = null;
    const out = await stellar.sendAndConfirm(tx, { server, poll: async (h) => { polled = h; return { status: 'SUCCESS', hash: h, returnValue: 7 }; } });
    assert.strictEqual(polled, tx.hash().toString('hex'));
    assert.strictEqual(out.status, 'SUCCESS');
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

await test('Each signed-in account gets its own practice wallet; the first sign-in keeps the browser wallet', () => {
  stellar.setPracticeWalletOwner(null);
  const browserWallet = stellar.provisionSimulatorWallet();
  stellar.setPracticeWalletOwner('user-a');
  assert.strictEqual(stellar.provisionSimulatorWallet(), browserWallet, 'first account adopts the wallet it already used');
  stellar.setPracticeWalletOwner(null);
  stellar.setPracticeWalletOwner('user-b');
  const walletB = stellar.provisionSimulatorWallet();
  assert.notStrictEqual(walletB, browserWallet, 'next student on the same PC must not inherit the wallet');
  stellar.setPracticeWalletOwner('user-a');
  assert.strictEqual(stellar.provisionSimulatorWallet(), browserWallet, 'signing back in restores your own wallet');
  stellar.setPracticeWalletOwner(null);
});

await test('Contract rejections never tell students to lock funds again', () => {
  const msg = stellar.formatStellarError(new Error('HostError: Error(WasmVm, InvalidAction)'));
  assert.ok(!/create a new task/i.test(msg) && /don't lock funds again/i.test(msg));
});

await test('Failed actions roll back exactly and database rejections are reported', () => {
  const ctx = read('src/context/TaskContext.jsx');
  assert.ok(ctx.includes('const restoreTask = (snapshot)') && ctx.includes("type: 'RESTORE_TASK'"), 'direct restore that bypasses the no-downgrade merge');
  assert.ok(!ctx.includes('updateTasksAndCache(previousTasks)'), 'rollback must not go through the merge');
  for (const action of ['proofError', 'disputeError', 'resolveError', 'saveError']) {
    assert.ok(ctx.includes(`if (${action})`), `${action} must be checked`);
  }
});

await test('Roles are confirmed in the database before money moves or a task is claimed', () => {
  const ctx = read('src/context/TaskContext.jsx');
  const fundAt = ctx.indexOf('const fundResult = await submitFundTask(');
  assert.ok(ctx.lastIndexOf("ensureDbRole('client')", fundAt) > 0, 'client role checked before funding');
  assert.ok(ctx.includes("ensureDbRole('freelancer')"), 'freelancer role checked before accepting');
  assert.ok(ctx.includes("status: isPending ? 'Confirming' : 'Available'"), 'pending funding is saved as Confirming');
  assert.ok(ctx.includes('getFundTaskOutcome(t.tx_hash)'), 'Confirming tasks are resolved from the chain');
});

await test('Signed-out taps never create the shared offline demo account', () => {
  const auth = read('src/context/AuthContext.jsx');
  assert.ok(auth.includes('if (!user) return null;'), 'switchRole must not invent a user');
  const guide = read('src/components/PilotGuideWidget.jsx');
  assert.ok(guide.includes("if (!user) {\n      navigate('/auth');") || guide.includes("if (!user) {\r\n      navigate('/auth');"), 'guide actions send signed-out visitors to sign up');
  assert.ok(!/single device|1 browser session/.test(guide), 'guide must not promise one-device dual-role testing');
});

await test('Pool function retries when simultaneous top-ups collide', () => {
  const fn = read('supabase/functions/fund-practice-wallet/index.ts');
  assert.ok(fn.includes('tx_bad_seq') && /for \(let attempt = 1; attempt <= \d+/.test(fn));
});

await test('Phone fixes: 16px fields, CONFIRM capitalised, task form first', () => {
  assert.ok(/font-size:\s*16px !important/.test(read('src/index.css')));
  const dash = read('src/pages/ClientDashboard.jsx');
  assert.ok(dash.includes('setConfirmText(e.target.value.toUpperCase())') && dash.includes('create-task-panel'));
});

await test('No fake proof links or placeholder balances', () => {
  const fl = read('src/pages/FreelancerDashboard.jsx') + read('src/components/PilotGuideWidget.jsx');
  assert.ok(!fl.includes('gigpay-pilot-deliverable') && !fl.includes('gigpay-pilot-sample-deliverable'), 'no made-up proof URLs');
  assert.ok(fl.includes("startsWith") || /\^https:/.test(fl), 'proof links must be https');
  const st = read('src/lib/stellar.js');
  assert.ok(!st.includes('return { balance: "10,000.00", raw: 10000, active: true, isDemo: true }'), 'Horizon errors must not report a fake balance');
  assert.ok(st.includes('unknown: true'), 'Horizon errors report an unknown balance');
});

// UI team (Nov 6): shared lab PCs, own-tasks-only, dispute metadata, honest wording.
await test('Invite payout lives in this tab only and sign-out clears it', async () => {
  const invite = await import('../src/lib/invite.js');
  const addr = S.Keypair.random().publicKey();
  assert.strictEqual(invite.captureInviteFromUrl(`?pay=${addr}`), addr);
  assert.strictEqual(localStorage.getItem('gigpay_invite_payout'), null, 'never kept in localStorage');
  assert.ok(sessionStorage.getItem('gigpay_invite_payout'), 'kept in sessionStorage');
  invite.clearInvitePayout();
  assert.strictEqual(invite.takeInvitePayout(), null, 'cleared on sign-out');
  sessionStorage.setItem('gigpay_invite_payout', JSON.stringify({ address: addr, at: Date.now() - 25 * 3600 * 1000 }));
  assert.strictEqual(invite.takeInvitePayout(), null, 'older than 24h is ignored');
  assert.ok(read('src/context/AuthContext.jsx').includes('clearInvitePayout();'), 'signOut clears the invite');
  const dash = read('src/pages/ClientDashboard.jsx');
  assert.ok(dash.includes('fund-payout-address') && dash.includes('release-payout-address'), 'fund form and release modal show who gets paid');
});

await test('Clients see and act only on their own tasks', () => {
  const dash = read('src/pages/ClientDashboard.jsx');
  assert.ok(!dash.includes("|| !t.client_id)") && !dash.includes("|| !task.client_id;"), 'tasks without client_id are not yours');
  assert.ok(dash.includes('const isMine = isOwnTask(task);'));
  assert.ok(dash.includes('const fundedTasks = ownTasks.filter('), 'metrics count only your tasks');
});

await test('Dispute metadata shows when, by whom and when resolved', async () => {
  const { getDisputeMetadata } = await import('../src/lib/disputeMetadata.js');
  const t = { client_id: 'c1', dispute_reason: 'Wrong file', disputed_at: '2026-11-05T02:00:00Z', disputed_by: 'c1', dispute_resolved_at: '2026-11-05T03:00:00Z' };
  const m = getDisputeMetadata(t, 'c1');
  assert.ok(m.raisedAt && m.resolvedAt);
  assert.strictEqual(m.raisedBy, 'the client (you)');
  assert.strictEqual(getDisputeMetadata({ ...t, dispute_resolved_at: '2026-11-04T00:00:00Z' }).resolvedAt, null, 'older resolution is not current');
  assert.strictEqual(getDisputeMetadata({ client_id: 'c1' }).raisedBy, 'not recorded');
  for (const f of ['src/pages/ClientDashboard.jsx', 'src/pages/FreelancerDashboard.jsx']) {
    assert.ok(read(f).includes('getDisputeMetadata('), `${f} shows dispute metadata`);
  }
});

await test('Auth page follows ?mode= changes; guide starts minimized', () => {
  assert.ok(read('src/pages/AuthPage.jsx').includes('[location.search, location.key]'));
  // \r?\n: Windows checkouts use CRLF line endings (this check failed on Windows while Linux CI passed).
  assert.ok(/isMinimized: true,\r?\n\s+isDismissed: false/.test(read('src/components/PilotGuideWidget.jsx')));
  assert.ok(read('src/components/Navbar.jsx').includes('navbar-menu-toggle'), 'phone header has a Menu');
});

await test('UI wording: Stellar Testnet, no personas, no X-Frame-Options meta', () => {
  const ui = ['src/pages/ClientDashboard.jsx', 'src/pages/ProfilePage.jsx', 'src/context/AuthContext.jsx',
    'src/components/PilotGuideWidget.jsx', 'src/components/PilotIntakeBanner.jsx'].map(read).join('\n');
  for (const bad of ['Protocol 22', 'Official Pilot Feedback', 'Acme Corp', 'Alex Rivera', 'Typical platform fee (up to 20%)', 'Left blank, the payment goes to']) {
    assert.ok(!ui.includes(bad), `still says "${bad}"`);
  }
  assert.ok(!/http-equiv="X-Frame-Options"/.test(read('index.html')));
});

console.log(`\n  Onboarding safety: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
