import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, ExternalLink, Download, X, Clock, CheckCircle2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';

const VerificationLedgerModal = ({ isOpen, onClose }) => {
  const { ledgerRecords, exportVerificationCsv } = useTasks();

  // Escape key listener for keyboard dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(5, 10, 24, 0.94)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        zIndex: 99999,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '3rem 1rem 4rem 1rem',
        overflowY: 'auto'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1020px',
          backgroundColor: '#0d1527',
          border: '1px solid rgba(0, 242, 254, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(0, 242, 254, 0.12)',
          padding: '2rem',
          position: 'relative',
          margin: '0 auto',
          color: '#f8fafc'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prominent Floating Close Button */}
        <button
          onClick={onClose}
          aria-label="Close Verification Ledger"
          title="Exit Public Ledger (Esc)"
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f8fafc',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            zIndex: 20
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.borderColor = '#ef4444';
            e.currentTarget.style.color = '#ef4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)';
            e.currentTarget.style.color = '#f8fafc';
          }}
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', paddingRight: '3.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <ShieldCheck color="#00f2fe" size={26} />
              <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#ffffff', fontWeight: 700 }}>
                Public On-Chain Verification Ledger
              </h3>
              <span style={{ background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(0, 242, 254, 0.3)' }}>
                Protocol 22 Testnet
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              Immutable record of Soroban contract calls, caller wallets, escrow locks, and release proofs.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={exportVerificationCsv}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem', borderColor: '#00f2fe', color: '#00f2fe', background: 'rgba(0, 242, 254, 0.05)' }}
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        {/* Contract Metadata Banner */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          fontSize: '0.82rem'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Contract ID:</span><br />
            <code style={{ color: '#00f2fe', wordBreak: 'break-all' }}>CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3</code>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Network RPC:</span><br />
            <span style={{ color: 'white' }}>https://soroban-testnet.stellar.org</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Audit Standard:</span><br />
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> SOW Table 7 Milestone Invariant
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.85rem 0.75rem' }}>Timestamp</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Task / Method</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Amount</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Status</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Tx Hash</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Explorer Link</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={12} /> {record.timestamp}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: 'white' }}>{record.taskId}</div>
                    <code style={{ fontSize: '0.75rem', color: '#00f2fe' }}>{record.method}</code>
                  </td>
                  <td style={{ padding: '0.75rem', fontWeight: 600, color: '#00f2fe' }}>
                    {record.amount}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: record.status.includes('Completed') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0, 242, 254, 0.15)',
                      color: record.status.includes('Completed') ? '#10b981' : '#00f2fe',
                      border: record.status.includes('Completed') ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(0, 242, 254, 0.3)'
                    }}>
                      {record.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {record.txHash ? record.txHash.substring(0, 10) + '...' : 'Pending'}
                    </code>
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    {record.explorerUrl ? (
                      <a
                        href={record.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none', fontWeight: 600 }}
                      >
                        Verify <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Footer with Explicit Close Action */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', flexWrap: 'wrap', gap: '1rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Showing verified on-chain Soroban escrow events (SOW Table 7)
          </span>
          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem', borderRadius: '8px', cursor: 'pointer' }}
          >
            Exit Public Ledger ✕
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

export default VerificationLedgerModal;
