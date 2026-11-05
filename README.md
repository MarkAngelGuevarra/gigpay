# GigPay: The Decentralized Escrow for Freelancers

![GitHub Repo Size](https://img.shields.io/github/repo-size/MarkAngelGuevarra/gigpay)
![Languages](https://img.shields.io/github/languages/top/MarkAngelGuevarra/gigpay)
![License](https://img.shields.io/github/license/MarkAngelGuevarra/gigpay)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Network](https://img.shields.io/badge/Stellar-Testnet%20Protocol%2022-teal)
![Tests](https://img.shields.io/badge/npm%20test-39%2F39%20passing-brightgreen)

**Stellar Philippines Instawards — Month 2 (Sprint 2)**  
**Track:** Decentralized Milestone Escrow for Filipino Freelancers  
**Live Production URL:** [https://gigpay.tech](https://gigpay.tech)  
**Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`

---

## 🛑 The Problem

The global freelance economy is booming, but the financial infrastructure supporting it is broken. Today, cross-border freelance payments are plagued by:
1. **Exorbitant Fees:** Traditional platforms (like Upwork or Fiverr) take a massive 20% cut of freelancer earnings, plus hidden withdrawal and foreign exchange fees.
2. **Slow Settlement:** International wire transfers and bank withdrawals can take anywhere from 3 to 7 business days to clear.
3. **Lack of Trust:** Freelancers often fear doing work without upfront payment, while clients fear paying upfront without seeing the work.

## 🌟 Our Vision & Solution

**GigPay** is a decentralized, Web3-native escrow platform designed to eliminate middlemen and empower the gig economy. 

By leveraging the Stellar network and Soroban Smart Contracts, we provide:
- **Fast Settlement:** Stellar confirms funding and release in about 5 seconds.
- **No Platform Commission:** GigPay takes no cut (traditional platforms take up to 20%). The only cost is the Stellar network fee, a fraction of a cent.
- **Trustless Escrow:** Funds are securely locked in a smart contract. Clients fund the contract upfront, proving they have the money. Freelancers work knowing the funds are cryptographically guaranteed. Once work is approved, the client releases the funds to the freelancer.

> **Testnet only.** Everything runs on Stellar Testnet with practice XLM. There is no bank, GCash or fiat withdrawal in the app; approved payments go to the freelancer's Testnet address.

---

## 🚀 Sprint 2 (Month 2 SOW) Deliverables Architecture

What GigPay has built against the 4 deliverables in the Month 2 Statement of Work, and what is still open:

### 1. Real-Time Multi-User Task Lifecycle & Escrow State Sync (Deliverable 1 — $1,500)
* **Live State Reflection:** Tasks funded by clients appear on freelancers' screens without a manual page reload (Supabase updates plus cross-tab storage events). Timing has not been formally benchmarked.
* **Resilient Shared Cache:** Implements optimistic in-memory dispatch combined with `gigpay_shared_tasks` localStorage caching and cross-window storage event listeners.
* **Save-failure handling:** If Supabase rejects a write (for example RLS error 42501), the task stays visible locally and the user sees a warning that it was not saved.

### 2. Zero-Barrier Onboarding & Public Verification Ledger (Deliverable 2 — $1,250)
* **1-Click Testnet Simulator Wallet:** Enables mobile and extensionless users to generate authentic ephemeral Ed25519 keypairs funded with Testnet XLM by Friendbot. One practice wallet per browser, so a client and a freelancer need two devices.
* **Public Verification Ledger:** Every escrow on the contract, generated from the chain (`node scripts/index_escrows.mjs`), with each row labeled outside user vs team/test wallet, plus one-click CSV export.

### 3. Dispute Mitigation Freeze & Proof-of-Work Verification (Deliverable 3 — $1,250)
* **Proof-of-Work Deliverable Submission:** Freelancers attach GitHub PR, Loom, or Google Drive links along with verification notes, moving tasks to `Under Review`.
* **Client Deliverable Review:** Clients inspect deliverables directly from the dashboard before releasing funds.
* **Structured Dispute Freeze:** Clients can halt releases and log structured dispute metadata (`dispute_reason`, `disputed_at`). The freeze is enforced by the app; the deployed contract has no dispute or refund state.
* **Accidental Release Guard:** AWS-style confirmation modal requiring users to type `"CONFIRM"` before escrow funds can be unlocked.

### 4. Comprehensive Testing Suite & Clean-Install Logs (Deliverable 4 — $1,000)
* **Automated Tests:** `npm test` runs 39 tests offline (22 regression, 10 escrow-integrity, 7 ledger-integrity), plus 4/4 Rust contract tests (`cargo test` in `contracts/gigpay_escrow`).
* **Clean-Install Validation:** Verified from a fresh clone on Windows 11 and Linux (Ubuntu 24.04); macOS still to do. See [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

---

## 🧪 Running Automated Tests

Run the full automated test suite locally:
```bash
npm test
```

### Test Suites
`npm test` runs 39 tests with no network access: the 22-test regression suite, 10 escrow-integrity tests and 7 ledger-integrity tests. The suites below run individually with `node <file>`; `soroban_sim` and `live_headless_e2e` need Stellar Testnet access.
* `soroban_sim.test.js`: Soroban Protocol 22 RPC health, contract format, SAC binding, resource fee calculation, error normalization, exponential backoff (9/9).
* `task_lifecycle.test.js`: End-to-end task creation, acceptance, milestone release, and earnings aggregation (9/9).
* `client_portal_qa.test.js`: Client validation, optimistic escrow lock, "CONFIRM" modal guard (14/14).
* `live_headless_e2e.test.js`: Multi-window isolation, real-time storage bridge, Supabase 42501 resilience (15/15).
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
