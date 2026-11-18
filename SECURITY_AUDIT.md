# 🛡️ GigPay Security Self-Review & Threat Mitigation Matrix

> A self-review by the GigPay team, not a third-party audit.

**Project:** GigPay — Milestone escrow on Stellar Testnet (Soroban)  
**SOW Milestone:** Week 4 / Deliverable 3 — Security Self-Review & Verification Package  
**Sprint Program:** Stellar Philippines Instawards (2026 Cohort / SDF / Rise In)  
**Lead Developer:** Mark Angel Guevarra (`marcangelguevarra@gmail.com` / `@GigPayPH`)  
**Active Testnet Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`  
**Native XLM SAC Contract ID:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`  
**Contract SDK:** soroban-sdk 22.0.8  
**Review type:** Self-review by the builder (not a third-party audit; third-party audits are out of SOW scope)  

---

## 1. Executive Summary

This security self-review covers on-chain state safety and the app's threat surface for **GigPay**, a milestone escrow app on Stellar Testnet for Filipino freelancers. It is not an audit. Two items are open (THREAT-09 and THREAT-10, added Nov 18, 2026).

The review focuses on four defense layers:
1. **On-Chain Soroban Smart Contract Invariants (`CAUU2O...7RD3`)**
2. **Key handling and wallet isolation**
3. **Frontend Application Security & Content Security Policy (CSP) Hardening**
4. **Backend Database Authorization & Supabase Row-Level Security (RLS)**

---

## 2. Threat Modeling & Vulnerability Mitigation Matrix

