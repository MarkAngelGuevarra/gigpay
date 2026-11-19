import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  FileCode,
  FileText,
  Video,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  ScanLine,
  X,
} from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import {
  formatStellarError,
  isSimulatedTxHash,
  buildExplorerTxUrl,
  parseXlmToStroops,
  GIGPAY_ESCROW_CONTRACT_ID,
  STELLAR_NETWORK_NAME,
} from '../lib/stellar';
import { isNonEvidenceHash } from '../lib/ledgerIntegrity';
import { safeHttpsUrl } from '../lib/taskLifecycle';
import { peekInvitePayload, clearInvitePayout, shortStellarAddress } from '../lib/invite';
import { getDisputeMetadata } from '../lib/disputeMetadata';
import { findRecentDuplicateLock, duplicateKey } from '../lib/duplicateLock';
import TaskProgress from '../components/TaskProgress';
import QrScannerModal from '../components/QrScannerModal';
import { usePilotFeedbackState, PILOT_FORM_URL } from '../hooks/usePilotFeedbackState';
import { recordStudentToGoogleSheet, isGoogleSheetsSyncEnabled } from '../lib/sheetsSync';
import { isPilotToolsEnabled } from '../lib/env';

const statusBadgeMeta = (status) => {
  switch (status) {
    case 'Completed':
    case 'Paid':
      return { label: 'Paid', cls: 'gp-status gp-status--money' };
    case 'Under Review':
      return { label: 'Under Review', cls: 'gp-status gp-status--warn' };
    case 'Disputed':
      return { label: 'Disputed', cls: 'gp-status gp-status--danger' };
    case 'In Progress':
      return { label: 'In Progress', cls: 'gp-status' };
    case 'Confirming':
      return { label: 'Confirming', cls: 'gp-status gp-status--warn' };
    case 'Failed':
      return { label: 'Failed', cls: 'gp-status gp-status--danger' };
    default:
      return { label: 'Funded', cls: 'gp-status gp-status--money' };
  }
};

