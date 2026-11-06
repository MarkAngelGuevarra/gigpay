# How GigPay counts traction

Every user number GigPay reports follows the rules on this page. On-chain numbers are generated from Stellar Testnet by a script anyone can run; nothing is typed in by hand.

## Reproduce the numbers

```
git clone https://github.com/MarkAngelGuevarra/gigpay.git
cd gigpay && npm ci
node scripts/index_escrows.mjs          # prints the counts
node scripts/index_escrows.mjs --write  # also regenerates EVIDENCE_TABLE.md and src/data/onchainEscrows.json
```

The script reads every escrow on contract `CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3` from Soroban RPC and Horizon, matches each funding transaction to its escrow, and labels every wallet. The current output is in [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md) and in the Public Ledger window on gigpay.tech.

## Definitions

| Metric | Counts when | Source |
| --- | --- | --- |
| Sign-up | An account exists in Supabase Auth and does not belong to the team | Supabase (team records; not public) |
| Outside wallet | A Stellar address that is not on the team list or the scripted-test list below | `scripts/index_escrows.mjs` |
| Onboarded | An outside wallet appears in an escrow where **both** client and freelancer are outside wallets | On-chain |
| Funded | `fund_task` succeeded between two outside wallets | On-chain |
| Activated | That escrow was also released with `approve_task` | On-chain |
| Repeat wallet | An outside wallet in two or more counted escrows | On-chain |
| Feedback response | A submitted tester feedback form | Google Form (team records; not public) |

Counts are wallets, not verified people. One person with two browsers can hold two practice wallets, so wallet counts are an upper bound on people.

## What is excluded

- **Team wallets:** the founder's wallet, the QA and demo wallets, the default freelancer wallet, and every practice wallet created on a team member's device. They are listed in `TEAM` in `scripts/index_escrows.mjs` and `TEAM_WALLETS` in `src/lib/ledgerIntegrity.js`.
- **Scripted test wallets:** wallets created by a test script on Nov 3, 2026 (escrows #16–#35). Listed in `SCRIPTED` in the same files.
- **Any escrow where one side is a team or scripted wallet**, even if the other side is an outside user.
- **Unconfirmed wallets:** when it is unclear whether a wallet belonged to a team member or a tester, it is counted as team until the tester confirms. When unsure, we exclude.

## How a tester's wallet gets confirmed

1. The tester uses their own phone or computer. A team member may explain the steps but never operates the tester's device.
2. Before a session, every team device's practice wallet is added to the team list.
3. In the feedback form, the tester can paste their GigPay wallet address (it starts with G) and confirm they used their own device. The form is private; only the wallet address, not the person's name or email, is ever published.
4. Wallets from peer testers in the Instawards cohort are counted as outside wallets and noted as "cohort peer" in the team's records.

## What we never do

- Count team, demo or script wallets as users.
- Round up, estimate, or backfill a number.
- Report a number that the script or a dated record cannot reproduce.
- Offer rewards for testing unless the Instawards team has confirmed one.

Corrections to earlier reports are listed in the correction notice at the top of [EVIDENCE_TABLE.md](EVIDENCE_TABLE.md).
