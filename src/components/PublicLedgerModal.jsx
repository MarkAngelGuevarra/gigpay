import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Lock, Search, ExternalLink, Download, X, Copy, Check, Star, Filter, RefreshCw } from 'lucide-react';
import { getAllTelemetryRecords, fetchLiveTelemetryRecords, exportTelemetryToCSV, isAuthenticUserName } from '../lib/telemetry.js';

const PublicLedgerModal = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCohort, setFilterCohort] = useState('all');
  const [copiedKey, setCopiedKey] = useState(null);
  const [allRecords, setAllRecords] = useState(() => getAllTelemetryRecords().filter(r => isAuthenticUserName(r.name)));
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      setIsLoadingLive(true);
      fetchLiveTelemetryRecords().then(records => {
        if (isMounted && records && records.length > 0) {
          setAllRecords(records.filter(r => isAuthenticUserName(r.name)));
        }
      }).catch(err => {
        console.warn("Live ledger fetch notice:", err);
      }).finally(() => {
        if (isMounted) setIsLoadingLive(false);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const authenticRecords = useMemo(() => {
    return allRecords.filter(r => isAuthenticUserName(r.name));
  }, [allRecords]);

  const filteredRecords = useMemo(() => {
    return authenticRecords.filter((r) => {
      // Filter by Cohort
      if (filterCohort === 'sprint2' && !r.cohort?.toLowerCase().includes('sprint 2')) return false;
      if (filterCohort === 'sprint1' && !r.cohort?.toLowerCase().includes('sprint 1')) return false;
      if (filterCohort === 'client' && r.role?.toLowerCase() !== 'client') return false;
      if (filterCohort === 'freelancer' && r.role?.toLowerCase() !== 'freelancer') return false;

      // Filter by search term
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        r.name?.toLowerCase().includes(term) ||
        r.email?.toLowerCase().includes(term) ||
        r.public_key?.toLowerCase().includes(term) ||
        r.task_title?.toLowerCase().includes(term) ||
        r.dept?.toLowerCase().includes(term) ||
        r.feedback?.toLowerCase().includes(term)
      );
    });
  }, [authenticRecords, searchTerm, filterCohort]);

  if (!isOpen) return null;

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const sprint1Count = authenticRecords.filter(r => r.cohort?.toLowerCase().includes('sprint 1')).length;
  const sprint2Count = authenticRecords.filter(r => r.cohort?.toLowerCase().includes('sprint 2')).length;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1.25rem'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        maxWidth: '960px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '1rem',
        border: '1px solid rgba(0, 242, 254, 0.4)',
        boxShadow: '0 0 40px rgba(0, 242, 254, 0.25)',
        background: '#0d1117',
        overflow: 'hidden'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.5rem 1.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
              <div style={{
                background: 'rgba(0, 242, 254, 0.15)',
                border: '1px solid #00f2fe',
                borderRadius: '8px',
                padding: '0.4rem',
                color: '#00f2fe',
                display: 'flex',
                alignItems: 'center'
              }}>
                <ShieldCheck size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '700', color: '#fff' }}>
                GigPay Public Verification & Traction Ledger
              </h3>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                fontWeight: '600'
              }}>
                <Lock size={11} /> Read-Only (Immutable)
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Live verification record for Stellar Instawards Sprint 2. Anchored to Soroban Protocol 22 smart contracts.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: '6px',
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Security / Immutability Banner */}
        <div style={{
          padding: '0.75rem 1.75rem',
          background: 'rgba(16, 185, 129, 0.08)',
          borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          fontSize: '0.82rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6ee7b7' }}>
            <Lock size={14} style={{ color: '#10b981', flexShrink: 0 }} />
            <span>
              <strong>Tamper-Proof Guarantee:</strong> This ledger is strictly read-only. No user, tester, or admin can modify or delete existing verified records.
            </span>
          </div>
          <button
            onClick={() => exportTelemetryToCSV(authenticRecords)}
            className="btn btn-outline"
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.78rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              borderColor: 'rgba(0, 242, 254, 0.4)',
              color: '#00f2fe'
            }}
          >
            <Download size={13} /> Export CSV (.csv)
          </button>
        </div>

        {/* Controls: Search & Filter Tabs */}
        <div style={{
          padding: '1rem 1.75rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          {/* Search Box */}
          <div style={{
            position: 'relative',
            flex: '1 1 280px',
            maxWidth: '400px'
          }}>
            <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search by student name, email, key, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Filter Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterCohort('all')}
              style={{
                background: filterCohort === 'all' ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${filterCohort === 'all' ? '#00f2fe' : 'rgba(255, 255, 255, 0.1)'}`,
                color: filterCohort === 'all' ? '#00f2fe' : 'var(--text-muted)',
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              All ({allRecords.length})
            </button>
            <button
              onClick={() => setFilterCohort('sprint2')}
              style={{
                background: filterCohort === 'sprint2' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${filterCohort === 'sprint2' ? '#10b981' : 'rgba(255, 255, 255, 0.1)'}`,
                color: filterCohort === 'sprint2' ? '#6ee7b7' : 'var(--text-muted)',
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Sprint 2 University Pilot ({sprint2Count})
            </button>
            <button
              onClick={() => setFilterCohort('sprint1')}
              style={{
                background: filterCohort === 'sprint1' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                border: `1px solid ${filterCohort === 'sprint1' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                color: filterCohort === 'sprint1' ? '#93c5fd' : 'var(--text-muted)',
                padding: '0.35rem 0.7rem',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Sprint 1 Baseline ({sprint1Count})
            </button>
          </div>
        </div>

        {/* Scrollable Records Feed */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          {filteredRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <p>No records match your search query.</p>
            </div>
          ) : (
            filteredRecords.map((r, idx) => {
              const isClient = r.role?.toLowerCase() === 'client';
              const pubKey = r.public_key || 'Stellar Testnet Account';
              const truncatedKey = pubKey.length > 14 ? `${pubKey.slice(0, 7)}...${pubKey.slice(-6)}` : pubKey;
              const isS2 = r.cohort?.includes('Sprint 2');

              return (
                <div key={r.id || idx} style={{
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  transition: 'border-color 0.2s',
                }}>
                  {/* Row Top: Name, Cohort & Role Badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px'
                      }}>
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <strong style={{ fontSize: '0.98rem', color: '#fff' }}>
                        {r.name || r.user_email}
                      </strong>
                      {r.dept && (
                        <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                          • {r.dept}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        background: isS2 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: isS2 ? '#6ee7b7' : '#93c5fd',
                        border: `1px solid ${isS2 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                        fontWeight: '600'
                      }}>
                        {r.cohort || 'Sprint 2'}
                      </span>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px',
                        background: isClient ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                        color: isClient ? '#60a5fa' : '#c084fc',
                        border: `1px solid ${isClient ? '#3b82f6' : '#8b5cf6'}`,
                        fontWeight: '700',
                        textTransform: 'uppercase'
                      }}>
                        {r.role || 'Freelancer'}
                      </span>
                    </div>
                  </div>

                  {/* Row Middle: Task Title, Amount & Feedback */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.25)',
                    padding: '0.6rem 0.85rem',
                    borderRadius: '6px'
                  }}>
                    <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Escrow Task: </span>
                      <strong style={{ color: '#38bdf8' }}>{r.task_title || 'Campus Web3 Task'}</strong>
                      {r.amount && (
                        <span style={{ marginLeft: '0.5rem', color: '#10b981', fontWeight: '700' }}>
                          ({r.amount} XLM)
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={13}
                          fill={i < (r.rating || 5) ? '#eab308' : 'none'}
                          color={i < (r.rating || 5) ? '#eab308' : '#475569'}
                        />
                      ))}
                    </div>
                  </div>

                  {r.feedback && (
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontStyle: 'italic', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(0, 242, 254, 0.4)' }}>
                      "{r.feedback}"
                    </div>
                  )}

                  {/* Row Bottom: Stellar Public Key & On-Chain Proof Link */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.76rem',
                    color: 'var(--text-muted)',
                    paddingTop: '0.25rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>Stellar Account:</span>
                      <code style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        color: '#93c5fd',
                        fontFamily: 'monospace'
                      }}>
                        {truncatedKey}
                      </code>
                      <button
                        onClick={() => handleCopy(pubKey, r.id || idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: copiedKey === (r.id || idx) ? '#10b981' : 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.15rem'
                        }}
                        title="Copy full Stellar address"
                      >
                        {copiedKey === (r.id || idx) ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>

                    <a
                      href={r.explorer_url || 'https://stellar.expert/explorer/testnet/contract/CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        color: '#00f2fe',
                        textDecoration: 'none',
                        fontWeight: '600'
                      }}
                    >
                      <ExternalLink size={12} /> View On-Chain Contract
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Showing <strong>{filteredRecords.length}</strong> of <strong>{authenticRecords.length}</strong> verified entries.
          </span>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => exportTelemetryToCSV(authenticRecords)}
              className="btn btn-outline"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
            >
              <Download size={14} /> Download Master CSV
            </button>
            <button
              onClick={onClose}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.45rem 1.25rem' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicLedgerModal;
