import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, CheckCircle, ShieldAlert, ShieldCheck, Landmark, FileCode, Video, FileText, UploadCloud, ExternalLink, CheckCircle2, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { requestWalletSignature } from '../lib/stellar';
import TaskProgress from '../components/TaskProgress';

const FreelancerDashboard = () => {
  const { user, publicKey, switchRole } = useAuth();
  const { tasks, isLoading, updateTaskStatus, submitProofOfWork } = useTasks();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const availableTasks = tasks.filter(t => t.status === 'Available');
  const acceptedTasks = tasks.filter(t => (t.status === 'In Progress' || t.status === 'Disputed') && (t.freelancer_id === user?.id || (user?.is_simulation_mode && t.freelancer_id === 'demo-freelancer-uuid-002')));
  const completedTasks = tasks.filter(t => t.status === 'Completed' && (t.freelancer_id === user?.id || (user?.is_simulation_mode && t.freelancer_id === 'demo-freelancer-uuid-002')));
  
  const totalEarned = completedTasks.reduce((sum, task) => sum + (Number(task.amount) || 0), 0);

  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);
  const [showKycModal, setShowKycModal] = useState(false);
  const [isKycVerified, setIsKycVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Proof of Work Submission State (Deliverable 3 - Armielyn Requirement)
  const [expandedPoWTask, setExpandedPoWTask] = useState(null);
  const [githubPrUrl, setGithubPrUrl] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [loomUrl, setLoomUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmittingPoW, setIsSubmittingPoW] = useState(false);

  // Bank Off-ramp State
  const [showBankModal, setShowBankModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const banks = [
    { id: 'unionbank', name: 'UnionBank (PH)' },
    { id: 'gcash', name: 'GCash' },
    { id: 'dbs', name: 'DBS Bank' },
    { id: 'revolut', name: 'Revolut' }
  ];

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

    if (!finalGithubUrl && !finalDocUrl && !finalLoomUrl) {
      if (finalNotes) {
        // If non-dev tester provided notes, auto-assign verified pilot deliverable link
        finalDocUrl = 'https://docs.google.com/document/d/gigpay-pilot-deliverable';
      } else {
        addToast("Please enter a work link, add notes, or click '⚡ Auto-Fill Sample' below.", "warning");
        return;
      }
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

  const handleWithdraw = async () => {
    if (totalEarned === 0) {
      addToast("No funds available to withdraw.", "error");
      return;
    }
    
    if (!isKycVerified) {
      setShowKycModal(true);
      return;
    }

    setShowBankModal(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!selectedBank || !accountNumber) {
      addToast("Please select a bank and enter an account number.", "error");
      return;
    }

    setIsWithdrawing(true);
    try {
      await requestWalletSignature(publicKey, `Withdraw ${totalEarned} XLM from Escrow to ${selectedBank}`);
      const bankName = banks.find(b => b.id === selectedBank)?.name || selectedBank;
      const last4 = accountNumber.slice(-4) || '1234';
      addToast(`Successfully converted & transferred ${totalEarned} XLM to ${bankName} account ending in ****${last4}.`, "success");
      setShowBankModal(false);
      setSelectedBank('');
      setAccountNumber('');
    } catch (error) {
      addToast(error.message || "Withdrawal signature failed.", "error");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleSimulateKyc = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      setIsKycVerified(true);
      setShowKycModal(false);
      addToast("Identity Verified successfully! You can now withdraw funds.", "success");
    }, 2500);
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
            Discover funded client escrows, accept jobs with 1-click, and submit verifiable deliverables.
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

      {/* Earnings Overview Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '3rem' }}>
        <div className="glass-panel" style={{ flex: '1 1 250px', borderLeft: '4px solid var(--accent)' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Earned</h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{totalEarned} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>XLM</span></div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 250px' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Active Escrows</h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{acceptedTasks.length}</div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {!publicKey && (
            <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
              <ShieldAlert size={16} /> Wallet Required
            </div>
          )}
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginBottom: '0.5rem', opacity: isWithdrawing || !publicKey ? 0.5 : 1 }}
            onClick={handleWithdraw}
            disabled={isWithdrawing || !publicKey}
          >
            <Wallet size={18} /> {isWithdrawing ? 'Processing...' : 'Withdraw to Bank'}
          </button>
        </div>
      </div>

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
        {!isLoading && availableTasks.map(task => (
          <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{task.title}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Client: {task.client_id ? task.client_id.slice(0, 8) + '...' : 'Unknown'}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>{task.amount} XLM Locked</div>
                <button 
                  className="btn btn-outline" 
                  style={{ padding: '0.5rem 1rem', opacity: !publicKey || isAccepting ? 0.5 : 1 }} 
                  onClick={() => handleAcceptWork(task.id, task.amount)}
                  disabled={!publicKey || isAccepting}
                  title={!publicKey ? "Connect wallet to accept work" : ""}
                >
                  {acceptingTaskId === task.id ? 'Signing...' : <>Accept Work <ArrowUpRight size={16} /></>}
                </button>
              </div>
            </div>
            <TaskProgress status={task.status} />
          </div>
        ))}
      </div>

      {/* Active Jobs & Proof of Work Submission (Deliverable 3 - Armielyn Requirement) */}
      {acceptedTasks.length > 0 && (
        <>
          <h3 style={{ marginTop: '3rem', marginBottom: '1.5rem' }}>Your Active Jobs & Deliverables</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {acceptedTasks.map(task => {
              const isDisputed = task.status === 'Disputed';
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
                      <strong>⚠️ Escrow Frozen:</strong> The client flagged this task as Disputed ({task.dispute_reason || 'Review requested'}). Standard release is paused until resolved.
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
                            setDocUrl('https://docs.google.com/document/d/gigpay-pilot-sample-deliverable');
                            setSubmissionNotes('Completed milestone deliverables. Tested and verified for client escrow release.');
                            addToast('Sample deliverables auto-filled for quick testing!', 'info');
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

      {/* KYC Verification Modal */}
      {showKycModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem', boxSizing: 'border-box' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 'min(400px, calc(100vw - 2rem))', boxSizing: 'border-box', padding: '1.75rem', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: '#ffb84d' }}>
              <ShieldAlert size={48} />
            </div>
            <h3 style={{ marginBottom: '1rem' }}>Identity Verification Required</h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              To comply with global anti-money laundering (AML) laws, you must verify your identity before withdrawing funds to a local bank account.
            </p>
            
            <button 
              className="btn btn-primary" 
              onClick={handleSimulateKyc}
              disabled={isVerifying}
              style={{ width: '100%', marginBottom: '1rem', display: 'flex', justifyContent: 'center', opacity: isVerifying ? 0.7 : 1 }}
            >
              {isVerifying ? 'Scanning ID Document...' : 'Start Secure KYC Check'}
            </button>
            
            <button 
              className="btn btn-outline" 
              onClick={() => setShowKycModal(false)}
              disabled={isVerifying}
              style={{ width: '100%', borderColor: 'transparent', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bank Selection Off-Ramp Modal */}
      {showBankModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem', boxSizing: 'border-box' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 'min(450px, calc(100vw - 2rem))', boxSizing: 'border-box', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
              <Landmark size={28} />
              <h3 style={{ margin: 0, color: 'white' }}>Select Off-Ramp Destination</h3>
            </div>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Convert and withdraw your {totalEarned} XLM directly to your local Philippine bank account.
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {banks.map(bank => (
                <button
                  key={bank.id}
                  onClick={() => setSelectedBank(bank.id)}
                  style={{
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: `1px solid ${selectedBank === bank.id ? 'var(--accent)' : 'var(--border)'}`,
                    backgroundColor: selectedBank === bank.id ? 'rgba(99, 102, 241, 0.1)' : 'rgba(0,0,0,0.2)',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    fontWeight: selectedBank === bank.id ? 'bold' : 'normal'
                  }}
                >
                  {bank.name}
                </button>
              ))}
            </div>

            {selectedBank && (
              <div style={{ marginBottom: '1.5rem', animation: 'fadeIn 0.3s ease-in-out' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Account Number
                </label>
                <input 
                  type="text" 
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="e.g. 1093 4293 4810"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.4)', color: 'white' }} 
                />
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => { setShowBankModal(false); setSelectedBank(''); setAccountNumber(''); }}
                disabled={isWithdrawing}
                style={{ flex: 1, borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleConfirmWithdraw}
                disabled={isWithdrawing || !selectedBank || !accountNumber}
                style={{ flex: 2, opacity: isWithdrawing || !selectedBank || !accountNumber ? 0.5 : 1 }}
              >
                {isWithdrawing ? 'Processing Transfer...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreelancerDashboard;
