import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, ExternalLink, Download, X, Clock } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import onchainData from '../data/onchainEscrows.json';
import { isTeamWallet, isScriptedTestWallet, buildPublicLedger, ledgerToCsv } from '../lib/ledgerIntegrity';
import {
  GIGPAY_ESCROW_CONTRACT_ID,
  SOROBAN_RPC_URL,
  STELLAR_NETWORK_NAME,
  buildExplorerAccountUrl,
  buildExplorerTxUrl,
  isStaticTestnetSnapshotEnabled,
} from '../lib/stellar';

const isOutside = (w) => !!w && !isTeamWallet(w) && !isScriptedTestWallet(w);
const computeChainStats = (rows) => {
  const outside = new Set();
  let outsideFunded = 0;
  let outsideReleased = 0;
  for (const r of rows) {
    if (isOutside(r.clientWallet) && isOutside(r.freelancerWallet)) {
      outside.add(r.clientWallet);
      outside.add(r.freelancerWallet);
      outsideFunded += 1;
      if (r.released) outsideReleased += 1;
    }
  }
  return { total: rows.length, outsideWallets: outside.size, outsideFunded, outsideReleased };
};

const shortKey = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}` : 'not recorded');

const WalletLink = ({ address }) => {
  if (!address) return <span className="text-[var(--text-muted)]">not recorded</span>;
  const accountUrl = buildExplorerAccountUrl(address);
  return accountUrl ? (
    <a
      href={accountUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className="gp-mono text-[var(--text-primary)] no-underline hover:underline"
    >
      {shortKey(address)}
    </a>
  ) : (
    <code title={address} className="gp-mono text-[var(--text-primary)]">
      {shortKey(address)}
    </code>
  );
};

const VerificationLedgerModal = ({ isOpen, onClose }) => {
  const { tasks, ledgerRecords } = useTasks();
  const { addToast } = useToast() || {};
  const snapshotActive = isStaticTestnetSnapshotEnabled();

  const staticEscrows = useMemo(
    () => (snapshotActive ? (onchainData.escrows || []) : []),
    [snapshotActive]
  );
  const chainStats = useMemo(() => computeChainStats(staticEscrows), [staticEscrows]);

  const records = useMemo(
    () =>
      buildPublicLedger({
        escrows: staticEscrows,
        tasks,
        otherRecords: ledgerRecords,
        generatedAt: snapshotActive ? onchainData.generatedAt : '',
      }),
    [staticEscrows, tasks, ledgerRecords, snapshotActive]
  );

  const exportVerificationCsv = () => {
    try {
      const blob = new Blob([ledgerToCsv(records)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `gigpay_onchain_verification_ledger_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast?.(`Exported ${records.length} ledger rows to CSV.`, 'success');
    } catch (err) {
      console.error('CSV export failed:', err);
      addToast?.('Failed to export the verification ledger.', 'error');
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const networkLabel = STELLAR_NETWORK_NAME === 'TESTNET' ? 'Stellar Testnet' : 'Stellar Local';
  const hasAnyDispute = records.some((r) => Boolean(r.dispute));

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Public On-Chain Verification Ledger"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-[var(--bg-scrim)] px-4 py-8 backdrop-blur-md sm:py-12"
      style={{ zIndex: 100000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mx-auto w-full max-w-[1100px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-lg)] sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Verification Ledger"
          title="Close (Esc)"
          className="gp-modal-close"
        >
          <X size={19} />
        </button>

        {/* Header with reserved right clearance for floating close button */}
        <div
          className="mb-5 flex items-start justify-between gap-4"
          style={{ paddingRight: '3.5rem', flexWrap: 'wrap' }}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <ShieldCheck size={22} className="shrink-0 text-[var(--signal-money)]" />
              <h2 className="m-0 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                Public On-Chain Verification Ledger
              </h2>
              <span className="gp-status gp-status--money whitespace-nowrap">{networkLabel}</span>
            </div>
            <p className="mt-1.5 mb-0 text-[13.5px] text-[var(--text-muted)]">
              Every escrow on the GigPay Soroban contract ({networkLabel}), with each wallet labeled as outside user or team/test.
            </p>
          </div>

          <button type="button" onClick={exportVerificationCsv} className="gp-btn gp-btn-secondary shrink-0">
            <Download size={15} />
            Export CSV
          </button>
        </div>

        {/* On-chain summary metrics */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] lg:grid-cols-4">
          {[
            { label: 'Escrows on contract', val: chainStats.total, hint: 'All wallets including team tests' },
            { label: 'Outside wallets', val: chainStats.outsideWallets, hint: 'Both sides are outside wallets' },
            {
              label: 'Funded outside',
              val: chainStats.outsideFunded,
              hint: snapshotActive ? 'Includes 3 duplicate locks (#52, #53, #66)' : 'Client and freelancer outside',
            },
            { label: 'Released outside', val: chainStats.outsideReleased, hint: 'Completed fund to release flows' },
          ].map((stat) => (
            <div key={stat.label} className="bg-[var(--bg-surface)] p-4">
              <div className="text-[12px] font-medium text-[var(--text-muted)]">{stat.label}</div>
              <div className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
                {stat.val}
              </div>
              <div className="mt-1 text-[12px] text-[var(--text-muted)]">{stat.hint}</div>
            </div>
          ))}
        </div>

        <p className="mt-2.5 mb-5 text-[12.5px] text-[var(--text-muted)]">
          {snapshotActive
            ? `Counted from Stellar Testnet on ${onchainData.generatedAt} by scripts/index_escrows.mjs. Wallets are counted, not verified people. Team and scripted test wallets are labeled below.`
            : 'Static Testnet snapshot disabled in offline, local, or custom-contract mode; displaying locally recorded verification rows only.'}
        </p>

        {/* Contract metadata strip */}
        <div className="mb-5 grid grid-cols-1 gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4 text-[13px] md:grid-cols-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-[var(--text-muted)]">Contract ID</div>
            <code className="gp-mono mt-0.5 block break-all text-[12.5px] text-[var(--text-primary)]">
              {GIGPAY_ESCROW_CONTRACT_ID}
            </code>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-[var(--text-muted)]">Network RPC</div>
            <div className="mt-0.5 break-all text-[12.5px] text-[var(--text-primary)]">{SOROBAN_RPC_URL}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-[var(--text-muted)]">Data source</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-[var(--signal-money-fg)]">
              scripts/index_escrows.mjs (read-only, chain + Horizon)
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[11.5px] font-semibold text-[var(--text-muted)]">
                <th className="px-3 py-2.5">Timestamp</th>
                <th className="px-3 py-2.5">Task / Method</th>
                <th className="px-3 py-2.5">Amount</th>
                <th className="px-3 py-2.5">Client → Freelancer</th>
                <th className="px-3 py-2.5">Status</th>
                {hasAnyDispute && <th className="px-3 py-2.5">Dispute</th>}
                <th className="px-3 py-2.5 text-right">Tx / Verify</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {records.map((record) => {
                const isCompleted = record.status.includes('Completed');
                const txExplorerUrl = buildExplorerTxUrl(record.txHash);
                return (
                  <tr key={record.id}>
                    <td className="max-w-[116px] px-2.5 py-2.5 text-[11.5px] leading-snug text-[var(--text-muted)]">
                      <span className="inline-flex items-start gap-1 tabular-nums">
                        <Clock size={12} className="mt-0.5 shrink-0" />
                        <span>{record.timestamp}</span>
                      </span>
                    </td>
                    <td className="max-w-[205px] px-2.5 py-2.5">
                      <div className="font-semibold leading-snug text-[var(--text-primary)]">{record.taskId}</div>
                      {record.source === 'Database only' && (
                        <div className="mt-0.5 text-[11.5px] text-[var(--signal-warn)]">
                          Database only: not in the on-chain index yet, not counted
                        </div>
                      )}
                      <code className="gp-mono text-[11px] text-[var(--text-muted)]">{record.method}</code>
                    </td>
                    <td className="px-2.5 py-2.5 font-semibold whitespace-nowrap text-[var(--text-primary)] tabular-nums">
                      {record.amount}
                    </td>
                    <td className="px-2.5 py-2.5 text-[11.5px]">
                      <div className="whitespace-nowrap">
                        <WalletLink address={record.clientWallet} /> → <WalletLink address={record.freelancerWallet} />
                      </div>
                      <div
                        className={`mt-0.5 text-[11px] ${
                          record.countsAsOutsideUser ? 'text-[var(--signal-money-fg)]' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {record.walletNote}
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`gp-status whitespace-nowrap !px-2 !py-0.5 !text-[11px] ${
                          isCompleted ? 'gp-status--money' : ''
                        }`}
                      >
                        <span className="gp-status-dot" />
                        {record.status}
                      </span>
                    </td>
                    {hasAnyDispute && (
                      <td
                        className={`max-w-[160px] px-2.5 py-2.5 text-[11px] ${
                          record.dispute?.includes('(open') ? 'text-[var(--signal-danger)]' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {record.dispute || '—'}
                      </td>
                    )}
                    <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                      {txExplorerUrl ? (
                        <a
                          href={txExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gp-mono inline-flex items-center justify-end gap-1 text-[12px] font-medium text-[var(--signal-money-fg)] no-underline hover:underline"
                          title={record.txHash}
                        >
                          {record.txHash ? `${record.txHash.substring(0, 8)}…` : 'Verify'}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <code className="gp-mono text-[11.5px] text-[var(--text-muted)]">
                          {record.txHash ? `${record.txHash.substring(0, 8)}…` : 'Pending'}
                        </code>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <span className="text-[13px] text-[var(--text-muted)]">
            Every escrow on the contract, from {networkLabel}
          </span>
          <button type="button" onClick={onClose} className="gp-btn gp-btn-primary">
            Close ledger
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};

export default VerificationLedgerModal;
