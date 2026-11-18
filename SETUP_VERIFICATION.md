# GigPay Setup & Verification Guide (Sprint 2 work: built before approval; not funded)

How to install, test and build GigPay from a clean checkout, and where the real clean-install results are recorded.

## Requirements

- Node.js 20.19.0 or newer, or 22.12.0 or newer (Vite 8 `engines.node`: `^20.19.0 || >=22.12.0`; CI runs Node 22)
- npm 10 or newer, and git
- Internet access for `npm ci`. `npm test` and `npm run test:unit` run offline; `node scripts/index_escrows.mjs` and `node src/test/soroban_sim.test.js --live` need Stellar Testnet access. `npm run test:db` tests local Supabase PostgreSQL guards inside a rolled-back transaction.

## Steps

```bash
git clone https://github.com/MarkAngelGuevarra/gigpay.git
cd gigpay
npm ci              # installs exactly the versions in package-lock.json
npm run lint        # ESLint across src/ and test/
npm run typecheck   # tsc --noEmit verification
npm test            # 91 offline tests in 7 suites
npm run test:unit   # 53 Vitest unit, RTL component, and Edge Function tests
npm run build       # production build into dist/
npm run dev         # optional: local app at http://localhost:5173
```

To regenerate the chain-verified escrow table in `EVIDENCE_TABLE.md`, run `node scripts/index_escrows.mjs --write`.

## Results

Real clean-install runs, with unedited output, are recorded in [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

| Environment | Status |
|:---|:---|
| Windows 11 (build 22621), Node 24 | ✅ Passed, 2026-11-04 |
| Linux (Ubuntu 24.04.5 LTS) in a fresh cloud container (not a separate physical computer), Node 22 | ✅ Passed, 2026-11-05 |
| macOS 26.7.2 (arm64) on a fresh GitHub-hosted virtual machine (not a personal computer), Node 22 | ✅ Passed, 2026-11-12 ([run 43319819222](https://github.com/MarkAngelGuevarra/gigpay/actions/runs/43319819222)) |

To add another run (for example on a personal Mac), follow "How to add another environment" in [CLEAN_INSTALL_LOGS.md](CLEAN_INSTALL_LOGS.md).

> **Correction, Nov 4, 2026.** An earlier version of this file reported passing runs on three environments that cannot be matched to real runs. For example, it listed Node v18.20.4, which cannot run this project's Vite 8 build. Only real runs are listed now.
