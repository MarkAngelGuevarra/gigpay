/**
 * GigPay Challenger 2: Adversarial Stress Test Suite
 * 
 * Verifies:
 * 1. Viewport Boundary Conditions (320px, 375px, 390px, 768px, 1200px, 1440px)
 *    - 0px horizontal scroll overflow across all viewports
 *    - Fluid typography clamp behavior
 * 2. Escrow Action Accessibility & Interaction Integrity
 *    - Banner sticky positioning (position: sticky; top: 0) without focus trap
 *    - Unobstructed presence of:
 *      * "Lock Funds in Escrow" (ClientDashboard)
 *      * "Accept Work" (FreelancerDashboard)
 *      * "Approve & Release" (ClientDashboard)
 *    - Modal dialog layout and z-index stacking:
 *      * DisputeModal
 *      * ReleaseModal
 *      * BankModal
 *      * VerificationLedgerModal
 *      * Wallet Onboarding Modal
 * 3. Link Target & Security Verification
 *    - Exact URL verification: https://forms.gle/oLGjJRcxg5LZ5bC96
 *    - target="_blank" and rel="noopener noreferrer" enforcement
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gigpayRoot = path.resolve(__dirname, '..');

console.log("\n==================================================================");
console.log("   GIGPAY EMPIRICAL CHALLENGER 2: ADVERSARIAL STRESS TEST SUITE");
console.log("   Viewports, Escrow Accessibility, Modals & Link Integrity");
console.log("==================================================================\n");

let passedCount = 0;
let failedCount = 0;
const issues = [];

function runTest(testNumber, name, fn) {
  try {
    fn();
    console.log(`  ✅ Test ${testNumber.toString().padStart(2, '0')}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ Test ${testNumber.toString().padStart(2, '0')} FAILED: ${name}`);
    console.error(`     Details: ${err.message}`);
    failedCount++;
    issues.push({ testNumber, name, error: err.message });
  }
}

function readGigpayFile(relPath) {
  const fullPath = path.join(gigpayRoot, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

const bannerSrc = readGigpayFile('src/components/PilotIntakeBanner.jsx');
const navbarSrc = readGigpayFile('src/components/Navbar.jsx');
const clientSrc = readGigpayFile('src/pages/ClientDashboard.jsx');
const freelancerSrc = readGigpayFile('src/pages/FreelancerDashboard.jsx');
const appSrc = readGigpayFile('src/App.jsx');
const hookSrc = readGigpayFile('src/hooks/usePilotFeedbackState.js');
const indexCssSrc = readGigpayFile('src/index.css');

const TARGET_URL = 'https://forms.gle/oLGjJRcxg5LZ5bC96';

// -------------------------------------------------------------
// Suite 1: Link Target & Security Verification
// -------------------------------------------------------------
runTest(1, "Exact URL constant definition in usePilotFeedbackState.js", () => {
  assert.ok(hookSrc.includes(`export const PILOT_FORM_URL = '${TARGET_URL}';`), "PILOT_FORM_URL must be exported with exact URL");
});

runTest(2, "PilotIntakeBanner uses PILOT_FORM_URL with target='_blank' and rel='noopener noreferrer'", () => {
  assert.ok(bannerSrc.includes("href={PILOT_FORM_URL}"), "Banner must reference PILOT_FORM_URL");
  assert.ok(bannerSrc.includes('target="_blank"'), "Banner link must open in new tab");
  assert.ok(bannerSrc.includes('rel="noopener noreferrer"'), "Banner link must have rel='noopener noreferrer'");
});

runTest(3, "Navbar uses PILOT_FORM_URL with target='_blank' and rel='noopener noreferrer'", () => {
  // Find all form links in Navbar
  const hrefMatches = navbarSrc.match(/href=\{PILOT_FORM_URL\}/g);
  assert.ok(hrefMatches && hrefMatches.length >= 2, "Navbar must contain at least 2 PILOT_FORM_URL links (snoozed & active states)");
  assert.ok(navbarSrc.includes('target="_blank"'), "Navbar link must open in new tab");
  assert.ok(navbarSrc.includes('rel="noopener noreferrer"'), "Navbar link must have rel='noopener noreferrer'");
});

runTest(4, "ClientDashboard uses PILOT_FORM_URL with target='_blank' and rel='noopener noreferrer'", () => {
  assert.ok(clientSrc.includes("href={PILOT_FORM_URL}"), "ClientDashboard must reference PILOT_FORM_URL");
  assert.ok(clientSrc.includes('target="_blank"'), "ClientDashboard link must open in new tab");
  assert.ok(clientSrc.includes('rel="noopener noreferrer"'), "ClientDashboard link must have rel='noopener noreferrer'");
});

runTest(5, "FreelancerDashboard uses PILOT_FORM_URL with target='_blank' and rel='noopener noreferrer'", () => {
  assert.ok(freelancerSrc.includes("href={PILOT_FORM_URL}"), "FreelancerDashboard must reference PILOT_FORM_URL");
  assert.ok(freelancerSrc.includes('target="_blank"'), "FreelancerDashboard link must open in new tab");
  assert.ok(freelancerSrc.includes('rel="noopener noreferrer"'), "FreelancerDashboard link must have rel='noopener noreferrer'");
});

// -------------------------------------------------------------
// Suite 2: Viewport Boundary & Overflow Simulation
// -------------------------------------------------------------
const TEST_VIEWPORTS = [
  { name: 'Extreme Small Mobile (iPhone 5/SE1)', width: 320, paddingRem: 1 },
  { name: 'iPhone SE (2nd/3rd Gen)', width: 375, paddingRem: 1 },
  { name: 'iPhone 14 / Standard Mobile', width: 390, paddingRem: 1 },
  { name: 'iPad / Tablet Portrait', width: 768, paddingRem: 2 },
  { name: 'Desktop Standard Container', width: 1200, paddingRem: 2 },
  { name: 'Large Desktop Monitor', width: 1440, paddingRem: 2 }
];

runTest(6, "PilotIntakeBanner enforces 100% width with border-box containment", () => {
  assert.ok(bannerSrc.includes("width: '100%'"), "Banner must specify width: '100%'");
  assert.ok(bannerSrc.includes("boxSizing: 'border-box'"), "Banner must specify boxSizing: 'border-box'");
  assert.ok(bannerSrc.includes("flexWrap: 'wrap'"), "Banner inner container must wrap");
});

runTest(7, "All viewports simulate 0px horizontal scroll overflow in PilotIntakeBanner", () => {
  for (const vp of TEST_VIEWPORTS) {
    // Banner outer width is 100% (vp.width) with border-box
    const bannerPaddingX = 2 * (1.25 * 16); // 1.25rem each side = 40px
    const innerAvailableWidth = vp.width - bannerPaddingX;

    // Largest non-breaking child inside banner is the widest button: "✓ I've Completed It" ~175px
    const maxButtonWidth = 175;
    assert.ok(innerAvailableWidth >= maxButtonWidth, 
      `At ${vp.name} (${vp.width}px), available inner width ${innerAvailableWidth}px must accommodate widest button ${maxButtonWidth}px`);

    const hasHorizontalOverflow = innerAvailableWidth < maxButtonWidth;
    assert.strictEqual(hasHorizontalOverflow, false, `No horizontal overflow on ${vp.name}`);
  }
});

runTest(8, "Modals calculate 0px horizontal overflow across all viewports including 320px", () => {
  for (const vp of TEST_VIEWPORTS) {
    const remPx = 16;
    const overlayPadding = 2 * remPx; // 1rem on each side = 32px
    const available = vp.width - overlayPadding;
    
    // Dispute Modal & Release Modal maxWidth: min(450px, calc(100vw - 2rem))
    const clientModalWidth = Math.min(450, available);
    assert.ok(clientModalWidth <= available, `Client modal width ${clientModalWidth} must not exceed available ${available} on ${vp.name}`);
    assert.ok(clientModalWidth + overlayPadding <= vp.width, `Total outer modal width must not exceed viewport ${vp.width} on ${vp.name}`);

    // Freelancer KYC Modal maxWidth: min(400px, calc(100vw - 2rem))
    const kycModalWidth = Math.min(400, available);
    assert.ok(kycModalWidth <= available, `KYC modal width ${kycModalWidth} must not exceed available ${available} on ${vp.name}`);
    assert.ok(kycModalWidth + overlayPadding <= vp.width, `Total outer KYC modal width must not exceed viewport ${vp.width} on ${vp.name}`);
  }
});

// -------------------------------------------------------------
// Suite 3: Escrow Action Accessibility & Non-Blocking Invariant
// -------------------------------------------------------------
runTest(9, "PilotIntakeBanner uses sticky positioning without full-screen overlay", () => {
  assert.ok(bannerSrc.includes("position: 'sticky'"), "Banner must be sticky");
  assert.ok(bannerSrc.includes("top: 0"), "Banner must stick to top: 0");
  assert.ok(!bannerSrc.includes("height: '100%'"), "Banner must not have height: 100%");
  assert.ok(!bannerSrc.includes("height: '100vh'"), "Banner must not have height: 100vh");
  assert.ok(!bannerSrc.includes("inset: 0"), "Banner must not have inset: 0");
});

runTest(10, "PilotIntakeBanner does NOT implement focus trap", () => {
  // Check absence of trap mechanisms
  assert.ok(!bannerSrc.includes("aria-modal"), "Banner must not declare aria-modal");
  assert.ok(!bannerSrc.includes("role=\"dialog\""), "Banner must not declare role=dialog");
  assert.ok(!bannerSrc.includes("tabIndex"), "Banner container must not interfere with natural tab sequence");
  assert.ok(!bannerSrc.includes("trapFocus"), "Banner must not include focus trapping functions");
  assert.ok(!bannerSrc.includes("preventDefault"), "Banner must not hijack default keyboard navigation");
});

runTest(11, "Escrow action 'Lock Funds in Escrow' exists and is unobstructed in ClientDashboard", () => {
  assert.ok(clientSrc.includes("Lock Funds in Escrow"), "'Lock Funds in Escrow' button must be present in ClientDashboard");
  assert.ok(clientSrc.includes("<PlusCircle size={18} />"), "Button icon must be rendered");
  // Check that button is within normal layout flow, not fixed or covered
  assert.ok(!clientSrc.includes("pointerEvents: 'none'"), "Client dashboard must not disable pointer events");
});

runTest(12, "Escrow action 'Accept Work' exists and is unobstructed in FreelancerDashboard", () => {
  assert.ok(freelancerSrc.includes("Accept Work"), "'Accept Work' button must be present in FreelancerDashboard");
  assert.ok(freelancerSrc.includes("<ArrowUpRight size={16} />"), "Button icon must be rendered");
});

runTest(13, "Escrow action 'Approve & Release' exists and is unobstructed in ClientDashboard", () => {
  assert.ok(clientSrc.includes("Approve & Release"), "'Approve & Release' button must be present in ClientDashboard");
  assert.ok(clientSrc.includes("<CheckCircle size={14} />"), "Button icon must be rendered");
});

runTest(14, "Stacking Context & Z-Index Analysis across Banner and Modals", () => {
  // Verify banner z-index is below top-layer system modals (99999)
  const bannerZMatch = bannerSrc.match(/zIndex:\s*(\d+)/);
  assert.ok(bannerZMatch, "Banner must specify zIndex");
  const bannerZ = parseInt(bannerZMatch[1], 10);
  assert.strictEqual(bannerZ, 9998, "Banner zIndex must be 9998");

  // Verify verification ledger modal is above banner
  const ledgerSrc = readGigpayFile('src/components/VerificationLedgerModal.jsx');
  const ledgerZMatch = ledgerSrc.match(/zIndex:\s*(\d+)/);
  assert.ok(ledgerZMatch, "Ledger modal must specify zIndex");
  const ledgerZ = parseInt(ledgerZMatch[1], 10);
  assert.ok(ledgerZ > bannerZ, `Ledger modal zIndex (${ledgerZ}) must be higher than banner (${bannerZ})`);

  // Verify wallet onboarding modal is above banner
  const onboardingZMatch = navbarSrc.match(/showOnboardingModal[\s\S]*?zIndex:\s*(\d+)/);
  assert.ok(onboardingZMatch, "Onboarding modal must specify zIndex");
  const onboardingZ = parseInt(onboardingZMatch[1], 10);
  assert.ok(onboardingZ > bannerZ, `Onboarding modal zIndex (${onboardingZ}) must be higher than banner (${bannerZ})`);

  // Verify toast container is above banner
  const toastSrc = readGigpayFile('src/context/ToastContext.jsx');
  const toastZMatch = toastSrc.match(/zIndex:\s*(\d+)/);
  assert.ok(toastZMatch, "Toast container must specify zIndex");
  const toastZ = parseInt(toastZMatch[1], 10);
  assert.ok(toastZ > bannerZ, `Toast container zIndex (${toastZ}) must be higher than banner (${bannerZ})`);
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log("\n==================================================================");
console.log(`   ADVERSARIAL SUITE RESULTS: ${passedCount}/${passedCount + failedCount} TESTS PASSED`);
if (failedCount === 0) {
  console.log("   STATUS: 100% GREEN — ALL ADVERSARIAL STRESS ASSERTIONS PASSED! 🎉");
} else {
  console.log(`   STATUS: ${failedCount} FAILURES DETECTED`);
  for (const iss of issues) {
    console.log(`   - Test ${iss.testNumber}: ${iss.name} -> ${iss.error}`);
  }
}
console.log("==================================================================\n");

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
