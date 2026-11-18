/**
 * Task lifecycle merge rules shared by every sync path (local optimistic updates, Supabase fetch and
 * realtime, BroadcastChannel / storage events across tabs and devices).
 *
 * Rank decides between different stages: a stale copy can never demote a task (Completed > In Progress
 * > Available). "Disputed" and "In Progress" share a rank because a task moves both ways between them,
 * so rank alone let a stale copy win: a dispute raised on one device could be undone by another device
 * (and release went ahead), and a resolved dispute could stay frozen. The dispute timestamps are the
 * source of truth for that pair: a task is Disputed while its latest dispute is newer than its latest
 * resolution.
 */
// Under Review (proof submitted) ranks above In Progress: a task only moves In Progress -> Under Review,
// and with equal ranks a stale copy hid submitted proof from the client while Release stayed enabled.
// Confirming = funding sent but not yet confirmed on-chain; it resolves to Available (1) or Failed (0.7 > 0.5).
export const STATUS_RANK = { Completed: 3, Paid: 3, 'Under Review': 2.5, 'In Progress': 2, Disputed: 2, Available: 1, Failed: 0.7, Confirming: 0.5 };

const time = (v) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const latest = (a, b) => (time(a) >= time(b) ? a ?? b ?? null : b ?? a ?? null);

const latestRecordTime = (task) => {
  if (!task) return 0;
  return Math.max(
    time(task.completed_at),
    time(task.submitted_at),
    time(task.updated_at),
    time(task.dispute_resolved_at),
    time(task.disputed_at),
    time(task.created_at)
  );
};

/** Returns canonical https:// URL string when valid without embedded credentials, else null. */
export const safeHttpsUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

const WRITE_ONCE_FIELDS = [
  'on_chain_task_id',
  'contract_id',
  'client_wallet',
  'freelancer_wallet',
  'tx_hash',
  'release_tx_hash',
  'explorer_url',
  'freelancer_id',
  'completed_at',
];

const hasDeliverableProof = (task) => Boolean(
  task?.proof_attached ||
  task?.submitted_at ||
  task?.github_pr_url ||
  task?.doc_url ||
  task?.loom_url
);

/** True while the task has an open dispute: raised, and not resolved since. */
export const isDisputeActive = (task) => {
  if (!task) return false;
  const disputed = time(task.disputed_at);
  if (disputed) return disputed > time(task.dispute_resolved_at);
  return task.status === 'Disputed';
};

/** Merges two copies of the same task (current = what this device has, incoming = the update). */
export const mergeTaskRecords = (current, incoming) => {
  const currentRank = STATUS_RANK[current?.status] || 0;
  const incomingRank = STATUS_RANK[incoming?.status] || 0;

  let base;
  let fallback;
  if (currentRank > incomingRank) {
    base = current;
    fallback = incoming;
  } else if (incomingRank > currentRank) {
    base = incoming;
    fallback = current;
  } else if (latestRecordTime(incoming) < latestRecordTime(current)) {
    base = current;
    fallback = incoming;
  } else {
    base = incoming;
    fallback = current;
  }

  const winner = { ...fallback, ...base };
  for (const field of WRITE_ONCE_FIELDS) {
    const baseVal = winner[field];
    const fallbackVal = fallback?.[field];
    if ((baseVal === null || baseVal === undefined || baseVal === '') && fallbackVal !== null && fallbackVal !== undefined && fallbackVal !== '') {
      winner[field] = fallbackVal;
    }
  }

  // Keep the most recent dispute and resolution from either copy, then derive the status and reason from them.
  const currentDisputed = time(current?.disputed_at);
  const incomingDisputed = time(incoming?.disputed_at);
  winner.disputed_at = latest(current?.disputed_at, incoming?.disputed_at);
  winner.dispute_resolved_at = latest(current?.dispute_resolved_at, incoming?.dispute_resolved_at);
  if (winner.disputed_at) {
    if (incomingDisputed > currentDisputed && incoming?.dispute_reason) {
      winner.dispute_reason = incoming.dispute_reason;
    } else if (currentDisputed > incomingDisputed && current?.dispute_reason) {
      winner.dispute_reason = current.dispute_reason;
    } else if (incomingDisputed === currentDisputed && incoming?.dispute_reason) {
      winner.dispute_reason = incoming.dispute_reason;
    } else if (current?.dispute_reason) {
      winner.dispute_reason = current.dispute_reason;
    }
  }

  if ((STATUS_RANK[winner.status] || 0) < 3) {
    if (isDisputeActive(winner)) {
      winner.status = 'Disputed';
    } else if (winner.status === 'Disputed') {
      winner.status = hasDeliverableProof(winner) ? 'Under Review' : 'In Progress';
    }
  }
  return winner;
};
