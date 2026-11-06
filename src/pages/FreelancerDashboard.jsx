import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, CheckCircle, ShieldAlert, FileCode, Video, FileText, UploadCloud, ExternalLink, CheckCircle2, ChevronDown, ChevronUp, ArrowLeft, Copy, Share2 } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { requestWalletSignature, isDemoWallet, isSimulatorWallet } from '../lib/stellar';
import { isNonEvidenceHash, describePayout, onChainEarnings } from '../lib/ledgerIntegrity';
import { buildInviteLink } from '../lib/invite';
import TaskProgress from '../components/TaskProgress';
import { usePilotFeedbackState, PILOT_FORM_URL } from '../hooks/usePilotFeedbackState';
import { getDisputeMetadata } from '../lib/disputeMetadata';

const FreelancerDashboard = () => {
  const { user, publicKey, switchRole } = useAuth();
  const { tasks, isLoading, updateTaskStatus, submitProofOfWork } = useTasks();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const {
    isCompleted: isPilotCompleted,
    openFormLink,
    markCompleted: markPilotCompleted
  } = usePilotFeedbackState();

  const availableTasks = tasks.filter(t => t.status === 'Available');
  const acceptedTasks = tasks.filter(t => (t.status === 'In Progress' || t.status === 'Under Review' || t.status === 'Disputed') && (t.freelancer_id === user?.id || (user?.is_simulation_mode && t.freelancer_id === 'demo-freelancer-uuid-002')));
  
  // Only escrows the contract actually released to this payout address (see onChainEarnings).
  const earnings = onChainEarnings(tasks, publicKey);
  const totalEarned = Number(earnings.total.toFixed(7));

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);
  
  // Proof of Work Submission State (Deliverable 3 - Armielyn Requirement)
  const [expandedPoWTask, setExpandedPoWTask] = useState(null);
  const [githubPrUrl, setGithubPrUrl] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [loomUrl, setLoomUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmittingPoW, setIsSubmittingPoW] = useState(false);

  const handleAcceptWork = async (id, amount) => {
    setIsAccepting(true);
    setAcceptingTaskId(id);
    try {
      if (publicKey) {
        await requestWalletSignature(publicKey, `Accept Escrow Contract for ${amount || ''} XLM`);
      }
      await updateTaskStatus(id, 'In Progress', true);
      addToast("Task accepted! Funds remain locked in Soroban escrow until completion.", "success");
    } catch (err) {
      addToast("Failed to accept task: " + (err?.message || err), "error");
    } finally {
      setIsAccepting(false);
      setAcceptingTaskId(null);
    }
  };

  const handleAcceptTask = handleAcceptWork;

  const handleSubmitProof = async (taskId) => {
    let finalDocUrl = docUrl ? docUrl.trim() : '';
    let finalGithubUrl = githubPrUrl ? githubPrUrl.trim() : '';
    let finalLoomUrl = loomUrl ? loomUrl.trim() : '';
    const finalNotes = submissionNotes ? submissionNotes.trim() : '';

    if (!finalGithubUrl && !finalDocUrl && !finalLoomUrl && !finalNotes) {
      addToast("Add a link to your work or a short note about what you delivered.", "warning");
      return;
    }
    // Only real web links are saved as proof; nothing is filled in on the freelancer's behalf.
    const badLink = [finalGithubUrl, finalDocUrl, finalLoomUrl].find((u) => u && !/^https:\/\//i.test(u));
    if (badLink) {
      addToast("Work links must start with https:// so your client can open them.", "warning");
      return;
    }

    setIsSubmittingPoW(true);
    try {
      await submitProofOfWork(taskId, {
        githubPrUrl: finalGithubUrl,
        docUrl: finalDocUrl,
        loomUrl: finalLoomUrl,
        notes: finalNotes || 'Completed milestone deliverables per project requirements.'
      });
      setExpandedPoWTask(null);
      setGithubPrUrl('');
      setDocUrl('');
      setLoomUrl('');
      setSubmissionNotes('');
    } catch (err) {
      addToast("Failed to submit proof of work: " + err.message, "error");
    } finally {
      setIsSubmittingPoW(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
            <h2 style={{ margin: 0 }}>Freelancer Portal</h2>
            <span style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', padding: '0.2rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 'bold', border: '1px solid rgba(139, 92, 246, 0.4)' }}>
              Freelancer View
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Discover funded client escrows, accept jobs with 1-click, and submit proof of your work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            switchRole('client');
            addToast("Switched to Client Mode! Create escrow tasks and approve payouts.", "info");
            navigate('/client');
          }}
          className="btn btn-outline"
          style={{
            borderColor: 'rgba(59, 130, 246, 0.5)',
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.82rem',
            padding: '0.5rem 0.85rem'
          }}
        >
          <ArrowLeft size={14} /> Switch to Client Portal
        </button>
      </div>

      {/* Payout address: the contract fixes the recipient when the client funds the escrow, so the
          freelancer must give the client this address BEFORE the task is funded. */}
      {publicKey && !isDemoWallet(publicKey) && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #a78bfa' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
            <h4 style={{ margin: 0 }}>Your payout address</h4>
            {isSimulatorWallet(publicKey) && (
              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 'bold', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                Practice wallet · Testnet only
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 0.6rem', fontSize: '0.88rem' }}>
            Send this to your client before they lock the payment. GigPay pays the escrow to this address when they approve your work. Easiest: share your invite link, which fills the address in for them.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 260px', minWidth: 0, overflowWrap: 'anywhere', background: 'rgba(255,255,255,0.06)', padding: '0.5rem 0.65rem', borderRadius: '0.4rem', fontSize: '0.8rem' }}>
              {publicKey}
            </code>
            <button
              type="button"
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(publicKey);
                  addToast("Payout address copied. Send it to your client.", "success");
                } catch {
                  addToast("Couldn't copy automatically. Select the address and copy it.", "warning");
                }
              }}
            >
              <Copy size={14} /> Copy
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
              onClick={async () => {
                // One link instead of a 56-character address: the client's task form is pre-filled with it.
                const link = buildInviteLink(publicKey);
                try {
                  if (navigator.share) {
                    await navigator.share({ title: 'Pay me on GigPay', text: 'Create our GigPay task here. My payout address is already filled in:', url: link });
                    return;
                  }
                } catch (err) {
                  if (err?.name === 'AbortError') return;
                }
                try {
                  await navigator.clipboard.writeText(link);
                  addToast('Invite link copied. Send it to your client: it fills in your payout address for them.', 'success');
                } catch {
                  addToast(`Couldn't copy automatically. Send your client this link: ${link}`, 'warning');
                }
              }}
            >
              <Share2 size={14} /> Share invite link
            </button>
          </div>
        </div>
      )}

      {/* Earnings Overview Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '3rem' }}>
        <div className="glass-panel" style={{ flex: '1 1 250px', borderLeft: '4px solid var(--accent)' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Earned <span style={{ fontWeight: 'normal', fontSize: '0.85rem' }}>(paid on-chain)</span></h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{totalEarned} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>XLM</span></div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {earnings.count > 0
              ? `From ${earnings.count} escrow${earnings.count === 1 ? '' : 's'} released to your payout address.`
              : 'Escrows released to your payout address appear here.'}
          </p>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 250px' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Active Escrows</h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{acceptedTasks.length}</div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.5rem' }}>
          <h4 style={{ color: 'var(--text-muted)', margin: 0 }}>Where your payment goes</h4>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Approved payments go straight to your payout address on Stellar Testnet. Testnet XLM is practice money with no cash value. Bank or GCash withdrawal is not part of this pilot.
          </p>
          {publicKey && !isDemoWallet(publicKey) && (
            <a className="btn btn-outline" href={'https://stellar.expert/explorer/testnet/account/' + publicKey} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
              <Wallet size={16} /> Check my balance on Stellar Expert <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {/* Pilot Tester Notice Card */}
      {!isPilotCompleted && (
        <div 
          className="glass-panel" 
          style={{ 
            marginBottom: '1.5rem', 
            padding: '1.25rem 1.5rem', 
            border: '1px solid rgba(0, 242, 254, 0.3)', 
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(9, 13, 22, 0.85) 100%)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: '9999px', background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', border: '1px solid rgba(0, 242, 254, 0.35)', textTransform: 'uppercase' }}>
                  ⚡ Freelancer Pilot Cohort
                </span>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>Early Tester Feedback</h4>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.4 }}>
                Tried a full payment? Tell us what worked and what confused you. It takes about a minute.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <a
                href={PILOT_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => openFormLink('freelancer_card_clicked')}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.45rem 0.9rem', textDecoration: 'none' }}
              >
                <span>Complete 60s Form</span> <ExternalLink size={13} />
              </a>
              <button
                type="button"
                onClick={() => {
                  markPilotCompleted();
                  addToast('🎉 Thanks for your feedback!', 'success');
                }}
                className="btn btn-outline"
                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', padding: '0.45rem 0.85rem', borderColor: 'rgba(0, 245, 160, 0.4)', background: 'rgba(0, 245, 160, 0.08)', color: 'var(--accent, #00f5a0)' }}
              >
                <CheckCircle2 size={13} /> I've Completed It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Available Jobs */}
      <h3 style={{ marginBottom: '1.5rem' }}>Available Funded Tasks</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isLoading ? (
          <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--accent)' }}>
            Syncing with Supabase Realtime...
          </div>
        ) : availableTasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No tasks available right now.</p>
        ) : null}
        {!isLoading && availableTasks.map(task => {
          // The contract pays the address the client entered when funding; whoever accepts cannot change it.
          const payout = describePayout(task, publicKey);
          const fundedOnChain = !isNonEvidenceHash(task.tx_hash) && !task.is_simulated;
          return (
          <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{task.title}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Client: {task.client_id ? task.client_id.slice(0, 8) + '...' : 'Unknown'}</p>
                <p style={{ color: payout.color, fontSize: '0.82rem', margin: '0.3rem 0 0' }}>{payout.text}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 'bold', color: fundedOnChain ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {task.amount} XLM {fundedOnChain ? 'locked on-chain' : '(not funded on-chain)'}
                </div>
                <button
                  className="btn btn-outline"
                  style={{ padding: '0.5rem 1rem', opacity: !publicKey || isAccepting || !payout.canAccept ? 0.5 : 1 }}
                  onClick={() => handleAcceptWork(task.id, task.amount)}
                  disabled={!publicKey || isAccepting || !payout.canAccept}
                  title={!publicKey ? "Connect wallet to accept work" : (!payout.canAccept ? "This payment is reserved for another freelancer" : "")}
                >
                  {acceptingTaskId === task.id ? 'Signing...' : <>Accept Work <ArrowUpRight size={16} /></>}
                </button>
              </div>
            </div>
            <TaskProgress status={task.status} />
          </div>
          );
        })}
      </div>

      {/* Active Jobs & Proof of Work Submission (Deliverable 3 - Armielyn Requirement) */}
      {acceptedTasks.length > 0 && (
        <>
          <h3 style={{ marginTop: '3rem', marginBottom: '1.5rem' }}>Your Active Jobs & Deliverables</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {acceptedTasks.map(task => {
              const isDisputed = task.status === 'Disputed';
              const dispute = getDisputeMetadata(task);
              const hasProof = task.proof_attached || task.github_pr_url || task.doc_url || task.loom_url;
              const isExpanded = expandedPoWTask === task.id;

              return (
                <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: isDisputed ? '4px solid #ef4444' : '4px solid #10b981' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                    <div>
                      <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{task.title}</h4>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Client: {task.client_id ? task.client_id.slice(0, 8) + '...' : 'Unknown'} &bull; Escrow Contract: <code>CAUU2O...7RD3</code>
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div style={{ fontWeight: 'bold', color: isDisputed ? '#ef4444' : 'var(--accent)' }}>
                        {task.amount} XLM Locked
                      </div>
                      <span style={{ 
                        color: isDisputed ? '#ef4444' : '#10b981', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        fontWeight: 'bold',
                        background: isDisputed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '999px',
                        fontSize: '0.8rem'
                      }}>
                        {isDisputed ? <ShieldAlert size={14} /> : <CheckCircle size={14} />} 
                        {isDisputed ? 'Dispute Frozen' : 'In Progress'}
                      </span>
                    </div>
                  </div>

                  {/* Dispute Banner if flagged */}
                  {isDisputed && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.85rem', color: '#fca5a5' }}>
                      <strong>⚠️ Escrow Frozen:</strong> The client flagged this task as Disputed ({task.dispute_reason || 'reason not recorded'}). Standard release is paused until resolved.
                      <div data-testid="dispute-metadata" style={{ color: 'var(--text-main)', fontSize: '0.78rem', marginTop: '0.3rem' }}>
                        <strong>Disputed:</strong> {dispute.raisedAt || 'time not recorded'} by {dispute.raisedBy}
                      </div>
                    </div>
                  )}
                  {!isDisputed && dispute.resolvedAt && (
                    <div data-testid="dispute-history" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.6rem 0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <strong>Dispute history:</strong> disputed {dispute.raisedAt || '(time not recorded)'} by {dispute.raisedBy}
                      {task.dispute_reason ? ` ("${task.dispute_reason}")` : ''}; resolved {dispute.resolvedAt}.
                    </div>
                  )}

                  {/* Attached Deliverables Badge Section */}
                  {hasProof && (
                    <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                        <CheckCircle2 size={14} /> Proof of Work Deliverables Attached:
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        {task.github_pr_url && (
                          <a href={task.github_pr_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#00f2fe', borderColor: 'rgba(0, 242, 254, 0.4)' }}>
                            <FileCode size={13} /> GitHub PR <ExternalLink size={11} />
                          </a>
                        )}
                        {task.doc_url && (
                          <a href={task.doc_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.4)' }}>
                            <FileText size={13} /> Deliverable Doc <ExternalLink size={11} />
                          </a>
                        )}
                        {task.loom_url && (
                          <a href={task.loom_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.4)' }}>
                            <Video size={13} /> Loom Walkthrough <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Expandable Submission Form Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedPoWTask(isExpanded ? null : task.id)}
                      className="btn btn-outline"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.4rem 0.8rem', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    >
                      <UploadCloud size={15} />
                      {hasProof ? 'Update Proof of Work' : 'Attach Proof of Work Deliverables'}
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Required before client milestone release
                    </span>
                  </div>

                  {/* Expandable PoW Form */}
                  {isExpanded && (
                    <div style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '8px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.85rem',
                      marginTop: '0.5rem'
                    }}>
                      <h5 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <UploadCloud size={16} color="var(--accent)" /> Submit Milestone Deliverables & Proof
                      </h5>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Attach your work link (Google Drive, Canva, Figma, Docs, or GitHub) for client verification.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSubmissionNotes('Test submission: no real deliverable (GigPay practice run).');
                            addToast('Filled a practice note. Add a real link if you have one.', 'info');
                          }}
                          style={{
                            background: 'rgba(0, 242, 254, 0.12)',
                            border: '1px solid rgba(0, 242, 254, 0.4)',
                            color: '#00f2fe',
                            padding: '0.28rem 0.65rem',
                            borderRadius: '6px',
                            fontSize: '0.74rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          ⚡ 1-Click Auto-Fill Sample (For Non-Dev Testers)
                        </button>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          1. Document, Design, or Work Link (Google Drive, Canva, Figma, Notion, Docs)
                        </label>
                        <input
                          type="url"
                          placeholder="https://docs.google.com/... or Google Drive / Canva link"
                          value={docUrl}
                          onChange={(e) => setDocUrl(e.target.value)}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.82rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          2. GitHub Pull Request URL (Optional — For Software Developers)
                        </label>
                        <input
                          type="url"
                          placeholder="https://github.com/organization/repo/pull/12"
                          value={githubPrUrl}
                          onChange={(e) => setGithubPrUrl(e.target.value)}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.82rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          3. Loom / Demo Walkthrough Video URL
                        </label>
                        <input
                          type="url"
                          placeholder="https://www.loom.com/share/..."
                          value={loomUrl}
                          onChange={(e) => setLoomUrl(e.target.value)}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.82rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          4. Summary Notes / Changelog
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Brief description of work completed for client verification..."
                          value={submissionNotes}
                          onChange={(e) => setSubmissionNotes(e.target.value)}
                          style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.82rem' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setExpandedPoWTask(null)}
                          disabled={isSubmittingPoW}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleSubmitProof(task.id)}
                          disabled={isSubmittingPoW}
                          style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                        >
                          {isSubmittingPoW ? 'Attaching Proof...' : 'Submit Deliverables'}
                        </button>
                      </div>
                    </div>
                  )}

                  <TaskProgress status={task.status} />
                </div>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
};

export default FreelancerDashboard;
