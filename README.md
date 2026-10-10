# GigPay: The Decentralized Escrow for Freelancers

![GitHub Repo Size](https://img.shields.io/github/repo-size/MarkAngelGuevarra/gigpay)
![Languages](https://img.shields.io/github/languages/top/MarkAngelGuevarra/gigpay)
![License](https://img.shields.io/github/license/MarkAngelGuevarra/gigpay)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Network](https://img.shields.io/badge/Stellar-Testnet%20Protocol%2022-teal)
![Tests](https://img.shields.io/badge/tests-8%2F8%20passing-brightgreen)
![SOW Deliverable 2](https://img.shields.io/badge/SOW%20Deliverable%202-Hardened-green)

**Stellar Philippines Instawards 2026 Sprint**  
**Track:** Decentralized Milestone Escrow for Filipino Freelancers  
**Live Production URL:** [https://gigpay.tech](https://gigpay.tech)

---

## 🛑 The Problem

The global freelance economy is booming, but the financial infrastructure supporting it is broken. Today, cross-border freelance payments are plagued by:
1. **Exorbitant Fees:** Traditional platforms (like Upwork or Fiverr) take a massive 20% cut of freelancer earnings, plus hidden withdrawal and foreign exchange fees.
2. **Slow Settlement:** International wire transfers and bank withdrawals can take anywhere from 3 to 7 business days to clear.
3. **Lack of Trust:** Freelancers often fear doing work without upfront payment, while clients fear paying upfront without seeing the work.

## 🌟 Our Vision & Solution

**GigPay** is a decentralized, Web3-native escrow platform designed to eliminate middlemen and empower the gig economy. 

Our vision is a world where anyone, anywhere, can work freely and get paid their full value instantly. By leveraging the Stellar network and Soroban Smart Contracts, we provide:
- **Instant Finality:** Payments settle in under 5 seconds cross-border.
- **Zero Middleman Fees:** By operating as a decentralized protocol, we eliminate the 20% platform tax. Freelancers keep exactly what they earn.
- **Trustless Escrow:** Funds are securely locked in a smart contract. Clients fund the contract upfront, proving they have the money. Freelancers work knowing the funds are cryptographically guaranteed. Once work is approved, funds are released instantly.

## ✨ Premium Features

1. **Authentic Web3 Signatures:** Deep integration with `@stellar/freighter-api`. Both Clients and Freelancers must sign secure transactions to lock funds, accept work, and withdraw USDC from escrow.
2. **The GigPay Advantage Widget:** An interactive fee calculator that dynamically proves how much money users save compared to Upwork (e.g., $100 fee vs $0.0001 Stellar fee).
3. **Slide to Verify Captcha:** A custom, Web3-native human verification puzzle built with Framer Motion to protect the application from bots while maintaining a futuristic aesthetic.
4. **Magical Auto-Login:** A premium debounce feature that seamlessly logs users in the moment they finish typing their password.
5. **Real-Time Sync:** Powered by Supabase, the dual-sided marketplace (Client and Freelancer dashboards) updates instantly across all users.

## 🛠 Tech Stack

- **Frontend:** React, Vite, Tailwind CSS (via custom styling), Framer Motion, Lucide React
- **Backend / Database:** Supabase (PostgreSQL, Auth, Realtime Subscriptions)
- **Blockchain / Web3:** Stellar Network (Testnet), Soroban Smart Contracts, `@stellar/freighter-api`

## 🔗 Deployed Smart Contract & Architecture

**GigPay's Soroban smart contract is officially deployed and active on the Stellar Testnet.**

### 📍 On-Chain Deployment Details (Stellar Testnet)
* **Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`
* **Network:** Stellar Testnet (Protocol 22)
* **WASM Hash:** `ea681b9739ada34e82b3d60158fb5fa75418e315488ee74074ce57b1180afdea`
* **Deployer Account:** `GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E`
* **Deployment Transaction:** [`d90e6e47...`](https://stellar.expert/explorer/testnet/tx/d90e6e47231356cc87c03c3207d166345b0b86705afbd8682be365e7a179cc39)
* **Stellar-Expert Explorer Link:** [Verify on Stellar Expert (Testnet)](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)

### 📂 Source Code & Frontend Integration
* **Contract Source:** `/contracts/gigpay_escrow/src/lib.rs`
* **Compiled Binary:** `/contracts/gigpay_escrow/target/wasm32v1-none/release/gigpay_escrow.wasm`
* **Frontend State Binding:** Directly integrated inside `/src/context/TaskContext.jsx` and `/src/lib/stellar.js` to bind task creation directly to our deployed Soroban escrow address.

---

## 🛡️ Week 3 Deliverable 2: Multi-Wallet Hardening & Error Resilience

GigPay has hardened its frontend and smart contract interaction layer to satisfy all **SOW Table 7 Deliverable 2** acceptance criteria:

* **Multi-Wallet Execution (SOW Table 7: $\ge 2$ Wallets):** Enforces distinct client funding and freelancer payout addresses across independent Freighter wallets.
* **Anti-Self-Dealing Assertion:** Front-end and cryptographic validation asserting that client and freelancer addresses cannot collide (`client != freelancer`), preventing wasted network gas.
* **Exponential Backoff Polling:** Progressive RPC retry schedule (`1500ms -> 2250ms -> 3375ms -> 5000ms -> 5000ms`) preventing rate limits and recovering from transient network congestion during transaction confirmation.
* **Graceful Error Normalization:** Intercepts Freighter signature declines and timeouts with non-crashing toast warnings.
* **Pre-Flight Reserve Assertions:** Verifies client account holds base reserve (1.0 XLM) + fee buffer (0.5 XLM) before transaction submission.

### 🧪 Automated Integration Tests (8/8 Passing)
Run the automated test suite locally:
```bash
npm test
```

For complete multi-wallet manual reproduction instructions (Client Persona A vs Freelancer Persona B), refer to [TESTING.md](TESTING.md).

### 📋 SOW Instawards Milestone Scorecard

| Milestone | SOW Deliverable | Status | Evidence / Verification |
| :--- | :--- | :---: | :--- |
| **Week 1** | Deliverable 1: Testnet Escrow Contract Deployment | ✅ Complete | PR #2 merged, Contract ID: `CAUU2O5Z...` |
| **Week 2** | Deliverable 1 & 2: Frontend Wiring & Execution | ✅ Complete | PR #3 merged, 10 on-chain tx hashes verified |
| **Week 3** | Deliverable 2: Multi-Wallet Hardening & Error Resilience | ✅ Complete | PR #4, 8/8 automated tests, `TESTING.md` runbook |
| **Week 4** | Deliverable 3: Final Verification & Capstone Video | 🔒 Locked | Capstone dossier & 3-min walkthrough video |

---

## 🚀 Running Locally

Want to try GigPay yourself? Follow these steps:

### Prerequisites
- Node.js (v18+)
- A Supabase account and project
- [Freighter Wallet](https://www.freighter.app/) browser extension installed and set to Stellar Testnet.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MarkAngelGuevarra/gigpay.git
   cd gigpay
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env` file in the root directory and add your Supabase credentials.

4. **Initialize Database:**
   Run the `supabase_schema.sql` script in your Supabase SQL Editor.

5. **Start the development server:**
   ```bash
   npm run dev
   ```

6. **Interact:**
   Open `http://localhost:5173` in your browser. Create an account, connect your Freighter wallet, and try posting or accepting a task!

## 📬 Let's Connect
*   **Email:** [marcangelguevarra@gmail.com](mailto:marcangelguevarra@gmail.com)
*   **GitHub:** [MarkAngelGuevarra](https://github.com/MarkAngelGuevarra)
