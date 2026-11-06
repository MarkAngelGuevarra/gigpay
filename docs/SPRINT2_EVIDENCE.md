# Sprint 2 evidence map (D1–D4)

Each acceptance criterion of the approved Sprint 2 SOW, what exists for it, and what evidence is still missing. Written November 6, 2026. Statuses are GigPay's own reading, not a program sign-off.

- **Done:** the behaviour is in `main` and has a test or a public record.
- **Partly:** some of it is in place, or it works but the required evidence is not there yet.
- **Not yet:** nothing to show.

## Baseline

The SOW was submitted on October 22, 2026, to start on approval. **The commits dated October 26, 2026 are the pre-sprint baseline**, the state of the code when Sprint 2 work began: `6866518`, `58b5eb6`, `d02ca3f`, `3f94496`, `e04bc14`, `a78417e`, `28d36cd`, `222526d`, `0c7ea19`, `6a256c2`. They are listed below only where a later commit built on them. Two of them made claims that were later corrected: `0c7ea19` reported clean installs on three environments that could not be matched to real runs (corrected in `ab47c2b`, Nov 4), and `222526d` is the regression suite described under D4(a).

On-chain numbers below come from `src/data/onchainEscrows.json`, generated from Stellar Testnet by `scripts/index_escrows.mjs` on 2026-11-05 23:33 UTC.

## Deliverable 1: real-time task and escrow sync

| Criterion | Status | Files | Commits | Tests |
|:---|:---|:---|:---|:---|
| (a) Funded tasks appear in the freelancer feed within 500ms, no reload or polling | Partly | `src/context/TaskContext.jsx`, `src/lib/taskLifecycle.js` | baseline `58b5eb6`; `7b0a132`, `d2ce2a4` | `test/dispute_sync.test.js` (merge rules); `test/sync_latency.test.js` (`5753cd0`) |
| (b) Optimistic task card while the transaction confirms | Done | `src/context/TaskContext.jsx` ("Confirming" status, rolled back on failure) | `65a0959` | `test/onboarding_safety.test.js` |
| (c) Cross-window sync (BroadcastChannel, storage events) within 500ms | Partly | `src/context/TaskContext.jsx` | baseline `58b5eb6`, `6866518`; `5753cd0` | `test/sync_latency.test.js` (`npm run test:latency`, needs Playwright) |
| (d) Accepting a task updates it and removes it from the open pool in every window | Done | `src/lib/taskLifecycle.js` (`mergeTaskRecords`) | `d2ce2a4`, `7b0a132` | `test/dispute_sync.test.js` ("Available never overrides an accepted task") |

Notes:

