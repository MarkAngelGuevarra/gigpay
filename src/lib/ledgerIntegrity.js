// Ledger evidence rules for the public verification ledger and its CSV export (SOW Deliverable 2b/2c).
//
// Instawards reviewers only count real users with verifiable on-chain activity, and the GigPay
// Customer Development Plan excludes the team's own wallets from every count. These helpers keep the
// ledger to rows a reviewer can open on Stellar Expert and confirm, and label rows that involve team
// or demo wallets so they are never mistaken for outside-user activity.

import {
  isSimulatedTxHash,
  isDemoWallet,
  DEFAULT_FREELANCER_TESTNET_ADDRESS,
  DEMO_FREELANCER_KEY,
  DEMO_PUBLIC_KEY,
  GIGPAY_ESCROW_CONTRACT_ID
} from './stellar.js';
import { isDisputeActive } from './taskLifecycle.js';

const LEGACY_SYNTHETIC_PREFIXES = ['demo_', 'resilient_', 'sim-tx-', 'rel-', '5f8c1e7a', '8b1c3e5a'];

/** True when a hash is not proof of a confirmed transaction (placeholder, fallback or synthetic). */
export const isNonEvidenceHash = (h) => {
  if (!h || typeof h !== 'string') return true;
  return isSimulatedTxHash(h) || LEGACY_SYNTHETIC_PREFIXES.some((p) => h.startsWith(p));
};

// Founder's own wallet (the payout address on the Instawards Sprint 2 form). It funded on-chain
// tasks #13 and #14 during internal testing, so it must be excluded from user counts like the others.
export const FOUNDER_WALLET = 'GCBXZSKNCLTKTVRHBRZ2XCTFDVNHSBF3G6CIPLBRCK2XBXIGPQY5RBRN';

// QA client used by src/test/soroban_sim.test.js; funded escrows #1–#11.
export const QA_TEST_CLIENT_WALLET = 'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E';

// Practice wallets created on a team device and used for team testing (escrows #41-#46, Nov 5, 2026).
export const TEAM_DEVICE_PRACTICE_WALLETS = [
  'GDC2RIYOYD6A45E27FG5CAVHVPUN6URQDJLYBSBZDK7HMVG3JZSDOPAE',
  'GBX7C2H7IN3SRUQ5BWEC4IDXWNARPKVQVY5UTGURKPTZRF2N3P4YT6RI',
  // Testnet funding pool used when Friendbot rate-limits (supabase/functions/fund-practice-wallet).
  'GAG74N2WUFBRSUP5JXQGGNZYO7VH73C72CZ3JTNEJDPICLWM7MNODYPZ'
];
export const TEAM_WALLETS = new Set([DEFAULT_FREELANCER_TESTNET_ADDRESS, DEMO_FREELANCER_KEY, DEMO_PUBLIC_KEY, FOUNDER_WALLET, QA_TEST_CLIENT_WALLET, ...TEAM_DEVICE_PRACTICE_WALLETS]);

// Eight wallets created by Friendbot within 25 seconds on 2026-11-03 23:45 UTC, then used by a script
// to fund and release escrows #16–#35 at 5–10s intervals in strict round-robin. Not user activity.
export const SCRIPTED_TEST_WALLETS = new Set([
  'GCACSSN7J2Q2ZKHHLQ2H33T6KDFNJAWTPOBWXH6PI4KDQ3ZAA77XV5VF',
  'GBU2Y6WMLM37IPDJND7LBRZC4LAQYM6HS5LL5RSYCBM4OBUVQUSDMK3Q',
  'GCXDBNYDOJXS2IMQXEWHHFGIQCIMJWJEAD425K5EGLWQDP5KPP6AK3CU',
  'GBI3QOLKJIHWCV5TDNHKKRR3JBN3OSRAAGEEDBMLYKWWVUEEVVL764S6',
  'GA3LTMJQEJYWEFPGVFRQBTG4ELFXYD2ATQAD2YB5FEECTBG7TCQQQRLJ',
  'GA4L5IVCI3GQKQ3WKYUTAWYJPXLHR5E2BWJKD7SY2UO3B5XTPK5I2DKK',
  'GBCRI6UZHCPBA5HDIYQGHJNQH5APJP2R2JDK6DS75JJFKQCWH2CSUDXI',
  'GDPGW5LDS2JBFWMLZUQBJUBIYAGAXBQXQPJBMDL2NYDPVMZ7CI3ZRHHK'
]);

/** True for team-controlled or demo-persona wallets, and for an unknown (missing) wallet. */
export const isTeamWallet = (w) => !w || TEAM_WALLETS.has(w) || isDemoWallet(w);
export const isScriptedTestWallet = (w) => SCRIPTED_TEST_WALLETS.has(w);

