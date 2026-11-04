/**
 * Onboarding & Public-Evidence Privacy Harness
 *
 * Instawards reviewers and testers see the public ledger and CSV exports. These checks make sure:
 *   - a mistyped or old URL never renders a blank page,
 *   - no unused component carries unverified adoption claims,
 *   - public exports never contain tester names or emails (wallet addresses only),
 *   - the escrow workflow keeps its safety gates.
 *
 * Command: node test/onboarding_empirical_challenge.test.js
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf-8');

console.log('==================================================================');
console.log('   ONBOARDING & PUBLIC-EVIDENCE PRIVACY HARNESS');
console.log('==================================================================');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ [PASS] ${name}`); passed++; }
  catch (err) { console.error(`  ❌ [FAIL] ${name}\n     Error: ${err.message}`); failed++; }
}

test('TEST 1: Unknown URLs (e.g. /ledger) redirect home instead of rendering a blank page', () => {
  const app = read('src', 'App.jsx');
  assert.ok(app.includes('path="*"') && app.includes('<Navigate to="/" replace />'), 'App.jsx needs a catch-all route');
});

test('TEST 2: No component carries the unverified "Total Verified Cohort" claim', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src', 'components', 'PublicLedgerModal.jsx')), 'PublicLedgerModal.jsx should stay deleted');
  assert.ok(!fs.existsSync(path.join(root, 'src', 'components', 'EscrowSuccessModal.jsx')), 'EscrowSuccessModal.jsx should stay deleted');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const offenders = walk(path.join(root, 'src')).filter((f) => /\.(jsx?|tsx?)$/.test(f) && fs.readFileSync(f, 'utf-8').includes('Total Verified Cohort'));
  assert.deepStrictEqual(offenders, []);
});

test('TEST 3: Public verification ledger never displays tester emails', () => {
  const modal = read('src', 'components', 'VerificationLedgerModal.jsx');
  assert.ok(!/email/i.test(modal), 'VerificationLedgerModal must not render emails');
});

test('TEST 4: Ledger CSV export contains wallets only, no names or emails', () => {
  const ctx = read('src', 'context', 'TaskContext.jsx');
  const m = ctx.match(/const headers = \[(.*?)\];/s);
  assert.ok(m, 'Could not find CSV headers in TaskContext.jsx');
  assert.ok(!/Email|Student|Name"/.test(m[1]), `CSV headers must not include personal data: ${m[1]}`);
  assert.ok(m[1].includes('Counts As Outside User'), 'CSV must label which rows count as outside users');
});

test('TEST 5: Telemetry CSV export contains no Email or Department column', () => {
  const tele = read('src', 'lib', 'telemetry.js');
  const block = tele.slice(tele.indexOf('const headers = ['), tele.indexOf('];', tele.indexOf('const headers = [')));
  assert.ok(!/'Email'|'Department'/.test(block), 'telemetry CSV must not export emails or departments');
});

test("TEST 6: ClientDashboard requires exact uppercase 'CONFIRM' to release escrow", () => {
  assert.ok(read('src', 'pages', 'ClientDashboard.jsx').includes("confirmText !== 'CONFIRM'"));
});

test("TEST 7: Freelancer must accept before submitting proof; client cannot release an 'Available' task", () => {
  assert.ok(read('src', 'pages', 'FreelancerDashboard.jsx').includes('handleAcceptWork(task.id, task.amount)'));
  assert.ok(read('src', 'pages', 'ClientDashboard.jsx').includes("taskObj.status === 'Available'"));
});

console.log('==================================================================');
console.log(`TOTAL EXECUTED: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('==================================================================');
if (failed > 0) process.exit(1);
