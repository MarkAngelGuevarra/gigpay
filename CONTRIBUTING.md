# Contributing to GigPay

Thanks for helping. GigPay is a milestone escrow app for freelancers on the **Stellar Testnet**, built for the Stellar Philippines Instawards program (Demo Day November 19, 2026). The grant has strict rules about scope, honesty and privacy, so please read this page before changing anything. When in doubt, ask Mark first.

## 1. Setup

1. Node.js **20.19+ or 22.12+** (Vite 8 engine requirement; CI uses Node 22).
2. `npm ci`
3. Copy `.env.example` to `.env` for shared pilot testing, or use `.env.local` for local Supabase (`npx supabase start`) and local Stellar Quickstart without touching live Testnet or production. Only the Supabase URL, publishable anon key, and network settings belong in frontend env files. Never ask for, use, or commit a service-role key or secret seed.
4. `npm run dev` to run the app, `npm test` and `npm run test:unit` for the tests, `npm run lint` and `npm run typecheck` for static checks, `npm run build` for a production build.

Everything runs on **Testnet with practice XLM**. Nothing in this project may touch Mainnet or real money.

## 2. Git workflow

- **Never push to `main`.** Every push to `main` auto-deploys https://www.gigpay.tech. Work on a branch and open a pull request; Mark reviews and merges.
- One topic per PR, with a clear title in the existing style: `fix: …`, `docs: …`, `test: …`.
- Commits must be real work. Don't squash someone else's history, rewrite published commits or make empty "activity" commits.

## 3. Before you open a PR

- `npm test` passes: **91 tests in 7 suites**, and `npm run test:unit` passes **53 Vitest tests in 10 suites**, all offline. If you add or remove tests, keep counts aligned across `README.md`, `SETUP_VERIFICATION.md`, `TESTING.md`, and `CLEAN_INSTALL_LOGS.md` (while preserving dated historical evidence snapshots).
- `npm run lint` (`0` errors, `0` warnings) and `npm run typecheck` pass.
- `npm run build` succeeds.
- When changing migrations under `supabase/migrations/`, run `npx supabase db reset` locally and verify `npm run test:db`.
- CI (`.github/workflows/ci.yml`) is green on your branch (including `cargo test --locked` with 10/10 Rust contract tests).
- You checked your change in the browser if it affects the UI, including on a phone-sized screen (most testers use phones).

## 4. Scope: nothing new until a revised SOW is approved

Sprint 2 features were built after Sprint 1, before program approval. The Sprint 2 proposal was not approved (Nov 18, 2026); a revised, technical-only SOW is pending. The program counts only work in an approved Statement of Work, and work outside it can get the project removed.

Until a revised SOW is approved, only fixes to docs, tests and existing bugs go to `main`. No new features.

What already exists (built before approval, not funded): real-time task and escrow sync; the Testnet practice wallet, public verification ledger and CSV export; proof of work, the app-level dispute freeze and the `CONFIRM` release step; automated tests, clean installs and a walkthrough video.

**Not planned now:** ratings or reputation profiles, Mainnet, fiat on/off-ramps, marketplace features, mobile apps. A new contract version (v2, with on-chain dispute and refund) is proposed in the revised SOW and will not be built unless it is approved.

## 5. Smart contract rules

- Deployed contract (Testnet): `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`. Source: `contracts/gigpay_escrow`.
- **Do not redeploy or change the deployed contract.** A new version needs an approved SOW and the Chapter Lead's approval.
- **Do not run `node scripts/extend_contract_ttl.mjs --submit`.** Mark handles contract storage upkeep.
- **Do not create Testnet escrows** from scripts or test wallets without asking. Every escrow shows up in the public ledger and in the on-chain counts. If testing needs one, its wallets must be added to the team lists in **both** `scripts/index_escrows.mjs` (`TEAM`) and `src/lib/ledgerIntegrity.js`, so they are excluded from outside-wallet counts.
- Known limits (documented): the dispute freeze is enforced by the app and database, not the contract; the contract has no events or refund; all escrows share one storage entry with room for about 130 more. A v2 contract that addresses these is proposed in the revised SOW and will not be built until it is approved.

## 6. Database (Supabase) rules

- The Supabase project is the **live production database** with real testers' accounts.
- **No direct writes, deletes or schema changes** on it. Schema changes go in a new file under `supabase/migrations/` and are applied by Mark after review.
- Don't weaken the update guard (`enforce_task_update`): escrow fields are write-once and completed tasks stay completed. Don't loosen row-level security.

## 7. Honesty rules for numbers and evidence

Reviewers check every number against the chain, so:

- On-chain counts come **only** from `node scripts/index_escrows.mjs --write` (see `EVIDENCE_TABLE.md` and `METRICS.md`).
- Counts are **wallets, not verified people**. Team, QA, scripted (#16–#35) and duplicate escrows (#52, #53, #66) are excluded.
- Never add placeholder or fake transaction hashes, demo data shown as on-chain, or words like "verified users", "real users" or "production-ready" that the evidence doesn't support.
- When updating a submitted document, keep the original text and add a dated note ("Update, <date>: …") instead of silently rewriting history.

## 8. Privacy and security

Never commit, paste into an issue or PR, or screenshot publicly:

- `.env` files, API keys, Supabase service-role keys, Stellar secret seeds (`S…`).
- Testers' emails, names, account IDs, sign-up lists or exports from the database.
- AI assistant handoff or prompt files (`.agent/` and `.agents/` are gitignored for this reason), temp files or logs.

Also:

- Don't add new third-party scripts or network calls without updating the Content Security Policy in `index.html` **and** `PRIVACY.md`. In particular, `src/lib/sheetsSync.js` (Google Sheet logging) is intentionally blocked by the CSP; don't unblock `script.google.com`.
- Report security issues to Mark privately, not in a public issue.

## 9. Where things are

| Area | Files |
|---|---|
| Wallet and contract calls | `src/lib/stellar.js` |
| Task state, sync, release flow | `src/context/TaskContext.jsx`, `src/lib/taskLifecycle.js` |
| Client and freelancer screens | `src/pages/ClientDashboard.jsx`, `src/pages/FreelancerDashboard.jsx` |
| Sign-in and practice wallet | `src/context/AuthContext.jsx`, `supabase/functions/fund-practice-wallet` |
| Public ledger and CSV | `src/components/VerificationLedgerModal.jsx`, `src/lib/ledgerIntegrity.js` |
| On-chain indexer | `scripts/index_escrows.mjs`, `src/data/onchainEscrows.json` |
| Tests | `test/*.test.js` |
| Evidence and rules | `docs/SPRINT2_EVIDENCE.md`, `EVIDENCE_TABLE.md`, `METRICS.md`, `docs/DISPUTE_RESOLUTION.md`, `PRIVACY.md` |
| Proposed v2 contract spec (pending approval) | `docs/CONTRACT_V2_SPEC.md` |

## 10. Good places to help (ask before starting)

Only fixes to docs, tests and existing bugs until a revised SOW is approved.

- A test that times a newly funded task reaching the freelancer's feed in a second tab (closes the D1a measurement gap).
- Accessibility fixes to existing screens (form labels, focus states, phone layouts).
- More tests that exercise the real modules (the CONFIRM modal, the dispute freeze) instead of comparing constants.

Thank you for helping keep GigPay honest and safe.
