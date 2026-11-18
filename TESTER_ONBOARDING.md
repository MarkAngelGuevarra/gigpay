# How to try GigPay on Testnet

GigPay runs on **Stellar Testnet**. Testnet XLM is practice money with no cash value: testers never need real money, a bank account, or a crypto wallet.

---

## Part 1 — For testers (share this section)

You need **two people on two different phones or computers**: one acts as the **client**, the other as the **freelancer**. One person, one device, one account, one role. Use your phone's normal browser (Chrome or Safari), not incognito/private mode, and don't use the "Grant reviewer" demo accounts.

### Freelancer (do this first)
1. Open **https://www.gigpay.tech** in Chrome or Safari, tap **🚀 Sign Up (New Tester)**, register with your own email, and under **I am a…** tap **Freelancer (Working)**. (No confirmation email is needed.)
2. Open the **Freelancer Portal**. A practice wallet is created for you automatically (yellow **Practice** badge). Wait until the balance at the top shows a number above 0 (up to 30 seconds; refresh once if needed).
3. On **Your payout address**, tap **Share invite link** and send it to your client partner (Messenger, Teams, anything). The link fills your address in for them, so nobody retypes 56 characters. (**Copy** still copies the bare address if you need it.)

### Client
1. If the invite link opened inside Messenger or Teams, tap **⋮ → Open in Chrome/Safari** first. Then sign up with **your own email**, keep **Client (Hiring)** selected, and open the **Client Portal**. Your practice wallet is created and topped up with Testnet XLM automatically (this can take up to 30 seconds).
2. Create a task: title and a small amount (e.g. 2 XLM). The **freelancer's payout address is already filled in** from the invite link; check it matches what they sent. (No link? Paste their address.)
   - The payout address is required: GigPay won't lock funds without it.
3. Tap **Lock Funds in Escrow** and wait about 10 seconds. If GigPay says the escrow is **Confirming**, don't lock funds again: it updates by itself.
   - One or two escrows per pair is plenty: the contract has room for a limited number of escrows in total.

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

## Part 2 — For the GigPay team (test hygiene)

On-chain counts follow [METRICS.md](METRICS.md): an escrow counts only when **both** client and freelancer are outside wallets. Team, QA, founder and scripted wallets never count, and neither does offline demo activity.

- **Add team wallets first.** Any wallet a team member uses must be added to `TEAM` in `scripts/index_escrows.mjs` and `TEAM_WALLETS` in `src/lib/ledgerIntegrity.js` before any test escrow. A practice wallet is a new random address, and the indexer would otherwise count it as an outside wallet.
- **Regenerate from the chain:** `node scripts/index_escrows.mjs --write` updates `EVIDENCE_TABLE.md` and `src/data/onchainEscrows.json`. Nothing is typed in by hand.
- **Contract lifetime:** `node scripts/extend_contract_ttl.mjs` shows how many days are left; Mark runs it with `--submit` when it is under 30. (If storage lapses, every fund and release fails until it is restored.)
- **Never create wallets or escrows by script** to raise a count, and never ask anyone to "just click through" without really testing.
- `npm test` runs offline. Tests write to the Testnet contract only with `GIGPAY_TESTNET_WRITES=1`, and those escrows pay the team wallet.
- **Practice-wallet funding.** Friendbot rate-limits by IP. When it refuses, the app asks the Supabase Edge Function `fund-practice-wallet`, which creates the practice wallet with 25 Testnet XLM from the team Testnet funding account `GAG74N2W…` (one top-up per signed-in account; its key is in Supabase Vault, never in this repo). Who funded a wallet does not affect counting. The funding account is on the team list and never takes part in escrows.
- **Privacy:** any record linking a wallet to a person (sign-up email, form response, wallet address) stays out of this public repo. See [PRIVACY.md](PRIVACY.md).
- Report wallets as wallets. One person can create several practice wallets.
