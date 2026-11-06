/**
 * Dispute metadata shown in the task record (SOW D3(c)): reason, when it was raised, by whom, and when
 * it was resolved. Uses only the stored fields dispute_reason, disputed_at, disputed_by and
 * dispute_resolved_at; anything missing is shown as "not recorded", never guessed.
 */
export const formatDisputeTime = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

export const getDisputeMetadata = (task, viewerId) => {
  if (!task) return null;
  const raisedAt = formatDisputeTime(task.disputed_at);
  let raisedBy = 'not recorded';
  if (task.disputed_by && task.disputed_by === task.client_id) {
    raisedBy = viewerId && viewerId === task.disputed_by ? 'the client (you)' : 'the client';
  } else if (task.disputed_by) {
    raisedBy = `account …${String(task.disputed_by).slice(-6)}`;
  }
  const resolvedTime = task.dispute_resolved_at ? new Date(task.dispute_resolved_at).getTime() : NaN;
  const raisedTime = task.disputed_at ? new Date(task.disputed_at).getTime() : NaN;
  // A resolution older than the latest dispute belongs to an earlier dispute, so it is not shown as current.
  const resolvedAt = !Number.isNaN(resolvedTime) && (Number.isNaN(raisedTime) || resolvedTime >= raisedTime)
    ? formatDisputeTime(task.dispute_resolved_at)
    : null;
  return {
    reason: task.dispute_reason || null,
    raisedAt,
    raisedBy,
    resolvedAt,
    hasHistory: !!(task.disputed_at || task.dispute_reason)
  };
};
