/**
 * Dispute freeze across devices (SOW Deliverable 3b: a dispute strictly prevents standard release).
 *
 * "Disputed" and "In Progress" share a lifecycle rank, so the old merge let a stale copy win: a dispute
 * raised on one device was undone by another (and release went ahead), and a resolved dispute stayed
 * frozen. The dispute timestamps now decide. Command: node test/dispute_sync.test.js
 */
import assert from 'node:assert';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = globalThis.localStorage;

const { mergeTaskRecords, isDisputeActive } = await import('../src/lib/taskLifecycle.js');
const { submitApproveTask } = await import('../src/lib/stellar.js');

let passed = 0;
let failed = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (err) { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; }
};

const T0 = '2026-11-05T10:00:00.000Z';
const T1 = '2026-11-05T10:05:00.000Z';
const T2 = '2026-11-05T10:10:00.000Z';
const base = { id: 't1', title: 'Logo', status: 'In Progress', on_chain_task_id: 7 };

console.log('\n=== Dispute freeze across devices ===\n');

await test('Raising a dispute applies even though the old copy says In Progress', () => {
  const merged = mergeTaskRecords(base, { ...base, status: 'Disputed', disputed_at: T1, dispute_reason: 'Wrong file' });
  assert.strictEqual(merged.status, 'Disputed');
  assert.strictEqual(merged.dispute_reason, 'Wrong file');
});

await test('A stale In Progress copy from another device cannot undo the dispute', () => {
  const disputed = { ...base, status: 'Disputed', disputed_at: T1 };
  assert.strictEqual(mergeTaskRecords(disputed, { ...base, status: 'In Progress' }).status, 'Disputed');
  assert.strictEqual(mergeTaskRecords({ ...base, status: 'In Progress' }, disputed).status, 'Disputed');
});

await test('Resolving unfreezes on every device, in either merge order', () => {
  const disputed = { ...base, status: 'Disputed', disputed_at: T1 };
  const resolved = { ...base, status: 'In Progress', disputed_at: T1, dispute_resolved_at: T2 };
  assert.strictEqual(mergeTaskRecords(disputed, resolved).status, 'In Progress');
  assert.strictEqual(mergeTaskRecords(resolved, disputed).status, 'In Progress');
});

await test('A second dispute after a resolution freezes again', () => {
  const resolved = { ...base, status: 'In Progress', disputed_at: T0, dispute_resolved_at: T1 };
  const again = { ...base, status: 'Disputed', disputed_at: T2, dispute_resolved_at: T1 };
  assert.strictEqual(mergeTaskRecords(resolved, again).status, 'Disputed');
});

await test('Completed is never demoted, and Available never overrides an accepted task', () => {
  assert.strictEqual(mergeTaskRecords({ ...base, status: 'Completed' }, { ...base, status: 'In Progress' }).status, 'Completed');
  assert.strictEqual(mergeTaskRecords({ ...base, status: 'In Progress' }, { ...base, status: 'Available' }).status, 'In Progress');
});

await test('Submitted proof reaches the other device: Under Review beats a stale In Progress copy', () => {
  const review = { ...base, status: 'Under Review', proof_attached: true, proof_url: 'https://docs.google.com/x' };
  for (const merged of [mergeTaskRecords({ ...base }, review), mergeTaskRecords(review, { ...base })]) {
    assert.strictEqual(merged.status, 'Under Review');
    assert.strictEqual(merged.proof_url, 'https://docs.google.com/x');
  }
});

await test('A dispute raised while work is under review still freezes it', () => {
  const review = { ...base, status: 'Under Review', proof_attached: true };
  const disputed = { ...review, status: 'Disputed', disputed_at: T1 };
  assert.strictEqual(mergeTaskRecords(review, disputed).status, 'Disputed');
  assert.strictEqual(mergeTaskRecords(disputed, review).status, 'Disputed');
});

await test('Release is refused for a task with an open dispute even if its status is stale', async () => {
  const stale = { ...base, status: 'In Progress', disputed_at: T1 };
  assert.strictEqual(isDisputeActive(stale), true);
  await assert.rejects(() => submitApproveTask({ clientAddress: 'GBDEMO_X', taskId: stale }), (e) => /in dispute/.test(e.message));
});

console.log(`\n  Dispute sync: ${passed}/${passed + failed} passed\n`);
if (failed > 0) process.exit(1);
