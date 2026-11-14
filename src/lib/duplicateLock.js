// BCC 2026 showed clients locking a second escrow for the same freelancer and amount a minute or two after
// the first (#51/#52 and #53/#55 on Nov 12, #66/#67 on Nov 13), usually because the first still looked
// like it was confirming. Before a new lock, find a recent unreleased escrow with the same freelancer and
// amount so the client can be asked to tap again on purpose.
export const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

const OPEN = new Set(['Confirming', 'Available', 'In Progress', 'Under Review', 'Disputed']);

export function findRecentDuplicateLock(tasks, { freelancerWallet, amount, now = Date.now(), windowMs = DUPLICATE_WINDOW_MS } = {}) {
  const wallet = (freelancerWallet || '').trim();
  const value = Number(amount);
  if (!wallet || !Number.isFinite(value)) return null;
  return (tasks || []).find((t) => {
    if (!t || (t.freelancer_wallet || '').trim() !== wallet) return false;
    if (Number(t.amount) !== value || !OPEN.has(t.status)) return false;
    const created = Date.parse(t.created_at || '');
    return Number.isFinite(created) && now - created >= 0 && now - created <= windowMs;
  }) || null;
}

// The confirmation lasts one minute and only for the same freelancer and amount.
export function duplicateKey(freelancerWallet, amount) {
  return `${(freelancerWallet || '').trim()}|${Number(amount)}`;
}
