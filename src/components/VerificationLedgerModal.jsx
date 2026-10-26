import React from 'react';
import { ShieldCheck, ExternalLink, Download, X, Layers, Clock, CheckCircle2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';

const VerificationLedgerModal = ({ isOpen, onClose }) => {
  const { ledgerRecords, exportVerificationCsv } = useTasks();

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      backdropFilter: 'blur(8px)',
      padding: '1.5rem'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '1000px',
        maxHeight: '85vh',
        overflowY: 'auto',
        border: '1px solid rgba(0, 242, 254, 0.35)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
        padding: '2rem'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <ShieldCheck color="#00f2fe" size={24} />
              <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'white' }}>Public On-Chain Verification Ledger</h3>
              <span style={{ background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                Protocol 22 Testnet
              </span>
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Immutable record of Soroban contract calls, caller wallets, escrow locks, and release proofs.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={exportVerificationCsv}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', fontSize: '0.85rem', borderColor: '#00f2fe', color: '#00f2fe' }}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.4rem' }}
            >
              <X size={22} />
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
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <CheckCircle2 size={13} /> SOW Table 7 Milestone Invariant
            </span>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Task / Method</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Tx Hash</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Explorer Link</th>
              </tr>
            </thead>
            <tbody>
              {ledgerRecords.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={12} /> {record.timestamp}
                    </div>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <div style={{ fontWeight: 600, color: 'white' }}>{record.taskId}</div>
                    <code style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{record.method}</code>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#00f2fe' }}>
                    {record.amount}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: record.status.includes('Completed') ? 'rgba(16, 185, 129, 0.15)' : 'rgba(0, 242, 254, 0.15)',
                      color: record.status.includes('Completed') ? '#10b981' : '#00f2fe'
                    }}>
                      {record.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {record.txHash ? record.txHash.substring(0, 10) + '...' : 'Pending'}
                    </code>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {record.explorerUrl ? (
                      <a
                        href={record.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#00f2fe', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
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
      </div>
    </div>
  );
};

export default VerificationLedgerModal;
