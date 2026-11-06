# Dispute freeze and resolution (Stellar Testnet)

This is the documented Testnet workflow that SOW Deliverable 3 refers to: a disputed task stays frozen "until the dispute is manually resolved through an explicitly documented Testnet administrative or agreed workflow." It describes what the app does today (November 6, 2026). It is not arbitration, and GigPay does not decide who is right.

## Short version

1. The client who funded the task clicks **Freeze & Dispute** and gives a reason.
2. GigPay records the dispute and refuses to release the escrow while it is open.
3. Client and freelancer sort out the problem between themselves (outside GigPay).
4. The client clicks **Resolve Dispute**. The task returns to Under Review if proof of work was already submitted, otherwise to In Progress.
5. The client can then release the payment as usual (type `CONFIRM`), or raise a new dispute.

## Important: the contract has no dispute state

The deployed contract (`CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3`, `contracts/gigpay_escrow/src/lib.rs`) has only `fund_task`, `approve_task` and `get_task`. It stores no dispute, refund or cancel state. `approve_task` only checks that the client signed and that the escrow was not already released.

So the freeze is enforced by the GigPay app and its database, not on-chain. Someone holding the client's secret key could still call `approve_task` directly, for example from Stellar Lab or the CLI, and the contract would release the funds. This is a known limit of the prototype. The contract is not being redeployed in Sprint 2.

## Who can do what

| Action | Who | Where in the code |
|:---|:---|:---|
| Raise a dispute | The client who owns the task (`tasks.client_id` is the signed-in user), while the task is **In Progress** or **Under Review** | `ClientDashboard.jsx` (Freeze & Dispute button), `raiseDispute` in `TaskContext.jsx` |
| Resolve a dispute | The same client, while the task is **Disputed** | `ClientDashboard.jsx` (Resolve Dispute button), `resolveDispute` in `TaskContext.jsx` |
| Release the escrow | The same client, only when no dispute is open, after typing `CONFIRM` | `handleApprove` in `ClientDashboard.jsx`, `updateTaskStatus` in `TaskContext.jsx`, `submitApproveTask` in `src/lib/stellar.js` |
| Freelancer | Can see the dispute and its reason. Cannot raise, resolve or clear it, and cannot change the task (including proof of work) while it is Disputed | `FreelancerDashboard.jsx`, database trigger below |

The database trigger `enforce_task_update` (added Nov 5, 2026, commit `c1c6471`; `supabase/migrations/20261105023600_guard_task_updates_and_harden_auth_functions.sql`) enforces this for signed-in users: only the task's client may change `dispute_reason`, `disputed_at`, `disputed_by` or `dispute_resolved_at`, and the assigned freelancer cannot change a task whose status is Disputed.

## What is recorded

Raising a dispute writes these fields on the task row in Supabase:

- `status` = `Disputed`
- `dispute_reason`: the client's text (pre-filled with "Deliverables require revision or do not match agreed specification.", editable)
- `disputed_at`: time the dispute was raised
- `disputed_by`: the client's user id

Resolving writes `dispute_resolved_at` and sets `status` back to `Under Review` when proof of work was already submitted, otherwise `In Progress` (`statusAfterDisputeResolved`, since commit `6546ad8`). The reason and the original dispute time are kept, so the history stays on the row.

If the database write fails (for example, the signed-in user is not the task's client), the app undoes the change on screen and shows an error, so nothing is shown as frozen that is not saved.

Where the dispute is visible:

- Client and freelancer dashboard task cards: the freeze notice with the reason, the dispute time and who raised it (the client); after a resolution, a one-line dispute history with the resolution time (`src/lib/disputeMetadata.js`).
- Public verification ledger and its CSV: a Dispute column for escrows linked to a task, with the time, "by client" and the reason, and the resolution time once resolved. No names or emails are shown.

## What is frozen

While a dispute is open, the release is refused at three points:

1. The client dashboard hides the Approve & Release button for Disputed tasks.
2. `updateTaskStatus` refuses to mark a task Completed while a dispute is open.
3. `submitApproveTask` refuses to build or sign the `approve_task` transaction while a dispute is open.

"Open" is decided from the timestamps, not only the status: a dispute is open while `disputed_at` is newer than `dispute_resolved_at` (`isDisputeActive` in `src/lib/taskLifecycle.js`). So an old "In Progress" copy of the task from another tab or device cannot undo a dispute, and a resolution reaches every device. A second dispute after a resolution freezes the task again. These cases are covered by `test/dispute_sync.test.js` and `test/escrow_submission_integrity.test.js` (run by `npm test`).

The XLM stays locked in the contract during the dispute. Nothing is moved on-chain by raising or resolving a dispute.

## How a dispute is resolved (the agreed workflow)

1. **Talk.** Client and freelancer agree on the fix outside GigPay (chat, call, the BCC lab session). GigPay has no messaging or arbitration.
2. **Unfreeze.** The client clicks **Resolve Dispute**. The task goes back to Under Review (proof already submitted) or In Progress, and the freelancer can work on it and submit proof of work again.
3. **Finish.** When the client is satisfied, they release the payment by typing `CONFIRM`. If not, they can raise a new dispute.

There is no administrator screen. The database trigger does not restrict writes made without a signed-in user (the Supabase dashboard or service role), so a project administrator could set `dispute_resolved_at` by hand if a client cannot. This has not been needed so far. If it is ever used, it should be written down with the date and reason. Even then, only the client's wallet can release the escrow on-chain.

## Limits

- **No on-chain freeze.** See above. The freeze holds only for releases made through GigPay.
- **No refund or cancel.** The contract cannot return funds to the client. If the two sides never agree, the Testnet XLM stays locked in the contract.
- **No arbitration.** Decentralized arbitration and dispute resolution are out of scope for this Instaward.
- **Local-only tasks.** A task that has no database row (offline demo only) is frozen only in that browser.
- **Testnet only.** All amounts are Stellar Testnet practice money.
