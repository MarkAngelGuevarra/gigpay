# GigPay Multi-Wallet QA Testing Runbook & Protocol Verification

**SOW Alignment:** Sprint 1 Deliverable 2 (multi-wallet hardening)  
**Acceptance Metric (SOW Table 7):** $\ge 2$ unique Freighter wallets executed on Testnet  
**Target Environment:** Stellar Testnet (contract built with soroban-sdk 22)  
**Contract ID:** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`  
**Native XLM SAC ID:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`  
**Live app (Stellar Testnet):** [https://gigpay.tech](https://gigpay.tech)

---

## 1. Automated Integration Test Suite

The test suite validates RPC health, contract schema, transaction footprint simulation, multi-wallet syntax, anti-self-dealing guards, and exponential backoff retry algorithms without requiring manual clicks.

### Running the Test Suite
These 9 checks call Stellar Testnet, so they are not part of the offline `npm test` run:
```bash
node src/test/soroban_sim.test.js
```

### Verified Assertions (9/9 Passing):
1. **RPC Endpoint Health:** Queries `https://soroban-testnet.stellar.org` and asserts endpoint responsiveness.
2. **Contract & SAC Formatting:** Asserts StrKey C-address format for both Escrow Contract and Native SAC.
3. **`fund_task` Transaction Simulation:** Generates simulated auth entries and validates calculated resource fee footprint.
4. **Multi-Wallet Syntax Validation:** Asserts Ed25519 public key syntax (G...) using `StellarSdk.StrKey.isValidEd25519PublicKey`.
5. **Multi-Wallet Separation Assertion:** Asserts that Client and Freelancer addresses cannot collide.
6. **Exponential Backoff Schedule:** Validates progressive delay math (`1500ms -> 2250ms -> 3375ms -> 5000ms -> 5000ms`) with hard upper ceiling.
7. **`validateEscrowParties` Unit Logic:** Validates rejection of empty keys, malformed addresses, and identical self-dealing wallets.
8. **`formatStellarError` Normalization:** Validates graceful message formatting for Freighter user rejections, signature cancellations, and network timeouts.
9. **`u32` Task ID Clamping & `simulateApproveTask`:** Validates numeric clamping within `[1, 4294967295]` and simulated approval state release.

---

## 2. Interactive Multi-Wallet QA Procedure (Manual Execution)

To reproduce the multi-wallet lifecycle with $\ge 2$ separate Freighter wallets on Stellar Testnet:

### Prerequisites:
- Install the **Freighter Wallet** browser extension ([freighter.app](https://www.freighter.app/)).
- Switch Freighter network to **Testnet** (Settings $\rightarrow$ Network $\rightarrow$ Testnet).
- Prepare two separate keypairs:
  - **Persona A (Client Wallet):** Funds the milestone escrow.
  - **Persona B (Freelancer Wallet):** Receives the payout upon approval.
- Fund Persona A with Testnet XLM via Friendbot.

---

### Step 1: Fund Milestone Escrow (Persona A $\rightarrow$ Persona B)
1. In Freighter, switch to **Persona A (Client)**.
2. Open [https://gigpay.tech/client](https://gigpay.tech/client) (or local dev `http://localhost:5173/client`).
3. Click **Connect Freighter** in the header. Verify Persona A's public key appears.
4. In the "Create New Escrow Task" card:
   - **Task Title:** `Fullstack Soroban Escrow Integration`
   - **Amount:** `1.5` XLM (native XLM only; GigPay does not use USDC)
   - **Freelancer Wallet:** Paste Persona B's public key (`G...`).
5. Click **Lock Funds in Escrow**:
   - Pre-flight check verifies Persona A holds $\ge 3.0$ XLM (1.5 task amount + 1.0 base reserve + 0.5 gas buffer).
   - Freighter pop-up displays the transaction request with description and Soroban contract invocation.
   - Click **Approve / Sign** in Freighter.
6. The app submits the signed transaction to Soroban Testnet RPC and polls with exponential backoff until confirmed.
7. Toast notification displays: *"Task Escrow created and funded on Stellar Testnet!"*.

---

### Step 2: Negative Test — Anti-Self-Dealing Prevention
1. Keep Persona A connected in Freighter.
2. In the "Create New Escrow Task" card, paste **Persona A's own address** into the Freelancer Wallet field.
3. Click **Lock Funds in Escrow**.
4. **Observed Behavior:**
   - The UI immediately halts execution *before* prompting Freighter or calling Horizon.
   - Warning toast appears:  
     `"Self-dealing prevented: Client wallet and Freelancer destination wallet cannot be identical. Multi-wallet separation is required."`
   - Zero gas fees or on-chain transactions are wasted.

---

### Step 3: Negative Test — Graceful User Signature Cancellation
1. Enter Persona B's valid public key.
2. Click **Lock Funds in Escrow**.
3. When the Freighter signature pop-up opens, click **Reject / Decline**.
4. **Observed Behavior:**
   - The application intercepts the decline gracefully.
   - Warning toast appears: `"Transaction signing was rejected in Freighter."`
   - The form does not crash or remain stuck in loading state.

---

### Step 4: Milestone Work Delivery & Client Approval
1. In the Client Dashboard task list, locate the funded task.
2. Click **Approve & Release**.
3. Type `CONFIRM` in the security modal to prevent accidental fund release.
4. Type **CONFIRM** and click **Release**.
5. Freighter prompts Persona A to sign the `approve_task` contract call.
6. Upon confirmation, Soroban smart contract releases the Stroop token balance directly to **Persona B (Freelancer)**.
7. Toast notification confirms: *"Escrow released on Testnet! Tx: …"*.

---

## 3. On-Chain Verifiability & Evidence

All transactions execute on Stellar Testnet and can be verified publicly:

| Component | Identifier / Link |
| :--- | :--- |
| **Escrow Smart Contract** | [`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3) |
| **Native SAC Contract** | [`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC`](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC) |
| **Escrow #1 funding (team test, Sep 20, 2026)** | [`40df1a722e...`](https://stellar.expert/explorer/testnet/tx/40df1a722e724daf317630345cc00d07a81344134938ea9745a0b6440d432dda) |
| **Escrow #1 release (team test)** | [`1770bfa555...`](https://stellar.expert/explorer/testnet/tx/1770bfa5558fa2bcbb95309a1ece394895f788fe1822cdf9a2dbd923f621e984) |
| **Live Production dApp** | [https://gigpay.tech](https://gigpay.tech) |
| **Pull Request #4** | [https://github.com/MarkAngelGuevarra/gigpay/pull/4](https://github.com/MarkAngelGuevarra/gigpay/pull/4) |