/** Adds the outside-user label used by the ledger UI and CSV. */
export const labelLedgerRecord = (r) => {
  const scripted = isScriptedTestWallet(r.clientWallet) || isScriptedTestWallet(r.freelancerWallet);
  const team = isTeamWallet(r.clientWallet) || isTeamWallet(r.freelancerWallet);
  return {
    ...r,
    countsAsOutsideUser: !scripted && !team,
    walletNote: scripted
      ? 'Scripted test wallet (created Nov 3, 2026): excluded from user counts'
      : team
        ? 'Team/test wallet: excluded from user counts'
        : 'Outside user'
  };
};

const formatUtc = (iso) => (iso ? String(iso).replace('T', ' ').substring(0, 19) + ' UTC' : '');

/**
 * Ledger row for a Completed/Paid task, or null when the task has no confirmed release hash.
 * Never substitutes a placeholder hash or another user's wallet for missing data.
 */
export const buildCompletedTaskLedgerRow = (t, mapped = null) => {
  if (!t) return null;
  const hash = mapped?.releaseHash || t.release_tx_hash;
  if (isNonEvidenceHash(hash)) return null;
  return labelLedgerRecord({
    id: 'completed-task-' + (t.id || t.title),
    taskId: mapped ? `Task #${mapped.onChainTaskId} — ${t.title}` : (t.title || 'Completed Task'),
    method: 'approve_task',
    amount: `${t.amount || 0} XLM`,
    contractId: GIGPAY_ESCROW_CONTRACT_ID,
    clientWallet: mapped?.clientWallet || t.client_wallet || null,
    freelancerWallet: mapped?.freelancerWallet || t.freelancer_wallet || null,
    txHash: hash,
    status: 'Completed & Released',
    timestamp: formatUtc(t.completed_at || t.created_at),
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${hash}`
  });
};

/** One row per transaction hash: the same on-chain release must not be listed (or counted) twice. */
export const dedupeLedgerByTxHash = (records) => {
  const seen = new Set();
  return records.filter((r) => {
    if (!r || isNonEvidenceHash(r.txHash)) return false;
    if (seen.has(r.txHash)) return false;
    seen.add(r.txHash);
    return true;
  });
};

// Who an open task's escrow will pay, as seen by the current freelancer.
export const describePayout = (task, myAddress) => {
  const to = task?.freelancer_wallet;
  if (!to) return { canAccept: true, color: 'var(--text-muted)', text: 'Payout address not recorded for this task.' };
  if (myAddress && to === myAddress) return { canAccept: true, color: '#34d399', text: 'Pays your payout address.' };
  if (isTeamWallet(to)) return { canAccept: true, color: '#fbbf24', text: "Pays GigPay's test wallet (practice task, not paid to you)." };
  return { canAccept: false, color: '#f87171', text: `Reserved: pays another freelancer (${to.slice(0, 6)}…${to.slice(-4)}).` };
};

// What a freelancer has really been paid: escrows released on-chain (a real release transaction) to this
// payout address. Database rows alone are not enough: old demo tasks marked Completed were never paid, and
// counting them showed 464 XLM "earned" on an account the contract had paid nothing.
export const onChainEarnings = (tasks, payoutAddress) => {
  const paid = (tasks || []).filter((t) =>
    t && t.status === 'Completed' && !t.is_simulated &&
    payoutAddress && t.freelancer_wallet === payoutAddress &&
    /^[0-9a-f]{64}$/.test(t.release_tx_hash || '') && !isNonEvidenceHash(t.release_tx_hash)
  );
  return { total: paid.reduce((sum, t) => sum + (Number(t.amount) || 0), 0), count: paid.length };
};

// ---------------------------------------------------------------------------------------------
// Public ledger: one row per on-chain escrow (SOW D2b/c)
// ---------------------------------------------------------------------------------------------

const ON_CHAIN_SOURCE = 'On-chain index';

const minuteUtc = (iso) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
};

/**
 * Dispute metadata for the public verification view (SOW D3c): when, who (as a role, never a name or
 * account) and why, plus the resolution time. Address-like text in the reason is removed, and the
 * reason is shortened. Empty when the task was never disputed.
 */
export const describeDispute = (task) => {
  if (!task || (!task.disputed_at && task.status !== 'Disputed')) return '';
  const by = task.disputed_by && task.client_id && String(task.disputed_by) === String(task.client_id) ? ' by client' : '';
  let reason = String(task.dispute_reason || '').replace(/\s+/g, ' ').trim()
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[address removed]');
  if (reason.length > 160) reason = reason.slice(0, 157) + '...';
  const when = minuteUtc(task.disputed_at);
  let text = `Disputed${when ? ' ' + when : ''}${by}${reason ? ': ' + reason : ''}`;
  if (isDisputeActive(task)) text += ' (open: release frozen in GigPay)';
  else if (task.dispute_resolved_at) text += `. Resolved ${minuteUtc(task.dispute_resolved_at)}`;
  return text;
};
const DB_ONLY_SOURCE = 'Database only';

/** The Supabase task for an on-chain escrow: same escrow id, or the same fund or release hash. */
export const findTaskForEscrow = (e, tasks) => {
  const list = (tasks || []).filter(Boolean);
  return list.find((t) => t.on_chain_task_id != null && Number(t.on_chain_task_id) === Number(e.onChainTaskId))
    || list.find((t) => (e.fundTxHash && t.tx_hash === e.fundTxHash) || (e.releaseTxHash && t.release_tx_hash === e.releaseTxHash))
    || null;
};

const findTaskForHash = (hash, tasks) =>
  (tasks || []).find((t) => t && hash && (t.tx_hash === hash || t.release_tx_hash === hash)) || null;

/** Ledger row for one escrow from src/data/onchainEscrows.json, with the linked task's title if any. */
export const buildOnChainLedgerRow = (e, task = null) => {
  const hash = e.releaseTxHash || e.fundTxHash;
  return labelLedgerRecord({
    id: `onchain-${e.onChainTaskId}`,
    escrowId: e.onChainTaskId,
    taskId: `Escrow #${e.onChainTaskId}` + (task?.title ? ` — ${task.title}` : '') + ` (${e.walletKind})`,
    method: e.released ? 'fund_task & approve_task' : 'fund_task',
    amount: `${e.amount} XLM`,
    contractId: GIGPAY_ESCROW_CONTRACT_ID,
    clientWallet: e.clientWallet,
    freelancerWallet: e.freelancerWallet,
    txHash: hash,
    fundTxHash: e.fundTxHash,
    releaseHash: e.releaseTxHash,
    status: e.released ? 'Completed & Released' : 'Escrow Locked (not released)',
    timestamp: formatUtc(e.releasedAt || e.fundedAt),
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${hash}`,
    source: ON_CHAIN_SOURCE,
    dispute: describeDispute(task),
    task
  });
};

/**
 * Rows for the public ledger and its CSV: every escrow in the on-chain index exactly once, then any
 * database/browser rows whose hash is not in that index (for example an escrow funded after the index
 * was generated). Those are labeled "Database only" and never count as outside users until the index
 * is regenerated from the chain. Rows whose hash is already covered by an escrow (its fund or release
 * transaction) are dropped, so the same escrow is never listed twice.
 */
export const buildPublicLedger = ({ escrows = [], tasks = [], otherRecords = [], generatedAt = '' } = {}) => {
  const chainRows = escrows.map((e) => buildOnChainLedgerRow(e, findTaskForEscrow(e, tasks)));
  const chainHashes = new Set(escrows.flatMap((e) => [e.fundTxHash, e.releaseTxHash]).filter(Boolean));
  const covered = (r) => [r.txHash, r.fundTxHash, r.releaseHash].some((h) => h && chainHashes.has(h));
  const dbOnly = dedupeLedgerByTxHash(
    (otherRecords || []).filter((r) => r && !String(r.id || '').startsWith('onchain-') && !covered(r))
  ).map((r) => {
    const task = r.task || findTaskForHash(r.txHash, tasks);
    return {
      ...r,
      id: `db-only-${r.txHash}`,
      source: DB_ONLY_SOURCE,
      task,
      dispute: describeDispute(task),
      countsAsOutsideUser: false,
      walletNote: `Not in the on-chain index${generatedAt ? ` (generated ${generatedAt})` : ''}: not counted until it is regenerated. ${r.walletNote || ''}`.trim()
    };
  });
  return [...chainRows, ...dbOnly];
};

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keep spreadsheet apps from running cell text as a formula
  return `"${s.replace(/"/g, '""')}"`;
};

export const LEDGER_CSV_HEADERS = ['Row ID', 'Escrow #', 'Source', 'Task Title', 'Method', 'Amount', 'Contract ID', 'Client Wallet', 'Freelancer Wallet', 'Transaction Hash', 'Fund Tx Hash', 'Release Tx Hash', 'Status', 'Timestamp (UTC)', 'Stellar Expert URL', 'Counts As Outside User', 'Wallet Note', 'Dispute'];

/** CSV text for the public ledger rows (quoted cells, inner quotes doubled). */
export const ledgerToCsv = (records) => {
  const rows = (records || []).map((r) => [
    r.id, r.escrowId ?? '', r.source || '', r.taskId, r.method, r.amount, r.contractId, r.clientWallet, r.freelancerWallet,
    r.txHash, r.fundTxHash, r.releaseHash, r.status, r.timestamp, r.explorerUrl, r.countsAsOutsideUser ? 'Yes' : 'No', r.walletNote, r.dispute || ''
  ].map(csvCell).join(','));
  return [LEDGER_CSV_HEADERS.map(csvCell).join(','), ...rows].join('\n');
};
