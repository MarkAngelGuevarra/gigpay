/**
 * Onboarding safety: failures never masquerade as success, wallets isolate per account,
 * invite state stays tab-local, and CSP/schema/Sheets privacy contracts hold.
 * Component-level UI workflows are covered by the RTL/Vitest suites under src/__tests__/.
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
globalThis.fetch = async () => new Response('{}', { status: 200 });

const S = await import('@stellar/stellar-sdk');
const stellar = await import('../src/lib/stellar.js');
const { mergeTaskRecords, safeHttpsUrl } = await import('../src/lib/taskLifecycle.js');
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
  const server = { sendTransaction: () => new Promise(() => {}) };
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, Math.min(ms, 5));
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

await test('Task status merge never downgrades Completed even across out-of-order syncs', () => {
  const released = { id: 't1', status: 'Completed', release_tx_hash: 'a'.repeat(64) };
  const stale = { id: 't1', status: 'Available', release_tx_hash: null };
  assert.strictEqual(mergeTaskRecords(released, stale).status, 'Completed');
  assert.strictEqual(mergeTaskRecords(stale, released).status, 'Completed');
});

await test('Horizon errors report unknown balance instead of a placeholder 10,000 XLM balance', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const out = await stellar.getAccountBalance(S.Keypair.random().publicKey());
    assert.strictEqual(out.unknown, true);
    assert.strictEqual(out.active, false);
    assert.notStrictEqual(out.raw, 10000);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test('Proof URL helper accepts https:// only and blocks javascript:/http:/data:', () => {
  assert.strictEqual(safeHttpsUrl('https://github.com/org/repo/pull/1'), 'https://github.com/org/repo/pull/1');
  assert.strictEqual(safeHttpsUrl('http://example.com'), null);
  assert.strictEqual(safeHttpsUrl('javascript:alert(1)'), null);
  assert.strictEqual(safeHttpsUrl('data:text/html,hi'), null);
});

await test('Invite payout lives in sessionStorage only, survives peek, and clears cleanly', async () => {
  const invite = await import('../src/lib/invite.js');
  const addr = S.Keypair.random().publicKey();
  assert.strictEqual(invite.captureInviteFromUrl(`?pay=${addr}`), addr);
  assert.strictEqual(localStorage.getItem('gigpay_invite_payout'), null, 'never kept in localStorage');
  assert.ok(sessionStorage.getItem('gigpay_invite_payout'), 'kept in sessionStorage');
  assert.strictEqual(invite.peekInvitePayout(), addr);
  assert.strictEqual(invite.peekInvitePayout(), addr, 'peeking keeps invite across reloads');
  invite.clearInvitePayout();
  assert.strictEqual(invite.takeInvitePayout(), null, 'cleared on sign-out or after lock');
  sessionStorage.setItem('gigpay_invite_payout', JSON.stringify({ address: addr, at: Date.now() - 25 * 3600 * 1000 }));
  assert.strictEqual(invite.takeInvitePayout(), null, 'older than 24h is ignored');
});

await test('Dispute metadata shows when, by whom, and when resolved', async () => {
  const { getDisputeMetadata } = await import('../src/lib/disputeMetadata.js');
  const t = { client_id: 'c1', dispute_reason: 'Wrong file', disputed_at: '2026-11-05T02:00:00Z', disputed_by: 'c1', dispute_resolved_at: '2026-11-05T03:00:00Z' };
  const m = getDisputeMetadata(t, 'c1');
  assert.ok(m.raisedAt && m.resolvedAt);
  assert.strictEqual(m.raisedBy, 'the client (you)');
  assert.strictEqual(getDisputeMetadata({ ...t, dispute_resolved_at: '2026-11-04T00:00:00Z' }).resolvedAt, null, 'older resolution is not current');
  assert.strictEqual(getDisputeMetadata({ client_id: 'c1' }).raisedBy, 'not recorded');
});

await test('Activity log never sends a name or email', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  const previousWebhookUrl = process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
  process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL = 'https://example.invalid/webhook';
  globalThis.fetch = async (_url, init) => { sent.push(String(init?.body || '')); return new Response('{}'); };
  try {
    const { recordStudentToGoogleSheet } = await import('../src/lib/sheetsSync.js');
    await recordStudentToGoogleSheet({ emailForSourceDetection: 'tester01@umak.edu.ph', programSection: 'Client', walletAddress: 'GTEST' });
  } finally {
    globalThis.fetch = realFetch;
    if (previousWebhookUrl === undefined) delete process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL;
    else process.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL = previousWebhookUrl;
  }
  assert.strictEqual(sent.length, 1);
  assert.ok(!sent[0].includes('@') && !sent[0].includes('tester01'), 'no email or name in the payload');
});

await test('Invite QR encodes exactly the invite link as inline data PNG', async () => {
  const QRCode = (await import('qrcode')).default;
  const invite = await import('../src/lib/invite.js');
  const addr = S.Keypair.random().publicKey();
  const link = invite.buildInviteLink(addr, 'https://www.gigpay.tech');
  const url = await invite.buildInviteQrDataUrl(addr, 'https://www.gigpay.tech');
  assert.ok(url.startsWith('data:image/png;base64,'), 'QR is an inline PNG (allowed by the CSP img-src data:)');
  const encoded = QRCode.create(link, { errorCorrectionLevel: 'M' }).segments.map((seg) => Buffer.from(seg.data).toString('utf8')).join('');
  assert.strictEqual(encoded, link, 'the QR holds the same invite link as Share invite link');
});

await test('Security & infra invariants: CSP data: img-src, no X-Frame-Options meta, Realtime migration on tasks', () => {
  const html = read('index.html');
  assert.ok(/img-src[^;]*data:/.test(html), 'CSP allows data: images');
  assert.ok(!/http-equiv="X-Frame-Options"/.test(html), 'no X-Frame-Options meta');
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const sql = migrations.map((m) => read(`supabase/migrations/${m}`)).join('\n');
  assert.ok(/alter publication supabase_realtime add table public\.tasks/i.test(sql), 'tasks table is in the Realtime publication');
});

await test('Refused sends mark error as notSent while dropped connections stay unknown', async () => {
  for (const status of ['TRY_AGAIN_LATER', 'ERROR']) {
    const server = { sendTransaction: async () => ({ status, errorResultXdr: 'AAAA' }) };
    await assert.rejects(() => stellar.sendAndConfirm(signedTx(), { server, poll: async () => ({ status: 'SUCCESS' }) }),
      (e) => e.notSent === true, `${status} is reported as not sent`);
  }
  const dropped = { sendTransaction: async () => { throw new Error('Failed to fetch'); } };
  await assert.rejects(() => stellar.sendAndConfirm(signedTx(), { server: dropped, poll: async () => ({ status: 'SUCCESS' }) }),
    (e) => !e.notSent, 'a dropped connection stays unknown');
});

await test('Duplicate lock detection catches rapid re-locks and ignores released or older escrows', async () => {
  const { findRecentDuplicateLock, duplicateKey } = await import('../src/lib/duplicateLock.js');
  const now = Date.parse('2026-11-13T05:37:00Z');
  const w = 'GAGCJHFNVZWJOLTM2VC3ITYNXRPUVFLWQSDSYYO6EYY3RVP4Z7NTTBVM';
  const first = { on_chain_task_id: 66, freelancer_wallet: w, amount: '10', status: 'Available', created_at: '2026-11-13T05:34:56Z' };
  assert.strictEqual(findRecentDuplicateLock([first], { freelancerWallet: w, amount: '10', now }), first);
  assert.strictEqual(findRecentDuplicateLock([first], { freelancerWallet: w, amount: '2', now }), null);
  assert.strictEqual(findRecentDuplicateLock([{ ...first, status: 'Completed' }], { freelancerWallet: w, amount: '10', now }), null);
  assert.strictEqual(findRecentDuplicateLock([first], { freelancerWallet: w, amount: '10', now: now + 20 * 60 * 1000 }), null);
  assert.strictEqual(duplicateKey(` ${w} `, '10'), duplicateKey(w, 10));
});

console.log(`\n  Onboarding safety: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
