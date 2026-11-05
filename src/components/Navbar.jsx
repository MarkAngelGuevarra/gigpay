import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, ShieldAlert, LogOut, User, Download, Globe, Shield, ExternalLink, Wallet, FileSpreadsheet, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getAccountBalance, isSimulatorWallet, ensureEphemeralAccountFunded } from '../lib/stellar';
import VerificationLedgerModal from './VerificationLedgerModal';
import { usePilotFeedbackState, PILOT_FORM_URL } from '../hooks/usePilotFeedbackState';

const Navbar = () => {
  const { user, signOut, publicKey, connectWallet, connectTesterWallet, switchRole, activeRole } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [balance, setBalance] = useState(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const {
    isCompleted: isPilotCompleted,
    isSnoozed: isPilotSnoozed,
    isFormOpened: isPilotFormOpened,
    openFormLink,
    markCompleted: markPilotCompleted
  } = usePilotFeedbackState();

  useEffect(() => {
    let isMounted = true;
    if (publicKey) {
      setIsLoadingBalance(true);
      const showBalance = (res) => {
        if (!isMounted) return;
        // Horizon unreachable: say so instead of showing a placeholder number.
        if (res.isDemo && isSimulatorWallet(publicKey)) setBalance('unavailable');
        else setBalance(res.balance);
        setIsLoadingBalance(false);
      };
      getAccountBalance(publicKey)
        .then(async (res) => {
          // A new practice wallet is still waiting on Friendbot: show that, retry, then refresh.
          if (!res.active && isSimulatorWallet(publicKey)) {
            if (isMounted) setBalance('Funding… (up to 30s)');
            const funded = await ensureEphemeralAccountFunded(publicKey);
            const after = await getAccountBalance(publicKey);
            if (!funded && !after.active) {
              if (isMounted) { setBalance('Not funded yet, refresh in a minute'); setIsLoadingBalance(false); }
              return;
            }
            showBalance(after);
            return;
          }
          showBalance(res);
        })
        .catch(() => {
          if (isMounted) setIsLoadingBalance(false);
        });
    } else {
      setBalance(null);
    }
    return () => {
      isMounted = false;
    };
  // Re-run after sign-in too: the GigPay pool only funds signed-in testers, so a wallet created before
  // sign-in (when Friendbot refused and the pool said 401) gets funded as soon as the tester signs in.
  }, [publicKey, user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleConnect = async () => {
    setError('');
    try {
      const res = await connectWallet();
      const connectedKey = typeof res === 'string' ? res : res?.publicKey;
      const network = res?.network || '';

      if (network && !network.toUpperCase().includes('TESTNET')) {
        const msg = `Freighter is on ${network}. Please switch network to Testnet in Freighter settings!`;
        setError(msg);
        addToast(msg, 'warning');
      } else {
        addToast(`Connected to Stellar Testnet: ${formatKey(connectedKey)}`, 'success');
      }
    } catch (err) {
      if (err.message === 'WALLET_NOT_INSTALLED') {
        setShowOnboardingModal(true);
      } else {
        setError(err.message);
        addToast(err.message || 'Failed to connect wallet', 'error');
      }
    }
  };

  const formatKey = (key) => {
    if (!key) return '';
    const str = typeof key === 'string' ? key : (key?.address || String(key));
    return `${str.slice(0, 5)}...${str.slice(-4)}`;
  };

  return (
    <nav className="navbar animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
      <a href="/" className="logo">
        <img src="/logo.png" alt="GigPay Emblem" className="logo-img" />
        <span className="logo-text">GigPay</span>
      </a>
      <div className="navbar-actions">
        {/* Dynamic Pilot Feedback Status Pill */}
        {isPilotCompleted ? (
          <button
            type="button"
            onClick={() => addToast('✨ Pilot Tester Status: Verified! Thank you for shaping GigPay.', 'info')}
            className="btn btn-outline"
            title="Pilot Tester Status Verified"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.42rem 0.75rem',
              borderColor: 'rgba(0, 245, 160, 0.45)',
              background: 'rgba(0, 245, 160, 0.1)',
              color: 'var(--accent, #00f5a0)',
              fontSize: '0.8rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: '0 0 10px rgba(0, 245, 160, 0.15)'
            }}
          >
            ✓ Feedback sent
          </button>
        ) : isPilotFormOpened ? (
          <button
            type="button"
            onClick={() => {
              markPilotCompleted();
              addToast('🎉 Pilot tester status verified! Thank you for your feedback.', 'success');
            }}
            className="btn btn-outline"
            title="Click to confirm you completed the form"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.42rem 0.75rem',
              borderColor: 'rgba(245, 158, 11, 0.6)',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              fontSize: '0.8rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(245, 158, 11, 0.25)'
            }}
          >
            ❓ Completed Form? Confirm
          </button>
        ) : isPilotSnoozed ? (
          <a
            href={PILOT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => openFormLink('navbar_clicked')}
            className="btn btn-outline"
            title="Pilot form reminder snoozed - click to open"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.42rem 0.75rem',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            ⏳ Pilot Form (Snoozed) <ExternalLink size={13} />
          </a>
        ) : (
          <a
            href={PILOT_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => openFormLink('navbar_clicked')}
            className="btn btn-outline"
            title="Complete 60s pilot feedback form"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.42rem 0.75rem',
              borderColor: 'rgba(0, 242, 254, 0.5)',
              background: 'rgba(0, 242, 254, 0.12)',
              color: '#00f2fe',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 12px rgba(0, 242, 254, 0.25)'
            }}
          >
            🚀 Tester Feedback Form <ExternalLink size={13} />
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowLedgerModal(true)}
          className="btn btn-outline"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.42rem 0.75rem',
            borderColor: 'rgba(99, 102, 241, 0.45)',
            background: 'rgba(99, 102, 241, 0.08)',
            color: '#818cf8',
            fontSize: '0.8rem',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
        >
          <FileSpreadsheet size={13} /> 📜 Public Ledger
        </button>
        {user ? (
          <>
            <Link 
              to="/client" 
              className="btn btn-outline" 
              style={{ 
                padding: '0.42rem 0.75rem', 
                fontSize: '0.8rem', 
                whiteSpace: 'nowrap',
                borderColor: (user.user_metadata?.role === 'client' || activeRole === 'client') ? 'rgba(59, 130, 246, 0.6)' : 'rgba(255, 255, 255, 0.15)',
                background: (user.user_metadata?.role === 'client' || activeRole === 'client') ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                color: (user.user_metadata?.role === 'client' || activeRole === 'client') ? '#60a5fa' : 'var(--text-muted)'
              }}
            >
              Client Portal
            </Link>
            <Link 
              to="/freelancer" 
              className="btn btn-outline" 
              style={{ 
                padding: '0.42rem 0.75rem', 
                fontSize: '0.8rem', 
                whiteSpace: 'nowrap',
                borderColor: (user.user_metadata?.role === 'freelancer' || activeRole === 'freelancer') ? 'rgba(139, 92, 246, 0.6)' : 'rgba(255, 255, 255, 0.15)',
                background: (user.user_metadata?.role === 'freelancer' || activeRole === 'freelancer') ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                color: (user.user_metadata?.role === 'freelancer' || activeRole === 'freelancer') ? '#a78bfa' : 'var(--text-muted)'
              }}
            >
              Freelancer Portal
            </Link>
            
            {/* Interactive 1-Click Role Switcher Pill */}
            <button
              type="button"
              onClick={() => {
                const nextRole = switchRole();
                addToast(`Active role switched to ${nextRole.toUpperCase()}!`, 'success');
                navigate(nextRole === 'client' ? '/client' : '/freelancer');
              }}
              title="Click to toggle active role between Client and Freelancer"
              style={{
                background: (user.user_metadata?.role === 'client' || activeRole === 'client') ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                color: (user.user_metadata?.role === 'client' || activeRole === 'client') ? '#60a5fa' : '#a78bfa',
                padding: '0.28rem 0.65rem',
                borderRadius: '999px',
                fontSize: '0.72rem',
                fontWeight: 'bold',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                border: `1px solid ${(user.user_metadata?.role === 'client' || activeRole === 'client') ? 'rgba(59, 130, 246, 0.5)' : 'rgba(139, 92, 246, 0.5)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                boxShadow: `0 0 10px ${(user.user_metadata?.role === 'client' || activeRole === 'client') ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`,
                transition: 'all 0.2s ease'
              }}
            >
              <ArrowLeftRight size={11} />
              <span>{user.user_metadata?.role || activeRole || 'client'}</span>
              <span style={{ fontSize: '0.62rem', opacity: 0.75, textTransform: 'none', background: 'rgba(255,255,255,0.12)', padding: '0.08rem 0.3rem', borderRadius: '3px' }}>switch</span>
            </button>
            {publicKey ? (
              <div className="navbar-wallet-pills" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                {/* Live Testnet Network & Balance Pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.78rem',
                  color: '#93c5fd',
                  whiteSpace: 'nowrap'
                }}>
                  <Globe size={13} style={{ color: '#60a5fa' }} />
                  <span style={{ fontWeight: '600' }}>Testnet</span>
                  {balance !== null && (
                    <span style={{
                      marginLeft: '0.25rem',
                      background: 'rgba(255, 255, 255, 0.08)',
                      padding: '0.12rem 0.4rem',
                      borderRadius: '4px',
                      color: '#ffffff',
                      fontWeight: '700'
                    }}>
                      {isLoadingBalance && !String(balance).startsWith('Funding') ? '...' : /^[\d,.]+$/.test(String(balance)) ? `${balance} XLM` : balance}
                    </span>
                  )}
                </div>

                {/* Connected Wallet Address Pill */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '0.5rem',
                  border: '1px solid var(--accent)',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{ width: '7px', height: '7px', background: 'var(--accent)', borderRadius: '50%', display: 'inline-block' }}></span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 'bold' }}>{formatKey(publicKey)}</span>
                  {isSimulatorWallet(publicKey) && (
                    <span title="A practice wallet created in this browser. Testnet only: no real money." style={{ fontSize: '0.66rem', fontWeight: 700, color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>
                      Practice
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleConnect} style={{ padding: '0.42rem 0.85rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>Connect Wallet</button>
            )}

            <Link to="/profile" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', fontSize: '0.8rem', borderColor: 'transparent', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
              <User size={15} /> Profile
            </Link>
            <button onClick={handleSignOut} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.6rem', fontSize: '0.8rem', borderColor: 'transparent', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              <LogOut size={15} /> Sign Out
            </button>
          </>
        ) : (
          <Link to="/auth?mode=signup" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>Sign In / Sign Up</Link>
        )}
      </div>
      {error && (
        <div style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '0.5rem', border: '1px solid #ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <ShieldAlert size={16} /> {error}
        </div>
      )}

      {/* Wallet Onboarding Modal */}
      {showOnboardingModal && typeof document !== 'undefined' && createPortal(
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowOnboardingModal(false);
          }}
          style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(5,10,24,0.92)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999, backdropFilter: 'blur(10px)' }}
        >
          <div className="glass-panel animate-fade-in" style={{ width: '90%', maxWidth: '500px', backgroundColor: '#0d1527', border: '1px solid rgba(0,242,254,0.3)', padding: '2.5rem', position: 'relative', boxShadow: '0 25px 60px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '0.75rem', borderRadius: '1rem' }}>
                <Wallet size={32} />
              </div>
              <h2 style={{ margin: 0, color: 'white' }}>Welcome to Web3</h2>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
              GigPay uses the Stellar blockchain to settle payments in about 5 seconds for a fraction of a cent. To use this app, you need a secure digital wallet.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ color: 'var(--accent)', marginTop: '0.25rem' }}><Download size={20} /></div>
                <div>
                  <h4 style={{ marginBottom: '0.25rem', color: 'white' }}>1. Download Freighter</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Install the official Stellar wallet extension for Chrome, Edge, or Firefox.</p>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ color: 'var(--accent)', marginTop: '0.25rem' }}><Shield size={20} /></div>
                <div>
                  <h4 style={{ marginBottom: '0.25rem', color: 'white' }}>2. Secure Your Account</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Create a password and safely write down your 12-word recovery phrase.</p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ color: 'var(--accent)', marginTop: '0.25rem' }}><Globe size={20} /></div>
                <div>
                  <h4 style={{ marginBottom: '0.25rem', color: 'white' }}>3. Switch to {import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET'}</h4>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Click the gear icon in Freighter and switch your network to "{import.meta.env.VITE_STELLAR_NETWORK || 'TESTNET'}".</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <a 
                href="https://www.freighter.app/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}
              >
                Download Freighter <ExternalLink size={16} />
              </a>
              <button 
                onClick={() => setShowOnboardingModal(false)}
                className="btn btn-outline"
                style={{ flex: 1, borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                I'll do it later
              </button>
              <button
                type="button"
                onClick={() => {
                  connectTesterWallet();
                  setShowOnboardingModal(false);
                  addToast("Connected in Mobile / Simulator Testnet Mode!", "success");
                }}
                className="btn btn-outline"
                style={{ flex: '1 1 100%', borderColor: 'rgba(0, 242, 254, 0.45)', color: '#00f2fe', marginTop: '0.5rem', fontSize: '0.85rem' }}
              >
                ⚡ Continue in Mobile / Simulator Testnet Mode
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Public Verification Ledger Modal (Deliverable 2) */}
      <VerificationLedgerModal 
        isOpen={showLedgerModal} 
        onClose={() => setShowLedgerModal(false)} 
      />
    </nav>
  );
};

export default Navbar;
