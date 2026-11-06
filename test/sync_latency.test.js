/**
 * Cross-tab sync latency (SOW D1 acceptance (a)/(c): state updates across separate client and
 * freelancer tabs within 500ms).
 *
 * What this measures: the real production build of the app (vite build of src/), served locally, in
 * two tabs of one headless Chromium profile. Tab A is /client, tab B is /freelancer, both signed in as
 * the offline demo tester. Tab A clicks "Confirm Dispute Freeze" / "Resolve Dispute"; TaskContext's
 * updateTasksAndCache writes gigpay_shared_tasks and posts on the gigpay_sync_channel BroadcastChannel;
 * tab B's TaskContext listeners merge the update and React re-renders the task card. Latency is the
 * time from the click event in tab A to the DOM change in tab B (MutationObserver), both read from
 * performance.timeOrigin + performance.now() on the same machine. It ends at DOM commit, not at paint.
 *
 * What it does NOT measure: sync between two devices (that goes through Supabase Realtime, which this
 * test never contacts). All requests that leave the local server are blocked, so nothing is written to
 * Supabase or Stellar, and the test runs offline.
 *
 * Needs Playwright + Chromium (not a package dependency):
 *   npm i --no-save playwright && npx playwright install chromium
 * Command: npm run test:latency
 */

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';

const ITERATIONS = 20; // each iteration measures two transitions (dispute, resolve) => 40 samples
const SLA_MS = 500;
const TASK_ID = 'latency-probe-task'; // not a UUID, so TaskContext never sends it to Supabase
const TASK_TITLE = 'Latency probe task';
const DEMO_USER = { id: 'demo-client-uuid-001', email: 'latency@localhost', user_metadata: { role: 'client' } };

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gigpay-latency-dist-'));

console.log('\n=== Cross-tab sync latency (production build, 2 tabs, offline) ===');
const buildStart = Date.now();
await build({ root, logLevel: 'error', build: { outDir, emptyOutDir: true } });
console.log(`  built src/ in ${Date.now() - buildStart} ms`);

// 127.0.0.1 rather than "localhost": on localhost src/lib/supabase.js routes through a dev proxy.
const server = await preview({ root, logLevel: 'silent', build: { outDir }, preview: { host: '127.0.0.1', port: 4319, strictPort: false } });
const origin = new URL(server.resolvedUrls.local[0]).origin;

const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
let exitCode = 1;
try {
  const context = await browser.newContext();
  let blocked = 0;
  await context.route('**/*', (route) => {
    if (route.request().url().startsWith(origin)) return route.continue();
    blocked++;
    return route.abort();
  });

  const seedTask = {
    id: TASK_ID, title: TASK_TITLE, amount: '1', status: 'In Progress',
    client_id: DEMO_USER.id, freelancer_id: DEMO_USER.id, tx_hash: null, created_at: new Date().toISOString()
  };
  const tabA = await context.newPage();
  await tabA.goto(origin + '/');
  await tabA.evaluate(({ user, task }) => {
    localStorage.clear();
    localStorage.setItem('gigpay_demo_user', JSON.stringify(user));
    localStorage.setItem('gigpay_shared_tasks', JSON.stringify([task]));
  }, { user: DEMO_USER, task: seedTask });

  await tabA.goto(origin + '/client');
  const tabB = await context.newPage();
  await tabB.goto(origin + '/freelancer');

  // Tab A: remember when the last click happened. Tab B: resolve when the task card reaches a state.
  await tabA.evaluate(() => {
    document.addEventListener('click', () => { window.__lastClickAt = performance.timeOrigin + performance.now(); }, true);
  });
  await tabB.evaluate((title) => {
    const cardText = () => {
      const h = [...document.querySelectorAll('h4')].find((el) => el.textContent.trim() === title);
      return h ? h.closest('.glass-panel')?.textContent || '' : null;
    };
    // Arms an observer and returns at once, so it is in place before tab A clicks.
    window.__armCardWatch = (wantDisputed) => {
      window.__seenAt = null;
      const matches = () => { const t = cardText(); return t !== null && t.includes('Dispute Frozen') === wantDisputed; };
      if (matches()) { window.__seenAt = -1; return; } // already in that state: a setup error, reported below
      const obs = new MutationObserver(() => {
        if (matches()) { obs.disconnect(); window.__seenAt = performance.timeOrigin + performance.now(); }
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    };
  }, TASK_TITLE);

  const cardA = tabA.locator('.glass-panel', { has: tabA.locator('h3', { hasText: TASK_TITLE }) }).first();
  await cardA.waitFor({ timeout: 15000 });
  await tabB.locator('h4', { hasText: TASK_TITLE }).waitFor({ timeout: 15000 });

  const measure = async (wantDisputed, clickTarget) => {
    await tabB.evaluate((d) => window.__armCardWatch(d), wantDisputed);
    await clickTarget.click();
    const handle = await tabB.waitForFunction(() => window.__seenAt, null, { timeout: 5000 })
      .catch(() => assert.fail(`tab B never showed the ${wantDisputed ? 'disputed' : 'resolved'} task within 5 s`));
    const seenAt = await handle.jsonValue();
    assert.ok(seenAt > 0, 'tab B was already in the target state before the click');
    const clickAt = await tabA.evaluate(() => window.__lastClickAt);
    return seenAt - clickAt;
  };

  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    await cardA.getByRole('button', { name: /Freeze & Dispute/ }).click(); // opens the modal (not timed)
    samples.push(await measure(true, tabA.getByRole('button', { name: 'Confirm Dispute Freeze' })));
    await cardA.getByRole('button', { name: /Resolve Dispute/ }).waitFor();
    await tabA.waitForTimeout(20); // keep dispute/resolve timestamps distinct
    samples.push(await measure(false, cardA.getByRole('button', { name: /Resolve Dispute/ })));
    await cardA.getByRole('button', { name: /Freeze & Dispute/ }).waitFor();
    await tabA.waitForTimeout(20);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
  const fmt = (v) => v.toFixed(1);
  console.log(`  samples (ms, click in tab A -> DOM update in tab B): ${samples.map(fmt).join(', ')}`);
  console.log(`  n=${samples.length}  min=${fmt(sorted[0])}  median=${fmt(pct(50))}  p95=${fmt(pct(95))}  max=${fmt(sorted.at(-1))}  (SLA p95 < ${SLA_MS} ms)`);
  console.log(`  outbound requests blocked (Supabase etc.): ${blocked}`);
  assert.ok(pct(95) < SLA_MS, `p95 ${fmt(pct(95))} ms is not under ${SLA_MS} ms`);
  console.log('  PASS: cross-tab p95 under 500 ms\n');
  exitCode = 0;
} catch (err) {
  console.error('  FAIL:', err.message);
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  fs.rmSync(outDir, { recursive: true, force: true });
}
process.exit(exitCode);