| Threat ID | Threat Category | Attack Vector / Risk | GigPay Mitigation & Defense Mechanism | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | **Unauthorized Escrow Release** | Malicious actor attempts to release escrowed funds without client consent. | On-chain `approve_task` requires cryptographic authorization from the client address who originally locked the escrow (`require_auth()`). Frontend validates client public key prior to transaction assembly. | **VERIFIED (PASSED)** |
| **THREAT-02** | **Self-Dealing / Collusion** | Client sets the destination freelancer wallet to their own address to fake volume or exploit platform bonuses. | Enforced by `validateEscrowParties()` in `src/lib/stellar.js`. Strictly blocks transaction assembly if `clientAddress === freelancerAddress`. This check is in the app only; the deployed contract does not reject client == freelancer. | **MITIGATED IN APP** |
| **THREAT-03** | **Private Key / Seed Extraction** | Malicious script or extension attempts to read seed phrases or private keys from local storage. | No user keys are held server-side: Varial (formerly Freighter) users sign in their wallet, and Testnet practice wallets keep their key in that browser's storage (Testnet only, accepted risk; see THREAT-10). One team Testnet funding-pool key is stored encrypted in Supabase Vault and used only by the `fund-practice-wallet` Edge Function (service role). | **ACCEPTED RISK (Testnet only)** |
| **THREAT-04** | **Replay & State Collisions** | Duplicate task IDs causing `AlreadyInit` on-chain contract panics or cross-transaction replaying. | The contract assigns escrow IDs from a sequential `TaskCounter`, so IDs cannot collide; the app checks IDs stay within `u32` bounds (`[1, 4294967295]`, Test 9 in `soroban_sim.test.js`). | **VERIFIED (PASSED)** |
| **THREAT-05** | **Cross-Site Scripting (XSS)** | Malicious third-party scripts injected via CDN or untrusted analytics. | Strict Content Security Policy (`CSP`) defined in `index.html`. Restricts `connect-src` strictly to `https://*.supabase.co`, `https://va.vercel-scripts.com`, and Stellar RPC/Horizon endpoints. | **VERIFIED (PASSED)** |
| **THREAT-06** | **Account Starvation / Stuck Tx** | Client attempts to fund escrow without leaving enough XLM for base reserves (1.0 XLM) and transaction fees. | `checkBalanceSufficiency()` pre-flight check asserts `currentBalance >= amount + 1.5 XLM` before prompting wallet signature. | **VERIFIED (PASSED)** |
| **THREAT-07** | **RPC Latency & False Failure** | Network latency on Testnet RPC causing timeout and user panic. | Resilient exponential backoff polling (`pollSorobanTransactionWithBackoff`) with `1500ms -> 2250ms -> 3375ms -> 5000ms` schedule. | **VERIFIED (PASSED)** |
| **THREAT-08** | **Database Tampering** | Authenticated user attempts to modify tasks or profiles belonging to another user. | Supabase PostgreSQL Row Level Security (`RLS`) enforces `auth.uid() = id` on `public.profiles` and `client_id = auth.uid()` on `public.tasks`.  A `BEFORE UPDATE` trigger (`enforce_task_update`) makes escrow fields write-once and limits who can change each status. Inserts are only role-checked, and the claim step does not verify the payout address server-side. | **PARTLY MITIGATED** |
| **THREAT-09** | **Dispute freeze bypass** | The dispute freeze is an app and database rule, not a contract rule. A client can call `approve_task` directly (for example from Stellar Lab or the CLI) and the contract releases the funds during a dispute. The database service role (Supabase dashboard) can change dispute fields, because the `enforce_task_update` trigger only restricts signed-in users. | Today: the app, its signing layer and the database trigger block a release through GigPay while a dispute is open ([docs/DISPUTE_RESOLUTION.md](docs/DISPUTE_RESOLUTION.md)). Planned fix: revised SOW (contract v2 on-chain dispute/refund; wallet confirmation screen and key export). | **OPEN** |
| **THREAT-10** | **Practice wallet signing and team funding key** | The Testnet practice wallet keeps its secret key in this browser's `localStorage` and signs GigPay fund and release transactions without a confirmation screen (`src/lib/stellar.js`). A script running in the page could read the key or get a transaction signed. This includes code shipped by whoever can deploy gigpay.tech (a push to main auto-deploys via Vercel): until the proposed wallet hardening adds a confirmation screen and key export, the practice wallet is controlled by the browser code GigPay serves. New practice wallets may be funded from a team-held Testnet funding account whose key is server-side (Supabase Vault, used by the `fund-practice-wallet` Edge Function). | Today: Testnet only (no cash value); the CSP limits which scripts can load; the funding function gives one top-up per signed-in account and its key is never in the repository. Planned fix: revised SOW (contract v2 on-chain dispute/refund; wallet confirmation screen and key export). | **OPEN** |

---

## 3. Key handling and contract state (current, Testnet)

### 3.1 Key handling (current, Testnet)
GigPay has two signing paths:
```
Varial (formerly Freighter) path:
User (Browser) <---> Varial wallet extension (signs in the extension) <---> Stellar RPC / Horizon
  The extension shows its own signing prompt. GigPay never sees the secret key.

Practice wallet path (Testnet only):
User (Browser) ---> Testnet secret key in this browser's localStorage ---> GigPay signs ---> Stellar RPC / Horizon
  No separate confirmation screen today; the client types CONFIRM before a release (THREAT-10).
```
- **Varial signing:** `signTransaction(xdr, { network: 'TESTNET', networkPassphrase, accountToSign })`.
- **Practice-wallet signing:** the stored keypair signs the prepared transaction in `src/lib/stellar.js`, with no wallet prompt.
- **Session state:** the app stores the active public key (`G...`). The practice wallet's secret key is also kept in this browser.
- **Server-side keys:** no user keys are stored server-side. The only server-side key is the team's Testnet funding-account key in Supabase Vault (never in the repository), used to fund new practice wallets when Friendbot rate-limits (THREAT-10).

