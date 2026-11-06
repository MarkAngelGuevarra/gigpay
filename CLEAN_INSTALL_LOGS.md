# GigPay Clean-Install Logs (SOW Deliverable 4b)

The SOW requires the project to run from a clean installation on three separate computers or environments. This file records only runs that actually happened, with their real output.

## Status

| # | Environment | Status |
|:---:|:---|:---|
| 1 | Windows 11 (build 10.0.22621), Node v24.15.0, npm 11.12.1 | ✅ **Passed**, 2026-11-04 (log below) |
| 2 | Linux: Ubuntu 24.04.5 LTS (fresh cloud container, not a separate physical computer; kernel 6.18), Node v22.23.4, npm 10.9.9 | ✅ **Passed**, 2026-11-05 (log below) |
| 3 | A third separate computer (for example a Mac) | ⏳ **Pending** (see "How to add environment 3") |

Two real runs so far. `npm test` today runs 85 offline tests in 7 suites; each log below shows the counts that existed at the commit it ran, so they are lower than today's.

> **Correction, Nov 4, 2026.** An earlier version of this file (and of `SETUP_VERIFICATION.md`) showed passing runs on macOS Sonoma and Ubuntu 24.04. Those logs cannot be matched to any real run:
> - The two files disagreed on the macOS version (14.4.1 vs 14.5) and on how Ubuntu was run (a cloud node vs Docker and GitHub Actions). The repo had no GitHub Actions workflow at the time.
> - They reported 248 installed packages; a real clean install of this lockfile installs 125.
> - A fresh clone was in fact **failing** on Windows, because committed Rust build files had paths too long for Windows. That was fixed in commit `e0c7ec3`.
>
> The earlier logs have been removed. Environment 2 was run and added on Nov 5, 2026; environment 3 will be added only after it is actually run.

## How to reproduce (any environment)

```bash
git clone https://github.com/MarkAngelGuevarra/gigpay.git
cd gigpay
npm ci
npm test
npm run build
```

`npm test` itself runs offline; `npm ci` needs internet access.

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

## Environment 2: Linux (Ubuntu 24.04.5 LTS cloud container), 2026-11-05 00:11 UTC (real output)

Fresh clone into an empty directory on a new Ubuntu container, then `npm ci`, `npm test` and `npm run build`. Output trimmed to the summary lines; nothing else was changed.

```text
$ uname -sr; grep PRETTY_NAME /etc/os-release
Linux 6.18.44-fc-v236
PRETTY_NAME="Ubuntu 24.04.5 LTS"
$ node -v && npm -v
v22.23.4
10.9.9
$ git clone https://github.com/MarkAngelGuevarra/gigpay.git
HEAD 676ea3c 2026-11-05 06:51:20 +0800
$ npm ci

added 125 packages in 6s
$ npm test
   REGRESSION SUITE RESULTS: 22/22 TESTS PASSED
  Escrow integrity: 10/10 passed
  Ledger integrity: 7/7 passed
$ npm run build

transforming...✓ 2431 modules transformed.
✓ built in 893ms
```

## How to add environment 3

Use a computer that is not one of the two above (a different physical machine is best). Node.js 20.19 or newer is required.

1. In an empty folder, run these and keep the terminal output:
   ```bash
   date -u                     # Windows PowerShell: Get-Date -AsUTC
   # OS version: macOS `sw_vers`; Linux `grep PRETTY_NAME /etc/os-release`; Windows `cmd /c ver`
   node -v; npm -v; git --version
   git clone https://github.com/MarkAngelGuevarra/gigpay.git
   cd gigpay
   git rev-parse --short HEAD
   npm ci
   npm test
   npm run build
   ```
2. Add a section "Environment 3: <OS>, <date> (real output)" below, and paste **unedited**: the date, the OS version line, the Node/npm/git versions, the commit hash, the `added N packages` line from `npm ci`, every suite summary line from `npm test` (for example `Escrow integrity: 10/10 passed`) and its exit code, and the `✓ built in` line. You may trim other lines, but say that you trimmed.
3. If any step fails, paste the failure and mark the row "Failed". If you then fix something and run again, keep both runs in the log.
4. Update the status table above and the Results table in [SETUP_VERIFICATION.md](SETUP_VERIFICATION.md), and the clean-install line in [README.md](README.md). A screenshot or short screen recording of the run is good supporting evidence.
