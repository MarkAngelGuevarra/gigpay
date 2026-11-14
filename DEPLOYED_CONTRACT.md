# 🚀 GigPay Deployed Soroban Smart Contract

Where the **GigPay Soroban escrow contract** is deployed on Stellar Testnet (not mainnet), and how to check it yourself. A machine-readable copy of these details is in [deployments/testnet.json](deployments/testnet.json).

## 📍 Live Deployment Verification
- **Contract Address (ID):** `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`
- **Network:** Stellar Testnet (contract built with soroban-sdk 22)
- **WASM Hash:** `ea681b9739ada34e82b3d60158fb5fa75418e315488ee74074ce57b1180afdea`
- **Deployer Account:** `GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E`
- **Admin:** none. The contract has no admin role (only `fund_task`, `approve_task`, `get_task`).
- **Source:** `contracts/gigpay_escrow/src/lib.rs`, last changed in commit `ebb2a7a` (Sep 20, 2026). The repo does not record which commit the deployed WASM was built from; rebuilding at `ebb2a7a` and comparing the WASM hash is the way to check.
- **Deployment Transaction:** [`d90e6e47...`](https://stellar.expert/explorer/testnet/tx/d90e6e47231356cc87c03c3207d166345b0b86705afbd8682be365e7a179cc39)
- **Explorer Verification Link:** [Stellar Expert Testnet Explorer](https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)
- **Stellar Lab Verification:** [Stellar Lab Contract](https://lab.stellar.org/r/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3)

## 📁 Code Repository Mapping
1. **Rust Smart Contract:** located at `contracts/gigpay_escrow/src/lib.rs` (soroban-sdk 22.0.8, 4/4 passing unit tests)
2. **Compiled WASM Binary:** not tracked in git. Build it with `stellar contract build` (or `cargo build --target wasm32v1-none --release`) in `contracts/gigpay_escrow`; output goes to `target/wasm32v1-none/release/gigpay_escrow.wasm`.
3. **Frontend Connection:** Configured in `src/lib/stellar.js` and `src/context/TaskContext.jsx`, referencing `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`.

## Contract lifetime and capacity
- **Storage lifetime (TTL):** the contract's instance and Wasm code were extended on Nov 5, 2026 to the network maximum (~180 days, until about **May 4, 2027**), [tx b408effa…](https://stellar.expert/explorer/testnet/tx/b408effa5a8a02e99a810a95f6b2311039ba740343e8fa96cb9b8dfc8d71bc7f). Check or renew with `node scripts/extend_contract_ttl.mjs` (dry run by default; `--submit` to extend).
- **Capacity:** all escrows live in one instance-storage entry (14,676 bytes for 46 escrows on Nov 6, 2026; the network limit is 65,536 bytes), leaving room for roughly 205 escrows in total. With 71 escrows on Nov 14, 2026, that is roughly 130 more.
