# GigPay — Current Traction, User Telemetry & Progress Report
**Stellar Philippines Instawards (Cohort 2026 / SDF / Rise In)**  
**Lead Developer:** Mark Angel Guevarra (`marcangelguevarra@gmail.com` / GitHub: [`MarkAngelGuevarra`](https://github.com/MarkAngelGuevarra))  
**Official Repository:** [`https://github.com/MarkAngelGuevarra/gigpay`](https://github.com/MarkAngelGuevarra/gigpay)  
**Live Production URL:** [`https://gigpay.tech`](https://gigpay.tech) (Mirror: [`https://gigpay-gules.vercel.app`](https://gigpay-gules.vercel.app))  
**Active Testnet Contract ID:** [`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)  
**Soroban Protocol Version:** Protocol 22  
**Reporting Date:** Sunday, October 18, 2026  

> **Correction added November 4, 2026.** Several figures in this report were overstated when it was written. Checked against the chain and the Supabase database as of Oct 18, 2026, the accurate figures are:
> - **Registered accounts: 23, not 28.** Of these, **18** were real sign-ups and 5 were team test accounts created in July.
> - **On-chain escrows: 14 funded and 10 released, all from team test wallets** (QA client and founder → team freelancer wallet). None were from testers' own wallets, so "11 completed milestones" and the 39.2% conversion claim were wrong.
> - **"18+ active testers completed dual-role flows" is not supported** by any record we can find. 18 is the number of sign-ups, not of completed flows.
> - **Testers' email addresses and handles have been removed** from this public report.
>
> Current, chain-verified numbers are in [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md).

---

## 1. Executive Summary

GigPay is a decentralized milestone escrow web application built on **Stellar Soroban (Protocol 22)** to eliminate 20% platform commission cuts and 7–14 day payout holds for Filipino freelancers. 

During the Month 1 Instawards Sprint, GigPay transitioned from initial architecture to a live Testnet dApp deployed at `https://gigpay.tech`. The platform enforces non-custodial milestone locking and atomic releases in ~5 seconds with near-zero network fees, backed by client-side Freighter signing and a resilient built-in Soroban Testnet Simulator.

---

## 2. On-Chain Development & Stellar Testnet Evidence

All smart contract logic is deployed, live, and publicly verifiable on the Stellar Testnet:
* **Contract Address:** [`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)
* **Native XLM SAC Contract:** [`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
* **WASM Hash:** `ea681b9739ada34e82b3d60158fb5fa75418e315488ee74074ce57b1180afdea`
* **Deployer Account:** `GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E`
* **Verifiable On-Chain Executions:** 14 escrows funded and 10 released (24 transactions) by Oct 18, 2026, all from team test wallets, verifying the contract's `fund_task` and `approve_task` logic. See [`EVIDENCE_TABLE.md`](EVIDENCE_TABLE.md).

---

## 3. Real-World User Adoption & Pilot Telemetry

To fulfill the Month 2 ($5,000) Instawards eligibility gate mandated by Armielyn Obinguar (SDF / Rise In), GigPay launched an active pilot testing intake campaign.

### 3.1 Pilot Intake Channels & Workflow
* **Intake Form:** [`https://forms.gle/oLGjJRcxg5LZ5bC96`](https://forms.gle/oLGjJRcxg5LZ5bC96)
* **Low-Friction Sign-Up Portal:** `https://gigpay.tech/auth?mode=signup` allows testers to register and test escrow release on mobile or desktop in **under 90 seconds** without requiring browser wallet extension installation.
* **Verified Pilot Testers (Evidence Vault):**
  * Tester names and contact details are kept in the intake form, not in this public report.
* **Live User Onboarding Recordings (Loom):**
  * **Community Group Call (Oct 17, 2026):** [`https://www.loom.com/share/c58f5cdb0a3446988f3ae1eb85cc59a0`](https://www.loom.com/share/c58f5cdb0a3446988f3ae1eb85cc59a0) — Live group session with 5 community members and the founder on camera, demonstrating milestone creation, escrow lock, and mobile tester mode.
  * **1-on-1 SQA & Security Walkthrough:** [`https://www.loom.com/share/0e0cf9099d8e4fe4b38a162d6972dab6`](https://www.loom.com/share/0e0cf9099d8e4fe4b38a162d6972dab6)
* **Evidence Repository:** Complete pilot tester profiles, screenshots, and UX survey responses are archived in the public Google Drive evidence vault at [GigPay Month 2 User Evidence Vault](https://drive.google.com/drive/folders/1ePGnn2aVU8KE2qq0h-zjB3pwHAqXBH-M?usp=sharing).

### 3.2 Pilot User Traction Funnel & Conversion Health Analysis

To provide full transparency for SDF and Rise In grant evaluation, GigPay tracks an authentic 3-tier user adoption and settlement funnel:

| Funnel Stage | Metric | Verification Source | Evaluation Significance |
| :--- | :--- | :--- | :--- |
| **Stage 1: Top of Funnel Discovery** | **117+ Unique Visitors** | `@vercel/analytics` Production Telemetry | Organic reach across 15+ countries, 49% PH domestic focus. |
| **Stage 2: User Registration (Acquisition)** | **18 real sign-ups** (23 accounts incl. 5 team test accounts) — *corrected Nov 4* | Live Supabase Auth (`gulshfticoirrpuohdxk`) | Real onboarding interest from the community sessions. |
| **Stage 3: Active Portal Flow Testers** | **Not measured** — *corrected Nov 4* | — | The earlier "18+ active testers" figure had no supporting record. |
| **Stage 4: Verified On-Chain Settlements** | **10 releases, all from team test wallets** — *corrected Nov 4* | Stellar Testnet Explorer (`CAUU2O...7RD3`) | Proves the contract works end to end; no tester-owned wallet had settled an escrow yet. |

> **Correction (Nov 4, 2026):** The conversion-rate claim that stood here ("39.2%, 11 settlements from 28 users") was based on wrong numbers and has been removed. No tester-owned wallet had completed an on-chain escrow by Oct 18.

### 3.3 Public X (Twitter) Weekly Ship Posts
Per Instawards Onboarding Slide 13–14 mandate, weekly progress was posted on X tagging `@StellarOrg`, `@PHI_stellar`, and `@riseinweb3`:
* **Week 1 Ship Post (Sep 22, 2026):** [`https://x.com/GigPayPH/status/2102193930150502781`](https://x.com/GigPayPH/status/2102193930150502781) — Soroban escrow deployment, 4/4 Rust unit tests & contract ID.
* **Week 2 Ship Post (Oct 1, 2026):** [`https://x.com/GigPayPH/status/2105480741761282160`](https://x.com/GigPayPH/status/2105480741761282160) — Frontend UI wiring, live Freighter balance, Soroban simulation & escrow funding/release.
* **Week 3 Ship Post (Oct 10, 2026):** [`https://x.com/GigPayPH/status/2108793569138110574`](https://x.com/GigPayPH/status/2108793569138110574) — Multi-wallet escrow execution, anti-self-dealing assertion & exponential backoff RPC resilience.
* **Week 4 Ship Post (Oct 17, 2026):** [`https://x.com/GigPayPH/status/2111271953164300425`](https://x.com/GigPayPH/status/2111271953164300425) — Final verification package, security self-review & 22/22 passing regression tests. *(The post's "28 registered pilot testers" was wrong: 18 real sign-ups + 5 team test accounts, see the correction above.)*

---

## 4. Production Web Analytics Telemetry (`@vercel/analytics`)

GigPay's production deployment (`https://gigpay.tech`) has integrated real-time analytics tracking authentic user traffic across 15+ countries:

| Metric | Value | Strategic Significance |
| :--- | :--- | :--- |
| **Unique Visitors** | **117 Unique Visitors** | Authentic organic reach across 15+ countries |
| **Total Page Views** | **281 Total Page Views** | Deep multi-page exploration (2.4 pages/visit overall) |
| **Top Page: Landing (/)** | **80 Visitors** | High initial discovery |
| **Top Page: Auth (/auth)** | **50 Visitors** | **62.5% Sign-Up Intent Rate** |
| **Registered User Accounts** | **18 real sign-ups + 5 team test accounts** (corrected Nov 4) | Live Supabase project `gulshfticoirrpuohdxk` |
| **Active Dual-Role Testers** | **Not measured** (corrected Nov 4) | No record supports the earlier "18+" figure |
| **Mobile Share** | **42% Mobile (Android 31%, iOS 11%)** | Strong mobile penetration validating simulator wallet |
| **Core Geographic Market** | **49% Philippines (57 visitors / 185 page views)** | Domestic target audience averaging 3.25 pages/visit |

---

## 5. Security Audit & Invariant Hardening

Published in [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) as part of Week 4 Deliverable 3:
* **Threat Mitigation Matrix:** Formally evaluates and resolves 8 threat categories (`THREAT-01` through `THREAT-08`), including unauthorized escrow release, self-dealing collusion, private key extraction, replay attacks, XSS, and RPC timeouts.
* **Zero Server-Side Key Custody:** No private keys exist in repository code, server memory, or database storage. Freighter users sign in their wallet. *Note added Nov 4:* the Testnet-only practice wallet keeps its key in the tester's own browser storage; it is disabled on Mainnet.
* **Automated Integration Testing:** 9 out of 9 passing Node test assertions in [`src/test/soroban_sim.test.js`](src/test/soroban_sim.test.js), verifying `fund_task` simulation, `approve_task` release, exponential backoff, and `u32` task ID boundary clamping (`[1, 4294967295]`).

---

## 6. SOW Milestone Delivery Scorecard

| Milestone | SOW Scope & Deliverable Description | Budget | Status |
| :--- | :--- | :---: | :---: |
| **Week 1** | **Deliverable 1:** Core Soroban Escrow Contract (`lib.rs`), Unit Tests, Testnet Deployment (`CAUU2O...7RD3`) | $1,500 USD | ✅ **COMPLETED (PR #2)** |
| **Week 2** | **Deliverable 2 (Part 1):** Frontend UI Integration, Freighter Connection, Task State Synchronization | $1,000 USD | ✅ **COMPLETED (PR #3)** |
| **Week 3** | **Deliverable 2 (Part 2):** Multi-Wallet Hardening, Anti-Self-Dealing Assertion, RPC Backoff Resilience | $1,000 USD | ✅ **COMPLETED (PR #4)** |
| **Week 4** | **Deliverable 3:** Verification Package, Security Audit, Traction Telemetry, Capstone Loom Walkthrough | $500 USD | ✅ **COMPLETED (PR #5 Merged)** |
| **All weeks** | Infrastructure & buffer (hosting, RPCs, testing) | $1,000 USD | — |
| **TOTAL** | **Full Month 1 Instawards Scope** | **$5,000 USD** | **100% On Track** |
