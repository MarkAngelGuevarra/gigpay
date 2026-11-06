# GigPay Setup & Verification Guide (SOW Deliverable 4b)

How to install, test and build GigPay from a clean checkout, and where the real clean-install results are recorded.

## Requirements

- Node.js 20.19 or newer (Vite 8 does not run on older Node versions)
- npm 10 or newer, and git
- Internet access for `npm ci`. `npm test` itself runs offline; `node scripts/index_escrows.mjs` and the `src/test/soroban_sim.test.js` suite need Stellar Testnet access.

## Steps

```bash
git clone https://github.com/MarkAngelGuevarra/gigpay.git
cd gigpay
npm ci          # installs exactly the versions in package-lock.json
npm test        # 70 offline tests in 6 suites
npm run build   # production build into dist/
npm run dev     # optional: local app at http://localhost:5173
```

To regenerate the chain-verified escrow table in `EVIDENCE_TABLE.md`, run `node scripts/index_escrows.mjs --write`.

## Results

Real clean-install runs, with unedited output, are recorded in [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

| Environment | Status |
|:---|:---|
| Windows 11 (build 22621), Node 24 | ✅ Passed, 2026-11-04 |
| Linux (Ubuntu 24.04.5 LTS) in a fresh cloud container (not a separate physical computer), Node 22 | ✅ Passed, 2026-11-05 |
| Third separate computer (for example a Mac) | ⏳ Pending |

To add the third run, follow "How to add environment 3" in [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

> **Correction, Nov 4, 2026.** An earlier version of this file reported passing runs on three environments that cannot be matched to real runs. For example, it listed Node v18.20.4, which cannot run this project's Vite 8 build. Only real runs are listed now.
