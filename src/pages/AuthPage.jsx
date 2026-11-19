import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { recordStudentToGoogleSheet, isGoogleSheetsSyncEnabled } from '../lib/sheetsSync';
import { peekInvitePayload, shortStellarAddress } from '../lib/invite';

const isSignupUrl = (search) => {
  const params = new URLSearchParams(search);
  return params.get('mode') === 'signup' || params.get('signup') === '1';
};

const AuthPage = () => {
  const { signIn, signUp, loginSimulationMode, user, isLoading: authLoading, activeRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();

  const invitePayload = peekInvitePayload();
  const invited = Boolean(invitePayload);
  const startOnSignup = (search) => isSignupUrl(search) || Boolean(peekInvitePayload());

  const [isLogin, setIsLogin] = useState(() => !startOnSignup(location.search));
  const [role, setRole] = useState(() => (invitePayload ? 'client' : null));

  useEffect(() => {
    setIsLogin(!startOnSignup(location.search));
    setPendingConfirmationEmail('');
    const requestedRole = new URLSearchParams(location.search).get('role');
    if (requestedRole === 'client' || requestedRole === 'freelancer') {
      setRole(requestedRole);
    }
  }, [location.search, location.key]);

  const showReviewerTools = new URLSearchParams(location.search).get('reviewer') === '1';

  useEffect(() => {
    if (!authLoading && user && !showReviewerTools) {
      navigate(activeRole === 'freelancer' ? '/freelancer' : '/client', { replace: true });
    }
  }, [authLoading, user, showReviewerTools, activeRole, navigate]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const processSubmit = async () => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail) {
      addToast('Please enter a valid email address.', 'error');
      return;
    }

    if (!cleanPassword) {
      addToast('Please enter your password.', 'error');
      return;
    }

    if (!isLogin && !role) {
      addToast('Choose your role first: Freelancer or Client.', 'error');
      return;
    }

    if (!isLogin && !agreedPrivacy) {
      addToast('Please read and accept the privacy notice to create your account.', 'error');
      return;
    }
    if (!isLogin && cleanPassword !== confirmPassword.trim()) {
      addToast('Passwords do not match.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        const data = await signIn(cleanEmail, cleanPassword);
        setPendingConfirmationEmail('');
        addToast('Signed in successfully.', 'success');
        const userRole = data.user?.user_metadata?.role || 'client';
        navigate(userRole === 'client' ? '/client' : '/freelancer');
      } else {
        const data = await signUp(cleanEmail, cleanPassword, { role });
        const activeWallet =
          (typeof localStorage !== 'undefined' && localStorage.getItem('gigpay_wallet_public_key')) ||
          'Practice Keypair Pending';
        if (isGoogleSheetsSyncEnabled()) {
          await Promise.race([
            recordStudentToGoogleSheet({
              emailForSourceDetection: cleanEmail,
              programSection: role === 'client' ? 'Client (Student Tester)' : 'Freelancer (Student Tester)',
              walletAddress: activeWallet,
              taskTitle: 'Awaiting Escrow Milestone',
              amount: '2.0',
              releaseTxHash: 'Registered',
              feedbackSubmitted: false,
            }).catch((sheetErr) => {
              console.warn('Google Sheets signup sync failed:', sheetErr);
            }),
            new Promise((resolve) => setTimeout(resolve, 4000)),
          ]);
        }
        if (data?.session) {
          setPendingConfirmationEmail('');
          addToast('Account created. Opening your workspace.', 'success');
          navigate(role === 'client' ? '/client' : '/freelancer');
        } else if (data?.user) {
          setPendingConfirmationEmail(cleanEmail);
          addToast('Account created. Check your email and confirm your address before signing in.', 'info');
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        } else {
          setPendingConfirmationEmail('');
          addToast('Account created. You can now sign in.', 'success');
          setIsLogin(true);
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      let errorMsg = error?.message || error?.error_description;
      if (!errorMsg || errorMsg === '{}' || (typeof errorMsg === 'object' && Object.keys(errorMsg).length === 0)) {
        errorMsg = 'Invalid email or password. Switch to Create Account if you have not registered yet.';
      }
      if (typeof errorMsg === 'string' && errorMsg.includes('Invalid login credentials')) {
        errorMsg = 'Invalid email or password. If you are new to GigPay, switch to Create Account above.';
      }
      if (typeof errorMsg === 'string' && errorMsg.includes('Email not confirmed')) {
        addToast('Please check your email and click the confirmation link before signing in.', 'error');
      } else {
        addToast(String(errorMsg), 'error');
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
    <div className="animate-fade-in flex min-h-[76vh] items-center justify-center py-6 sm:py-10">
      <div className="gp-card w-full max-w-[440px] p-6 sm:p-8">
        <div className="mb-5 flex flex-col items-center text-center">
          <BrandMark size={44} />
          <h1 className="mt-4 mb-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {isLogin ? 'Welcome back' : 'Create your GigPay account'}
          </h1>
          <p className="m-0 text-[13.5px] text-[var(--text-muted)]">
            {isLogin
              ? 'Sign in to manage your Stellar Testnet milestone escrows.'
              : 'Runs on Stellar Testnet with practice XLM only (no cash value).'}
          </p>
        </div>

        {/* Mode Segmented Control */}
        <div className="gp-segmented mb-5 w-full" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isLogin}
            onClick={() => {
              setIsLogin(false);
              setPendingConfirmationEmail('');
            }}
            className="gp-segmented-btn flex-1"
          >
            Create Account
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            onClick={() => setIsLogin(true)}
            className="gp-segmented-btn flex-1"
          >
            Sign In
          </button>
        </div>

        {isLogin && pendingConfirmationEmail && (
          <div
            role="status"
            data-testid="email-confirmation-banner"
            className="mb-4 rounded-xl border border-[var(--signal-money-border)] bg-[var(--signal-money-bg)] px-3.5 py-3 text-[13.5px] text-[var(--text-primary)]"
          >
            Confirmation link sent to <strong>{pendingConfirmationEmail}</strong>. Open the link in your email before signing in.
          </div>
        )}

        {!isLogin && invited && invitePayload && (
          <div
            data-testid="invite-banner"
            className="mb-4 rounded-xl border border-[var(--signal-money-border)] bg-[var(--signal-money-bg)] px-3.5 py-3 text-[13.5px] text-[var(--text-primary)]"
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[var(--signal-money)]" />
              <div>
                <div className="font-semibold">
                  {invitePayload.name ? `${invitePayload.name} shared a Pay QR` : 'Recipient QR captured'}
                </div>
                <div className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">
                  Create your <strong>Client</strong> account below to lock funds to{' '}
                  <span className="gp-mono">{shortStellarAddress(invitePayload.address)}</span>
                  {invitePayload.amount ? ` (${invitePayload.amount} XLM)` : ''} in this browser.
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {!isLogin && (
            <div data-testid="role-picker" className="gp-field">
              <div id="auth-role-picker-label" className="gp-label">
                Choose your role
              </div>
              <div role="group" aria-labelledby="auth-role-picker-label" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {[
                  {
                    value: 'freelancer',
                    title: 'Freelancer',
                    sub: 'Share your Pay QR, deliver work, and get paid.',
                  },
                  {
                    value: 'client',
                    title: 'Client',
                    sub: 'Scan a QR, lock milestone funds, and release on approval.',
                  },
                ].map((opt) => {
                  const selected = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRole(opt.value)}
                      className={`gp-role-card${selected ? ' gp-role-card--selected' : ''}`}
                    >
                      <div className="flex w-full items-center justify-between gap-2 text-[14px] font-semibold text-[var(--text-primary)]">
                        <span>{opt.title}</span>
                        {selected && <CheckCircle2 size={15} className="shrink-0 text-[var(--signal-money)]" />}
                      </div>
                      <p className="mt-1 mb-0 text-[12.5px] leading-snug text-[var(--text-muted)]">
                        {opt.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="gp-field">
            <label htmlFor="auth-email" className="gp-label">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="gp-input"
              required
            />
          </div>

          <div className="gp-field">
            <label htmlFor="auth-password" className="gp-label">
              Password
            </label>
            <div className="relative flex items-center">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="gp-input pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div className="gp-field">
              <label htmlFor="auth-confirm-password" className="gp-label">
                Confirm Password
              </label>
              <div className="relative flex items-center">
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="gp-input pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          )}

          {!isLogin && (
            // Philippine Data Privacy Act (RA 10173) informed consent before creating a Stellar Testnet pilot account
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
              <input
                type="checkbox"
                required
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--signal-money)]"
              />
              <span>
                I agree that GigPay may store my email, my Testnet wallet address, and my pilot tasks to run this pilot and report aggregate totals (never my email). Wallet activity on Stellar Testnet is public. I can request deletion at any time.{' '}
                <a
                  href="https://github.com/MarkAngelGuevarra/gigpay/blob/main/PRIVACY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[var(--signal-money-fg)] underline"
                >
                  Privacy notice
                </a>
              </span>
            </label>
          )}

          <button
            type="submit"
            className="gp-btn gp-btn-primary gp-btn-lg mt-1 w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Processing…' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {showReviewerTools && (
          <details className="mt-6 border-t border-[var(--border-subtle)] pt-4">
            <summary className="cursor-pointer text-center text-[13px] font-medium text-[var(--text-muted)]">
              Reviewer demo accounts and sandbox
            </summary>
            <p className="mt-2 mb-3 text-center text-[12.5px] text-[var(--text-muted)]">
              Shared review accounts run in demo mode and are not counted as real users.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setEmail('client@gigpay.tech');
                  setPassword('password123');
                }}
                className="gp-btn gp-btn-secondary flex-col !py-2.5 text-center"
              >
                <span className="text-[13px] font-semibold">Demo Client</span>
                <span className="text-[11.5px] font-normal text-[var(--text-muted)]">client@gigpay.tech</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setEmail('freelancer@gigpay.tech');
                  setPassword('password123');
                }}
                className="gp-btn gp-btn-secondary flex-col !py-2.5 text-center"
              >
                <span className="text-[13px] font-semibold">Demo Freelancer</span>
                <span className="text-[11.5px] font-normal text-[var(--text-muted)]">freelancer@gigpay.tech</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                loginSimulationMode('client');
                addToast('Dual-role simulation sandbox activated.', 'success');
                navigate('/client');
              }}
              className="gp-btn gp-btn-secondary mt-2.5 w-full"
            >
              Open Dual-Role Sandbox (Offline Simulation)
            </button>
          </details>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
