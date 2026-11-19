import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, QrCode, ScanLine, FileSpreadsheet, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import VerificationLedgerModal from './VerificationLedgerModal';

const MobileBottomNav = () => {
  const { user, activeRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLedger, setShowLedger] = useState(false);

  if (!user) return null;

  const isFreelancer =
    location.pathname === '/freelancer' ||
    (location.pathname !== '/client' && activeRole === 'freelancer');
  const tasksPath = isFreelancer ? '/freelancer' : '/client';
  const isTasksActive = location.pathname === '/client' || location.pathname === '/freelancer';
  const isProfileActive = location.pathname === '/profile';

  const handlePrimaryQrAction = () => {
    const eventName = isFreelancer ? 'gigpay:open-pay-qr' : 'gigpay:open-qr-scanner';
    if (location.pathname !== tasksPath) {
      navigate(tasksPath);
      setTimeout(() => window.dispatchEvent(new CustomEvent(eventName)), 80);
    } else {
      window.dispatchEvent(new CustomEvent(eventName));
    }
  };

  return (
    <>
      <nav
        aria-label="Mobile workspace navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-4 items-center px-2 py-1.5">
          <Link
            to={tasksPath}
            className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-medium no-underline transition-colors ${
              isTasksActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <Briefcase size={19} strokeWidth={isTasksActive ? 2.2 : 1.8} />
            <span>Tasks</span>
          </Link>

          <button
            type="button"
            onClick={handlePrimaryQrAction}
            className="flex min-h-[48px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-0 bg-[var(--signal-money-bg)] text-[12px] font-semibold text-[var(--signal-money-fg)] transition-colors"
          >
            {isFreelancer ? <QrCode size={19} strokeWidth={2.2} /> : <ScanLine size={19} strokeWidth={2.2} />}
            <span>{isFreelancer ? 'Pay QR' : 'Scan QR'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLedger(true)}
            className="flex min-h-[48px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-0 bg-transparent text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <FileSpreadsheet size={19} strokeWidth={1.8} />
            <span>Ledger</span>
          </button>

          <Link
            to="/profile"
            className={`flex min-h-[48px] flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-medium no-underline transition-colors ${
              isProfileActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
            }`}
          >
            <User size={19} strokeWidth={isProfileActive ? 2.2 : 1.8} />
            <span>Profile</span>
          </Link>
        </div>
      </nav>

      {showLedger && <VerificationLedgerModal isOpen={showLedger} onClose={() => setShowLedger(false)} />}
    </>
  );
};

export default MobileBottomNav;
