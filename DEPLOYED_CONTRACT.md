# 🚀 GigPay Deployed Soroban Smart Contract

This document provides definitive on-chain verification of the **GigPay Soroban Smart Contract** deployed on the official Stellar Testnet for the SCF Instawards Sprint.

## 📍 Live Deployment Verification (Protocol 22)
- **Contract Address (ID):** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`
- **Network:** Stellar Testnet (Protocol 22)
- **WASM Hash:** `ea681b9739ada34e82b3d60158fb5fa75418e315488ee74074ce57b1180afdea`
- **Deployer Account:** `GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E`
- **Deployment Transaction:** [`d90e6e47...`](https://stellar.expert/explorer/testnet/tx/d90e6e47231356cc87c03c3207d166345b0b86705afbd8682be365e7a179cc39)
- **Explorer Verification Link:** [Stellar Expert Testnet Explorer](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)
- **Stellar Lab Verification:** [Stellar Lab Contract](https://lab.stellar.org/r/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)

## 📁 Code Repository Mapping
1. **Rust Smart Contract:** located at `contracts/gigpay_escrow/src/lib.rs` (Protocol 22, 4/4 passing unit tests)
2. **Compiled WASM Binary:** located at `contracts/gigpay_escrow/target/wasm32v1-none/release/gigpay_escrow.wasm`
3. **Frontend Connection:** Configured in `src/lib/stellar.js` and `src/context/TaskContext.jsx`, referencing `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`.
