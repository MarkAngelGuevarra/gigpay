import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, ArrowUpRight, CheckCircle, ShieldAlert, ShieldCheck, Landmark, Zap, Download, ExternalLink } from 'lucide-react';
import EscrowSuccessModal from '../components/EscrowSuccessModal';
import PublicLedgerModal from '../components/PublicLedgerModal';
import { exportTelemetryToCSV } from '../lib/telemetry';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { requestWalletSignature } from '../lib/stellar';
import TaskProgress from '../components/TaskProgress';

const FreelancerDashboard = () => {
  const { user, publicKey, connectTesterWallet, switchRole, isSimulationMode } = useAuth();
  const { tasks, isLoading, updateTaskStatus } = useTasks();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const availableTasks = tasks.filter(t => t.status === 'Available');
  const acceptedTasks = tasks.filter(t => (t.status === 'In Progress' || t.status === 'Under Review' || t.status === 'Disputed') && (t.freelancer_id === user?.id || (!t.freelancer_id && user?.id === 'demo-freelancer-uuid-002')));
  const completedTasks = tasks.filter(t => t.status === 'Completed' && (t.freelancer_id === user?.id || (!t.freelancer_id && user?.id === 'demo-freelancer-uuid-002')));
  
  const totalEarned = completedTasks.reduce((sum, task) => sum + Number(task.amount), 0);

  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [acceptingTaskId, setAcceptingTaskId] = useState(null);
  const [successModalData, setSuccessModalData] = useState(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [showKycModal, setShowKycModal] = useState(false);
  const [isKycVerified, setIsKycVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Work Proof Submission State (Deliverable 3 Compliance)
  const [taskToSubmitProof, setTaskToSubmitProof] = useState(null);
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);

  // New Bank Off-ramp State
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
    let activeKey = publicKey;
    if (!activeKey) {
      const conn = connectTesterWallet();
      activeKey = conn?.publicKey || 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
      addToast("Simulator Testnet Wallet connected to sign task acceptance.", "info");
    }
    setAcceptingTaskId(id);
    try {
      await requestWalletSignature(activeKey, `Accept Escrow Contract for ${amount} XLM`);
      await updateTaskStatus(id, 'In Progress', true);
      const targetTask = tasks.find(t => t.id === id);
      setSuccessModalData({
        task: targetTask || { id, title: 'Accepted Milestone', amount },
        role: 'freelancer',
        actionType: 'accepted'
      });
      addToast("Work accepted! Task escrow moved to In Progress.", "success");
    } catch (error) {
      addToast(error.message || "Failed to sign acceptance.", "error");
    } finally {
      setAcceptingTaskId(null);
    }
  };

  const handleWithdraw = async () => {
    if (!publicKey) {
      connectTesterWallet();
      addToast("Simulator Testnet Wallet connected for bank off-ramp testing.", "info");
    }
    if (totalEarned === 0) {
      addToast("No completed funds available to withdraw yet. Complete a task milestone first!", "warning");
      return;
    }
    
    if (!isKycVerified) {
      setShowKycModal(true);
      return;
    }

    // Instead of withdrawing instantly, open bank selection
    setShowBankModal(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!selectedBank || !accountNumber) {
      addToast("Please select a bank and enter an account number.", "error");
      return;
    }

    let activeKey = publicKey;
    if (!activeKey) {
      const conn = connectTesterWallet();
      activeKey = conn?.publicKey || 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
    }

    setIsWithdrawing(true);
    try {
      await requestWalletSignature(activeKey, `Withdraw $${totalEarned} USDC from Escrow to ${selectedBank}`);
      const bankName = banks.find(b => b.id === selectedBank)?.name || selectedBank;
      const last4 = accountNumber.slice(-4) || '1234';
      addToast(`Successfully converted & transferred $${totalEarned} USDC to ${bankName} account ending in ****${last4}.`, "success");
      setShowBankModal(false);
      setSelectedBank('');
      setAccountNumber('');
    } catch (error) {
      addToast(error.message || "Withdrawal signature failed.", "error");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleSubmitProof = async (e) => {
    e.preventDefault();
    if (!deliverableUrl || !taskToSubmitProof) {
      addToast("Please provide a valid deliverable URL (e.g. GitHub PR, Loom, Google Drive).", "error");
      return;
    }
    setIsSubmittingProof(true);
    try {
      await updateTaskStatus(taskToSubmitProof.id, 'Under Review', false, {
        deliverable_url: deliverableUrl.trim(),
        deliverable_notes: deliverableNotes.trim() || 'Work deliverable submitted for milestone escrow verification.'
      });
      addToast("Work proof submitted! Client notified to review and release escrow.", "success");
      setTaskToSubmitProof(null);
      setDeliverableUrl('');
      setDeliverableNotes('');
    } catch (err) {
      addToast(err.message || "Failed to submit work proof.", "error");
    } finally {
      setIsSubmittingProof(false);
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
          <h2>Freelancer Portal</h2>
          <p style={{ color: 'var(--text-muted)' }}>Browse funded Stellar escrow contracts, accept jobs, and cash out instantly.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setIsLedgerOpen(true)}
            className="btn btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#6ee7b7' }}
            title="View public immutable verification ledger"
          >
            <ShieldCheck size={16} /> View Public Ledger
          </button>
          <button
            type="button"
            onClick={exportTelemetryToCSV}
            className="btn btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', borderColor: 'rgba(0, 242, 254, 0.4)', color: '#00f2fe' }}
            title="Download the full verified onboarding ledger spreadsheet (.csv) for Instawards"
          >
            <Download size={16} /> Export Traction Ledger (.csv)
          </button>
        </div>
      </div>

      {/* Dual-Role Simulation Banner */}
      {(isSimulationMode || user?.is_simulation_mode || user?.id === 'demo-freelancer-uuid-002') && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.12), rgba(0, 242, 254, 0.12))',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: '0.75rem',
          padding: '0.85rem 1.25rem',
          marginBottom: '1.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Zap size={18} style={{ color: '#a78bfa', flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', color: '#e2e8f0' }}>
              <strong>Dual-Role Simulation Active:</strong> Currently viewing as <strong>Freelancer (Alex Rivera)</strong>. Accept work below, then switch to Client to approve and release escrow payout!
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                switchRole('client');
                navigate('/client');
                addToast("Switched to Client Portal! Review deliverable and release escrow.", "info");
              }}
              className="btn btn-outline"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                borderColor: 'rgba(96, 165, 250, 0.6)',
                color: '#93c5fd',
                background: 'rgba(59, 130, 246, 0.15)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ⇄ Switch to Client View
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth?mode=signup')}
              className="btn btn-outline"
              style={{
                padding: '0.35rem 0.75rem',
                fontSize: '0.8rem',
                borderColor: 'rgba(0, 242, 254, 0.6)',
                color: '#00f2fe',
                background: 'rgba(0, 242, 254, 0.12)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              🚀 Create Real Pilot Account
            </button>
          </div>
        </div>
      )}

      {!publicKey && (
        <div className="glass-panel" style={{ 
          padding: '1rem 1.25rem', 
          marginBottom: '2rem', 
          border: '1px solid rgba(0, 242, 254, 0.4)',
          background: 'rgba(0, 242, 254, 0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Zap size={24} style={{ color: '#00f2fe', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, color: 'white', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(0, 242, 254, 0.2)', color: '#00f2fe', padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.7rem' }}>PILOT TESTER</span>
                Testing Freelancer Mode without Freighter Wallet?
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                One-click activate a pre-funded Testnet Simulator Wallet to accept tasks and test instant bank off-ramps with zero setup.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              connectTesterWallet();
              addToast("Simulator Testnet Wallet (10,000 XLM) connected!", "success");
            }}
            style={{ fontSize: '0.82rem', padding: '0.45rem 1rem', whiteSpace: 'nowrap' }}
          >
            ⚡ Connect Simulator Wallet
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginBottom: '3rem' }}>
        <div className="glass-panel" style={{ flex: '1 1 250px', borderLeft: '4px solid var(--accent)' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Earned</h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>${totalEarned} <span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>USDC</span></div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 250px' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Active Escrows</h4>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>{acceptedTasks.length}</div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {!publicKey ? (
            <button 
              type="button"
              className="btn btn-outline" 
              style={{ width: '100%', marginBottom: '0.5rem', borderColor: '#00f2fe', color: '#00f2fe', background: 'rgba(0, 242, 254, 0.08)', fontSize: '0.82rem' }}
              onClick={() => {
                connectTesterWallet();
                addToast("Simulator Testnet Wallet connected!", "success");
              }}
            >
              ⚡ Connect Simulator Wallet
            </button>
          ) : null}
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginBottom: '0.5rem', opacity: isWithdrawing ? 0.6 : 1 }}
            onClick={handleWithdraw}
            disabled={isWithdrawing}
          >
            <Wallet size={18} /> {isWithdrawing ? 'Processing...' : 'Withdraw to Bank'}
          </button>
        </div>
      </div>

      <h3 style={{ marginBottom: '1.5rem' }}>Available Funded Tasks</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {isLoading ? (
          <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--accent)' }}>
            Syncing with Supabase Realtime...
          </div>
        ) : availableTasks.length === 0 ? (
          <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', border: '1px dashed rgba(255, 255, 255, 0.15)' }}>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>
              No funded tasks available right now. Open the Client Portal or log in as a Client to fund a new Soroban escrow task!
            </p>
          </div>
        ) : null}
        {!isLoading && availableTasks.map(task => (
          <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{task.title}</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Client: {task.client_id ? task.client_id.slice(0, 8) + '...' : 'Unknown'}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>${task.amount} USDC Locked</div>
                  <button 
                    className="btn btn-outline" 
                    style={{ padding: '0.5rem 1rem', opacity: acceptingTaskId === task.id ? 0.6 : 1, borderColor: '#00f2fe', color: '#00f2fe' }} 
                    onClick={() => handleAcceptWork(task.id, task.amount)}
                    disabled={acceptingTaskId === task.id}
                  >
                    {acceptingTaskId === task.id ? 'Signing Acceptance...' : <>Accept Work <ArrowUpRight size={16} /></>}
                  </button>
              </div>
            </div>
            <TaskProgress status={task.status} />
          </div>
        ))}
      </div>

      {acceptedTasks.length > 0 && (
        <>
          <h3 style={{ marginTop: '3rem', marginBottom: '1.5rem' }}>Your Active Jobs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {acceptedTasks.map(task => (
              <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>{task.title}</h4>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Client: {task.client_id ? task.client_id.slice(0, 8) + '...' : 'Unknown'}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 'bold', color: task.status === 'Disputed' ? '#ef4444' : 'var(--accent)' }}>${task.amount} USDC Locked</div>
                    <span style={{ color: task.status === 'Disputed' ? '#ef4444' : task.status === 'Under Review' ? '#38bdf8' : 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 'bold', fontSize: '0.88rem' }}>
                      {task.status === 'Disputed' ? <ShieldAlert size={16} /> : <CheckCircle size={16} />} 
                      {task.status === 'Disputed' ? 'Disputed' : task.status === 'Under Review' ? 'Under Review' : 'In Progress'}
                    </span>
                    {task.status === 'In Progress' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTaskToSubmitProof(task);
                          setDeliverableUrl(task.deliverable_url || '');
                          setDeliverableNotes(task.deliverable_notes || '');
                        }}
                        className="btn btn-outline"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', borderColor: 'rgba(0, 242, 254, 0.6)', color: '#00f2fe' }}
                      >
                        📤 Submit Work Proof
                      </button>
                    )}
                    {task.status === 'Under Review' && task.deliverable_url && (
                      <a
                        href={task.deliverable_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#38bdf8', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        View Proof <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
                <TaskProgress status={task.status} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* KYC Verification Modal */}
      {showKycModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '400px', padding: '2rem', textAlign: 'center' }}>
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

      {/* Submit Work Proof Modal (Deliverable 3 SOW Compliance) */}
      {taskToSubmitProof && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, backdropFilter: 'blur(6px)' }}>
          <div className="glass-panel" style={{ width: '90%', maxWidth: '480px', padding: '2rem' }}>
            <h3 style={{ marginBottom: '0.5rem', color: 'white' }}>Submit Work Deliverable</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Provide verifiable proof-of-work for "{taskToSubmitProof.title}" (${taskToSubmitProof.amount} USDC). The client will review this deliverable before releasing escrow.
            </p>
            <form onSubmit={handleSubmitProof}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Deliverable URL (GitHub PR, Loom Video, Google Drive, Figma) *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://github.com/.../pull/1 or https://loom.com/share/..."
                  value={deliverableUrl}
                  onChange={(e) => setDeliverableUrl(e.target.value)}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem' }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Verification Summary / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Completed milestone deliverables and verified on Stellar Testnet."
                  value={deliverableNotes}
                  onChange={(e) => setDeliverableNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)', color: 'white', fontSize: '0.85rem', resize: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setTaskToSubmitProof(null)}
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingProof}
                >
                  {isSubmittingProof ? 'Submitting Proof...' : 'Submit for Client Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Selection Off-Ramp Modal */}
      {showBankModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '450px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', color: 'var(--accent)' }}>
              <Landmark size={28} />
              <h3 style={{ margin: 0, color: 'white' }}>Select Off-Ramp Destination</h3>
            </div>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Convert and withdraw your ${totalEarned} USDC directly to your local bank account.
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

      <EscrowSuccessModal
        isOpen={Boolean(successModalData)}
        onClose={() => setSuccessModalData(null)}
        task={successModalData?.task}
        role={successModalData?.role || 'freelancer'}
        actionType={successModalData?.actionType || 'accepted'}
        user={user}
        publicKey={publicKey}
        onToast={addToast}
      />

      <PublicLedgerModal
        isOpen={isLedgerOpen}
        onClose={() => setIsLedgerOpen(false)}
      />
    </div>
  );
};

export default FreelancerDashboard;
