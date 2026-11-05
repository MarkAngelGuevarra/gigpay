# GigPay — Current Traction, User Telemetry & Progress Report
**Stellar Philippines Instawards (Cohort 2026 / SDF / Rise In)**  
**Lead Developer:** Mark Angel Guevarra (`marcangelguevarra@gmail.com` / GitHub: [`MarkAngelGuevarra`](https://github.com/MarkAngelGuevarra))  
**Official Repository:** [`https://github.com/MarkAngelGuevarra/gigpay`](https://github.com/MarkAngelGuevarra/gigpay)  
**Live Production URL:** [`https://gigpay.tech`](https://gigpay.tech) (Mirror: [`https://gigpay-gules.vercel.app`](https://gigpay-gules.vercel.app))  
**Active Testnet Contract ID:** [`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)  
**Contract SDK:** soroban-sdk 22.0.8  
**Reporting Date:** Sunday, October 18, 2026  

> **Correction added November 4, 2026.** Several figures in this report were overstated when it was written. Checked against the chain and the Supabase database as of Oct 18, 2026, the accurate figures are:
> - **Registered accounts: 23, not 28.** Of these, **16** were real sign-ups and 7 were team accounts (5 July test accounts, the founder's account and the shared reviewer demo account). *Recounted Nov 5: the Nov 4 correction had counted the founder and reviewer demo accounts as testers.*
> - **On-chain escrows: 14 funded and 10 released, all from team test wallets** (QA client and founder → team freelancer wallet). None were from testers' own wallets, so "11 completed milestones" and the 39.2% conversion claim were wrong.
> - **"18+ active testers completed dual-role flows" is not supported** by any record we can find. 18 was not the number of completed flows; the real sign-up count was 16.
> - **Testers' email addresses and handles have been removed** from this public report.
>
> Current, chain-verified numbers are in [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md).

---

## 1. Executive Summary

GigPay is a decentralized milestone escrow web application built on **Stellar Soroban** to remove platform commissions of up to 20% and multi-day payout holds for Filipino freelancers. 

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
* **Low-Friction Sign-Up Portal:** `https://gigpay.tech/auth?mode=signup` allows testers to register and test escrow release on mobile or desktop without installing a browser wallet extension (time to complete not yet measured).
* **Verified Pilot Testers (Evidence Vault):**
  * Tester names and contact details are kept in the intake form, not in this public report.
* **Live User Onboarding Recordings (Loom):**
  * **Community Group Call (Oct 17, 2026):** [`https://www.loom.com/share/c58f5cdb0a3446988f3ae1eb85cc59a0`](https://www.loom.com/share/c58f5cdb0a3446988f3ae1eb85cc59a0) — Live group session with 5 community members and the founder on camera, demonstrating milestone creation, escrow lock, and mobile tester mode.
  * **1-on-1 SQA & Security Walkthrough:** [`https://www.loom.com/share/0e0cf9099d8e4fe4b38a162d6972dab6`](https://www.loom.com/share/0e0cf9099d8e4fe4b38a162d6972dab6)
* **Evidence Repository:** Tester profiles and survey responses contain personal data, so they are kept privately (in the intake form) and are not published. Public evidence is the on-chain table in [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md).

### 3.2 Pilot User Traction Funnel & Conversion Health Analysis

To provide full transparency for SDF and Rise In grant evaluation, GigPay tracks an authentic 3-tier user adoption and settlement funnel:

| Funnel Stage | Metric | Verification Source | Evaluation Significance |
| :--- | :--- | :--- | :--- |
| **Stage 1: Top of Funnel Discovery** | Not measured | Web analytics were removed on Oct 30, 2026 (commit 1696410) | Earlier visitor figures are withdrawn: no committed evidence supports them. |
| **Stage 2: User Registration (Acquisition)** | **16 real sign-ups** (23 accounts incl. 7 team accounts) — *corrected Nov 4, recounted Nov 5* | Live Supabase Auth (`gulshfticoirrpuohdxk`) | Real onboarding interest from the community sessions. |
| **Stage 3: Active Portal Flow Testers** | **Not measured** — *corrected Nov 4* | — | The earlier "18+ active testers" figure had no supporting record. |
| **Stage 4: Verified On-Chain Settlements** | **10 releases, all from team test wallets** — *corrected Nov 4* | Stellar Testnet Explorer (`CAUU2O...7RD3`) | Proves the contract works end to end; no tester-owned wallet had settled an escrow yet. |

> **Correction (Nov 4, 2026):** The conversion-rate claim that stood here ("39.2%, 11 settlements from 28 users") was based on wrong numbers and has been removed. No tester-owned wallet had completed an on-chain escrow by Oct 18.

### 3.3 Public X (Twitter) Weekly Ship Posts
Per Instawards Onboarding Slide 13–14 mandate, weekly progress was posted on X tagging `@StellarOrg`, `@PHI_stellar`, and `@riseinweb3`:
* **Week 1 Ship Post (Sep 22, 2026):** [`https://x.com/GigPayPH/status/2102193930150502781`](https://x.com/GigPayPH/status/2102193930150502781) — Soroban escrow deployment, 4/4 Rust unit tests & contract ID.
* **Week 2 Ship Post (Oct 1, 2026):** [`https://x.com/GigPayPH/status/2105480741761282160`](https://x.com/GigPayPH/status/2105480741761282160) — Frontend UI wiring, live Freighter balance, Soroban simulation & escrow funding/release.
* **Week 3 Ship Post (Oct 10, 2026):** [`https://x.com/GigPayPH/status/2108793569138110574`](https://x.com/GigPayPH/status/2108793569138110574) — Multi-wallet escrow execution, anti-self-dealing assertion & exponential backoff RPC resilience.
* **Week 4 Ship Post (Oct 17, 2026):** [`https://x.com/GigPayPH/status/2111271953164300425`](https://x.com/GigPayPH/status/2111271953164300425) — Final verification package, security self-review & 22/22 passing regression tests. *(The post's "28 registered pilot testers" was wrong: 16 real sign-ups + 7 team accounts, see the correction above.)*

---

## 4. Production Web Analytics Telemetry (`@vercel/analytics`)

_Withdrawn (Nov 6, 2026):_ the visitor figures below came from `@vercel/analytics`, which was removed on Oct 30, 2026, and no export was kept, so they cannot be verified and are not claimed:

| Metric | Value | Source |
| :--- | :--- | :--- |
| **Registered User Accounts** | **16 real sign-ups + 7 team accounts** (corrected Nov 4, recounted Nov 5) | Live Supabase project `gulshfticoirrpuohdxk` |
| **Active Dual-Role Testers** | **Not measured** (corrected Nov 4) | No record supports the earlier "18+" figure |

Visitor, page-view, mobile-share and country figures previously shown here are withdrawn (see note above).

---

## 5. Security Audit & Invariant Hardening

Published in [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) as part of Week 4 Deliverable 3:
* **Threat Mitigation Matrix:** Formally evaluates and resolves 8 threat categories (`THREAT-01` through `THREAT-08`), including unauthorized escrow release, self-dealing collusion, private key extraction, replay attacks, XSS, and RPC timeouts.
* **No Server-Side User Keys:** No user private keys exist in repository code or server storage; the only server-side key is the team's Testnet funding-pool key, encrypted in Supabase Vault. Freighter users sign in their wallet. *Note added Nov 4:* the Testnet-only practice wallet keeps its key in the tester's own browser storage; it is disabled on Mainnet.
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
