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
export const STATUS_RANK = { Completed: 3, Paid: 3, 'In Progress': 2, 'Under Review': 2, Disputed: 2, Available: 1 };

const time = (v) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const latest = (a, b) => (time(a) >= time(b) ? a ?? b ?? null : b ?? a ?? null);

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
  const winner = currentRank >= incomingRank ? { ...incoming, ...current } : { ...current, ...incoming };

  // Keep the most recent dispute and resolution from either copy, then derive the status from them.
  winner.disputed_at = latest(current?.disputed_at, incoming?.disputed_at);
  winner.dispute_resolved_at = latest(current?.dispute_resolved_at, incoming?.dispute_resolved_at);
  if (winner.disputed_at && time(winner.disputed_at) === time(incoming?.disputed_at) && incoming?.dispute_reason) {
    winner.dispute_reason = incoming.dispute_reason;
  }

  if ((STATUS_RANK[winner.status] || 0) < 3) {
    if (isDisputeActive(winner)) winner.status = 'Disputed';
    else if (winner.status === 'Disputed') winner.status = 'In Progress';
  }
  return winner;
};
