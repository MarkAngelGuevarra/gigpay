# GigPay: The Decentralized Escrow for Freelancers

![GitHub Repo Size](https://img.shields.io/github/repo-size/MarkAngelGuevarra/gigpay)
![Languages](https://img.shields.io/github/languages/top/MarkAngelGuevarra/gigpay)
![License](https://img.shields.io/github/license/MarkAngelGuevarra/gigpay)
![Network](https://img.shields.io/badge/Stellar-Testnet-teal)
![Tests](https://img.shields.io/badge/npm%20test-70%2F70%20passing-brightgreen)

**Stellar Philippines Instawards — Month 2 (Sprint 2)**  
**Track:** Decentralized Milestone Escrow for Filipino Freelancers  
**Live app (Stellar Testnet):** [https://gigpay.tech](https://gigpay.tech)  
**Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`

## Testnet honesty and known limits
- **Stellar Testnet only.** Everything uses practice money (Testnet XLM, no cash value). There is no mainnet deployment and no bank, GCash or fiat withdrawal.
- **Not externally audited.** [SECURITY_AUDIT.md](SECURITY_AUDIT.md) is the team's own security self-review.
- **The contract has no refund, cancel or dispute state.** It can only pay the freelancer address named at funding, when the client approves. The dispute freeze and the check that client and freelancer are different wallets are enforced by the GigPay app, not by the contract.
- **Practice-wallet keys live in the browser** that created them. Clearing browser data or using private mode loses the wallet.
- **Numbers are wallets, not verified people.** One person can create several wallets. Counting rules: [METRICS.md](METRICS.md).
- **Clean installs:** verified on Windows 11 (Nov 4, 2026) and Ubuntu 24.04 (Nov 5, 2026, in a cloud container); the third environment is pending. See [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).
- **Walkthrough video:** pending; it will be linked here once published.

More detail is under "Known limitations" below.

---

## 🛑 The Problem

The global freelance economy is booming, but the financial infrastructure supporting it is broken. Today, cross-border freelance payments are plagued by:
1. **Exorbitant Fees:** Traditional platforms (like Upwork or Fiverr) take a cut of up to 20% of freelancer earnings, plus hidden withdrawal and foreign exchange fees.
2. **Slow Settlement:** International wire transfers and bank withdrawals can take anywhere from 3 to 7 business days to clear.
3. **Lack of Trust:** Freelancers often fear doing work without upfront payment, while clients fear paying upfront without seeing the work.

## 🌟 Our Vision & Solution

**GigPay** is a milestone escrow app for freelancers and their clients, built on Stellar and Soroban smart contracts.

By leveraging the Stellar network and Soroban Smart Contracts, we provide:
- **Fast Settlement:** Stellar confirms funding and release in about 5 seconds.
- **No Platform Commission:** GigPay takes no cut (traditional platforms take up to 20%). The only cost is the Stellar network fee (the app estimates about 0.03 XLM per transaction).
- **Smart-contract escrow:** Funds are locked in the Soroban contract. Clients fund the contract upfront, proving they have the money. The contract can only pay the freelancer address named when the escrow was funded, and only when the client approves. (There is no refund or cancel: see Known limitations.) Once work is approved, the client releases the funds to the freelancer.

## ✅ Verify in 2 minutes (for reviewers)
1. **Contract:** [`CAUU2O5Z…7RD3` on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3). Live until about May 2027 (see [DEPLOYED_CONTRACT.md](DEPLOYED_CONTRACT.md)).
2. **Every escrow, from the chain:** [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md) lists all escrows with funding and release links, and labels team, scripted and outside wallets. As of Nov 6, 2026: **46 escrows, 1 from outside wallets (#15, not yet released)**. Regenerate it yourself with `node scripts/index_escrows.mjs` (read-only).
3. **Counting rules:** [METRICS.md](METRICS.md) defines every user number (onboarded, activated, repeat), lists which wallets are excluded, and shows how to reproduce the counts.
4. **Corrections:** earlier overstated claims and how they were fixed are listed in the correction notice at the top of [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md).
5. **Tests:** `npm ci && npm test` runs 70 offline tests in 6 suites.
6. **Privacy:** [PRIVACY.md](PRIVACY.md). Public evidence shows wallet addresses and transactions, never tester emails.
7. **Sprint 2 evidence map:** [docs/SPRINT2_EVIDENCE.md](docs/SPRINT2_EVIDENCE.md) maps each D1–D4 acceptance criterion to what exists and what evidence is still missing.
8. **Dispute workflow:** [docs/DISPUTE_RESOLUTION.md](docs/DISPUTE_RESOLUTION.md) describes the app-level dispute freeze and how a dispute is resolved on Testnet (not arbitration).

## ⚠️ Known limitations (pilot, Testnet only)
- **No refund or cancel.** Once funded, an escrow can only be released to the named freelancer by the client. If the client never approves, the funds stay locked.
- **Dispute freeze and self-dealing checks are app-level.** The contract has no dispute state; GigPay's app and signing layer refuse a release while a dispute is open.
- **Contract capacity.** Escrows are stored in the contract's instance storage, which has room for roughly 160 more escrows in total. A v2 contract (per-escrow storage, refund/cancel) would need a new contract ID.
- **Practice wallets live in the browser.** Each signed-in account gets its own Testnet practice wallet stored in that browser; releasing must be done from the browser that funded. Incognito mode or clearing browser data loses it.
- **One server-side key:** the team's Testnet funding-pool key (used when Friendbot rate-limits) is stored encrypted in Supabase Vault.

---

## 🚀 Sprint 2 (Month 2 SOW) Deliverables Architecture

What GigPay has built against the 4 deliverables in the Month 2 Statement of Work, and what is still open:

### 1. Real-Time Multi-User Task Lifecycle & Escrow State Sync (Deliverable 1 — $1,500)
* **Live State Reflection:** Tasks funded by clients appear on freelancers' screens without a manual page reload (Supabase updates plus cross-tab storage events). Timing has not been formally benchmarked.
* **Resilient Shared Cache:** Implements optimistic in-memory dispatch combined with `gigpay_shared_tasks` localStorage caching and cross-window storage event listeners.
* **Save-failure handling:** If Supabase rejects a write (for example RLS error 42501), the task stays visible locally and the user sees a warning that it was not saved.

### 2. Zero-Barrier Onboarding & Public Verification Ledger (Deliverable 2 — $1,250)
* **1-Click Testnet Simulator Wallet:** Enables mobile and extensionless users to generate random per-browser practice keypairs funded with Testnet XLM by Friendbot. One practice wallet per browser, so a client and a freelancer need two devices.
* **Public Verification Ledger:** Every escrow on the contract, generated from the chain (`node scripts/index_escrows.mjs`), with each row labeled outside user vs team/test wallet, plus one-click CSV export.

### 3. Dispute Mitigation Freeze & Proof-of-Work Verification (Deliverable 3 — $1,250)
* **Proof-of-Work Deliverable Submission:** Freelancers attach GitHub PR, Loom, or Google Drive links along with verification notes, moving tasks to `Under Review`.
* **Client Deliverable Review:** Clients inspect deliverables directly from the dashboard before releasing funds.
* **Structured Dispute Freeze:** Clients can halt releases and log structured dispute metadata (`dispute_reason`, `disputed_at`). The freeze is enforced by the app; the deployed contract has no dispute or refund state.
* **Accidental Release Guard:** AWS-style confirmation modal requiring users to type `"CONFIRM"` before escrow funds can be unlocked.

### 4. Automated Tests, Clean-Install Logs & Walkthrough Video (Deliverable 4 — $1,000)
* **Automated Tests:** `npm test` runs 70 tests offline in 6 suites (22 regression, 10 escrow-integrity, 12 ledger-integrity, 7 onboarding-at-scale, 8 dispute-sync, 11 onboarding-safety), plus 4/4 Rust contract tests (`cargo test` in `contracts/gigpay_escrow`).
* **Clean-Install Validation:** Verified from a fresh clone on a Windows 11 PC and in a Linux (Ubuntu 24.04) cloud container; the third environment is still pending. See [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).
* **Walkthrough video:** not yet published. The recording script is [DEMO_WALKTHROUGH_SCRIPT.md](DEMO_WALKTHROUGH_SCRIPT.md).

---

## 🧪 Running Automated Tests

Run the full automated test suite locally:
```bash
npm test
```

### Test Suites
`npm test` runs 70 tests with no network access: the 22-test regression suite plus the escrow-integrity (10), ledger-integrity (12), onboarding-at-scale (7), dispute-sync (8) and onboarding-safety (11) suites. The older suites below are not part of `npm test`; run them individually with `node <file>`. `soroban_sim` and `live_headless_e2e` need Stellar Testnet access and were not re-run for this README.
* `soroban_sim.test.js`: Soroban RPC health, contract format, SAC binding, resource fee calculation, error normalization, exponential backoff (9 checks).
* `task_lifecycle.test.js`: End-to-end task creation, acceptance, milestone release, and earnings aggregation (9/9).
* `client_portal_qa.test.js`: Client validation, optimistic escrow lock, "CONFIRM" modal guard (14/14).
* `live_headless_e2e.test.js`: Multi-window isolation, real-time storage bridge, Supabase 42501 resilience (15 checks).
* `freelancer_portal_qa.test.js`: Real-time cross-tab sync, double-click protection, work proof submission (12/12).
* `dual_role_simulation.test.js`: Dynamic role switcher, paired simulator keypairs, anti-self-dealing verification (17/17).

---

## 🔗 Deployed Smart Contract (Stellar Testnet)

* **Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`
* **Network:** Stellar Testnet (contract built with soroban-sdk 22)
* **WASM Hash:** `ea681b9739ada34e82b3d60158fb5fa75418e315488ee74074ce57b1180afdea`
* **Deployer Account:** `GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E`
* **Stellar-Expert Explorer Link:** [Verify on Stellar Expert (Testnet)](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)

---

## 🚀 Running Locally

```bash
# 1. Clone repository
git clone https://github.com/MarkAngelGuevarra/gigpay.git
cd gigpay

# 2. Install dependencies
npm install

# 3. Run automated test suite
npm test

# 4. Start local development server
npm run dev
```

For clean installation logs on other operating systems, inspect [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

---

## 📬 Builder Contact
* **Primary Contact:** Mark Angel Guevarra ([marcangelguevarra@gmail.com](mailto:marcangelguevarra@gmail.com))
* **Stellar Ambassador Chapter:** Stellar Philippines (Leads: Nelson Lumbres & Armielyn Obinguar)
* **Live App:** [https://gigpay.tech](https://gigpay.tech)
* **Twitter / X:** [@GigPayPH](https://x.com/GigPayPH)
