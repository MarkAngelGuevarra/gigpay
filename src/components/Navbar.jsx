import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldAlert,
  LogOut,
  User,
  Download,
  Globe,
  Shield,
  ExternalLink,
  Wallet,
  FileSpreadsheet,
  ArrowLeftRight,
  Menu,
  X,
  Sun,
  Moon,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { BrandLockup } from './BrandMark';
import {
  getAccountBalance,
  isDemoWallet,
  isSimulatorWallet,
  ensureEphemeralAccountFunded,
  buildExplorerAccountUrl,
  STELLAR_NETWORK_NAME,
  STELLAR_NETWORK_PASSPHRASE,
} from '../lib/stellar';
import VerificationLedgerModal from './VerificationLedgerModal';
import { usePilotFeedbackState, PILOT_FORM_URL } from '../hooks/usePilotFeedbackState';
import { isPilotToolsEnabled } from '../lib/env';

const Navbar = () => {
  const { user, signOut, publicKey, connectWallet, connectTesterWallet, switchRole, activeRole, isSimulationMode } = useAuth();
  const { addToast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const pilotToolsEnabled = isPilotToolsEnabled();

  const [error, setError] = useState('');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [balance, setBalance] = useState(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [balanceRefreshTick, setBalanceRefreshTick] = useState(0);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const walletPopoverRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
    setWalletMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!walletMenuOpen) return undefined;
    const handlePointerDown = (e) => {
      if (walletPopoverRef.current && !walletPopoverRef.current.contains(e.target)) {
        setWalletMenuOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setWalletMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [walletMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const triggerRefresh = () => setBalanceRefreshTick((n) => n + 1);
    window.addEventListener('gigpay:balance-refresh', triggerRefresh);
    return () => window.removeEventListener('gigpay:balance-refresh', triggerRefresh);
  }, []);

  useEffect(() => {
    if (!showOnboardingModal || typeof window === 'undefined') return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowOnboardingModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showOnboardingModal]);

  const {
    isCompleted: isPilotCompleted,
    isSnoozed: isPilotSnoozed,
    isFormOpened: isPilotFormOpened,
    openFormLink,
    markCompleted: markPilotCompleted,
  } = usePilotFeedbackState();

  useEffect(() => {
    const controller = new AbortController();
    const activeUserId = user?.id || null;
    if (!activeUserId || !publicKey) {
      setBalance(null);
      setIsLoadingBalance(false);
      return () => controller.abort();
    }

    const isStale = () => controller.signal.aborted;
    setIsLoadingBalance(true);

    const showBalance = (res) => {
      if (isStale()) return;
      if (res.unknown || (res.isDemo && isSimulatorWallet(publicKey))) setBalance('unavailable');
      else setBalance(res.balance);
      setIsLoadingBalance(false);
    };

    getAccountBalance(publicKey)
      .then(async (res) => {
        if (isStale()) return;
        if (!isSimulationMode && !isDemoWallet(publicKey) && !res.active && !res.unknown && isSimulatorWallet(publicKey)) {
          if (!isStale()) setBalance('Funding… (up to 30s)');
          const funded = await ensureEphemeralAccountFunded(publicKey);
          if (isStale()) return;
          const after = await getAccountBalance(publicKey);
          if (isStale()) return;
          if (!funded && !after.active) {
            setBalance('Not funded yet, refresh in a minute');
            setIsLoadingBalance(false);
            return;
          }
          showBalance(after);
          return;
        }
        showBalance(res);
      })
      .catch(() => {
        if (!isStale()) setIsLoadingBalance(false);
      });

    return () => controller.abort();
  }, [publicKey, user, user?.id, isSimulationMode, balanceRefreshTick]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setBalance(null);
    setIsLoadingBalance(false);
    try {
      await signOut();
      navigate('/');
    } finally {
      setIsSigningOut(false);
    }
  };

  const formatKey = (key) => {
    if (!key) return '';
    const str = typeof key === 'string' ? key : (key?.address || String(key));
    return `${str.slice(0, 5)}…${str.slice(-4)}`;
  };

  const handleConnect = async () => {
    setError('');
    const targetLabel = STELLAR_NETWORK_NAME === 'TESTNET' ? 'Stellar Testnet' : 'Stellar Local (Standalone)';
    try {
      const res = await connectWallet();
      const connectedKey = typeof res === 'string' ? res : res?.publicKey;
      const network = String(res?.network || '').trim();
      const passphrase = String(res?.networkPassphrase || '').trim();
      const upperNetwork = network.toUpperCase();
      const isExpectedNetwork = passphrase
        ? passphrase === STELLAR_NETWORK_PASSPHRASE
        : (STELLAR_NETWORK_NAME === 'STANDALONE'
            ? (upperNetwork.includes('STANDALONE') || upperNetwork.includes('LOCAL'))
            : upperNetwork.includes('TESTNET'));

      if ((network || passphrase) && !isExpectedNetwork) {
        const msg = `Your Varial (formerly Freighter) wallet is on ${network || 'another network'}. Please switch it to ${targetLabel} in the wallet settings.`;
        setError(msg);
        addToast(msg, 'warning');
      } else {
        addToast(`Connected to ${targetLabel}: ${formatKey(connectedKey)}`, 'success');
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

  const handleCopyWallet = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopiedWallet(true);
      addToast('Wallet address copied.', 'success');
      setTimeout(() => setCopiedWallet(false), 1800);
    } catch {
      addToast('Could not copy wallet address.', 'warning');
    }
  };

  const formattedBalance =
    balance === null
      ? null
      : isLoadingBalance && !String(balance).startsWith('Funding')
        ? '…'
        : /^[\d,.]+$/.test(String(balance))
          ? `${balance} XLM`
          : balance;

  const isSandbox = Boolean(user?.is_simulation_mode || isSimulationMode);
  const explorerAccountUrl = publicKey && !isDemoWallet(publicKey) ? buildExplorerAccountUrl(publicKey) : null;
  const isAuthRoute = location.pathname === '/auth';
  const isClientRoute = location.pathname === '/client';
  const isFreelancerRoute = location.pathname === '/freelancer';
  const isProfileRoute = location.pathname === '/profile';

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/92 backdrop-blur-md">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <nav
          className="navbar !mb-0 !py-2 flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap"
          aria-label="Workspace navigation"
        >
          <div className="flex shrink-0 items-center gap-2.5">
            <Link to="/" className="no-underline" aria-label="GigPay home">
              <BrandLockup size={28} />
            </Link>
            {user && !isSandbox && (
              <span
                data-testid="navbar-role-badge"
                className="hidden rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[12px] font-medium capitalize text-[var(--text-secondary)] sm:inline-flex"
              >
                {activeRole === 'freelancer' ? 'freelancer' : 'client'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="gp-btn gp-btn-ghost !min-h-[40px] !w-[40px] !p-0"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              type="button"
              className="gp-btn gp-btn-secondary navbar-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="navbar-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={16} /> : <Menu size={16} />}
              <span>{menuOpen ? 'Close' : 'Menu'}</span>
            </button>
          </div>

          <div className="navbar-actions">
            <div
              id="navbar-menu"
              className={`navbar-secondary${menuOpen ? ' is-open' : ''}`}
              onClick={(e) => {
                if (e.target.closest('a, button')) setMenuOpen(false);
              }}
            >
              {pilotToolsEnabled && (
                isPilotCompleted ? (
                  <button
                    type="button"
                    onClick={() => addToast('Feedback received. Thank you for shaping GigPay.', 'info')}
                    className="gp-btn gp-btn-secondary !min-h-[36px] !px-2.5 text-[var(--signal-money-fg)]"
                  >
                    Feedback sent
                  </button>
                ) : isPilotFormOpened ? (
                  <button
                    type="button"
                    onClick={() => {
                      markPilotCompleted();
                      addToast('Thanks for your feedback.', 'success');
                    }}
                    className="gp-btn gp-btn-secondary !min-h-[36px] !px-2.5 text-[var(--signal-warn)]"
                  >
                    Confirm feedback
                  </button>
                ) : isPilotSnoozed ? (
                  <a
                    href={PILOT_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => openFormLink('navbar_clicked')}
                    className="gp-btn gp-btn-ghost !min-h-[36px] !px-2.5"
                  >
                    Feedback Form (Snoozed)
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <a
                    href={PILOT_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => openFormLink('navbar_clicked')}
                    className="gp-btn gp-btn-secondary !min-h-[36px] !px-2.5"
                  >
                    Tester Feedback Form
                    <ExternalLink size={13} />
                  </a>
                )
              )}

              <button
                type="button"
                onClick={() => setShowLedgerModal(true)}
                aria-label="Public ledger"
                className="gp-btn gp-btn-ghost !min-h-[36px] !px-2.5"
              >
                <FileSpreadsheet size={15} />
                <span className="hidden lg:inline">Public ledger</span>
                <span className="lg:hidden">Ledger</span>
              </button>

              {user && isSandbox && (
                <div className="inline-flex items-center gap-1.5">
                  <div className="gp-segmented !p-0.5">
                    <Link
                      to="/client"
                      aria-current={isClientRoute ? 'page' : undefined}
                      className={`gp-segmented-btn !min-h-[30px] !px-2.5 no-underline ${
                        isClientRoute ? '!bg-[var(--bg-surface)] !font-semibold !text-[var(--text-primary)] shadow-[var(--shadow-xs)]' : ''
                      }`}
                    >
                      Client
                    </Link>
                    <Link
                      to="/freelancer"
                      aria-current={isFreelancerRoute ? 'page' : undefined}
                      className={`gp-segmented-btn !min-h-[30px] !px-2.5 no-underline ${
                        isFreelancerRoute ? '!bg-[var(--bg-surface)] !font-semibold !text-[var(--text-primary)] shadow-[var(--shadow-xs)]' : ''
                      }`}
                    >
                      Freelancer
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextRole = switchRole();
                      if (!nextRole) return;
                      addToast(`Switched active role to ${nextRole}.`, 'success');
                      navigate(nextRole === 'client' ? '/client' : '/freelancer');
                    }}
                    className="gp-btn gp-btn-secondary !min-h-[36px] !px-2.5"
                    title="Toggle active role between Client and Freelancer"
                    aria-label="Toggle active role between Client and Freelancer"
                  >
                    <ArrowLeftRight size={13} />
                  </button>
                </div>
              )}

              {user && !isSandbox && (
                <Link
                  to={activeRole === 'freelancer' ? '/freelancer' : '/client'}
                  aria-current={isClientRoute || isFreelancerRoute ? 'page' : undefined}
                  className={`gp-btn !min-h-[36px] !px-2.5 ${
                    isClientRoute || isFreelancerRoute ? 'gp-btn-secondary' : 'gp-btn-ghost'
                  }`}
                >
                  Workspace
                </Link>
              )}
            </div>

            {user && (
              <>
                {publicKey ? (
                  <div
                    ref={walletPopoverRef}
                    className="navbar-wallet-pills relative"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}
                  >
                    <button
                      type="button"
                      onClick={() => setWalletMenuOpen((o) => !o)}
                      aria-expanded={walletMenuOpen}
                      aria-haspopup="dialog"
                      className="gp-btn gp-btn-secondary !min-h-[36px] !px-2.5"
                    >
                      <span className="h-2 w-2 rounded-full bg-[var(--signal-money)]" />
                      <span className="text-[12.5px] font-medium text-[var(--text-muted)]">
                        {STELLAR_NETWORK_NAME === 'TESTNET' ? 'Testnet' : 'Local'}
                      </span>
                      {formattedBalance && (
                        <span className="text-[13px] font-semibold text-[var(--text-primary)] tabular-nums">
                          {formattedBalance}
                        </span>
                      )}
                      <span className="gp-mono hidden text-[12px] text-[var(--text-muted)] xl:inline">
                        {formatKey(publicKey)}
                      </span>
                      <ChevronDown size={13} className="text-[var(--text-muted)]" />
                    </button>

                    {walletMenuOpen && (
                      <div
                        role="dialog"
                        aria-label="Wallet details"
                        className="absolute top-full right-0 z-50 mt-2 w-72 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-lg)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12.5px] font-medium text-[var(--text-muted)]">
                            {STELLAR_NETWORK_NAME === 'TESTNET' ? 'Stellar Testnet' : 'Stellar Local'}
                          </span>
                          {isSimulatorWallet(publicKey) && (
                            <span className="gp-status gp-status--warn !py-0.5 !text-[11.5px]">
                              Practice wallet
                            </span>
                          )}
                        </div>

                        {formattedBalance && (
                          <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">
                            {formattedBalance}
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-2.5">
                          <code className="gp-mono min-w-0 flex-1 truncate text-[12px] text-[var(--text-primary)]">
                            {publicKey}
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyWallet}
                            aria-label="Copy wallet address"
                            className="gp-btn gp-btn-ghost !min-h-[30px] !w-[30px] !p-0"
                          >
                            {copiedWallet ? <Check size={14} className="text-[var(--signal-money)]" /> : <Copy size={14} />}
                          </button>
                        </div>

                        {isSimulatorWallet(publicKey) && (
                          <p className="mt-2.5 mb-0 text-[12px] leading-relaxed text-[var(--text-muted)]">
                            Browser-stored practice wallet with Testnet XLM only (no cash value).
                          </p>
                        )}

                        <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3">
                          {explorerAccountUrl && (
                            <a
                              href={explorerAccountUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="gp-btn gp-btn-ghost w-full justify-between !px-2.5 text-[13px]"
                            >
                              View on Stellar Expert
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setWalletMenuOpen(false);
                              handleConnect();
                            }}
                            className="gp-btn gp-btn-ghost w-full justify-between !px-2.5 text-[13px]"
                          >
                            Connect Varial wallet
                            <Wallet size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <button type="button" className="gp-btn gp-btn-primary" onClick={handleConnect}>
                    Connect Wallet
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="gp-btn gp-btn-ghost hidden !min-h-[38px] !w-[38px] !p-0 sm:inline-flex"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                <div className={`navbar-secondary navbar-secondary-end${menuOpen ? ' is-open' : ''}`}>
                  <Link
                    to="/profile"
                    aria-current={isProfileRoute ? 'page' : undefined}
                    className={`gp-btn !min-h-[36px] !px-2.5 ${isProfileRoute ? 'gp-btn-secondary' : 'gp-btn-ghost'}`}
                  >
                    <User size={15} />
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    aria-label={isSigningOut ? 'Signing Out' : 'Sign Out'}
                    title="Sign Out"
                    className="gp-btn gp-btn-ghost !min-h-[36px] !px-2.5 text-[var(--text-muted)]"
                  >
                    <LogOut size={15} />
                    <span className="sm:hidden lg:inline">
                      {isSigningOut ? 'Signing Out…' : 'Sign Out'}
                    </span>
                  </button>
                </div>
              </>
            )}

            {!user && (
              <>
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="gp-btn gp-btn-ghost hidden !min-h-[36px] !w-[36px] !p-0 sm:inline-flex"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                {!isAuthRoute && (
                  <Link to="/auth?mode=signup" className="gp-btn gp-btn-primary !min-h-[36px] !px-3.5">
                    Sign in
                  </Link>
                )}
              </>
            )}
          </div>
        </nav>

        {error && (
          <div
            role="alert"
            className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)] px-3.5 py-2.5 text-[13.5px] text-[var(--signal-danger)]"
          >
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Wallet Onboarding Modal */}
      {showOnboardingModal && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Connect Stellar Wallet"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowOnboardingModal(false);
          }}
          className="gp-modal-backdrop"
          style={{ zIndex: 100000 }}
        >
          <div className="gp-modal max-w-[480px]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowOnboardingModal(false)}
              className="gp-modal-close"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 pr-10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--signal-money-bg)] text-[var(--signal-money)]">
                <Wallet size={20} />
              </div>
              <div>
                <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">Connect a Stellar Wallet</h2>
                <p className="m-0 text-[13px] text-[var(--text-muted)]">
                  Five-second milestone settlement on {STELLAR_NETWORK_NAME === 'TESTNET' ? 'Stellar Testnet' : 'Stellar Local'}.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <div className="flex gap-3">
                <Download size={18} className="mt-0.5 shrink-0 text-[var(--signal-money)]" />
                <div>
                  <h4 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">
                    1. Install Varial (formerly Freighter)
                  </h4>
                  <p className="mt-0.5 mb-0 text-[13px] text-[var(--text-muted)]">
                    Install the Stellar browser wallet extension for Chrome, Edge, Firefox, or Brave, or use the built-in browser practice wallet below.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Shield size={18} className="mt-0.5 shrink-0 text-[var(--signal-money)]" />
                <div>
                  <h4 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">
                    2. Back up your recovery phrase
                  </h4>
                  <p className="mt-0.5 mb-0 text-[13px] text-[var(--text-muted)]">
                    Store your 12-word recovery phrase offline when setting up an extension wallet.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Globe size={18} className="mt-0.5 shrink-0 text-[var(--signal-money)]" />
                <div>
                  <h4 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">
                    3. Switch network to {STELLAR_NETWORK_NAME}
                  </h4>
                  <p className="mt-0.5 mb-0 text-[13px] text-[var(--text-muted)]">
                    Open wallet settings and select {STELLAR_NETWORK_NAME}.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  connectTesterWallet();
                  setShowOnboardingModal(false);
                  addToast(
                    `Practice ${STELLAR_NETWORK_NAME === 'TESTNET' ? 'Testnet' : 'Local'} wallet created in this browser. Test XLM can take up to 30 seconds to arrive.`,
                    'success'
                  );
                }}
                className="gp-btn gp-btn-money gp-btn-lg w-full"
              >
                Use {STELLAR_NETWORK_NAME === 'TESTNET' ? 'Testnet' : 'Local'} practice wallet in this browser
              </button>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="https://varialwallet.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gp-btn gp-btn-secondary w-full"
                >
                  Get Varial
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  onClick={() => setShowOnboardingModal(false)}
                  className="gp-btn gp-btn-ghost w-full"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showLedgerModal && (
        <VerificationLedgerModal
          isOpen={showLedgerModal}
          onClose={() => setShowLedgerModal(false)}
        />
      )}
    </header>
  );
};

export default Navbar;
