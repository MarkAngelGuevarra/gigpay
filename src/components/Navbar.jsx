import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Zap, ShieldAlert, LogOut, User, Download, Globe, Shield, ExternalLink, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, signOut, publicKey, connectWallet } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleConnect = async () => {
    setError('');
    try {
      await connectWallet();
    } catch (err) {
      if (err.message === 'WALLET_NOT_INSTALLED') {
        setShowOnboardingModal(true);
      } else {
        setError(err.message);
      }
    }
  };

  const formatKey = (key) => {
    if (!key) return '';
    return `${key.slice(0, 5)}...${key.slice(-4)}`;
  };

  return (
    <nav className="navbar animate-fade-in" style={{ flexWrap: 'wrap' }}>
      <a href="/" className="logo">
        <Zap className="logo-icon" fill="currentColor" />
        GigPay
      </a>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {user ? (
          <>
            {user.user_metadata?.role === 'client' && (
              <Link to="/client" className="btn btn-outline">Client Portal</Link>
            )}
            {user.user_metadata?.role === 'freelancer' && (
              <Link to="/freelancer" className="btn btn-outline">Freelancer Portal</Link>
            )}
            
            {/* Visual Role Badge for Demo Clarity */}
            {user.user_metadata?.role && (
              <span style={{
                background: user.user_metadata.role === 'client' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                color: user.user_metadata.role === 'client' ? '#60a5fa' : '#a78bfa',
                padding: '0.3rem 0.8rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                border: `1px solid ${user.user_metadata.role === 'client' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(139, 92, 246, 0.5)'}`,
                display: 'flex',
                alignItems: 'center',
                boxShadow: `0 0 10px ${user.user_metadata.role === 'client' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`
              }}>
                {user.user_metadata.role}
              </span>
            )}
            {publicKey ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--accent)' }}>
                <span style={{ width: '8px', height: '8px', background: 'var(--accent)', borderRadius: '50%', display: 'inline-block' }}></span>
                <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 'bold' }}>{formatKey(publicKey)}</span>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={handleConnect}>Connect Wallet</button>
            )}

            <Link to="/profile" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: 'transparent', color: 'var(--text-main)' }}>
              <User size={16} /> Profile
            </Link>
            <button onClick={handleSignOut} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderColor: 'transparent', color: 'var(--text-muted)' }}>
              <LogOut size={16} /> Sign Out
            </button>
          </>
        ) : (
          <Link to="/auth" className="btn btn-primary">Sign In / Sign Up</Link>
        )}
      </div>
      {error && (
        <div style={{ width: '100%', marginTop: '1rem', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '0.5rem', border: '1px solid #ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <ShieldAlert size={16} /> {error}
        </div>
      )}

      {/* Wallet Onboarding Modal */}
      {showOnboardingModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '90%', maxWidth: '500px', padding: '2.5rem', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '0.75rem', borderRadius: '1rem' }}>
                <Wallet size={32} />
              </div>
              <h2 style={{ margin: 0, color: 'white' }}>Welcome to Web3</h2>
            </div>
            
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.6' }}>
              GigPay uses the Stellar Blockchain to process payments instantly with zero fees. To use this app, you need a secure digital wallet.
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
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
