import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  CheckCircle,
  ShieldAlert,
  FileCode,
  Video,
  FileText,
  UploadCloud,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Share2,
  QrCode,
  RotateCcw,
} from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isDemoWallet, isSimulatorWallet, buildExplorerAccountUrl } from '../lib/stellar';
import { isNonEvidenceHash, describePayout, onChainEarnings } from '../lib/ledgerIntegrity';
import { safeHttpsUrl } from '../lib/taskLifecycle';
import { buildInviteLink, shortStellarAddress } from '../lib/invite';
import TaskProgress from '../components/TaskProgress';
import PayQrModal from '../components/PayQrModal';
import { usePilotFeedbackState, PILOT_FORM_URL } from '../hooks/usePilotFeedbackState';
import { getDisputeMetadata } from '../lib/disputeMetadata';
import { isPilotToolsEnabled } from '../lib/env';

const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

const FreelancerDashboard = () => {
  const { user, publicKey, switchRole, isSimulationMode } = useAuth();
  const { tasks, refreshTasks, updateTaskStatus, submitProofOfWork } = useTasks();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPayQrModal, setShowPayQrModal] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const { addToast } = useToast();
  const navigate = useNavigate();
  const pilotToolsEnabled = isPilotToolsEnabled();

  const {
    isCompleted: isPilotCompleted,
    openFormLink,
    markCompleted: markPilotCompleted,
  } = usePilotFeedbackState();

  // Open Pay QR modal when triggered from MobileBottomNav
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const openQr = () => setShowPayQrModal(true);
    window.addEventListener('gigpay:open-pay-qr', openQr);
    return () => window.removeEventListener('gigpay:open-pay-qr', openQr);
  }, []);

  // Load freelancer display name quietly for the branded QR Ph Save-to-Photos card
  useEffect(() => {
    let active = true;
    const fallbackName =
      user?.user_metadata?.display_name ||
      (user?.email ? user.email.split('@')[0] : '');

    if (!user?.id || isSimulationMode || !isUuid(user.id)) {
      setDisplayName(fallbackName);
      return undefined;
    }

    try {
      const profileQuery = supabase?.from?.('profiles')?.select?.('display_name');
      if (typeof profileQuery?.eq === 'function') {
        Promise.resolve(profileQuery.eq('id', user.id).single())
          .then(({ data } = {}) => {
            if (!active) return;
            setDisplayName(data?.display_name?.trim() || fallbackName);
          })
          .catch(() => {
            if (active) setDisplayName(fallbackName);
          });
      } else {
        setDisplayName(fallbackName);
      }
    } catch {
      if (active) setDisplayName(fallbackName);
    }

    return () => {
      active = false;
    };
  }, [user?.id, user?.email, user?.user_metadata?.display_name, isSimulationMode]);

  const isMine = (t) => !!publicKey && t.freelancer_wallet === publicKey;
  const availableTasks = tasks
    .filter((t) => t.status === 'Available')
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)));
  const acceptedTasks = tasks.filter(
    (t) =>
      (t.status === 'In Progress' || t.status === 'Under Review' || t.status === 'Disputed') &&
      (t.freelancer_id === user?.id || (isSimulationMode && t.freelancer_id === 'demo-freelancer-uuid-002'))
  );

  const earnings = onChainEarnings(tasks, publicKey);
  const totalEarned = Number(earnings.total.toFixed(7));

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);
  const acceptInFlightRef = useRef(false);
  const powInFlightRef = useRef(false);

  const [expandedPoWTask, setExpandedPoWTask] = useState(null);
  const [githubPrUrl, setGithubPrUrl] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [loomUrl, setLoomUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmittingPoW, setIsSubmittingPoW] = useState(false);

  const togglePowForm = (task) => {
    if (isSubmittingPoW || powInFlightRef.current) return;
    if (!task || expandedPoWTask === task.id) {
      setExpandedPoWTask(null);
      setGithubPrUrl('');
      setDocUrl('');
      setLoomUrl('');
      setSubmissionNotes('');
      return;
    }
    setExpandedPoWTask(task.id);
    setDocUrl(task.doc_url || '');
    setGithubPrUrl(task.github_pr_url || '');
    setLoomUrl(task.loom_url || '');
    setSubmissionNotes(task.submission_notes || '');
  };

  const handleAcceptWork = async (id) => {
    if (acceptInFlightRef.current || isAccepting) return;
    acceptInFlightRef.current = true;
    setIsAccepting(true);
    setAcceptingTaskId(id);
    try {
      await updateTaskStatus(id, 'In Progress', true);
      addToast(
        isSimulationMode
          ? 'Simulation only: task accepted in this browser. Nothing is locked on Stellar Testnet.'
          : 'Task accepted. Funds stay locked in Soroban escrow until your client approves release.',
        isSimulationMode ? 'info' : 'success'
      );
    } catch (err) {
      addToast(`Failed to accept task: ${err?.message || err}`, 'error');
    } finally {
      acceptInFlightRef.current = false;
      setIsAccepting(false);
      setAcceptingTaskId(null);
    }
  };

  const handleSubmitProof = async (taskId) => {
    if (powInFlightRef.current || isSubmittingPoW) return;
    const finalDocUrl = docUrl ? docUrl.trim() : '';
    const finalGithubUrl = githubPrUrl ? githubPrUrl.trim() : '';
    const finalLoomUrl = loomUrl ? loomUrl.trim() : '';
    const finalNotes = submissionNotes ? submissionNotes.trim() : '';

    if (!finalGithubUrl && !finalDocUrl && !finalLoomUrl) {
      addToast(
        'Add at least one deliverable link (Document, GitHub PR, or Loom walkthrough). Notes are optional.',
        'warning'
      );
      return;
    }
    const badLink = [finalGithubUrl, finalDocUrl, finalLoomUrl].find(
      (u) => u && (!/^https:\/\//i.test(u) || !safeHttpsUrl(u))
    );
    if (badLink) {
      addToast('Deliverable links must be valid https:// URLs so your client can open them safely.', 'warning');
      return;
    }

    powInFlightRef.current = true;
    setIsSubmittingPoW(true);
    try {
      await submitProofOfWork(taskId, {
        githubPrUrl: finalGithubUrl,
        docUrl: finalDocUrl,
        loomUrl: finalLoomUrl,
        notes: finalNotes || 'Completed milestone deliverables per project requirements.',
      });
      setExpandedPoWTask(null);
      setGithubPrUrl('');
      setDocUrl('');
      setLoomUrl('');
      setSubmissionNotes('');
    } catch (err) {
      addToast(`Failed to submit proof of work: ${err.message}`, 'error');
    } finally {
      powInFlightRef.current = false;
      setIsSubmittingPoW(false);
    }
  };

  const handleQuickShareLink = async () => {
    if (!publicKey || isDemoWallet(publicKey)) {
      setShowPayQrModal(true);
      return;
    }
    const link = buildInviteLink(publicKey, { name: displayName });
    try {
      if (navigator.share) {
        await navigator.share({
          title: displayName ? `Pay ${displayName} on GigPay` : 'Pay me on GigPay',
          text: 'Lock milestone funds in GigPay escrow:',
          url: link,
        });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(link);
      addToast('Invite link copied. Send it to your client to pre-fill your payout address.', 'success');
    } catch {
      addToast(`Send your client this link: ${link}`, 'warning');
    }
  };

  const hasShareableWallet = Boolean(publicKey && !isDemoWallet(publicKey));
  const explorerAccountUrl = hasShareableWallet ? buildExplorerAccountUrl(publicKey) : null;

  return (
    <div className="animate-fade-in flex flex-col gap-6">
      {/* Action-First Workspace Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Freelancer Workspace
          </h1>
          <p className="mt-1 mb-0 text-[14px] text-[var(--text-muted)]">
            Share your Pay QR, accept funded milestones, and submit deliverables to settle in five seconds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPayQrModal(true)}
            data-testid="show-invite-qr"
            className="gp-btn gp-btn-primary"
          >
            <QrCode size={16} />
            My Pay QR
          </button>
          {hasShareableWallet && (
            <button type="button" onClick={handleQuickShareLink} className="gp-btn gp-btn-secondary">
              <Share2 size={15} />
              Share link
            </button>
          )}

          {user?.is_simulation_mode && (
            <button
              type="button"
              onClick={() => {
                switchRole('client');
                addToast('Switched to Client mode.', 'info');
                navigate('/client');
              }}
              className="gp-btn gp-btn-secondary"
            >
              <ArrowLeft size={14} />
              Client view
            </button>
          )}
        </div>
      </div>

      {/* Compact Earnings & Payout Strip */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--border-subtle)] md:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,1.4fr)]">
        <div className="bg-[var(--bg-surface)] p-5">
          <div className="text-[12.5px] font-medium text-[var(--text-muted)]">Total Earned (paid on-chain)</div>
          <div className="gp-amount gp-amount--money mt-1 text-3xl">
            {totalEarned}{' '}
            <span className="text-[14px] font-medium text-[var(--text-muted)]">XLM</span>
          </div>
          <p className="mt-1 mb-0 text-[12.5px] text-[var(--text-muted)]">
            {earnings.count > 0
              ? `From ${earnings.count} escrow${earnings.count === 1 ? '' : 's'} released to your wallet.`
              : 'Released escrows appear here.'}
          </p>
        </div>

        <div className="bg-[var(--bg-surface)] p-5">
          <div className="text-[12.5px] font-medium text-[var(--text-muted)]">Active Escrows</div>
          <div className="gp-amount mt-1 text-3xl">{acceptedTasks.length}</div>
          {hasShareableWallet && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
              <span className="gp-mono">{shortStellarAddress(publicKey)}</span>
              {isSimulatorWallet(publicKey) && <span>· Practice</span>}
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-3 bg-[var(--bg-surface)] p-5">
          <div>
            <div className="text-[13px] font-semibold text-[var(--text-primary)]">Where your payment goes</div>
            <p className="mt-1 mb-0 text-[13px] leading-relaxed text-[var(--text-muted)]">
              Approved payments go straight to your Stellar Testnet address. Testnet XLM is practice money with no cash value; bank or GCash withdrawal is not part of this pilot.
            </p>
          </div>
          {explorerAccountUrl && (
            <div>
              <a
                href={explorerAccountUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--signal-money-fg)] no-underline hover:underline"
              >
                <Wallet size={14} />
                Check balance on Stellar Expert
                <ExternalLink size={12} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Pilot Feedback Banner (strictly gated behind VITE_ENABLE_PILOT_TOOLS) */}
      {pilotToolsEnabled && !isPilotCompleted && (
        <div className="gp-card flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <div className="text-[14px] font-semibold text-[var(--text-primary)]">Early Tester Feedback</div>
            <p className="mt-0.5 mb-0 text-[13px] text-[var(--text-muted)]">
              Completed an escrow run? Share quick feedback to help refine GigPay.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={PILOT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => openFormLink('freelancer_card_clicked')}
              className="gp-btn gp-btn-primary"
            >
              Complete 60s Form
              <ExternalLink size={13} />
            </a>
            <button
              type="button"
              onClick={() => {
                markPilotCompleted();
                addToast('Thanks for your feedback.', 'success');
              }}
              className="gp-btn gp-btn-secondary"
            >
              <CheckCircle2 size={14} />
              I&apos;ve Completed It
            </button>
          </div>
        </div>
      )}

      {/* Available Funded Tasks */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">Available Funded Tasks</h2>
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

        {availableTasks.length === 0 ? (
          <div className="gp-card flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <h3 className="m-0 text-base font-semibold text-[var(--text-primary)]">No funded tasks waiting</h3>
              <p className="mt-1 mb-0 text-[14px] text-[var(--text-muted)]">
                Share your Pay QR card so a client can lock funds straight to your wallet. New escrows sync automatically.
              </p>
            </div>
            {hasShareableWallet && (
              <button
                type="button"
                onClick={() => setShowPayQrModal(true)}
                className="gp-btn gp-btn-primary"
              >
                <QrCode size={15} />
                Open My Pay QR
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {availableTasks.map((task) => {
              const payout = describePayout(task, publicKey);
              const fundedOnChain = !isNonEvidenceHash(task.tx_hash) && !task.is_simulated;
              const paysMe = isMine(task);
              return (
                <article key={task.id} className="gp-card flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="m-0 text-base font-semibold text-[var(--text-primary)]">{task.title}</h4>
                        {paysMe && (
                          <span className="gp-status gp-status--money !text-[12px]">
                            <span className="gp-status-dot" />
                            Reserved for your wallet
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[13px] text-[var(--text-muted)]">
                        Client: {task.client_id ? `${task.client_id.slice(0, 8)}…` : 'Unknown'}
                      </div>
                      <p
                        className={`mt-1 mb-0 text-[13px] ${
                          payout.canAccept ? 'text-[var(--signal-money-fg)]' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {payout.text}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="text-right">
                        <div className={`gp-amount text-lg ${fundedOnChain ? 'gp-amount--money' : ''}`}>
                          {task.amount} XLM
                        </div>
                        <div className="text-[12px] text-[var(--text-muted)]">
                          {fundedOnChain ? 'Locked on-chain' : 'Not funded on-chain'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={payout.canAccept ? 'gp-btn gp-btn-primary' : 'gp-btn gp-btn-secondary'}
                        onClick={() => handleAcceptWork(task.id)}
                        disabled={!publicKey || isAccepting || !payout.canAccept}
                        title={
                          !publicKey
                            ? 'Connect wallet to accept work'
                            : !payout.canAccept
                              ? 'This payment is reserved for another freelancer'
                              : ''
                        }
                      >
                        {acceptingTaskId === task.id ? (
                          'Accepting…'
                        ) : (
                          <>
                            Accept Work
                            <ArrowUpRight size={16} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <TaskProgress status={task.status} />
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Milestones & Deliverables */}
      {acceptedTasks.length > 0 && (
        <section className="flex flex-col gap-4 pt-2">
          <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">
            Active Milestones &amp; Deliverables
          </h2>
          <div className="flex flex-col gap-4">
            {acceptedTasks.map((task) => {
              const isDisputed = task.status === 'Disputed';
              const dispute = getDisputeMetadata(task);
              const safeGithubUrl = safeHttpsUrl(task.github_pr_url);
              const safeDocUrl = safeHttpsUrl(task.doc_url);
              const safeLoomUrl = safeHttpsUrl(task.loom_url);
              const hasProof = task.proof_attached || safeGithubUrl || safeDocUrl || safeLoomUrl;
              const isExpanded = expandedPoWTask === task.id;

              return (
                <article
                  key={task.id}
                  className={`gp-card flex flex-col gap-4 p-5 ${isDisputed ? 'gp-card--disputed' : ''}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="m-0 text-base font-semibold text-[var(--text-primary)]">{task.title}</h4>
                        <span
                          className={`gp-status ${
                            isDisputed
                              ? 'gp-status--danger'
                              : task.status === 'Under Review'
                                ? 'gp-status--warn'
                                : 'gp-status--money'
                          }`}
                        >
                          {isDisputed ? <ShieldAlert size={13} /> : <CheckCircle size={13} />}
                          {isDisputed
                            ? 'Release paused (app-level)'
                            : task.status === 'Under Review'
                              ? 'Under review'
                              : 'In progress'}
                        </span>
                      </div>
                      <div className="mt-1 text-[13px] text-[var(--text-muted)]">
                        Client: {task.client_id ? `${task.client_id.slice(0, 8)}…` : 'Unknown'}
                      </div>
                    </div>

                    <div className={`gp-amount text-xl ${isDisputed ? 'gp-amount--danger' : 'gp-amount--money'}`}>
                      {task.amount} XLM
                    </div>
                  </div>

                  {isDisputed && (
                    <div className="rounded-xl border border-[var(--signal-danger-border)] bg-[var(--signal-danger-bg)] p-3.5 text-[13px]">
                      <div className="font-semibold text-[var(--signal-danger)]">
                        Release paused (app-level): {task.dispute_reason || 'reason not recorded'}
                      </div>
                      <div data-testid="dispute-metadata" className="mt-1 text-[12.5px] text-[var(--text-secondary)]">
                        <strong>Disputed:</strong> {dispute.raisedAt || 'time not recorded'} by {dispute.raisedBy}
                      </div>
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

                  {hasProof && (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3.5">
                      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--signal-money-fg)]">
                        <CheckCircle2 size={14} />
                        Attached deliverables
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {safeGithubUrl && (
                          <a href={safeGithubUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-secondary !min-h-[34px] !px-3 !text-[12.5px]">
                            <FileCode size={13} />
                            GitHub PR
                            <ExternalLink size={11} />
                          </a>
                        )}
                        {safeDocUrl && (
                          <a href={safeDocUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-secondary !min-h-[34px] !px-3 !text-[12.5px]">
                            <FileText size={13} />
                            Deliverable Doc
                            <ExternalLink size={11} />
                          </a>
                        )}
                        {safeLoomUrl && (
                          <a href={safeLoomUrl} target="_blank" rel="noopener noreferrer" className="gp-btn gp-btn-secondary !min-h-[34px] !px-3 !text-[12.5px]">
                            <Video size={13} />
                            Loom Walkthrough
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <TaskProgress status={task.status} />

                  {isDisputed ? (
                    <div className="border-t border-[var(--border-subtle)] pt-3 text-[13px] text-[var(--text-muted)]">
                      Proof of work is paused while this dispute is open. Once your client resolves it, you can submit deliverables again.
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5">
                      <span className="text-[12.5px] text-[var(--text-muted)]">
                        Attach at least one deliverable link before requesting release.
                      </span>
                      <button
                        type="button"
                        disabled={isSubmittingPoW}
                        onClick={() => togglePowForm(task)}
                        className="gp-btn gp-btn-secondary"
                      >
                        <UploadCloud size={15} />
                        {hasProof ? 'Update Proof of Work' : 'Attach Proof of Work Deliverables'}
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  )}

                  {isExpanded && !isDisputed && (
                    <div className="mt-1 flex flex-col gap-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h5 className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">
                          Submit Milestone Deliverables
                        </h5>
                        {pilotToolsEnabled && (
                          <button
                            type="button"
                            onClick={() => {
                              setSubmissionNotes('Test submission: practice note without deliverable link.');
                              addToast('Filled a practice note. Add an https:// deliverable link to submit.', 'info');
                            }}
                            className="gp-btn gp-btn-ghost !min-h-[32px] !px-2.5 !text-[12px]"
                          >
                            Fill sample note
                          </button>
                        )}
                      </div>

                      <div className="gp-field">
                        <label htmlFor={`pow-doc-${task.id}`} className="gp-label">
                          Document, Design, or Work Link (Figma, Google Drive, Canva, Notion)
                        </label>
                        <input
                          id={`pow-doc-${task.id}`}
                          type="url"
                          placeholder="https://www.figma.com/file/… or Google Drive link"
                          value={docUrl}
                          onChange={(e) => setDocUrl(e.target.value)}
                          className="gp-input"
                        />
                      </div>

                      <div className="gp-field">
                        <label htmlFor={`pow-github-${task.id}`} className="gp-label">
                          GitHub Pull Request URL (optional)
                        </label>
                        <input
                          id={`pow-github-${task.id}`}
                          type="url"
                          placeholder="https://github.com/org/repo/pull/12"
                          value={githubPrUrl}
                          onChange={(e) => setGithubPrUrl(e.target.value)}
                          className="gp-input"
                        />
                      </div>

                      <div className="gp-field">
                        <label htmlFor={`pow-loom-${task.id}`} className="gp-label">
                          Loom / Demo Walkthrough Video URL (optional)
                        </label>
                        <input
                          id={`pow-loom-${task.id}`}
                          type="url"
                          placeholder="https://www.loom.com/share/…"
                          value={loomUrl}
                          onChange={(e) => setLoomUrl(e.target.value)}
                          className="gp-input"
                        />
                      </div>

                      <div className="gp-field">
                        <label htmlFor={`pow-notes-${task.id}`} className="gp-label">
                          Summary Notes (optional)
                        </label>
                        <textarea
                          id={`pow-notes-${task.id}`}
                          rows={2}
                          placeholder="Brief summary of completed deliverables…"
                          value={submissionNotes}
                          onChange={(e) => setSubmissionNotes(e.target.value)}
                          className="gp-textarea"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          className="gp-btn gp-btn-secondary"
                          onClick={() => togglePowForm(null)}
                          disabled={isSubmittingPoW}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="gp-btn gp-btn-money"
                          onClick={() => handleSubmitProof(task.id)}
                          disabled={isSubmittingPoW}
                        >
                          {isSubmittingPoW ? 'Submitting…' : 'Submit Deliverables'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Branded QR Ph-Grade Save-to-Photos Pay QR Modal */}
      <PayQrModal
        isOpen={showPayQrModal}
        onClose={() => setShowPayQrModal(false)}
        payoutAddress={publicKey}
        displayName={displayName}
        onToast={addToast}
      />
    </div>
  );
};

export default FreelancerDashboard;
