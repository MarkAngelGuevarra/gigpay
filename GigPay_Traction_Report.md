# GigPay — Current Traction, User Telemetry & Progress Report
**Stellar Philippines Instawards (Cohort 2026 / SDF / Rise In)**  
**Lead Developer:** Mark Angel Guevarra (`marcangelguevarra@gmail.com` / GitHub: [`MarkAngelGuevarra`](https://github.com/MarkAngelGuevarra))  
**Official Repository:** [`https://github.com/MarkAngelGuevarra/gigpay`](https://github.com/MarkAngelGuevarra/gigpay)  
**Live Production URL:** [`https://gigpay.tech`](https://gigpay.tech) (Mirror: [`https://gigpay-gules.vercel.app`](https://gigpay-gules.vercel.app))  
**Active Testnet Contract ID:** [`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)  
**Soroban Protocol Version:** Protocol 22  
**Reporting Date:** Sunday, October 18, 2026  

---

## 1. Executive Summary

GigPay is a decentralized milestone escrow web application built on **Stellar Soroban (Protocol 22)** to eliminate 20% platform commission cuts and 7–14 day payout holds for Filipino freelancers. 

During the Month 1 Instawards Sprint, GigPay transitioned from initial architecture to a live, production-grade dApp deployed at `https://gigpay.tech`. The platform enforces non-custodial milestone locking and atomic releases in ~5 seconds with near-zero network fees, backed by client-side Freighter signing and a resilient built-in Soroban Testnet Simulator.

---

## 2. On-Chain Development & Stellar Testnet Evidence

All smart contract logic is deployed, live, and publicly verifiable on the Stellar Testnet:
* **Contract Address:** [`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)
* **Native XLM SAC Contract:** [`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
* **WASM Hash:** `ea681b9739ada34e82b3d60158fb5fa75418e315488ee74074ce57b1180afdea`
* **Deployer Account:** `GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E`
* **Verifiable On-Chain Executions:** Over **20 verified transactions** across 10 complete escrow lifecycles (`fund_task` and `approve_task`) documented with direct hash links in [`EVIDENCE_TABLE.md`](EVIDENCE_TABLE.md).

---

## 3. Real-World User Adoption & Pilot Telemetry

To fulfill the Month 2 ($5,000) Instawards eligibility gate mandated by Armielyn Obinguar (SDF / Rise In), GigPay launched an active pilot testing intake campaign.

### 3.1 Pilot Intake Channels & Workflow
* **Intake Form:** [`https://forms.gle/oLGjJRcxg5LZ5bC96`](https://forms.gle/oLGjJRcxg5LZ5bC96)
* **Low-Friction Sign-Up Portal:** `https://gigpay.tech/auth?mode=signup` allows testers to register and test escrow release on mobile or desktop in **under 90 seconds** without requiring browser wallet extension installation.
* **Verified Pilot Testers (Evidence Vault):**
  * **User #01:** Prince Dale Limosnero (`princedale99@gmail.com` / `@princedale99` Telegram) — Client & Web3 UX Tester
  * **User #02:** Ashley Loraine A. Mendoza (`mendozaoraine3@gmail.com` / Messenger) — Freelancer & Remote Worker Persona
* **Live User Onboarding Recordings (Loom):**
  * **Community Group Call (Oct 17, 2026):** [`https://www.loom.com/share/c58f5cdb0a3446988f3ae1eb85cc59a0`](https://www.loom.com/share/c58f5cdb0a3446988f3ae1eb85cc59a0) — Live group session with 6 community members on camera (Clarence Ingal, Christian Daniel Gerlan, Ashley Loraine Mendoza, Ella Deladia, Prince Dale Limosnero, and Mark Angel Guevarra) demonstrating milestone creation, escrow lock, and mobile tester mode.
  * **1-on-1 SQA & Security Walkthrough:** [`https://www.loom.com/share/0e0cf9099d8e4fe4b38a162d6972dab6`](https://www.loom.com/share/0e0cf9099d8e4fe4b38a162d6972dab6)
* **Evidence Repository:** Complete pilot tester profiles, screenshots, and UX survey responses are archived in the public Google Drive evidence vault at [GigPay Month 2 User Evidence Vault](https://drive.google.com/drive/folders/1ePGnn2aVU8KE2qq0h-zjB3pwHAqXBH-M?usp=sharing).

### 3.2 Public X (Twitter) Weekly Ship Posts
Per Instawards Onboarding Slide 13–14 mandate, weekly progress was posted on X tagging `@StellarOrg`, `@PHI_stellar`, and `@riseinweb3`:
* **Week 1 Ship Post (Sep 22, 2026):** [`https://x.com/GigPayPH/status/2102193930150502781`](https://x.com/GigPayPH/status/2102193930150502781) — Soroban escrow deployment, 4/4 Rust unit tests & contract ID.
* **Week 2 Ship Post (Oct 1, 2026):** [`https://x.com/GigPayPH/status/2105480741761282160`](https://x.com/GigPayPH/status/2105480741761282160) — Frontend UI wiring, live Freighter balance, Soroban simulation & escrow funding/release.
* **Week 3 Ship Post (Oct 10, 2026):** [`https://x.com/GigPayPH/status/2108793569138110574`](https://x.com/GigPayPH/status/2108793569138110574) — Multi-wallet escrow execution, anti-self-dealing assertion & exponential backoff RPC resilience.
* **Week 4 Ship Post (Oct 17, 2026):** [`https://x.com/GigPayPH/status/2111271953164300425`](https://x.com/GigPayPH/status/2111271953164300425) — Final verification package, security audit, 9/9 passing tests & 14+ verified pilot testers.

---

## 4. Production Web Analytics Telemetry (`@vercel/analytics`)

GigPay's production deployment (`https://gigpay.tech`) has integrated real-time analytics tracking authentic user traffic across 7 countries:

| Metric | Value | Strategic Significance |
| :--- | :--- | :--- |
| **Unique Visitors** | **104 Unique Visitors** | Authentic organic reach (up from 44+) |
| **Total Page Views** | **266 Total Page Views** | Deep multi-page exploration (up from 64+) |
| **Top Page: Landing (/)** | **68 Visitors / 111 Views** | High initial discovery |
| **Top Page: Auth (/auth)** | **50 Visitors / 88 Views** | **48% Sign-Up Intent Rate** |
| **Active Onboarded Users** | **22 Authenticated Users** | Real Supabase Auth accounts with unique UUIDs |
| **Mobile & OS Share** | **47% Windows, 35% Android, 9% iOS, 9% Linux** | Strong mobile penetration validating simulator need |
| **Core Geographic Market** | **53% Philippines (55 visitors / 183 page views)** | Primary domestic target audience engagement |

---

## 5. Security Audit & Invariant Hardening

Published in [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) as part of Week 4 Deliverable 3:
* **Threat Mitigation Matrix:** Formally evaluates and resolves 8 threat categories (`THREAT-01` through `THREAT-08`), including unauthorized escrow release, self-dealing collusion, private key extraction, replay attacks, XSS, and RPC timeouts.
* **Zero Private Key Custody:** Enforces client-side signing exclusively via Freighter Wallet API. Zero private keys exist in repository code, server memory, or database storage.
* **Automated Integration Testing:** 9 out of 9 passing Vitest assertions in [`src/test/soroban_sim.test.js`](src/test/soroban_sim.test.js), verifying `fund_task` simulation, `approve_task` release, exponential backoff, and `u32` task ID boundary clamping (`[1, 4294967295]`).

---

## 6. SOW Milestone Delivery Scorecard

| Milestone | SOW Scope & Deliverable Description | Budget | Status |
| :--- | :--- | :---: | :---: |
| **Week 1** | **Deliverable 1:** Core Soroban Escrow Contract (`lib.rs`), Unit Tests, Testnet Deployment (`CAUU2O...7RD3`) | $1,500 USD | ✅ **COMPLETED (PR #2)** |
| **Week 2** | **Deliverable 2 (Part 1):** Frontend UI Integration, Freighter Connection, Task State Synchronization | $1,000 USD | ✅ **COMPLETED (PR #3)** |
| **Week 3** | **Deliverable 2 (Part 2):** Multi-Wallet Hardening, Anti-Self-Dealing Assertion, RPC Backoff Resilience | $1,000 USD | ✅ **COMPLETED (PR #4)** |
| **Week 4** | **Deliverable 3:** Verification Package, Security Audit, Traction Telemetry, Capstone Loom Walkthrough | $500 USD | ✅ **COMPLETED (PR #5 Merged)** |
| **TOTAL** | **Full Month 1 Instawards Scope** | **$5,000 USD** | **100% On Track** |

---

## 7. Next Steps & Month 2 Expansion Roadmap

Upon completion of Month 1 SOW Deliverable 3 on Friday, October 16, 2026:
1. **Official Demo Showcase Presentation:** Present live running product (zero slides) to the SDF / Rise In evaluation committee.
2. **Month 2 Instawards Tranche ($5,000 USD):** Deploy to Stellar Mainnet, add native USDC on Stellar, and integrate Philippine off-ramp anchors (GCash/Maya/Bank).
3. **Month 3 Instawards Tranche ($5,000 USD):** Multi-stage milestone releases and decentralized dispute arbitration.
4. **SCF Build Award ($150,000 USD in XLM):** Full production scale.