const ClientDashboard = () => {
  const { user, publicKey, connectTesterWallet, switchRole, isSimulationMode } = useAuth();
  const { tasks, refreshTasks, addTask, updateTaskStatus, raiseDispute, resolveDispute } = useTasks();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { addToast } = useToast();
  const navigate = useNavigate();
  const pilotToolsEnabled = isPilotToolsEnabled();

  const {
    isCompleted: isPilotCompleted,
    openFormLink,
    markCompleted: markPilotCompleted,
  } = usePilotFeedbackState();

  // Auto-connect practice wallet on mount when needed so mobile sessions stay ready
  useEffect(() => {
    if (!publicKey && typeof connectTesterWallet === 'function') {
      connectTesterWallet();
    }
  }, [publicKey, connectTesterWallet]);

  const [viewAllEscrows, setViewAllEscrows] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [recipientName, setRecipientName] = useState('');

  // Open QR scanner when triggered from MobileBottomNav
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const openScanner = () => setShowQrScanner(true);
    window.addEventListener('gigpay:open-qr-scanner', openScanner);
    return () => window.removeEventListener('gigpay:open-qr-scanner', openScanner);
  }, []);

  const isDemoAccount = isSimulationMode || user?.id === 'demo-client-uuid-001';
  const isOwnTask = (t) =>
    !!user?.id &&
    (t.client_id === user.id ||
      (isDemoAccount && (!t.client_id || String(t.client_id).startsWith('demo-'))));
  const ownTasks = tasks.filter(isOwnTask);
  const clientTasks = viewAllEscrows ? tasks : ownTasks;

  // Metrics count only escrows with verifiable on-chain funding
  const fundedTasks = ownTasks.filter(
    (t) =>
      !t.is_simulated &&
      t.status !== 'Confirming' &&
      t.status !== 'Failed' &&
      (t.on_chain_task_id != null ||
        (/^[0-9a-f]{64}$/.test(t.tx_hash || '') &&
          !isSimulatedTxHash(t.tx_hash) &&
          !isNonEvidenceHash(t.tx_hash)))
  );
  const totalEscrowed = fundedTasks.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const activeEscrows = fundedTasks.filter(
    (t) => t.status === 'In Progress' || t.status === 'Under Review' || t.status === 'Disputed'
  ).length;
  const completedTasks = fundedTasks.filter((t) => t.status === 'Completed' || t.status === 'Paid');
  const totalReleased = completedTasks.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const totalTasksCount = fundedTasks.length;
  const completionPercentage = totalTasksCount > 0 ? Math.round((completedTasks.length / totalTasksCount) * 100) : 0;

  const [isTransacting, setIsTransacting] = useState(false);
  const lockInFlight = useRef(false);
  const actionInFlightRef = useRef(false);
  const duplicateConfirm = useRef({ key: '', until: 0 });
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAmount, setNewTaskAmount] = useState('');
  const [freelancerWallet, setFreelancerWallet] = useState('');

  // Pre-fill from freelancer QR or invite link (?pay=G...&name=...&title=...&amount=...)
  useEffect(() => {
    const invited = peekInvitePayload();
    if (invited?.address) {
      setFreelancerWallet(invited.address);
      if (invited.name) setRecipientName(invited.name);
      if (invited.title) setNewTaskTitle((prev) => prev || invited.title);
      if (invited.amount) setNewTaskAmount((prev) => prev || invited.amount);
      addToast(
        invited.name
          ? `Recipient ${invited.name} loaded from invite link.`
          : "Payout address filled in from your freelancer's invite link. Check it matches what they sent you.",
        'success'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [taskToApprove, setTaskToApprove] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);

  const [taskToDispute, setTaskToDispute] = useState(null);
  const [disputeReason, setDisputeReason] = useState(
    'Deliverables require revision or do not match agreed specification.'
  );

  const closeDisputeModal = () => {
    setTaskToDispute(null);
    setDisputeReason('Deliverables require revision or do not match agreed specification.');
  };

  useEffect(() => {
    if ((!taskToDispute && !taskToApprove) || typeof window === 'undefined') return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isTransacting) {
        if (taskToApprove) setTaskToApprove(null);
        else if (taskToDispute) closeDisputeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [taskToDispute, taskToApprove, isTransacting]);

  const handleQrConfirmed = ({ address, name, title, amount }) => {
    setFreelancerWallet(address);
    setRecipientName(name || '');
    if (title) setNewTaskTitle(title);
    if (amount) setNewTaskAmount(amount);
    addToast(
      name ? `Recipient ${name} verified from QR.` : 'Recipient address verified from QR.',
      'success'
    );
  };

  const initiateApproval = (taskOrId) => {
    if (!publicKey && typeof connectTesterWallet === 'function') {
      connectTesterWallet();
    }
    const taskObj =
      taskOrId && typeof taskOrId === 'object'
        ? taskOrId
        : ownTasks.find((t) => t.id === taskOrId) || { id: taskOrId };
    if (!isOwnTask(taskObj)) {
      addToast('Only the client who funded this escrow can release it.', 'warning');
      return;
    }
    if (taskObj.status === 'Available') {
      addToast('Cannot release escrow: task must first be accepted by a freelancer.', 'warning');
      return;
    }
    setTaskToApprove(taskObj);
    setConfirmText('');
  };

  const handleDisputeSubmit = async () => {
    if (!taskToDispute || isTransacting || actionInFlightRef.current) return;
    if (!ownTasks.some((t) => t.id === taskToDispute)) {
      addToast('Only the client who funded this escrow can dispute it.', 'warning');
      closeDisputeModal();
      return;
    }
    actionInFlightRef.current = true;
    setIsTransacting(true);
    try {
      await raiseDispute(taskToDispute, disputeReason);
      closeDisputeModal();
    } catch (error) {
      addToast(`Failed to raise dispute: ${error.message}`, 'error');
    } finally {
      actionInFlightRef.current = false;
      setIsTransacting(false);
    }
  };

  const handleResolve = async (id) => {
    if (!ownTasks.some((t) => t.id === id) || isTransacting || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setIsTransacting(true);
    try {
      await resolveDispute(id);
    } catch (error) {
      addToast(`Failed to resolve dispute: ${error?.message || error}`, 'error');
    } finally {
      actionInFlightRef.current = false;
      setIsTransacting(false);
    }
  };

  const suggestAmountTimerRef = useRef(null);
  useEffect(
    () => () => {
      if (suggestAmountTimerRef.current) clearTimeout(suggestAmountTimerRef.current);
    },
    []
  );

  const suggestAmount = () => {
    if (!newTaskTitle) {
      addToast('Enter a task title first to get a suggested amount.', 'error');
      return;
    }
    setIsEstimating(true);
    if (suggestAmountTimerRef.current) clearTimeout(suggestAmountTimerRef.current);
    suggestAmountTimerRef.current = setTimeout(() => {
      const words = newTaskTitle.toLowerCase();
      let est = 2;
      if (words.includes('website') || words.includes('app')) est = 5;
      if (words.includes('logo') || words.includes('design')) est = 2;
      if (words.includes('smart contract') || words.includes('blockchain')) est = 10;

      setNewTaskAmount(est.toString());
      setIsEstimating(false);
      addToast(`Suggested Testnet amount for this milestone: ${est} XLM.`, 'success');
    }, 600);
  };

  const handleApprove = async () => {
    if (confirmText !== 'CONFIRM' || !taskToApprove || isTransacting || actionInFlightRef.current) return;
    if (!publicKey && typeof connectTesterWallet === 'function') {
      connectTesterWallet();
    }

    const targetTaskId = taskToApprove.id;
    if (!targetTaskId) {
      addToast('Error: Missing task identifier for milestone release.', 'error');
      return;
    }

    actionInFlightRef.current = true;
    setIsTransacting(true);
    try {
      const result = await updateTaskStatus(targetTaskId, 'Completed');
      const releaseHash = result?.alreadyReleased ? '' : result?.hash || '';
      const taskObj = taskToApprove;
      if (!isDemoAccount && isGoogleSheetsSyncEnabled()) {
        await Promise.race([
          recordStudentToGoogleSheet({
            emailForSourceDetection: user?.email || '',
            programSection: 'Client (Milestone Payout Released)',
            walletAddress: typeof publicKey === 'string' ? publicKey : publicKey?.address || 'N/A',
            taskTitle: taskObj?.title || 'Milestone Escrow Release',
            amount: String(taskObj?.amount || '2.0'),
            releaseTxHash: releaseHash,
            feedbackSubmitted: false,
          }),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
      setTaskToApprove(null);
      setConfirmText('');
      if (isDemoAccount || result?.isDemo) {
        addToast('Simulation only: task marked Completed in this browser. No payment was sent on Stellar.', 'info');
      } else if (!result?.alreadyReleased && !result?.hash) {
        addToast(
          `Release submitted. The task card shows its status on ${STELLAR_NETWORK_NAME === 'TESTNET' ? 'Stellar Testnet' : 'Stellar Local'}.`,
          'info'
        );
      }
    } catch (error) {
      const formatted = formatStellarError(error);
      const isWarning = formatted.includes('rejected') || formatted.includes('declined');
      addToast(formatted, isWarning ? 'warning' : 'error');
    } finally {
      actionInFlightRef.current = false;
      setIsTransacting(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const trimmedTitle = newTaskTitle.trim();
    if (!trimmedTitle || !newTaskAmount) {
      if (newTaskTitle && !trimmedTitle) {
        addToast('Enter a task title before locking funds in escrow.', 'warning');
      }
      return;
    }

    try {
      parseXlmToStroops(newTaskAmount);
    } catch (amountErr) {
      addToast(amountErr.message || 'Enter a valid positive amount in XLM.', 'warning');
      return;
    }

    if (/^G[A-Z2-7]{55}$/.test(trimmedTitle)) {
      if (!freelancerWallet.trim()) {
        setFreelancerWallet(trimmedTitle);
        addToast(
          'That looks like a payout address, not a title. It is now in Freelancer\'s Payout Address; enter a short task title like "Logo design".',
          'warning'
        );
      } else {
        addToast('That looks like a payout address, not a title. Enter a short task title like "Logo design".', 'warning');
      }
      return;
    }

    if (!isDemoAccount && !freelancerWallet.trim()) {
      addToast("Enter your freelancer's payout address (starts with G, 56 characters) or scan their Pay QR.", 'warning');
      return;
    }

    const safeClientKey = typeof publicKey === 'string' ? publicKey.trim() : publicKey?.address?.trim() || '';
    if (freelancerWallet && safeClientKey && freelancerWallet.trim() === safeClientKey) {
      addToast('Self-dealing prevented: Client and Freelancer wallets cannot be identical.', 'warning');
      return;
    }

    if (lockInFlight.current) return;

    if (!isDemoAccount) {
      const recent = findRecentDuplicateLock(ownTasks, { freelancerWallet, amount: newTaskAmount });
      const key = duplicateKey(freelancerWallet, newTaskAmount);
      const confirmed = duplicateConfirm.current.key === key && Date.now() < duplicateConfirm.current.until;
      if (recent && !confirmed) {
        duplicateConfirm.current = { key, until: Date.now() + 60 * 1000 };
        const ref = recent.on_chain_task_id ? ` (escrow #${recent.on_chain_task_id})` : '';
        addToast(
          `You already locked ${recent.amount} XLM for this freelancer a few minutes ago${ref}; it is in your task list. Only if you want a second escrow, tap Lock Funds in Escrow again.`,
          'warning'
        );
        return;
      }
      duplicateConfirm.current = { key: '', until: 0 };
    }

    lockInFlight.current = true;
    setIsTransacting(true);
    try {
      const newTask = {
        title: trimmedTitle,
        amount: newTaskAmount,
        freelancer_wallet: freelancerWallet.trim() || undefined,
      };
      const created = await addTask(newTask);
      clearInvitePayout();
      setNewTaskTitle('');
      setNewTaskAmount('');
      setFreelancerWallet('');
      setRecipientName('');
      if (isDemoAccount || created?.isDemo) {
        addToast('Simulation only: practice task saved in this browser. Nothing was sent to Stellar.', 'info');
      } else if (!created?.hash && !created?.isPending) {
        addToast(
          `Funding sent. It is confirming on ${STELLAR_NETWORK_NAME === 'TESTNET' ? 'Stellar Testnet' : 'Stellar Local'} (about 5 seconds).`,
          'info'
        );
      }
    } catch (error) {
      const formatted = formatStellarError(error);
      const isWarning =
        formatted.includes('rejected') ||
        formatted.includes('declined') ||
        formatted.includes('Self-dealing') ||
        formatted.includes('Insufficient balance');
      addToast(formatted, isWarning ? 'warning' : 'error');
    } finally {
      lockInFlight.current = false;
      setIsTransacting(false);
    }
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      {/* Action-First Workspace Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Client Workspace
          </h1>
          <p className="mt-1 mb-0 text-[14px] text-[var(--text-muted)]">
            Scan a freelancer QR, lock milestone funds on Stellar Testnet, and release on approval.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="gp-segmented" role="tablist" aria-label="Escrow visibility filter">
            <button
              type="button"
              role="tab"
              aria-selected={!viewAllEscrows}
              onClick={() => setViewAllEscrows(false)}
              className="gp-segmented-btn"
            >
              My escrows
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewAllEscrows}
              onClick={() => setViewAllEscrows(true)}
              className="gp-segmented-btn"
            >
              All escrows
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowQrScanner(true)}
            className="gp-btn gp-btn-money"
          >
            <ScanLine size={16} />
            Scan QR
          </button>

          {user?.is_simulation_mode && (
            <button
              type="button"
              onClick={() => {
                switchRole('freelancer');
                addToast('Switched to Freelancer mode.', 'info');
                navigate('/freelancer');
              }}
              className="gp-btn gp-btn-secondary"
            >
              Freelancer view
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Compact Unified Metric Strip (visible on both desktop and mobile) */}
      <div className="client-metrics grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] lg:grid-cols-4">
        <div className="bg-[var(--bg-surface)] p-4 sm:p-5">
          <div className="text-[12.5px] font-medium text-[var(--text-muted)]">Escrowed on-chain</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">
            {totalEscrowed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}{' '}
            <span className="text-[13px] font-medium text-[var(--text-muted)]">XLM</span>
          </div>
        </div>
        <div className="bg-[var(--bg-surface)] p-4 sm:p-5">
          <div className="text-[12.5px] font-medium text-[var(--text-muted)]">Active escrows</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">
            {activeEscrows}
          </div>
        </div>
        <div className="bg-[var(--bg-surface)] p-4 sm:p-5">
          <div className="text-[12.5px] font-medium text-[var(--text-muted)]">Released on-chain</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--signal-money-fg)] tabular-nums">
            {totalReleased.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}{' '}
            <span className="text-[13px] font-medium text-[var(--text-muted)]">XLM</span>
          </div>
        </div>
        <div className="bg-[var(--bg-surface)] p-4 sm:p-5">
          <div className="text-[12.5px] font-medium text-[var(--text-muted)]">Completion rate</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">
            {completionPercentage}%
          </div>
        </div>
      </div>

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: Milestone Feed */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">
              {viewAllEscrows ? 'All escrows (read-only)' : 'Your escrows'}
            </h2>
            <button
              type="button"
              className="gp-btn gp-btn-secondary"
              data-testid="refresh-tasks"
              disabled={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                const ok = await refreshTasks();
                setIsRefreshing(false);
                addToast(
                  ok ? 'Tasks refreshed.' : "Couldn't refresh. Check your connection and try again.",
                  ok ? 'success' : 'warning'
                );
              }}
            >
              <RotateCcw size={14} />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {clientTasks.length === 0 && (
            <div className="gp-card flex flex-col gap-4 p-6">
              <div>
                <h3 className="m-0 text-base font-semibold text-[var(--text-primary)]">No active escrows yet</h3>
                <p className="mt-1.5 mb-0 text-[14px] text-[var(--text-muted)]">
                  Scan a freelancer&apos;s Pay QR card or enter their Stellar Testnet address on the right to lock your first milestone. Practice XLM only.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowQrScanner(true)}
                  className="gp-btn gp-btn-primary"
                >
                  <ScanLine size={15} />
                  Scan freelancer QR
                </button>
                {pilotToolsEnabled && (
                  <>
                    <button
                      type="button"
                      className="gp-btn gp-btn-secondary"
                      onClick={() => {
                        setNewTaskTitle('Sample task: poster design');
                        setNewTaskAmount('2');
                        addToast('Sample task loaded. Tap Lock Funds in Escrow when ready.', 'success');
                      }}
                    >
                      Fill Sample Task (2 XLM)
                    </button>
                    {isPilotCompleted ? (
                      <span className="gp-status gp-status--money">
                        <CheckCircle2 size={14} />
                        Feedback sent
                      </span>
                    ) : (
                      <>
                        <a
                          href={PILOT_FORM_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => openFormLink('client_card_clicked')}
                          className="gp-btn gp-btn-secondary"
                        >
                          Submit 60s Pilot Feedback
                          <ExternalLink size={13} />
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            markPilotCompleted();
                            addToast('Thanks for your feedback.', 'success');
                          }}
                          className="gp-btn gp-btn-ghost"
                        >
                          <CheckCircle2 size={14} />
                          I&apos;ve Completed It
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {clientTasks.map((task) => {
            const isDisputed = task.status === 'Disputed';
            const dispute = getDisputeMetadata(task, user?.id);
            const safeGithubUrl = safeHttpsUrl(task.github_pr_url);
            const safeDocUrl = safeHttpsUrl(task.doc_url);
            const safeLoomUrl = safeHttpsUrl(task.loom_url);
            const hasProof = task.proof_attached || safeGithubUrl || safeDocUrl || safeLoomUrl;
            const isMine = isOwnTask(task);
            const hasRealFundTx =
              !task.is_simulated &&
              task.status !== 'Failed' &&
              !isSimulatedTxHash(task.tx_hash) &&
              !isNonEvidenceHash(task.tx_hash);
            const badge = statusBadgeMeta(task.status);
            const explorerTxUrl = hasRealFundTx ? buildExplorerTxUrl(task.tx_hash) : null;

            return (
              <article
                key={task.id}
                className={`gp-card flex flex-col gap-4 p-5 ${isDisputed ? 'gp-card--disputed' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="m-0 text-base font-semibold text-[var(--text-primary)]">{task.title}</h3>
                      <span className={badge.cls}>
                        <span className="gp-status-dot" />
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--text-muted)]">
                      <span>
                        Freelancer: {task.freelancer_id ? `${task.freelancer_id.slice(0, 8)}…` : 'Unassigned'}
                      </span>
                      {task.freelancer_wallet && (
                        <span className="gp-mono">{shortStellarAddress(task.freelancer_wallet)}</span>
                      )}
                      {explorerTxUrl && (
                        <a
                          href={explorerTxUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[var(--signal-money-fg)] no-underline hover:underline"
                        >
                          Stellar Expert
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`gp-amount text-xl ${
                        isDisputed ? 'gp-amount--danger' : 'gp-amount--money'
                      }`}
                    >
                      {task.amount} XLM
                    </div>
                    {!isMine && (
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">View only</div>
                    )}
                  </div>
                </div>

                {/* App-level dispute notice */}
                {isDisputed && (
                  <div className="rounded-xl border border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)] p-3.5 text-[13px]">
                    <div className="flex items-center gap-2 font-semibold text-[var(--signal-danger)]">
                      <AlertTriangle size={15} />
                      Release paused (app-level, disputed)
                    </div>
                    <div className="mt-1.5 text-[var(--text-primary)]">
                      <strong>Reason:</strong> {task.dispute_reason || 'Not recorded'}
                    </div>
                    <div data-testid="dispute-metadata" className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                      <strong>Disputed:</strong> {dispute.raisedAt || 'time not recorded'} by {dispute.raisedBy}
                    </div>
                    <p className="mt-1.5 mb-0 text-[12.5px] text-[var(--text-muted)]">
                      Release stays paused until the client who raised the dispute resolves it.
                    </p>
                  </div>
                )}

                {!isDisputed && dispute.resolvedAt && (
                  <div
                    data-testid="dispute-history"
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3.5 py-2.5 text-[12.5px] text-[var(--text-muted)]"
                  >
                    <strong>Dispute history:</strong> disputed {dispute.raisedAt || '(time not recorded)'} by{' '}
                    {dispute.raisedBy}
                    {task.dispute_reason ? ` ("${task.dispute_reason}")` : ''}; resolved {dispute.resolvedAt}.
                  </div>
                )}

                {/* Attached Proof of Work */}
                {hasProof && (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--signal-money-fg)]">
                      <CheckCircle2 size={14} />
                      Deliverables submitted for review
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {safeGithubUrl && (
                        <a href={safeGithubUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-secondary !min-h-[34px] !px-3 !text-[12.5px]">
                          <FileCode size={13} />
                          Inspect GitHub PR
                          <ExternalLink size={11} />
                        </a>
                      )}
                      {safeDocUrl && (
                        <a href={safeDocUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-secondary !min-h-[34px] !px-3 !text-[12.5px]">
                          <FileText size={13} />
                          Inspect Document
                          <ExternalLink size={11} />
                        </a>
                      )}
                      {safeLoomUrl && (
                        <a href={safeLoomUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-secondary !min-h-[34px] !px-3 !text-[12.5px]">
                          <Video size={13} />
                          Watch Loom Demo
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    {task.submission_notes && (
                      <p className="mt-2.5 mb-0 border-t border-[var(--border-subtle)] pt-2 text-[13px] text-[var(--text-secondary)]">
                        <strong>Note:</strong> {task.submission_notes}
                      </p>
                    )}
                  </div>
                )}

                <TaskProgress status={task.status} />

                {/* Action Footer */}
                {isMine && (task.status === 'In Progress' || task.status === 'Under Review' || task.status === 'Available') && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5">
                    <span className="text-[12.5px] text-[var(--text-muted)]">
                      {task.status === 'Available'
                        ? 'Waiting for freelancer to accept milestone.'
                        : !hasProof
                          ? 'Waiting for deliverables before release.'
                          : 'Deliverables ready for review.'}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {(task.status === 'In Progress' || task.status === 'Under Review') && (
                        <button
                          type="button"
                          className="gp-btn gp-btn-danger"
                          onClick={() => setTaskToDispute(task.id)}
                          disabled={isTransacting}
                          title="Pause release in GigPay (app-level) and log a dispute"
                        >
                          <AlertTriangle size={13} />
                          Pause Release &amp; Dispute
                        </button>
                      )}
                      <button
                        type="button"
                        className={`gp-btn ${task.status === 'Available' ? 'gp-btn-secondary' : 'gp-btn-money'}`}
                        onClick={() => initiateApproval(task)}
                        disabled={isTransacting || task.status === 'Available'}
                        title={
                          task.status === 'Available'
                            ? 'Cannot release escrow before task is accepted by a freelancer'
                            : undefined
                        }
                      >
                        <CheckCircle size={14} />
                        {isTransacting ? 'Processing…' : 'Approve & Release'}
                      </button>
                    </div>
                  </div>
                )}

                {isMine && isDisputed && (
                  <div className="flex justify-end border-t border-[var(--border-subtle)] pt-3.5">
                    <button
                      type="button"
                      className="gp-btn gp-btn-money"
                      disabled={isTransacting}
                      onClick={() => handleResolve(task.id)}
                    >
                      <RotateCcw size={13} />
                      Resolve Dispute
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* Right: Lock New Escrow Sheet / Panel */}
        <aside className="gp-card create-task-panel order-first p-5 sm:p-6 lg:sticky lg:top-20 lg:order-none">
          <div className="mb-5 flex items-center justify-between gap-2">
            <div>
              <h2 className="m-0 text-base font-semibold text-[var(--text-primary)]">Lock New Escrow</h2>
              <p className="mt-0.5 mb-0 text-[12.5px] text-[var(--text-muted)]">0% GigPay commission</p>
            </div>
            <button
              type="button"
              onClick={() => setShowQrScanner(true)}
              className="gp-btn gp-btn-secondary !min-h-[36px] !px-3 !text-[12.5px]"
            >
              <ScanLine size={14} />
              Scan QR
            </button>
          </div>

          {recipientName && freelancerWallet.trim() && (
            <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-[var(--signal-money-border)] bg-[var(--signal-money-bg)] px-3.5 py-2.5 text-[13px]">
              <div className="min-w-0">
                <div className="font-semibold text-[var(--text-primary)]">{recipientName}</div>
                <div className="gp-mono text-[12px] text-[var(--signal-money-fg)]">
                  {shortStellarAddress(freelancerWallet)}
                </div>
              </div>
              <CheckCircle2 size={16} className="shrink-0 text-[var(--signal-money)]" />
            </div>
          )}

          <form className="flex flex-col gap-4" onSubmit={handleCreateTask}>
            <div className="gp-field">
              <label htmlFor="client-task-title" className="gp-label">
                Task Title
              </label>
              <input
                id="client-task-title"
                type="text"
                placeholder="e.g., Landing page UI"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="gp-input"
                required
              />
            </div>

            <div className="gp-field">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="client-task-amount" className="gp-label">
                  Milestone Amount (XLM)
                </label>
                <button
                  type="button"
                  onClick={suggestAmount}
                  disabled={isEstimating}
                  className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-medium text-[var(--signal-money-fg)] hover:underline"
                >
                  <Sparkles size={13} />
                  {isEstimating ? 'Suggesting…' : 'Suggest amount'}
                </button>
              </div>
              <input
                id="client-task-amount"
                type="number"
                placeholder="e.g., 5"
                min="0.1"
                step="any"
                value={newTaskAmount}
                onChange={(e) => setNewTaskAmount(e.target.value)}
                className="gp-input tabular-nums"
                required
              />
            </div>

            <div className="gp-field">
              <label htmlFor="client-freelancer-wallet" className="gp-label">
                Freelancer&apos;s Payout Address
              </label>
              <input
                id="client-freelancer-wallet"
                type="text"
                placeholder="Scan QR or paste G... address"
                value={freelancerWallet}
                onChange={(e) => {
                  setFreelancerWallet(e.target.value);
                  if (recipientName) setRecipientName('');
                }}
                required={!isDemoAccount}
                className="gp-input gp-mono text-[13px]"
              />
              <p className="gp-hint">
                {freelancerWallet.trim()
                  ? 'Funds lock strictly for this recipient address. Verify it matches your freelancer.'
                  : isDemoAccount
                    ? 'Demo mode: leave blank to use an offline practice recipient.'
                    : 'Scan their Pay QR card above or paste their 56-character Stellar address.'}
              </p>
              {freelancerWallet.trim() && (
                <code
                  data-testid="fund-payout-address"
                  className="gp-mono mt-1 block break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2.5 py-2 text-[12px] text-[var(--text-primary)]"
                >
                  {freelancerWallet.trim()}
                </code>
              )}
            </div>

            {newTaskAmount && Number(newTaskAmount) > 0 && (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5 text-[13px]">
                <div className="flex items-center justify-between text-[var(--text-muted)]">
                  <span>Typical 20% platform cut</span>
                  <span className="text-[var(--signal-danger)] tabular-nums">
                    -{(Number(newTaskAmount) * 0.2).toFixed(2)} XLM
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[var(--text-muted)]">
                  <span>Stellar network fee (lock + release)</span>
                  <span className="tabular-nums">~0.06 XLM</span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 font-semibold text-[var(--text-primary)]">
                  <span>Freelancer receives (0% fee)</span>
                  <span className="text-[var(--signal-money-fg)] tabular-nums">
                    {Number(newTaskAmount).toFixed(2)} XLM
                  </span>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="gp-btn gp-btn-money gp-btn-lg mt-1 w-full"
              disabled={isTransacting}
            >
              <PlusCircle size={18} />
              {isTransacting ? 'Locking payment…' : 'Lock Funds in Escrow'}
            </button>
          </form>
        </aside>
      </div>

      {/* QR Ph-Grade Scanner Modal */}
      <QrScannerModal
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onConfirm={handleQrConfirmed}
      />

      {/* Raise Escrow Dispute Sheet */}
      {taskToDispute && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Raise Escrow Dispute"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTransacting) closeDisputeModal();
          }}
          className="gp-modal-backdrop"
          style={{ position: 'fixed', padding: '1rem' }}
        >
          <div
            className="gp-modal border-[var(--signal-danger-border)]"
            style={{ width: '100%', maxWidth: 'min(450px, calc(100vw - 2rem))', boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { if (!isTransacting) closeDisputeModal(); }}
              aria-label="Close dispute dialog"
              className="gp-modal-close"
            >
              <X size={18} />
            </button>

            <h3 className="m-0 flex items-center gap-2 pr-8 text-lg font-semibold text-[var(--signal-danger)]">
              <AlertTriangle size={19} />
              Raise Escrow Dispute
            </h3>
            <p className="mt-2 mb-4 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
              Pauses release in GigPay (app-level). The Soroban v1 contract has no on-chain dispute state; funds remain locked until the client releases them. Reason and timestamp are logged to the task record.
            </p>

            <div className="gp-field">
              <label htmlFor="client-dispute-reason" className="gp-label">
                Dispute Reason / Required Revisions
              </label>
              <textarea
                id="client-dispute-reason"
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                disabled={isTransacting}
                className="gp-textarea"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="gp-btn gp-btn-secondary"
                onClick={() => { if (!isTransacting) closeDisputeModal(); }}
                disabled={isTransacting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gp-btn gp-btn-danger"
                onClick={handleDisputeSubmit}
                disabled={isTransacting}
              >
                {isTransacting ? 'Submitting…' : 'Confirm Dispute (Pause Release)'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Milestone Release Confirmation Sheet (Strict uppercase CONFIRM guard preserved) */}
      {taskToApprove && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Milestone Release Confirmation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTransacting) setTaskToApprove(null);
          }}
          className="gp-modal-backdrop"
          style={{ position: 'fixed', padding: '1rem' }}
        >
          <div
            className="gp-modal border-[var(--signal-money-border)]"
            style={{ width: '100%', maxWidth: 'min(450px, calc(100vw - 2rem))', boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { if (!isTransacting) setTaskToApprove(null); }}
              aria-label="Close release confirmation"
              className="gp-modal-close"
            >
              <X size={18} />
            </button>

            <h3 className="m-0 flex items-center gap-2 pr-8 text-lg font-semibold text-[var(--signal-money-fg)]">
              <CheckCircle size={20} />
              Milestone Release Confirmation
            </h3>
            <p className="mt-2 mb-4 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
              Releases locked funds from Soroban contract{' '}
              <code className="gp-mono text-[var(--text-primary)]">
                {GIGPAY_ESCROW_CONTRACT_ID.slice(0, 6)}…{GIGPAY_ESCROW_CONTRACT_ID.slice(-4)}
              </code>{' '}
              directly to the freelancer. This on-chain settlement is <strong>irreversible</strong>.
            </p>

            {taskToApprove?.title && (
              <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5">
                <div className="text-[13.5px] font-medium text-[var(--text-secondary)]">{taskToApprove.title}</div>
                <div className="gp-amount gp-amount--money mt-1 text-2xl">
                  {taskToApprove.amount} XLM
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                  0% GigPay commission · 100% paid directly to recipient
                </div>
              </div>
            )}

            <div className="mb-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5 text-[12.5px]">
              <div className="mb-1 font-medium text-[var(--text-muted)]">Recipient payout address</div>
              {taskToApprove?.freelancer_wallet ? (
                <code
                  data-testid="release-payout-address"
                  className="gp-mono block break-all text-[12.5px] text-[var(--text-primary)]"
                >
                  {taskToApprove.freelancer_wallet}
                </code>
              ) : (
                <span className="text-[var(--signal-warn)]">
                  Not stored with this task (demo or legacy row). On-chain escrows always pay the address set when funded.
                </span>
              )}
            </div>

            <div className="gp-field">
              <label htmlFor="confirm-release-input" className="gp-label">
                Type <strong>CONFIRM</strong> to authorize release
              </label>
              <input
                id="confirm-release-input"
                type="text"
                aria-label="Type CONFIRM to release the payment"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="CONFIRM"
                disabled={isTransacting}
                className="gp-input gp-mono tracking-wider"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="gp-btn gp-btn-secondary"
                onClick={() => { if (!isTransacting) setTaskToApprove(null); }}
                disabled={isTransacting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="gp-btn gp-btn-money"
                onClick={handleApprove}
                disabled={confirmText !== 'CONFIRM' || isTransacting}
              >
                {isTransacting ? 'Releasing…' : 'Release Escrow Payout'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ClientDashboard;
