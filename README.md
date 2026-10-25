# GigPay: The Decentralized Escrow for Freelancers

![GitHub Repo Size](https://img.shields.io/github/repo-size/MarkAngelGuevarra/gigpay)
![Languages](https://img.shields.io/github/languages/top/MarkAngelGuevarra/gigpay)
![License](https://img.shields.io/github/license/MarkAngelGuevarra/gigpay)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Network](https://img.shields.io/badge/Stellar-Testnet%20Protocol%2022-teal)
![Tests](https://img.shields.io/badge/tests-76%2F76%20passing-brightgreen)
![SOW Deliverables](https://img.shields.io/badge/Sprint%202%20SOW-Verified-green)

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
- **Instant Finality:** Payments settle in under 5 seconds cross-border.
- **Zero Middleman Fees:** By operating as a decentralized protocol, we eliminate the 20% platform tax. Freelancers keep exactly what they earn.
- **Trustless Escrow:** Funds are securely locked in a smart contract. Clients fund the contract upfront, proving they have the money. Freelancers work knowing the funds are cryptographically guaranteed. Once work is approved, funds are released instantly.

> **Note on Simulated Features:** All bank off-ramps and fiat withdrawals in the demo dashboard are simulated test features for UI demonstration purposes. Real settlement operates strictly on Stellar Testnet (Protocol 22).

---

## 🚀 Sprint 2 (Month 2 SOW) Deliverables Architecture

GigPay's Month 2 engagement fulfills all 4 deliverables specified in our approved Statement of Work:

### 1. Real-Time Multi-User Task Lifecycle & Escrow State Sync (Deliverable 1 — $1,500)
* **Sub-500ms State Reflection:** Tasks funded by clients render immediately on freelancers' screens without manual page reloads or database polling.
* **Resilient Shared Cache:** Implements optimistic in-memory dispatch combined with `gigpay_shared_tasks` localStorage caching and cross-window storage event listeners.
* **RLS Fallback Bridge:** Seamlessly tolerates network partitions or Supabase RLS error 42501 with 100% data integrity.

### 2. Zero-Barrier Onboarding & Public Verification Ledger (Deliverable 2 — $1,250)
* **1-Click Testnet Simulator Wallet:** Enables mobile and extensionless users to generate authentic ephemeral Ed25519 keypairs pre-funded with 10,000 XLM via Friendbot.
* **Immutable Public Ledger Modal:** Real-time query of Supabase tasks and authentic student profiles with one-click Master CSV export for grant auditors.
* **Anti-Bot Filtering:** Strictly purges generic placeholders (`Demo Client`, `Freelancer`) to present verifiable student developer identities.

### 3. Dispute Mitigation Freeze & Proof-of-Work Verification (Deliverable 3 — $1,250)
* **Proof-of-Work Deliverable Submission:** Freelancers attach GitHub PR, Loom, or Google Drive links along with verification notes, moving tasks to `Under Review`.
* **Client Deliverable Review:** Clients inspect deliverables directly from the dashboard before releasing funds.
* **Structured Dispute Freeze:** Clients can halt releases and log structured dispute metadata (`dispute_reason`, `disputed_at`).
* **Accidental Release Guard:** AWS-style confirmation modal requiring users to type `"CONFIRM"` before escrow funds can be unlocked.

### 4. Comprehensive Testing Suite & Clean-Install Logs (Deliverable 4 — $1,000)
* **Automated Tests:** 6 test suites with **76 total passing assertions** (`npm test`), plus 4/4 native Rust contract tests (`cargo test`).
* **Multi-OS Validation:** Full clean-install logs verified across Windows 11, macOS Apple Silicon, and Ubuntu Linux. See [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

---

## 🧪 Running Automated Tests

Run the full automated test suite locally:
```bash
npm test
```

### Test Suite Coverage Matrix (76 Assertions — 100% Green)
* `soroban_sim.test.js`: Soroban Protocol 22 RPC health, contract format, SAC binding, resource fee calculation, error normalization, exponential backoff (9/9).
* `task_lifecycle.test.js`: End-to-end task creation, acceptance, milestone release, and earnings aggregation (9/9).
* `client_portal_qa.test.js`: Client validation, optimistic escrow lock, "CONFIRM" modal guard (14/14).
* `live_headless_e2e.test.js`: Multi-window isolation, real-time storage bridge, Supabase 42501 resilience (15/15).
* `freelancer_portal_qa.test.js`: Real-time cross-tab sync, double-click protection, work proof submission (12/12).
* `dual_role_simulation.test.js`: Dynamic role switcher, paired simulator keypairs, anti-self-dealing verification (17/17).

---

## 🔗 Deployed Smart Contract (Stellar Testnet)

* **Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`
* **Network:** Stellar Testnet (Protocol 22)
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
