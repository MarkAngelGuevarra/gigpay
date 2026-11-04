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

export const TEAM_WALLETS = new Set([DEFAULT_FREELANCER_TESTNET_ADDRESS, DEMO_FREELANCER_KEY, DEMO_PUBLIC_KEY, FOUNDER_WALLET, QA_TEST_CLIENT_WALLET]);

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
