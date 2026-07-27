# GigPay: The Decentralized Escrow for Freelancers

![GitHub Repo Size](https://img.shields.io/github/repo-size/Markyy0411/gigpay)
![Languages](https://img.shields.io/github/languages/top/Markyy0411/gigpay)
![License](https://img.shields.io/github/license/Markyy0411/gigpay)

**Stellar Community Fund (SCF) Instaward Sprint**  
**Track:** Protocol Infrastructure & Payment Applications

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

## 🔗 Smart Contract Architecture

**Important:** The GigPay escrow contract is currently deployed on the Stellar Testnet, with Mainnet migration and arbitration architecture scheduled for the upcoming Instaward 30-Day Sprint.

- **Development Network:** Stellar Testnet
- **Production Network:** Stellar Mainnet (Pending deployment)
- **Source Code Location:** `/contracts/gigpay_escrow/src/lib.rs` (Note: MVP frontend utilizes mock SDK implementations to trigger authentic Freighter signature UX).

## 🚀 Running Locally

Want to try GigPay yourself? Follow these steps:

### Prerequisites
- Node.js (v18+)
- A Supabase account and project
- [Freighter Wallet](https://www.freighter.app/) browser extension installed and set to Stellar Testnet.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Markyy0411/gigpay.git
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
*   **GitHub:** [Markyy0411](https://github.com/Markyy0411)
