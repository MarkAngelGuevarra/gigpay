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
  const fundAt = ctx.indexOf('fundResult = await submitFundTask(');
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

await test('Activity log never sends a name or email', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(String(init?.body || '')); return new Response('{}'); };
  try {
    const { recordStudentToGoogleSheet } = await import('../src/lib/sheetsSync.js');
    await recordStudentToGoogleSheet({ emailForSourceDetection: 'juan.delacruz@umak.edu.ph', programSection: 'Client', walletAddress: 'GTEST' });
  } finally { globalThis.fetch = realFetch; }
  assert.strictEqual(sent.length, 1);
  assert.ok(!sent[0].includes('@') && !sent[0].includes('juan'), 'no email or name in the payload');
  for (const f of ['src/pages/AuthPage.jsx', 'src/pages/ClientDashboard.jsx']) {
    assert.ok(!/studentId:|studentName:/.test(read(f)), `${f} must not pass names or emails to the activity log`);
  }
});

await test('Invite QR encodes exactly the invite link and tells the partner to use the camera app', async () => {
  const S = await import('@stellar/stellar-sdk');
  const QRCode = (await import('qrcode')).default;
  const invite = await import('../src/lib/invite.js');
  const addr = S.Keypair.random().publicKey();
  const link = invite.buildInviteLink(addr, 'https://www.gigpay.tech');
  const url = await invite.buildInviteQrDataUrl(addr, 'https://www.gigpay.tech');
  assert.ok(url.startsWith('data:image/png;base64,'), 'QR is an inline PNG (allowed by the CSP img-src data:)');
  const encoded = QRCode.create(link, { errorCorrectionLevel: 'M' }).segments.map((seg) => Buffer.from(seg.data).toString('utf8')).join('');
  assert.strictEqual(encoded, link, 'the QR holds the same invite link as Share invite link');
  const dash = fs.readFileSync(new URL('../src/pages/FreelancerDashboard.jsx', import.meta.url), 'utf8');
  assert.ok(dash.includes('Show invite QR') && dash.includes('buildInviteQrDataUrl(publicKey)'), 'freelancer dashboard offers the QR for its own payout address');
  assert.ok(/camera app/.test(dash) && /same browser/.test(dash), 'the QR tells the partner to scan with the camera and stay in that browser');
  assert.ok(/img-src[^;]*data:/.test(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')), 'CSP allows data: images');
});

await test('Partner sees new tasks without reloading: Realtime on tasks, 10s refresh, refresh on return, Refresh button', async () => {
  const ctx = fs.readFileSync(new URL('../src/context/TaskContext.jsx', import.meta.url), 'utf8');
  assert.ok(/TASK_REFRESH_INTERVAL_MS = 10000/.test(ctx), 'tasks are re-read every 10 seconds');
  assert.ok(ctx.includes("addEventListener('visibilitychange', onReturn)") && ctx.includes("addEventListener('focus', onReturn)"), 'tasks are re-read when the student comes back to the page');
  assert.ok(ctx.includes('clearInterval(poll)') && ctx.includes("removeEventListener('visibilitychange', onReturn)"), 'timers and listeners are cleaned up');
  assert.ok(/refreshTasks,/.test(ctx), 'refreshTasks is provided to the pages');
  for (const page of ['src/pages/ClientDashboard.jsx', 'src/pages/FreelancerDashboard.jsx']) {
    const src = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.ok(src.includes('data-testid="refresh-tasks"') && src.includes('await refreshTasks()'), `${page} has a Refresh tasks button`);
  }
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const sql = migrations.map((m) => fs.readFileSync(new URL(`../supabase/migrations/${m}`, import.meta.url), 'utf8')).join('\n');
  assert.ok(/alter publication supabase_realtime add table public\.tasks/i.test(sql), 'tasks table is in the Realtime publication');
});

await test('Scanning the invite QR opens Sign Up with Client chosen; no silent role default otherwise', async () => {
  const S = await import('@stellar/stellar-sdk');
  const invite = await import('../src/lib/invite.js');
  invite.clearInvitePayout();
  assert.strictEqual(invite.hasPendingInvite(), false, 'no invite yet');
  const addr = S.Keypair.random().publicKey();
  invite.captureInviteFromUrl(`?pay=${addr}`);
  assert.strictEqual(invite.hasPendingInvite(), true, 'an invite from the QR is pending');
  assert.strictEqual(invite.hasPendingInvite(), true, 'checking does not use it up');
  assert.strictEqual(invite.takeInvitePayout(), addr, 'the client form still gets the address');
  assert.strictEqual(invite.hasPendingInvite(), false, 'once used, the next visit is a normal one');
  const auth = fs.readFileSync(new URL('../src/pages/AuthPage.jsx', import.meta.url), 'utf8');
  assert.ok(auth.includes('isSignupUrl(search) || hasPendingInvite()'), 'an invited visitor starts on Sign Up');
  assert.ok(auth.includes("useState(() => (hasPendingInvite() ? 'client' : null))"), 'invited = Client; otherwise no default role');
  assert.ok(/!isLogin && !role\)/.test(auth) && auth.includes('Choose your role first'), 'sign-up refuses to continue without a role');
  assert.ok(auth.indexOf('data-testid="role-picker"') < auth.indexOf('type="email"'), 'the role picker is above the email field');
  assert.ok(auth.includes('data-testid="invite-banner"'), 'invited visitors are told their partner invited them');
});

await test('Students never see grant-reviewer demo accounts, the sandbox or role-switch buttons', () => {
  const auth = fs.readFileSync(new URL('../src/pages/AuthPage.jsx', import.meta.url), 'utf8');
  assert.ok(auth.includes("get('reviewer') === '1'") && auth.includes('{showReviewerTools && ('), 'demo accounts and sandbox only on /auth?reviewer=1');
  for (const [page, label] of [['src/pages/ClientDashboard.jsx', 'Switch to Freelancer Portal'], ['src/pages/FreelancerDashboard.jsx', 'Switch to Client Portal']]) {
    const src = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const at = src.indexOf(label);
    assert.ok(src.lastIndexOf('{user?.is_simulation_mode && (', at) > src.lastIndexOf('return (', at), `${label} only shows in the sandbox`);
  }
  const widget = fs.readFileSync(new URL('../src/components/PilotGuideWidget.jsx', import.meta.url), 'utf8');
  assert.ok(!widget.includes('switchRole(tour)') && !widget.includes('Step 3: Switch to Freelancer to accept (the task card'), 'the guide never tells a client to switch roles');
});

await test('Phone layout: pop-ups centre on the screen, messages are readable and stay 6s, tap targets 44px', () => {
  const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.ok(/animation: fadeIn 0\.6s ease-out backwards;/.test(css), 'fade-in leaves no transform behind (fixed pop-ups stay on screen)');
  assert.ok(/min-height: 44px;/.test(css) && /\.client-metrics \{\s*display: none !important;/.test(css), '44px buttons; stat cards hidden on phones');
  assert.ok(/prefers-reduced-motion: reduce/.test(css), 'reduced motion is respected');
  const toast = fs.readFileSync(new URL('../src/context/ToastContext.jsx', import.meta.url), 'utf8');
  assert.ok(toast.includes("type === 'error' ? 9000 : 6000") && toast.includes('aria-live="polite"') && toast.includes("'#070a12'"), 'toasts: 6s/9s, announced, dark text on light colours');
  const client = fs.readFileSync(new URL('../src/pages/ClientDashboard.jsx', import.meta.url), 'utf8');
  assert.ok(client.includes("confirmText === 'CONFIRM' ? '#047857'") && client.includes('aria-label="Type CONFIRM to release the payment"'), 'release button contrast and CONFIRM label');
  assert.strictEqual((client.match(/overflowY: 'auto', zIndex: 100000/g) || []).length, 2, 'release and dispute pop-ups scroll when the keyboard is open');
  const nav = fs.readFileSync(new URL('../src/components/Navbar.jsx', import.meta.url), 'utf8');
  assert.ok(nav.includes("height: '100dvh'") && nav.includes("overflowY: 'auto', padding: '1rem'"), 'the Connect Wallet pop-up can scroll on phones');
});

await test('A second lock for the same freelancer and amount needs a deliberate second tap', async () => {
  const { findRecentDuplicateLock, duplicateKey } = await import('../src/lib/duplicateLock.js');
  const now = Date.parse('2026-11-13T05:37:00Z');
  const w = 'GAGCJHFNVZWJOLTM2VC3ITYNXRPUVFLWQSDSYYO6EYY3RVP4Z7NTTBVM';
  const first = { on_chain_task_id: 66, freelancer_wallet: w, amount: '10', status: 'Available', created_at: '2026-11-13T05:34:56Z' };
  assert.strictEqual(findRecentDuplicateLock([first], { freelancerWallet: w, amount: '10', now }), first, 'the #66/#67 case is caught');
  assert.strictEqual(findRecentDuplicateLock([first], { freelancerWallet: w, amount: '2', now }), null, 'a different amount is a new task');
  assert.strictEqual(findRecentDuplicateLock([{ ...first, status: 'Completed' }], { freelancerWallet: w, amount: '10', now }), null, 'released escrows are not duplicates');
  assert.strictEqual(findRecentDuplicateLock([first], { freelancerWallet: w, amount: '10', now: now + 20 * 60 * 1000 }), null, 'older than 15 minutes is a new task');
  assert.strictEqual(duplicateKey(` ${w} `, '10'), duplicateKey(w, 10), 'the confirm key ignores spaces and number format');
  const client = fs.readFileSync(new URL('../src/pages/ClientDashboard.jsx', import.meta.url), 'utf8');
  assert.ok(client.includes('if (lockInFlight.current) return;') && client.includes('lockInFlight.current = false;'), 'a double tap while locking is ignored');
});

await test('Lock: the task is saved before sending, and a refused send is marked as never sent (Nov 14, 2026)', async () => {
  // The network refusing a transaction means it can never land, so the saved "Confirming" card can be dropped.
  for (const status of ['TRY_AGAIN_LATER', 'ERROR']) {
    const server = { sendTransaction: async () => ({ status, errorResultXdr: 'AAAA' }) };
    await assert.rejects(() => stellar.sendAndConfirm(signedTx(), { server, poll: async () => ({ status: 'SUCCESS' }) }),
      (e) => e.notSent === true, `${status} is reported as not sent`);
  }
  // A dropped connection is NOT marked as not sent: it may still have landed.
  const dropped = { sendTransaction: async () => { throw new Error('Failed to fetch'); } };
  await assert.rejects(() => stellar.sendAndConfirm(signedTx(), { server: dropped, poll: async () => ({ status: 'SUCCESS' }) }),
    (e) => !e.notSent, 'a dropped connection stays unknown');

  const src = read('src/lib/stellar.js');
  const signedAt = src.indexOf('await onSigned({ hash: signedTx.hash()');
  assert.ok(signedAt > 0 && signedAt < src.indexOf('const outcome = await sendAndConfirm(signedTx);', signedAt), 'onSigned runs after signing and before sending');
  const ctx = read('src/context/TaskContext.jsx');
  assert.ok(ctx.includes('{ onSigned: saveBeforeSend }'), 'addTask saves the task before the escrow is sent');
  assert.ok(ctx.includes("status: 'Confirming',") && ctx.includes("throw new Error(\"GigPay couldn't save this task, so nothing was sent"), 'saved as Confirming; if saving fails nothing is sent');
  assert.ok(ctx.includes('if (fundErr?.notSent)') && ctx.includes("return { pending: true };"), 'refused sends drop the card; unclear sends keep it Confirming');
  assert.ok(ctx.includes('if (fundInFlightRef.current)'), 'only one lock at a time per page');
});

await test('Release: Completed is shown only after Stellar confirms it', () => {
  const ctx = read('src/context/TaskContext.jsx');
  const fn = ctx.slice(ctx.indexOf('const updateTaskStatus = async'), ctx.indexOf('const approveMilestone'));
  assert.ok(fn.includes("if (newStatus !== 'Completed') {\n      updateTasksAndCache") || fn.includes("if (newStatus !== 'Completed') {\r\n      updateTasksAndCache"), 'no optimistic Completed before the release');
  assert.ok(fn.indexOf('updateTasksAndCache((prev)', fn.indexOf('updatedFields.release_tx_hash = relHash;')) > 0, 'Completed is applied after the release hash comes back');
});

await test('Invite address survives a reload or failed lock; accept signs once; real release hash; own tasks first; lab PCs cleared', async () => {
  const S = await import('@stellar/stellar-sdk');
  const invite = await import('../src/lib/invite.js');
  invite.clearInvitePayout();
  const addr = S.Keypair.random().publicKey();
  invite.captureInviteFromUrl(`?pay=${addr}`);
  assert.strictEqual(invite.peekInvitePayout(), addr, 'the form reads the invite');
  assert.strictEqual(invite.peekInvitePayout(), addr, 'reading it again (reload, failed lock) still has it');
  invite.clearInvitePayout();
  assert.strictEqual(invite.peekInvitePayout(), null, 'cleared after a successful lock');
  const client = read('src/pages/ClientDashboard.jsx');
  assert.ok(client.includes('const invited = peekInvitePayout();') && !client.includes('takeInvitePayout()'), 'the client form no longer consumes the invite on page load');
  assert.ok(client.indexOf('clearInvitePayout();') > client.indexOf('await addTask(newTask);'), 'the invite is cleared only after the lock succeeds');
  assert.ok(client.includes("result?.alreadyReleased ? '' : (result?.hash || '')") && !client.includes('result?.txHash'), 'the Sheet gets the real release hash');
  const free = read('src/pages/FreelancerDashboard.jsx');
  const accept = free.slice(free.indexOf('const handleAcceptWork'), free.indexOf('const handleAcceptTask'));
  assert.ok(!accept.includes('requestWalletSignature'), 'accept asks for one confirmation, not two');
  assert.ok(free.includes('.sort((a, b) => Number(isMine(b)) - Number(isMine(a)))'), "the freelancer's own tasks are listed first");
  const auth = read('src/context/AuthContext.jsx');
  assert.ok(auth.includes("localStorage.removeItem('gigpay_tasks_cache_v2');") && auth.includes("localStorage.removeItem('gigpay_verification_ledger_v1');"), 'sign-out clears every task and ledger cache');
  const ctx = read('src/context/TaskContext.jsx');
  assert.ok(ctx.includes('if (previousId && currentId !== previousId) {'), "leaving an account clears its tasks from memory");
});

console.log(`\n  Onboarding safety: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
