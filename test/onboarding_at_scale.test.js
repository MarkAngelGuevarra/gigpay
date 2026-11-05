/**
 * Onboarding at scale (BCC lab sessions): invite links and the Friendbot fallback.
 *
 *  - Invite links (/client?pay=G...) replace copy-pasting a 56-character address, and must never
 *    pre-fill a malformed, demo or team address.
 *  - When Friendbot refuses (it rate-limits by IP, so a classroom on one Wi-Fi hits it), a practice
 *    wallet is funded by the GigPay Testnet pool instead of being left empty.
 *
 * Offline: Friendbot, Horizon and the pool are stubbed. Command: node test/onboarding_at_scale.test.js
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

const { Keypair } = await import('@stellar/stellar-sdk');
const stellar = await import('../src/lib/stellar.js');
const invite = await import('../src/lib/invite.js');

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; }
};

console.log('\n=== Onboarding at scale ===\n');

const FREELANCER = Keypair.random().publicKey();

await test('Invite link carries the payout address and pre-fills it exactly once', () => {
  const link = invite.buildInviteLink(FREELANCER, 'https://www.gigpay.tech');
  assert.strictEqual(link, `https://www.gigpay.tech/client?pay=${FREELANCER}`);
  assert.strictEqual(invite.captureInviteFromUrl(new URL(link).search), FREELANCER);
  assert.strictEqual(invite.takeInvitePayout(), FREELANCER);
  assert.strictEqual(invite.takeInvitePayout(), null, 'second read must be empty');
});

await test('Invite links never pre-fill a typo, demo key or team wallet', () => {
  const typo = FREELANCER.slice(0, -1) + (FREELANCER.endsWith('A') ? 'B' : 'A');
  for (const bad of [typo, stellar.DEMO_PUBLIC_KEY, stellar.DEFAULT_FREELANCER_TESTNET_ADDRESS, 'GBDEMO_X', '<script>', '']) {
    assert.strictEqual(invite.captureInviteFromUrl(`?pay=${encodeURIComponent(bad)}`), null, `accepted ${bad}`);
  }
  assert.strictEqual(invite.takeInvitePayout(), null);
});

await test('Invite older than 24h is ignored', () => {
  localStorage.setItem('gigpay_invite_payout', JSON.stringify({ address: FREELANCER, at: Date.now() - 25 * 3600 * 1000 }));
  assert.strictEqual(invite.takeInvitePayout(), null);
});

// Stub the network: Horizon says the account exists only after "funded" is set.
const realFetch = globalThis.fetch;
const stubNetwork = ({ friendbotStatus }) => {
  const state = { funded: false, friendbotCalls: 0 };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('friendbot.stellar.org')) {
      state.friendbotCalls++;
      if (friendbotStatus === 200) state.funded = true;
      return new Response('{}', { status: friendbotStatus });
    }
    if (u.includes('/accounts/')) {
      return state.funded
        ? new Response(JSON.stringify({ id: 'x', account_id: u.split('/accounts/')[1], sequence: '1', balances: [{ asset_type: 'native', balance: '25.0000000' }], subentry_count: 0, thresholds: {}, flags: {}, signers: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ status: 404 }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(url);
  };
  return state;
};

await test('Friendbot rate-limited: the GigPay pool funds the practice wallet', async () => {
  const net = stubNetwork({ friendbotStatus: 429 });
  let poolCalls = 0;
  stellar.setPracticeWalletFundingFallback(async () => { poolCalls++; net.funded = true; return { status: 'funded' }; });
  const ok = await stellar.ensureEphemeralAccountFunded(Keypair.random().publicKey(), { attempts: 2, delayMs: 10 });
  assert.strictEqual(ok, true);
  assert.strictEqual(net.friendbotCalls, 1);
  assert.strictEqual(poolCalls, 1, 'pool must be asked exactly once');
});

await test('Friendbot works: the pool is never touched', async () => {
  const net = stubNetwork({ friendbotStatus: 200 });
  let poolCalls = 0;
  stellar.setPracticeWalletFundingFallback(async () => { poolCalls++; });
  const ok = await stellar.ensureEphemeralAccountFunded(Keypair.random().publicKey(), { attempts: 2, delayMs: 10 });
  assert.strictEqual(ok, true);
  assert.strictEqual(net.friendbotCalls, 1);
  assert.strictEqual(poolCalls, 0);
});

await test('Pool also fails: reports not funded instead of pretending', async () => {
  stubNetwork({ friendbotStatus: 429 });
  stellar.setPracticeWalletFundingFallback(async () => { throw new Error('pool down'); });
  const ok = await stellar.ensureEphemeralAccountFunded(Keypair.random().publicKey(), { attempts: 2, delayMs: 10 });
  assert.strictEqual(ok, false);
});

await test('Pool function keeps its key server-side and limits one top-up per account', () => {
  const fn = fs.readFileSync(new URL('../supabase/functions/fund-practice-wallet/index.ts', import.meta.url), 'utf8');
  assert.ok(!/\bS[A-Z2-7]{55}\b/.test(fn), 'no secret key may be committed in the function source');
  assert.ok(fn.includes('gigpay_testnet_pool_secret'), 'secret must come from Vault');
  assert.ok(fn.includes('practice_wallet_fundings'), 'one-top-up ledger must be used');
  assert.ok(fn.includes('Networks.TESTNET'), 'pool must be Testnet only');
});

globalThis.fetch = realFetch;
stellar.setPracticeWalletFundingFallback(null);
console.log(`\n  Onboarding at scale: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
