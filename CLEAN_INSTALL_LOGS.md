# GigPay Clean-Install Logs (SOW Deliverable 4b)

The SOW requires the project to run from a clean installation on three separate computers or environments. This file records only runs that actually happened, with their real output.

## Status

| # | Environment | Status |
|:---:|:---|:---|
| 1 | Windows 11 (build 10.0.22621), Node v24.15.0, npm 11.12.1 | ✅ **Passed**, 2026-11-04 (log below) |
| 2 | Linux (Ubuntu or a clean `node:22` Docker container) | ⏳ **Not yet run** |
| 3 | macOS | ⏳ **Not yet run** (needs a Mac) |

> **Correction, Nov 4, 2026.** An earlier version of this file (and of `SETUP_VERIFICATION.md`) showed passing runs on macOS Sonoma and Ubuntu 24.04. Those logs cannot be matched to any real run:
> - The two files disagreed on the macOS version (14.4.1 vs 14.5) and on how Ubuntu was run (a cloud node vs Docker and GitHub Actions). The repo has no GitHub Actions workflow.
> - They reported 248 installed packages; a real clean install of this lockfile installs 125.
> - A fresh clone was in fact **failing** on Windows, because committed Rust build files had paths too long for Windows. That was fixed in commit `e0c7ec3`.
>
> The earlier logs have been removed. Environments 2 and 3 will be added here only after they are actually run.

## How to reproduce (any environment)

```bash
git clone https://github.com/MarkAngelGuevarra/gigpay.git
cd gigpay
npm ci
npm test
npm run build
```

`npm test` makes a few read-only calls to Stellar Testnet (Horizon/RPC), so it needs internet access.

## Environment 1: Windows 11, 2026-11-04 (real output)

Fresh clone of branch `fix/evidence-integrity` at commit `e0c7ec3` into an empty folder:

```
=== CLEAN INSTALL 2026-11-04T16:00:04Z
OS: Microsoft Windows [Version 10.0.22621.4317]
Node v24.15.0, npm 11.12.1, git version 2.54.0.windows.1
Commit: e0c7ec3
--- npm ci
added 125 packages in 38s
--- npm test
exit 0
   REGRESSION SUITE RESULTS: 22/22 TESTS PASSED
  Escrow integrity: 10/10 passed
  Ledger integrity: 6/6 passed
--- npm run build
✓ built in 2.41s
exit 0
```

## Recording a new environment

Run the reproduce steps above on the new machine. Then paste the **unedited** terminal output into a new section with the date, OS version, `node -v`, `npm -v` and the commit hash (`git rev-parse --short HEAD`). A screenshot or short screen recording of the run is good supporting evidence.