### 3.2 Smart Contract Escrow State Machine
The Soroban escrow contract enforces an immutable state progression:
1. `Initialized` $\rightarrow$ Locked upon `fund_task(client, freelancer, token, amount)`
2. `Approved` $\rightarrow$ Atomic release to freelancer upon `approve_task(task_id)`
3. There is no `Disputed`, refund or arbitrator state in the contract. The dispute freeze is enforced by the app (`isDisputeActive` in `src/lib/taskLifecycle.js` and the signing layer), not on-chain.

---

## 4. Automated Verification & Test Suite Evidence

The frontend integration test suite located at [`src/test/soroban_sim.test.js`](src/test/soroban_sim.test.js) validates 9/9 critical security and operational invariants:

```text
🧪 Starting GigPay Soroban Integration Tests...

--- Test 1: RPC Endpoint Health ---
RPC Endpoint: https://soroban-testnet.stellar.org
RPC Status: healthy
✅ Test 1 Passed: RPC endpoint is responsive.

--- Test 2: Contract Address & SAC Verification ---
Escrow Contract ID: CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3
Native XLM SAC ID:   CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
✅ Test 2 Passed: Contract addresses format valid.

--- Test 3: fund_task Transaction Simulation ---
Simulation Status: Success
Calculated Min Resource Fee: 244362 stroops
✅ Test 3 Passed: fund_task simulation generated valid Soroban auth & footprint.

--- Test 4: Multi-Wallet Syntax & Key Validation ---
✅ Test 4 Passed: Stellar address formats strictly validated.

--- Test 5: Multi-Wallet Separation & Anti-Self-Dealing Assertion ---
✅ Test 5 Passed: Multi-wallet separation and anti-self-dealing confirmed.

--- Test 6: Exponential Backoff Calculation & Delay Bounds ---
Calculated Polling Intervals: 1500ms -> 2250ms -> 3375ms -> 5000ms -> 5000ms
✅ Test 6 Passed: Exponential backoff math and delay ceiling verified.

--- Test 7: validateEscrowParties Assertion Logic ---
✅ Test 7 Passed: validateEscrowParties correctly asserts distinct parties and catches self-dealing.

--- Test 8: formatStellarError Normalization ---
✅ Test 8 Passed: User cancellations and wallet timeouts normalized gracefully.

--- Test 9: u32 Task ID Clamping & simulateApproveTask Verification ---
Clamped u32 Task ID: 1070320958 (within [1, 4294967295])
✅ Test 9 Passed: u32 Task ID clamping and simulateApproveTask verified.

🎉 All 9/9 Soroban frontend integration tests passed successfully!
```

---

## 5. Deployment Environment & CSP Hardening Checklist

- [x] **Production URL:** `https://gigpay.tech` (Vercel CDN)
- [x] **SSL / TLS Encryption:** Strict HSTS & TLS 1.3 enforced by Vercel Edge Network
- [x] **CSP connect-src** (as in `index.html`): `'self'`, `va.vercel-scripts.com`, `*.stellar.org` (Soroban RPC, Horizon, Friendbot) and `*.supabase.co`, including their `wss://` endpoints.
- [x] **Supabase fallback route:** if a network blocks `*.supabase.co` (some school and office firewalls do), `src/lib/supabase.js` retries through the same-origin `/api/supabase` rewrite in `vercel.json`.
- [x] **Task update guard:** a database trigger (`supabase/migrations/20261105023600_guard_task_updates_and_harden_auth_functions.sql`) makes escrow fields write-once and limits what a freelancer can change; only the task's client can release or dispute.

---

## 6. Conclusion

Based on static analysis, transaction simulation, and automated test execution:
This self-review found no way to release an escrow without the funding client's signature. Known limits: the dispute freeze and the client ≠ freelancer check are enforced by the app, not the contract (THREAT-02, THREAT-09), and the Testnet practice wallet keeps its key in browser storage and signs without a confirmation screen (THREAT-10). THREAT-09 and THREAT-10 are open. Suitable for Testnet pilot testing only; not a substitute for a third-party audit before Mainnet.
