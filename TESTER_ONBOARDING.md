# GigPay Tester Onboarding (Stellar Testnet)

GigPay runs on **Stellar Testnet**. Testnet XLM is practice money with no cash value: testers never need real money, a bank account, or a crypto wallet.

---

## Part 1 — For testers (share this section)

You need **two people on two different phones or computers**: one acts as the **client**, the other as the **freelancer**. One person cannot test both roles in the same browser.

### Freelancer (do this first)
1. Open **https://www.gigpay.tech**, tap **🚀 Sign Up (New Tester)**, and register with your own email. Confirm the email link, then sign in.
2. Open the **Freelancer Portal**. A practice wallet is created for you automatically (you'll see a yellow **Practice** badge).
3. On **Your payout address**, tap **Copy** and send the address (starts with `G…`) to your client partner.

### Client
1. Sign up with **your own email** the same way, then open the **Client Portal**. Your practice wallet is created and topped up with Testnet XLM automatically (this can take up to 30 seconds).
2. Create a task: title, a small amount (e.g. 2 XLM), and **paste your freelancer's payout address**.
   - Left blank, the payment goes to GigPay's test wallet and **does not count** as a real pilot job.
3. Tap **Lock Funds in Escrow** and wait about 10 seconds.

### Freelancer
4. Refresh the Freelancer Portal. The task shows **"Pays your payout address"**. Tap **Accept Work**.
5. Submit proof of work (a Google Doc, GitHub or Loom link).

### Client
6. Review the proof, tap **Release**, type **CONFIRM**, and wait about 10 seconds.

### Freelancer
7. Tap **Check my balance on Stellar Expert** to see the payment arrive on-chain.

Then fill in the 2-minute tester form: **https://forms.gle/oLGjJRcxg5LZ5bC96** — tell us honestly what was confusing.

### Avoid these mistakes
| Problem | Why it happens | Fix |
|:---|:---|:---|
| Client can't release later | The practice wallet lives in the browser that funded the task | Release from the **same phone and browser**. Don't use incognito/private mode and don't clear browser data mid-test. |
| "Reserved: pays another freelancer" | The task pays someone else's address | Ask your client to create a task with **your** payout address. |
| "You cannot pay your own address" | Both roles in one browser | Use two devices, one per person. |
| Balance shows 0 right after sign-up | Testnet top-up still settling | Wait 30 seconds and refresh. |
| Using the shared demo accounts | They are for grant reviewers | Activity on shared accounts is a demo and isn't counted. Sign up with your own email. |

---

## Part 2 — For the GigPay team (how traction is tracked)

**What counts** (Customer Development Plan + Instawards rules): real people, with on-chain activity, where **both** the client and the freelancer are outside wallets. Team, QA, founder and scripted wallets never count. Simulated or offline demo activity never counts.

### Weekly routine (every Friday)
1. Rebuild the evidence from the chain:
   ```bash
   node scripts/index_escrows.mjs --write
   ```
   This updates the **Sprint 2 on-chain traction** table and the full escrow table in `EVIDENCE_TABLE.md`, and the public ledger snapshot in `src/data/onchainEscrows.json`. Every number comes from Stellar Testnet; nothing is typed in by hand.
2. Commit and push the result, so the weekly commit history shows the evidence growing.
3. Match on-chain wallets to people privately: sign-up email + form response + wallet address. Keep that mapping **out of this public repo** (it contains personal data).
4. Post the weekly update (X post tagging @StellarOrg, @PHI_stellar, @riseinweb3) with Stellar Expert links to new released escrows.

### Rules that protect the evidence
- **Team members never test with practice wallets.** A practice wallet is a new random address, and the indexer would count it as an outside user. Test with the team QA client wallet, or add any address you used to `TEAM` in `scripts/index_escrows.mjs` and `TEAM_WALLETS` in `src/lib/ledgerIntegrity.js` before the next run.
- **Never create wallets or escrows by script** for traction, and never ask friends to "just click through" without really testing.
- `npm test` runs offline. Tests write to the Testnet contract only with `GIGPAY_TESTNET_WRITES=1`, and those escrows pay the team wallet.
- Report wallets as wallets. One person can create several practice wallets, so pair the on-chain count with sign-up and form records before calling it "users".
