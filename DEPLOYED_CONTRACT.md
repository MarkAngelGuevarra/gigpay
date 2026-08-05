# 🚀 GigPay Deployed Soroban Smart Contract

This document provides definitive on-chain verification of the **GigPay Soroban Smart Contract** deployed on the official Stellar Testnet for the SCF Instawards Sprint.

## 📍 Live Deployment Verification
- **Contract Address (ID):** `CBRTDAFRUCLVRVYTDMRYM26RPMXC67VO7VMY7ZNVBBR2NVARLOF2KYMH`
- **Network:** Stellar Testnet
- **WASM Hash:** `2c2e7626e6a7ebb2888ab92c0408671e4df818774d68772d24582dd41dded8e2`
- **Deployer Account:** `GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3`
- **Creation Timestamp:** 1783207752
- **Explorer Verification Link:** [Stellar Expert Testnet Explorer](https://stellar.expert/explorer/testnet/contract/CBRTDAFRUCLVRVYTDMRYM26RPMXC67VO7VMY7ZNVBBR2NVARLOF2KYMH)

## 📁 Code Repository Mapping
1. **Rust Smart Contract:** located at `contracts/gigpay_escrow/src/lib.rs`
2. **Compiled WASM Binary:** located at `contracts/gigpay_escrow/target/wasm32-unknown-unknown/release/gigpay_escrow.wasm`
3. **Frontend Connection:** Configured in `src/context/TaskContext.jsx`, which links newly created escrow tasks directly to the deployed contract address (`CBRTDAFRUCLVRVYTDMRYM26RPMXC67VO7VMY7ZNVBBR2NVARLOF2KYMH`).