- `test/sync_latency.test.js` times dispute raise and resolve between two tabs of the same browser and asserts p95 < 500ms. It does not time a funded task reaching the freelancer feed, and it does not measure sync between devices (Supabase Realtime). Recorded run: GitHub Actions run 42162411037 on commit `524fe5c` (Nov 6, 2026), n=40, median 1.9 ms, p95 4.9 ms, max 15.9 ms (https://github.com/MarkAngelGuevarra/gigpay/actions/runs/42162411037). CI repeats it on every push to main.
- The SOW mentions reconciling with "contract events". The contract emits no events. The app reconciles by checking the transaction result and, since `58c4017`, the contract's `get_task`.

## Deliverable 2: practice wallet and public verification ledger

| Criterion | Status | Files | Commits | Tests |
|:---|:---|:---|:---|:---|
| (a) Mobile and extensionless users can fund and approve with the badged Testnet practice wallet | Done (team-tested only) | `src/lib/stellar.js`, `src/context/AuthContext.jsx`, `supabase/functions/fund-practice-wallet` | `663514e`, `e0256b6`, `65a0959` | `test/escrow_submission_integrity.test.js`, `test/onboarding_at_scale.test.js`, `test/onboarding_safety.test.js` |
| (b) Public ledger shows every on-chain escrow, methods, caller public keys, timestamps and Stellar Expert links | Done | `src/components/VerificationLedgerModal.jsx`, `src/lib/ledgerIntegrity.js`, `scripts/index_escrows.mjs` | `9f5f2e9`, `8702923`, `b5e36eb`, `6b87016` | `test/ledger_integrity.test.js` |
| (c) 1-click CSV export of the ledger | Done | `src/components/VerificationLedgerModal.jsx`, `src/lib/ledgerIntegrity.js` (`ledgerToCsv`) | baseline `d02ca3f`; `b5e36eb`, `d20f800` | `test/ledger_integrity.test.js` |

Notes:

- (a) Escrows #41–#46 were funded on Nov 5, 2026 from a practice wallet created on a team device, and #42, #43 and #45 were also released. That is team testing. No outside user has funded and released an escrow with a practice wallet yet.
- (b) The ledger reads a snapshot of the chain (46 escrows). It must be regenerated (`node scripts/index_escrows.mjs --write`) before a review. Escrows funded after the snapshot show up as "Database only" rows that are not counted.
- Before `b5e36eb` the CSV listed some escrows twice and left out #42, #43 and #45 as on-chain rows.

## Deliverable 3: proof of work, dispute freeze, CONFIRM

| Criterion | Status | Files | Commits | Tests |
|:---|:---|:---|:---|:---|
| (a) Freelancer attaches a GitHub PR, document or Loom link before release | Done | `src/pages/FreelancerDashboard.jsx` (links must start with `https://`), `submitProofOfWork` in `src/context/TaskContext.jsx` | baseline `e04bc14`; `7b0a132`, `2fdb47b` | `test/dispute_sync.test.js` (proof reaches the other device), `test/onboarding_safety.test.js` (no made-up proof links) |
| (b) Client can dispute; the normal release is blocked while Disputed | Done (app-level) | `src/pages/ClientDashboard.jsx`, `src/context/TaskContext.jsx`, `src/lib/stellar.js`, `src/lib/taskLifecycle.js`, `supabase/migrations/20261105023600_guard_task_updates_and_harden_auth_functions.sql` | baseline `a78417e`; `c1c6471`, `d2ce2a4` | `test/dispute_sync.test.js`, `test/escrow_submission_integrity.test.js` |
| (c) Dispute time, reason and initiator recorded and visible in the task record and the public view | Done | `src/lib/disputeMetadata.js`, `src/pages/ClientDashboard.jsx`, `src/pages/FreelancerDashboard.jsx`, `src/components/VerificationLedgerModal.jsx`, `src/lib/ledgerIntegrity.js` (`describeDispute`) | `174901b`, `d20f800` | `test/ledger_integrity.test.js` |
| (d) Release needs `CONFIRM` typed in a confirmation modal | Done | `src/pages/ClientDashboard.jsx` (`handleApprove`) | baseline `a78417e`; `65a0959` | `test/onboarding_safety.test.js` |

Notes:

- (b) The deployed contract has no dispute, refund or cancel state, so the freeze is enforced by the app and the database only. The SOW's success metric "Active contract freeze state" is not met as written. The workflow and its limits are in [DISPUTE_RESOLUTION.md](DISPUTE_RESOLUTION.md).
- (c) No task in the production database had a recorded dispute when checked on Nov 6, 2026, so there is no live example yet.
- Regression tests 16–17 in `test/gigpay_regression.test.js` compare two string values defined in the test file; they do not exercise the modal.

## Deliverable 4: tests, clean installs, video

| Criterion | Status | Files | Commits | Evidence |
|:---|:---|:---|:---|:---|
| (a) Automated suite (target 18 tests) passes with `npm test` | Done | `package.json`, `test/*.test.js` | baseline `222526d`, `28d36cd`; later suites listed above | `npm test`: 90 tests in 7 suites pass as of `524fe5c` |
| (b) Clean install on three separate computers, documented in `SETUP_VERIFICATION.md` | Partly | `SETUP_VERIFICATION.md`, `CLEAN_INSTALL_LOGS.md` | `ab47c2b`, `6f57ebe` | 2 of 3 runs |
| (c) 3–5 minute walkthrough video published | Not yet | `DEMO_WALKTHROUGH_SCRIPT.md` (script only) | none | none |

Notes:

- (a) The 22 tests in `test/gigpay_regression.test.js` (the baseline "18 tests", since extended) mostly check values defined inside the test file and import no app code. The 48 tests in the other five suites call the app's own modules, or check its source files directly (some tests in `test/onboarding_safety.test.js`).
- (b) The two runs are Windows 11 (Nov 4) and Linux in a fresh cloud container (Nov 5), which is not a separate physical computer. The third run is pending.

## Success metric: on-chain transactions

The index has 46 escrows: 83 contract transactions (46 `fund_task`, 37 `approve_task`). That passes the SOW's "≥ 50 transactions" target as a raw count, but almost all of it is testing:

- #1–#14 and #36–#46 (25 escrows): team or test wallets.
- #16–#35 (20 escrows): created by a script on Nov 3, 2026.
- #15 (1 escrow): between outside wallets, funded, not released.

Outside-user releases on-chain: **0**.

## Evidence still missing

1. The 3–5 minute walkthrough video (D4c).
2. The third clean install on a separate computer (D4b).
3. A measurement of a funded task reaching the freelancer feed and of sync between devices (D1a, D1c).
4. Escrows funded **and released** between outside wallets, ideally with practice wallets on students' own phones (D2a, success metrics).
5. Screenshots or a screen recording of proof submission, a dispute freeze and its resolution (SOW section 6.1, D3).
6. A fresh `node scripts/index_escrows.mjs --write` just before review, so the ledger includes every escrow.
