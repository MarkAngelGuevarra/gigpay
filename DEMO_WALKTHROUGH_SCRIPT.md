# GigPay Walkthrough Video Script (3 to 5 minutes)
**Stellar Philippines Instawards Sprint 2 &bull; SOW Deliverable 4 (c)**

Script for recording the walkthrough on today's app at https://gigpay.tech (Stellar Testnet). Button names below are copied from the app; if the app changes, update this file before recording. Status: **video not yet recorded or published.**

---

### Before you record
- **Two practice wallets, two devices.** Each browser holds one practice wallet, so the client and the freelancer need two devices, or two different browsers on one computer (for example Chrome and Edge) so both fit in one screen recording. Two windows of the same browser share one wallet, and the app refuses a task where client and freelancer are the same wallet.
- Sign up a separate account on each: one with **Client (Hiring)**, one with **Freelancer (Working)**. Don't use private/incognito mode; the practice wallet would be lost.
- **Keep the evidence honest.** These are team wallets. Before the next `node scripts/index_escrows.mjs --write`, add both practice-wallet addresses to `TEAM` in `scripts/index_escrows.mjs` and `TEAM_WALLETS` in `src/lib/ledgerIntegrity.js`, so the demo escrow is not counted as outside use.
- Have a terminal open in a clone of the repo for the last scene.

### Checklist (SOW Deliverable 4 video)
- [ ] Task creation and escrow funding
- [ ] Client and freelancer on separate practice wallets
- [ ] Task change appearing on the other screen without a manual reload
- [ ] Freelancer proof-of-work links
- [ ] Client dispute freeze (app-level) and resolve
- [ ] Release confirmation modal (typing `CONFIRM`)
- [ ] Public Ledger, with dispute column and CSV export
- [ ] Transaction on Stellar Expert (contract `CAUU2O…7RD3`)
- [ ] `npm test` in the terminal

---

### Script

#### 0:00 – 0:30 | Introduction
- *"Hi, I'm Mark Angel Guevarra, builder of GigPay for the Stellar Philippines Instawards Sprint 2. GigPay is a milestone escrow on Stellar Soroban: the client locks payment in a smart contract before work starts, and GigPay takes no platform commission; only the Stellar network fee applies."*
- *"Everything here is Stellar Testnet with practice money. It is not on mainnet."*

#### 0:30 – 1:15 | Practice wallets and funding
- *"Freelancer on the right, client on the left, each with its own practice wallet."* Point at **Practice wallet · Testnet only** in the Freelancer Portal.
- Freelancer: on **Your payout address**, tap **Share invite link** and send it to the client. *"The link fills the freelancer's address in for the client, so nobody retypes 56 characters."*
- Client: open the link, then in **Create Task Escrow** enter a **Task Title** and **Milestone Amount (XLM)**, e.g. 2. Show that **Freelancer's Payout Address** is already filled in. (On an empty dashboard, **⚡ Fill Sample Task (2 XLM)** fills in a sample title and amount.)
- Click **Lock Funds in Escrow**. *"Stellar closes a ledger about every 5 seconds; the app waits for confirmation, so the button says about 10 seconds."*

#### 1:15 – 2:00 | Accept and proof of work
- Freelancer: *"The new task appears here without a manual reload."* (If it hasn't arrived after a few seconds, say so and refresh; don't cut around it.) The task shows **Pays your payout address.** Tap **Accept Work**; it moves to **In Progress**.
- Tap **Attach Proof of Work Deliverables**, paste a Google Doc, GitHub PR and/or Loom link plus a short note, and tap **Submit Deliverables**.
- Client: *"The proof links now show on the client's task card under Freelancer Proof of Work Attached."*

#### 2:00 – 3:00 | Dispute freeze and release
- Client: click **Freeze & Dispute**, edit the reason, click **Confirm Dispute Freeze**. *"The task is now Disputed and the release button is gone. This freeze is enforced by the GigPay app; the escrow contract itself has no dispute or refund state."* Show **Release Action Frozen (Disputed State)** with the reason, and **Dispute Frozen** on the freelancer side.
- Click **Resolve Dispute**. Because proof was already submitted, the task returns to **Under Review** (without proof it would return to **In Progress**).
- Click **Approve & Release**. *"To avoid accidental payouts, the client must type CONFIRM."* Type `CONFIRM` and click **Release Escrow Payout**. This sends the contract's `approve_task` transaction on Testnet.
- Freelancer: tap **Check my balance on Stellar Expert** to show the payment on-chain.

#### 3:00 – 4:00 | Public Ledger and tests
- Click **📜 Public Ledger** in the top bar. *"This lists every escrow on contract CAUU2O…7RD3, generated from Stellar Testnet, with transaction links to Stellar Expert. Each wallet is labeled outside user or team/test, and the counts are wallets, not verified people. Disputes show in the Dispute column."*
- Click **Export CSV** to download the same data.
- Open one transaction link on Stellar Expert.
- Terminal: run `npm test` and read the totals from the screen (on Nov 6, 2026: 70 tests in 6 suites, all offline). Optionally run `cargo test` in `contracts/gigpay_escrow` (4 contract tests).
- *"Thanks to the Stellar Development Foundation, Stellar Philippines and Rise In."*

### After recording
- Publish the video, then add its link to the README "Walkthrough video" lines in the same commit that removes "pending".
