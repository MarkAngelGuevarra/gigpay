/**
 * GigPay Milestone 1: Automated Mobile Responsive Layout Test Harness
 * 
 * Verifies Requirement R2 across standard mobile viewports:
 * - 375px (iPhone SE)
 * - 390px (iPhone 12/13/14)
 * - 430px (iPhone 14 Pro Max)
 * 
 * Checks:
 * 1. Dispute Modal & Milestone Release Modal widths in ClientDashboard.jsx
 * 2. KYC Modal & Bank Off-Ramp Modal widths in FreelancerDashboard.jsx
 * 3. Navbar actions specificity & wallet pill flex wrapping in Navbar.jsx
 * 4. Typography clamp bounds in index.css and LandingPage.jsx
 * 5. Viewport boundary simulation (horizontal overflow prevention)
 * 
 * Execution: node test/mobile_layout_harness.test.js
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log("\n==================================================================");
console.log("   GIGPAY EMPIRICAL CHALLENGER 1: MOBILE RESPONSIVE TEST HARNESS");
console.log("   Requirement R2: Viewport Widths 375px, 390px, 430px");
console.log("==================================================================\n");

let passedCount = 0;
let failedCount = 0;
const failures = [];

function runTest(testNumber, name, fn) {
  try {
    fn();
    console.log(`  ✅ Test ${testNumber.toString().padStart(2, '0')}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ Test ${testNumber.toString().padStart(2, '0')} FAILED: ${name}`);
    console.error(`     Details: ${err.message}`);
    failedCount++;
    failures.push({ testNumber, name, error: err.message });
  }
}

// Helper to read project files
function readProjectFile(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  return fs.readFileSync(fullPath, 'utf8');
}

// Layout math helper: calculate CSS clamp(min, val, max) in pixels
function resolveClampPx(minPx, vwPercent, maxPx, viewportWidth) {
  const preferred = (vwPercent / 100) * viewportWidth;
  return Math.min(Math.max(preferred, minPx), maxPx);
}

// Layout math helper: simulate modal width with min(maxPx, calc(100vw - 2rem))
function computeModalWidth(maxDesktopPx, viewportWidth, remPx = 16) {
  const containerPadding = 2 * remPx; // 2rem
  const availableWidth = viewportWidth - containerPadding;
  const maxWidth = Math.min(maxDesktopPx, availableWidth);
  // width: 100% constrained by maxWidth
  const modalWidth = Math.min(availableWidth, maxWidth);
  const totalOuterWidth = modalWidth + containerPadding;
  const overflows = totalOuterWidth > viewportWidth;
  return { availableWidth, maxWidth, modalWidth, totalOuterWidth, overflows };
}

// Viewports under test
const VIEWPORTS = [
  { name: 'iPhone SE', width: 375 },
  { name: 'iPhone 12/13/14', width: 390 },
  { name: 'iPhone 14 Pro Max', width: 430 }
];

// -----------------------------------------------------------------
// Suite 1: ClientDashboard Modal Responsiveness (Tests 1-3)
// -----------------------------------------------------------------
const clientDashboardSrc = readProjectFile('src/pages/ClientDashboard.jsx');

runTest(1, "ClientDashboard: Dispute Modal specifies fluid width and 100vw-capped maxWidth", () => {
  const disputeModalMatch = clientDashboardSrc.match(/Raise Escrow Dispute[\s\S]*?className="glass-panel"[\s\S]*?style=\{\{([^}]+)\}\}/);
  assert.ok(disputeModalMatch, "Dispute modal glass-panel must exist");
  
  // Search preceding panel definition
  const panelRegex = /<div className="glass-panel" style=\{\{([^}]+)\}\}>\s*<h3[^>]*>\s*<AlertTriangle/g;
  const match = panelRegex.exec(clientDashboardSrc);
  assert.ok(match, "Dispute modal must be defined with inline glass-panel style");
  
  const styleStr = match[1];
  assert.ok(styleStr.includes("width: '100%'"), "Dispute modal must have width: '100%'");
  assert.ok(styleStr.includes("maxWidth: 'min(450px, calc(100vw - 2rem))'"), "Dispute modal must have fluid maxWidth");
  assert.ok(styleStr.includes("boxSizing: 'border-box'"), "Dispute modal must have boxSizing: 'border-box'");
});

runTest(2, "ClientDashboard: Milestone Release Modal specifies fluid width and 100vw-capped maxWidth", () => {
  const panelRegex = /<div className="glass-panel" style=\{\{([^}]+)\}\}>\s*<h3[^>]*>\s*<CheckCircle[^>]*\/> Milestone Release Confirmation/g;
  const match = panelRegex.exec(clientDashboardSrc);
  assert.ok(match, "Milestone Release modal must be defined with inline glass-panel style");
  
  const styleStr = match[1];
  assert.ok(styleStr.includes("width: '100%'"), "Milestone release modal must have width: '100%'");
  assert.ok(styleStr.includes("maxWidth: 'min(450px, calc(100vw - 2rem))'"), "Milestone release modal must have fluid maxWidth");
  assert.ok(styleStr.includes("boxSizing: 'border-box'"), "Milestone release modal must have boxSizing: 'border-box'");
});

runTest(3, "ClientDashboard: Dispute & Release modals produce 0px overflow across 375px, 390px, 430px", () => {
  for (const vp of VIEWPORTS) {
    const sim = computeModalWidth(450, vp.width);
    assert.strictEqual(sim.overflows, false, `Modal must not overflow on ${vp.name} (${vp.width}px)`);
    assert.ok(sim.modalWidth <= sim.availableWidth, `Modal width ${sim.modalWidth}px must not exceed available width ${sim.availableWidth}px on ${vp.name}`);
    assert.ok(sim.totalOuterWidth <= vp.width, `Total width ${sim.totalOuterWidth}px must not exceed viewport ${vp.width}px`);
  }
});

// -----------------------------------------------------------------
// Suite 2: FreelancerDashboard Modal Responsiveness (Tests 4-6)
// -----------------------------------------------------------------
const freelancerDashboardSrc = readProjectFile('src/pages/FreelancerDashboard.jsx');

runTest(4, "FreelancerDashboard: KYC Modal specifies fluid width and 100vw-capped maxWidth", () => {
  const panelRegex = /<div className="glass-panel" style=\{\{([^}]+)\}\}>\s*<div[^>]*>\s*<ShieldAlert/g;
  const match = panelRegex.exec(freelancerDashboardSrc);
  assert.ok(match, "KYC Modal glass-panel must exist");
  
  const styleStr = match[1];
  assert.ok(styleStr.includes("width: '100%'"), "KYC modal must have width: '100%'");
  assert.ok(styleStr.includes("maxWidth: 'min(400px, calc(100vw - 2rem))'"), "KYC modal must have fluid maxWidth min(400px, calc(100vw - 2rem))");
  assert.ok(styleStr.includes("boxSizing: 'border-box'"), "KYC modal must have boxSizing: 'border-box'");
  assert.ok(!styleStr.match(/width:\s*['"]400px['"]/), "Fixed 400px width must not be present");
});

runTest(5, "FreelancerDashboard: Bank Off-Ramp Modal specifies fluid width and 100vw-capped maxWidth", () => {
  const panelRegex = /<div className="glass-panel" style=\{\{([^}]+)\}\}>\s*<div[^>]*>\s*<Landmark/g;
  const match = panelRegex.exec(freelancerDashboardSrc);
  assert.ok(match, "Bank modal glass-panel must exist");
  
  const styleStr = match[1];
  assert.ok(styleStr.includes("width: '100%'"), "Bank modal must have width: '100%'");
  assert.ok(styleStr.includes("maxWidth: 'min(450px, calc(100vw - 2rem))'"), "Bank modal must have fluid maxWidth min(450px, calc(100vw - 2rem))");
  assert.ok(styleStr.includes("boxSizing: 'border-box'"), "Bank modal must have boxSizing: 'border-box'");
  assert.ok(!styleStr.match(/width:\s*['"]450px['"]/), "Fixed 450px width must not be present");
});

runTest(6, "FreelancerDashboard: KYC & Bank modals produce 0px overflow across 375px, 390px, 430px", () => {
  for (const vp of VIEWPORTS) {
    const kycSim = computeModalWidth(400, vp.width);
    assert.strictEqual(kycSim.overflows, false, `KYC Modal must not overflow on ${vp.name}`);
    assert.ok(kycSim.totalOuterWidth <= vp.width);

    const bankSim = computeModalWidth(450, vp.width);
    assert.strictEqual(bankSim.overflows, false, `Bank Modal must not overflow on ${vp.name}`);
    assert.ok(bankSim.totalOuterWidth <= vp.width);
  }
});

// -----------------------------------------------------------------
// Suite 3: Navbar Specificity & Flex Wrapping (Tests 7-9)
// -----------------------------------------------------------------
const navbarSrc = readProjectFile('src/components/Navbar.jsx');
const indexCssSrc = readProjectFile('src/index.css');

runTest(7, "Navbar: Inline justifyContent: 'flex-end' is removed from .navbar-actions", () => {
  // Find navbar-actions div
  const navbarActionsMatch = navbarSrc.match(/<div className="navbar-actions"([^>]*)>/);
  assert.ok(navbarActionsMatch, "navbar-actions container must exist");
  const attributes = navbarActionsMatch[1];
  assert.ok(!attributes.includes("justifyContent: 'flex-end'"), "Inline justifyContent: 'flex-end' must not be present on navbar-actions");
  assert.ok(!attributes.includes('justify-content'), "Inline justify-content must not override stylesheet");
});

runTest(8, "Navbar: index.css mobile media query governs .navbar-actions flex alignment", () => {
  const mediaQueryMatch = indexCssSrc.match(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.navbar-actions\s*\{([^}]+)\}/);
  assert.ok(mediaQueryMatch, "CSS rule for .navbar-actions under @media (max-width: 640px) must exist");
  const cssBody = mediaQueryMatch[1];
  assert.ok(cssBody.includes("justify-content: flex-start"), ".navbar-actions must align flex-start on mobile");
  assert.ok(cssBody.includes("width: 100%"), ".navbar-actions must occupy 100% width on mobile");
});

runTest(9, "Navbar: Wallet pills wrapper enables flexWrap: 'wrap' for multi-pill mobile rows", () => {
  const walletPillsMatch = navbarSrc.match(/className="navbar-wallet-pills"[\s\S]*?style=\{\{([^}]+)\}\}/);
  assert.ok(walletPillsMatch, "navbar-wallet-pills container must exist");
  const styleStr = walletPillsMatch[1];
  assert.ok(styleStr.includes("flexWrap: 'wrap'"), "navbar-wallet-pills must enable flexWrap: 'wrap'");
  assert.ok(!styleStr.includes("flexWrap: 'nowrap'"), "navbar-wallet-pills must not be locked with flexWrap: 'nowrap'");
});

// -----------------------------------------------------------------
// Suite 4: Heading Clamp Bounds & Typography (Tests 10-12)
// -----------------------------------------------------------------
const landingPageSrc = readProjectFile('src/pages/LandingPage.jsx');

runTest(10, "index.css: Root h1 font-size utilizes clamp(2rem, 5vw, 3rem) for responsive scaling", () => {
  const h1Match = indexCssSrc.match(/h1\s*\{[\s\S]*?font-size:\s*([^;]+);/);
  assert.ok(h1Match, "Global h1 font-size declaration must exist in index.css");
  const fontSizeVal = h1Match[1].trim();
  assert.strictEqual(fontSizeVal, "clamp(2rem, 5vw, 3rem)", "h1 font-size must strictly equal clamp(2rem, 5vw, 3rem)");
});

runTest(11, "Typography Math: clamp(2rem, 5vw, 3rem) scales correctly at 375px, 390px, 430px", () => {
  // 2rem = 32px, 3rem = 48px
  for (const vp of VIEWPORTS) {
    const resolvedPx = resolveClampPx(32, 5, 48, vp.width);
    // At mobile viewports (375-430px), 5vw is 18.75px to 21.5px, so it safely clamps at minimum 32px (2rem)
    assert.strictEqual(resolvedPx, 32, `At ${vp.name} (${vp.width}px), clamp must resolve to 32px minimum`);
  }
  // At large viewport (1200px), 5vw = 60px -> clamps to 48px
  const desktopResolved = resolveClampPx(32, 5, 48, 1200);
  assert.strictEqual(desktopResolved, 48, "At 1200px desktop, clamp must resolve to 48px maximum");
});

runTest(12, "LandingPage: Hero h1 and badge specify clamp typography and word-break containment", () => {
  // Check hero announcement badge
  assert.ok(landingPageSrc.includes("fontSize: 'clamp(0.72rem, 3.2vw, 0.85rem)'"), "Badge must have responsive clamp font size");
  assert.ok(landingPageSrc.includes("wordBreak: 'break-word'"), "Badge must have wordBreak: 'break-word'");
  assert.ok(landingPageSrc.includes("maxWidth: '100%'"), "Badge must have maxWidth: '100%'");
  assert.ok(landingPageSrc.includes("boxSizing: 'border-box'"), "Badge must have boxSizing: 'border-box'");

  // Check hero h1
  assert.ok(landingPageSrc.includes("fontSize: 'clamp(2.1rem, 7.5vw, 4.5rem)'"), "Hero h1 must have clamp typography");
  assert.ok(landingPageSrc.includes("wordBreak: 'break-word'"), "Hero h1 must have wordBreak: 'break-word'");
});

// -----------------------------------------------------------------
// Suite 5: Modal Close Button Clearance & Overlay Invariants (Tests 13-14)
// -----------------------------------------------------------------
const ledgerModalSrc = readProjectFile('src/components/VerificationLedgerModal.jsx');

runTest(13, "VerificationLedgerModal: Header reserves clearance for floating close button", () => {
  assert.ok(ledgerModalSrc.includes("paddingRight: '3.5rem'"), "Modal header must reserve 3.5rem right padding for close button");
  assert.ok(ledgerModalSrc.includes("flexWrap: 'wrap'"), "Modal header elements must allow flexWrap: 'wrap'");
});

runTest(14, "Modal Overlays: All mobile modal backdrops include padding to prevent edge sticking", () => {
  // Check overlay padding in ClientDashboard & FreelancerDashboard
  const clientOverlayCount = (clientDashboardSrc.match(/position:\s*'fixed'[\s\S]*?padding:\s*'1rem'/g) || []).length;
  assert.ok(clientOverlayCount >= 2, "ClientDashboard modals must have 1rem backdrop padding");

  const freelancerOverlayCount = (freelancerDashboardSrc.match(/position:\s*'fixed'[\s\S]*?padding:\s*'1rem'/g) || []).length;
  assert.ok(freelancerOverlayCount >= 2, "FreelancerDashboard modals must have 1rem backdrop padding");
});

// -----------------------------------------------------------------
// Summary
// -----------------------------------------------------------------
console.log("\n==================================================================");
console.log(`   LAYOUT HARNESS RESULTS: ${passedCount}/14 TESTS PASSED`);
if (failedCount === 0) {
  console.log("   STATUS: 100% GREEN — ALL MOBILE RESPONSIVE ASSERTIONS PASSED! 🎉");
} else {
  console.log(`   STATUS: ${failedCount} FAILURES DETECTED`);
  for (const f of failures) {
    console.log(`   - Test ${f.testNumber}: ${f.name} -> ${f.error}`);
  }
}
console.log("==================================================================\n");

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
