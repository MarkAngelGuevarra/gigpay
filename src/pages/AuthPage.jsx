import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { Eye, EyeOff } from 'lucide-react';
import { recordStudentToGoogleSheet } from '../lib/sheetsSync';
import { hasPendingInvite } from '../lib/invite';

const AuthPage = () => {
  const { signIn, signUp, loginSimulationMode } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const location = useLocation();
  const isSignupUrl = (search) => {
    const params = new URLSearchParams(search);
    return params.get('mode') === 'signup' || params.get('signup') === '1';
  };
  // A partner who scanned the invite QR (or opened the invite link) is new and will be the Client: start on
  // Sign Up with Client chosen, instead of "Welcome Back" (the redirect to /auth drops ?pay= and the mode).
  const invited = hasPendingInvite();
  const startOnSignup = (search) => isSignupUrl(search) || hasPendingInvite();
  const [isLogin, setIsLogin] = useState(() => !startOnSignup(location.search));
  // The navbar links to /auth?mode=signup and /auth while this page is already open; follow each
  // navigation (a new location key, even to the same URL) instead of reading the mode only once.
  useEffect(() => {
    setIsLogin(!startOnSignup(location.search));
  }, [location.search, location.key]);
  // Grant reviewers' shared demo accounts and the sandbox only appear on /auth?reviewer=1, so students
  // can't wander into activity that never counts as a tester.
  const showReviewerTools = new URLSearchParams(location.search).get('reviewer') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  // No silent default: a freelancer who skipped the picker used to become a Client. Invited partners are Clients.
  const [role, setRole] = useState(() => (hasPendingInvite() ? 'client' : null));
  const [isLoading, setIsLoading] = useState(false);

  const processSubmit = async () => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail) {
      addToast("Please enter a valid email address.", "error");
      return;
    }

    if (!cleanPassword) {
      addToast("Please enter your password.", "error");
      return;
    }

    if (!isLogin && !role) {
      addToast("Choose your role first: Freelancer (you do the work) or Client (you pay).", "error");
      return;
    }

    if (!isLogin && !agreedPrivacy) {
      addToast("Please read and accept the privacy notice to create your tester account.", "error");
      return;
    }
    if (!isLogin && cleanPassword !== confirmPassword.trim()) {
      addToast("Passwords do not match.", "error");
      return;
    }

    setIsLoading(true);
    
    try {
      if (isLogin) {
        const data = await signIn(cleanEmail, cleanPassword);
        addToast("Logged in successfully!", "success");
        const userRole = data.user?.user_metadata?.role || 'client';
        navigate(userRole === 'client' ? '/client' : '/freelancer');
      } else {
        const data = await signUp(cleanEmail, cleanPassword, { role });
        const activeWallet = (typeof localStorage !== 'undefined' && localStorage.getItem('gigpay_wallet_public_key')) || 'Practice Keypair Pending';
        await recordStudentToGoogleSheet({
          emailForSourceDetection: cleanEmail,
          programSection: role === 'client' ? 'Client (Student Tester)' : 'Freelancer (Student Tester)',
          walletAddress: activeWallet,
          taskTitle: 'Awaiting Escrow Milestone',
          amount: '2.0',
          releaseTxHash: 'Registered',
          feedbackSubmitted: false,
        });
        if (data?.session || data?.user) {
          addToast("Pilot account created! Redirecting to your dashboard...", "success");
          navigate(role === 'client' ? '/client' : '/freelancer');
        } else {
          addToast("Account created successfully! You can now sign in.", "success");
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (error) {
      console.error("Auth error:", error);
      let errorMsg = error?.message || error?.error_description;
      if (!errorMsg || errorMsg === '{}' || (typeof errorMsg === 'object' && Object.keys(errorMsg).length === 0)) {
        errorMsg = "Invalid email or password. New tester? Click '🚀 Sign Up (New Tester)' at the top first!";
      }
      if (typeof errorMsg === 'string' && errorMsg.includes('Invalid login credentials')) {
        errorMsg = "Account not found yet! Click the '🚀 Sign Up (New Tester)' tab above to register your email first.";
      }
      if (typeof errorMsg === 'string' && errorMsg.includes('Email not confirmed')) {
        addToast("Please check your email and click the confirmation link before logging in.", "error");
      } else {
        addToast(String(errorMsg), "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    processSubmit();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
          <img 
            src="/logo.png" 
            alt="GigPay Emblem" 
            style={{ 
              width: '52px', 
              height: '52px', 
              borderRadius: '12px', 
              boxShadow: '0 0 20px rgba(0, 242, 254, 0.4)', 
              border: '1px solid rgba(0, 242, 254, 0.3)' 
            }} 
          />
        </div>

        {/* Prominent Top Mode Switcher Tabs for Pilot Testers */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          background: 'rgba(0, 0, 0, 0.35)',
          padding: '0.35rem',
          borderRadius: '0.65rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '1.25rem'
        }}>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            style={{
              flex: 1.2,
              padding: '0.6rem 0.5rem',
              borderRadius: '0.45rem',
              border: !isLogin ? '1px solid rgba(0, 242, 254, 0.6)' : '1px solid transparent',
              background: !isLogin ? 'rgba(0, 242, 254, 0.16)' : 'transparent',
              color: !isLogin ? '#00f2fe' : 'var(--text-muted)',
              fontWeight: !isLogin ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🚀 Sign Up (New Tester)
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            style={{
              flex: 0.8,
              padding: '0.6rem 0.5rem',
              borderRadius: '0.45rem',
              border: isLogin ? '1px solid rgba(0, 242, 254, 0.6)' : '1px solid transparent',
              background: isLogin ? 'rgba(0, 242, 254, 0.16)' : 'transparent',
              color: isLogin ? '#00f2fe' : 'var(--text-muted)',
              fontWeight: isLogin ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Sign In
          </button>
        </div>

        <h2 style={{ textAlign: 'center', marginBottom: '0.35rem', fontSize: '1.35rem' }}>
          {isLogin ? 'Welcome Back' : 'Create Pilot Tester Account'}
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
          {isLogin
            ? 'New to GigPay? Click "🚀 Sign Up (New Tester)" above to register your email.'
            : 'Register with your email to join the GigPay Testnet pilot. Practice money only.'}
        </p>
        
        {!isLogin && invited && (
          <div data-testid="invite-banner" style={{ background: 'rgba(0, 242, 254, 0.1)', border: '1px solid rgba(0, 242, 254, 0.4)', borderRadius: '0.5rem', padding: '0.65rem 0.8rem', marginBottom: '1rem', fontSize: '0.9rem', color: 'white' }}>
            Your partner invited you. Create your <strong>Client</strong> account below, then do everything in this browser.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isLogin && (
            <div data-testid="role-picker">
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'white', fontWeight: 600 }}>Your role in this pair</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[
                  { value: 'freelancer', title: 'Freelancer (Working)', sub: 'I do the work and get paid (sign up first)', color: '#a78bfa' },
                  { value: 'client', title: 'Client (Hiring)', sub: 'I pay for the work (I scanned my partner\'s QR)', color: 'var(--accent)' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={role === opt.value}
                    onClick={() => setRole(opt.value)}
                    style={{
                      textAlign: 'left',
                      padding: '0.7rem 0.85rem',
                      minHeight: '48px',
                      borderRadius: '0.5rem',
                      border: role === opt.value ? `2px solid ${opt.color}` : '1px solid var(--border)',
                      background: role === opt.value ? 'rgba(0, 240, 255, 0.08)' : 'rgba(0,0,0,0.2)',
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: role === opt.value ? opt.color : 'white' }}>
                      {role === opt.value ? '✓ ' : ''}{opt.title}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Email</label>
            <input 
              type="email"
              autoComplete="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" 
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
              required
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                autoComplete={isLogin ? "current-password" : "new-password"}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                style={{ 
                  width: '100%', 
                  padding: '0.75rem 2.8rem 0.75rem 0.75rem', 
                  borderRadius: '0.5rem', 
                  border: '1px solid var(--border)', 
                  background: 'rgba(0,0,0,0.2)', 
                  color: 'white' 
                }} 
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.25rem',
                  minWidth: '44px',
                  minHeight: '44px',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  color: showPassword ? 'var(--primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.25rem',
                  transition: 'color 0.2s'
                }}
                title={showPassword ? "Hide password" : "Show password"}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Confirm Password</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type={showPassword ? "text" : "password"} 
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••" 
                  style={{ 
                    width: '100%', 
                    padding: '0.75rem 2.8rem 0.75rem 0.75rem', 
                    borderRadius: '0.5rem', 
                    border: '1px solid var(--border)', 
                    background: 'rgba(0,0,0,0.2)', 
                    color: 'white' 
                  }} 
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.25rem',
                    minWidth: '44px',
                    minHeight: '44px',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    color: showPassword ? 'var(--primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem',
                    transition: 'color 0.2s'
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}
          
          {!isLogin && (
            // Privacy notice and consent (Philippine Data Privacy Act, RA 10173): testers should know what the
            // pilot collects, why, and that Stellar Testnet activity is public, before they create an account.
            <label style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45, cursor: 'pointer' }}>
              <input
                type="checkbox"
                required
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                style={{ marginTop: '0.2rem', width: '18px', height: '18px', flexShrink: 0 }}
              />
              <span>
                I agree that GigPay may store my email, my Testnet wallet address and my pilot tasks to run this test and to report pilot results to the Stellar Philippines Instawards program (as totals, never my email). Wallet activity on Stellar Testnet is public. I can ask for my data to be deleted at any time.{' '}
                <a href="https://github.com/MarkAngelGuevarra/gigpay/blob/main/PRIVACY.md" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Privacy notice</a>
              </span>
            </label>
          )}

          <button
            type="submit"
            className="btn btn-primary" 
            style={{ marginTop: '1rem', opacity: isLoading ? 0.5 : 1 }}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        {/* Grant Reviewer Quick-Fill. Folded away so testers sign up with their own email: activity on these
            shared accounts cannot be tied to a real person, so it never counts as tester traction. */}
        {showReviewerTools && (
        <details style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <summary style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            For grant reviewers: shared demo accounts
          </summary>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', margin: '0.5rem 0 0.75rem' }}>
            Shared accounts for a quick look. Anything done here is a demo and is <strong>not counted as a tester</strong>. Pilot testers: please use <strong>🚀 Sign Up (New Tester)</strong> with your own email.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setEmail('client@gigpay.tech');
                setPassword('password123');
              }}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(0, 242, 254, 0.3)',
                background: 'rgba(0, 242, 254, 0.06)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 242, 254, 0.15)';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 242, 254, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(0, 242, 254, 0.3)';
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#00f2fe' }}>👤 Demo Client</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>client@gigpay.tech</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setEmail('freelancer@gigpay.tech');
                setPassword('password123');
              }}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                background: 'rgba(139, 92, 246, 0.06)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                e.currentTarget.style.borderColor = 'var(--secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#c084fc' }}>🛠️ Demo Freelancer</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>freelancer@gigpay.tech</div>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              loginSimulationMode('client');
              addToast("⚡ Dual-Role Simulation Sandbox Activated! Test the full escrow lifecycle.", "success");
              navigate('/client');
            }}
            style={{
              width: '100%',
              marginTop: '0.75rem',
              padding: '0.65rem 0.5rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(0, 242, 254, 0.6)',
              background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.15), rgba(139, 92, 246, 0.15))',
              cursor: 'pointer',
              textAlign: 'center',
              color: '#00f2fe',
              fontWeight: 700,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              boxShadow: '0 0 12px rgba(0, 242, 254, 0.2)'
            }}
          >
            ⚡ 1-Click Dual-Role Sandbox (Simulate Client & Freelancer)
          </button>
        </details>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
