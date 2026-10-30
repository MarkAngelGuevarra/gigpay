import React, { useState } from 'react';
import { PlusCircle, CheckCircle, Clock, ShieldAlert, AlertTriangle, Sparkles, ExternalLink, FileCode, FileText, Video, CheckCircle2, RotateCcw } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { requestWalletSignature, formatStellarError } from '../lib/stellar';
import TaskProgress from '../components/TaskProgress';

const ClientDashboard = () => {
  const { user, publicKey } = useAuth();
  const { tasks, isLoading, addTask, updateTaskStatus, raiseDispute, resolveDispute } = useTasks();
  const { addToast } = useToast();
  const clientTasks = tasks.filter(t => t.client_id === user?.id);

  // Aggregate Metrics Calculations (R2 & R3 Requirement with safe zero-division guards)
  const totalEscrowed = clientTasks.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const activeEscrows = clientTasks.filter(t => t.status === 'In Progress' || t.status === 'Under Review' || t.status === 'Disputed').length;
  const totalReleased = clientTasks.filter(t => t.status === 'Completed').reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
  const completedTasks = clientTasks.filter(t => t.status === 'Completed');
  const totalTasksCount = clientTasks.length;
  const completionPercentage = totalTasksCount > 0 
    ? Math.round((completedTasks.length / totalTasksCount) * 100) 
    : 0;
  
  const [isTransacting, setIsTransacting] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAmount, setNewTaskAmount] = useState('');
  const [freelancerWallet, setFreelancerWallet] = useState('');
  const [taskToApprove, setTaskToApprove] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);

  // Dispute Modal State (Deliverable 3 - Armielyn Requirement)
  const [taskToDispute, setTaskToDispute] = useState(null);
  const [disputeReason, setDisputeReason] = useState('Deliverables require revision or do not match agreed specification.');

  const initiateApproval = (taskOrId) => {
    if (!publicKey) {
      addToast("Please connect your Freighter wallet in the header before approving milestone releases.", "warning");
      return;
    }
    const taskObj = (taskOrId && typeof taskOrId === 'object') 
      ? taskOrId 
      : (clientTasks.find(t => t.id === taskOrId) || { id: taskOrId });
    if (taskObj.status === 'Available') {
      addToast("Cannot release escrow before task is accepted and work is in progress.", "warning");
      return;
    }
    setTaskToApprove(taskObj);
    setConfirmText('');
  };

  const handleDisputeSubmit = async () => {
    if (!taskToDispute) return;
    try {
      await raiseDispute(taskToDispute, disputeReason);
      setTaskToDispute(null);
      setDisputeReason('Deliverables require revision or do not match agreed specification.');
    } catch (error) {
      addToast("Failed to raise dispute: " + error.message, "error");
    }
  };

  const handleResolve = async (id) => {
    try {
      await resolveDispute(id);
    } catch (error) {
      addToast("Failed to resolve dispute.", "error");
    }
  };

  const simulateAIEstimate = () => {
    if (!newTaskTitle) {
      addToast("Please enter a task title first so AI can analyze it.", "error");
      return;
    }
    setIsEstimating(true);
    setTimeout(() => {
      const words = newTaskTitle.toLowerCase();
      let est = 2;
      if (words.includes('website') || words.includes('app')) est = 5;
      if (words.includes('logo') || words.includes('design')) est = 2;
      if (words.includes('smart contract') || words.includes('blockchain')) est = 10;
      
      setNewTaskAmount(est.toString());
      setIsEstimating(false);
      addToast(`AI estimated a Testnet milestone rate of ${est} XLM for this task.`, "success");
    }, 1000);
  };

  const handleApprove = async () => {
    if (confirmText !== 'CONFIRM' || !taskToApprove) return;
    if (!publicKey) {
      addToast("Please connect your Freighter wallet in the header before approving milestone releases.", "warning");
      return;
    }

    const targetTaskId = typeof taskToApprove === 'object' ? taskToApprove.id : taskToApprove;
    if (!targetTaskId) {
      addToast("Error: Missing task identifier for milestone release.", "error");
      return;
    }

    setIsTransacting(true);
    try {
      const result = await updateTaskStatus(targetTaskId, 'Completed');
      setTaskToApprove(null);
      setConfirmText('');
      const txSnippet = result?.hash ? ` (Tx: ${result.hash.slice(0, 8)}...)` : '';
      addToast(`Transaction Confirmed! Escrow released to freelancer on Testnet${txSnippet}.`, "success");
    } catch (error) {
      const formatted = formatStellarError(error);
      const isWarning = formatted.includes("rejected") || formatted.includes("declined");
      addToast(formatted, isWarning ? "warning" : "error");
    } finally {
      setIsTransacting(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskAmount) return;

    const safeClientKey = typeof publicKey === 'string' ? publicKey.trim() : (publicKey?.address?.trim() || '');
    if (freelancerWallet && safeClientKey && freelancerWallet.trim() === safeClientKey) {
      addToast("Self-dealing prevented: Client and Freelancer wallets cannot be identical.", "warning");
      return;
    }

    setIsTransacting(true);
    
    try {
      const newTask = {
        title: newTaskTitle,
        amount: newTaskAmount,
        freelancer_wallet: freelancerWallet.trim() || undefined
      };
      await addTask(newTask);
      setNewTaskTitle('');
      setNewTaskAmount('');
      setFreelancerWallet('');
      addToast("Task Escrow created and funded on Stellar Testnet!", "success");
    } catch (error) {
      const formatted = formatStellarError(error);
      const isWarning = formatted.includes("rejected") || formatted.includes("declined") || formatted.includes("Self-dealing") || formatted.includes("Insufficient balance");
      addToast(formatted, isWarning ? "warning" : "error");
    } finally {
      setIsTransacting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Client Portal</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            Manage your funded Stellar Soroban escrow tasks, inspect freelancer proof-of-work, and approve milestone payouts.
          </p>
        </div>
      </div>

      {/* Aggregate Balance & Escrow Metrics Cards (R2 & R3 Pilot Requirement) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="glass-panel" style={{ flex: '1 1 200px', borderLeft: '4px solid var(--accent)' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Total Escrowed</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>
            {totalEscrowed.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>XLM</span>
          </div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 200px', borderLeft: '4px solid #38bdf8' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Active Escrows</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>
            {activeEscrows}
          </div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 200px', borderLeft: '4px solid #10b981' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Total Released</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>
            {totalReleased.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>XLM</span>
          </div>
        </div>
        <div className="glass-panel" style={{ flex: '1 1 200px', borderLeft: '4px solid #f59e0b' }}>
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>Completion Rate</h4>
          <div style={{ fontSize: '2.2rem', fontWeight: 'bold' }}>
            {completionPercentage}%
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
        {/* Task List */}
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isLoading ? (
            <div className="glass-panel" style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: 'var(--accent)' }}>
              Loading tasks from blockchain...
            </div>
          ) : clientTasks.length === 0 ? (
            <div className="glass-panel" style={{ padding: '2rem', border: '1px solid rgba(0, 242, 254, 0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <span style={{ background: 'rgba(0, 242, 254, 0.15)', color: '#00f2fe', padding: '0.25rem 0.65rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px' }}>
                  🚀 PILOT TESTER QUICK-START
                </span>
              </div>
              <h3 style={{ marginBottom: '0.5rem', color: 'white' }}>No Active Escrows Yet — Ready to Test!</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Welcome to the GigPay Client Portal on <strong>Stellar Soroban Protocol 22</strong>. Follow these 3 quick steps to complete your pilot evaluation:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem', fontSize: '0.86rem', color: 'var(--text-main)' }}>
                <div><strong>1️⃣ Connect Wallet (Optional on Mobile):</strong> Click <em>Connect Wallet</em> in the top bar (or pre-fill a sample task below).</div>
                <div><strong>2️⃣ Lock Testnet Escrow:</strong> Click the button below to pre-fill a <strong>2 XLM</strong> sample milestone and lock it in Soroban contract <code>CAUU2O...7RD3</code>.</div>
                <div><strong>3️⃣ Record Your Session:</strong> Take a quick screenshot of this dashboard and submit the 60-second Pilot Tester Form!</div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setNewTaskTitle('UI/UX Prototype & Soroban Integration');
                    setNewTaskAmount('2');
                    addToast('Sample 2 XLM milestone loaded! Click "Lock Funds in Escrow" on the right.', 'success');
                  }}
                  style={{ fontSize: '0.85rem', padding: '0.55rem 1rem' }}
                >
                  ⚡ Fill Sample Task (2 XLM)
                </button>
                <a
                  href="https://forms.gle/oLGjJRcxg5LZ5bC96"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', padding: '0.55rem 1rem', borderColor: 'rgba(0, 242, 254, 0.45)', color: '#00f2fe', textDecoration: 'none' }}
                >
                  📝 Submit 60s Pilot Feedback <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ) : null}

          {!isLoading && clientTasks.map(task => {
            const isDisputed = task.status === 'Disputed';
            const hasProof = task.proof_attached || task.github_pr_url || task.doc_url || task.loom_url;

            return (
              <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', borderLeft: isDisputed ? '4px solid #ef4444' : '4px solid var(--accent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ marginBottom: '0.25rem', color: isDisputed ? '#ef4444' : 'white' }}>{task.title}</h3>
                    <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={14} /> {task.status}
                      </span>
                      <span>Freelancer: {task.freelancer_id ? task.freelancer_id.slice(0, 8) + '...' : 'Unassigned'}</span>
                      <span>Contract: <code>CAUU2O...7RD3</code></span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: isDisputed ? '#ef4444' : 'var(--accent)' }}>
                      {task.amount} XLM
                    </div>
                    
                    {/* Action Buttons */}
                    {(task.status === 'In Progress' || task.status === 'Available') && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {task.status === 'In Progress' && (
                          <button 
                            className="btn btn-outline" 
                            onClick={() => setTaskToDispute(task.id)}
                            disabled={isTransacting}
                            style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                            title="Freeze escrow funds and log dispute"
                          >
                            <AlertTriangle size={13} /> Freeze & Dispute
                          </button>
                        )}
                        <button 
                          className="btn btn-primary" 
                          onClick={() => initiateApproval(task)}
                          disabled={isTransacting || task.status === 'Available'}
                          title={task.status === 'Available' ? "Cannot release escrow before task is accepted by a freelancer" : undefined}
                          style={{ 
                            padding: '0.45rem 0.95rem', 
                            fontSize: '0.8rem', 
                            opacity: (isTransacting || task.status === 'Available') ? 0.45 : 1,
                            cursor: (isTransacting || task.status === 'Available') ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <CheckCircle size={14} /> {isTransacting ? 'Processing...' : 'Approve & Release'}
                        </button>
                      </div>
                    )}

                    {/* Disputed State Freeze Notice & Resolution Button */}
                    {isDisputed && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleResolve(task.id)}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem', borderColor: '#10b981', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <RotateCcw size={12} /> Resolve Dispute
                        </button>
                      </div>
                    )}

                    {task.tx_hash && (
                      <a 
                        href={`https://stellar.expert/explorer/testnet/tx/${task.tx_hash}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#4ade80', fontSize: '0.78rem', background: 'rgba(74, 222, 128, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', textDecoration: 'none', border: '1px solid rgba(74, 222, 128, 0.3)' }}
                      >
                        On-Chain Tx: {task.tx_hash.slice(0, 6)}...{task.tx_hash.slice(-4)} <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Dispute Metadata Freeze Alert (Armielyn Acceptance Criteria b & c) */}
                {isDisputed && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0.85rem', fontSize: '0.85rem', color: '#fca5a5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                      <AlertTriangle size={15} color="#ef4444" /> ⛔ Release Action Frozen (Disputed State)
                    </div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.8rem' }}>
                      <strong>Dispute Metadata:</strong> {task.dispute_reason || 'Client logged revision request.'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      Escrow settlement is paused per SOW Deliverable 3 until mutually resolved or updated by the freelancer.
                    </div>
                  </div>
                )}

                {/* Attached Freelancer Proof of Work (Armielyn Deliverable 3 Verification) */}
                {hasProof && (
                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#00f2fe', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.5rem' }}>
                      <CheckCircle2 size={14} /> Freelancer Proof of Work Attached:
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: task.submission_notes ? '0.5rem' : 0 }}>
                      {task.github_pr_url && (
                        <a href={task.github_pr_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#00f2fe', borderColor: 'rgba(0, 242, 254, 0.4)' }}>
                          <FileCode size={13} /> Inspect GitHub PR <ExternalLink size={11} />
                        </a>
                      )}
                      {task.doc_url && (
                        <a href={task.doc_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.4)' }}>
                          <FileText size={13} /> Inspect Document <ExternalLink size={11} />
                        </a>
                      )}
                      {task.loom_url && (
                        <a href={task.loom_url} target="_blank" rel="noreferrer" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.4)' }}>
                          <Video size={13} /> Watch Loom Demo <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    {task.submission_notes && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.4rem' }}>
                        <strong>Freelancer Note:</strong> {task.submission_notes}
                      </div>
                    )}
                  </div>
                )}

                <TaskProgress status={task.status} />
              </div>
            );
          })}
        </div>

        {/* Create Task Form */}
        <div className="glass-panel" style={{ flex: '1 1 300px', height: 'fit-content' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>Create Task Escrow</h3>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} onSubmit={handleCreateTask}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Task Title</label>
              <input 
                type="text" 
                placeholder="e.g. Logo Design" 
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
                required
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <label style={{ color: 'var(--text-muted)', margin: 0 }}>Milestone Amount (XLM)</label>
                <button
                  type="button"
                  onClick={simulateAIEstimate}
                  disabled={isEstimating}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: 0
                  }}
                >
                  <Sparkles size={14} /> {isEstimating ? 'Estimating...' : 'AI Fee Estimate'}
                </button>
              </div>
              <input 
                type="number" 
                placeholder="e.g. 5" 
                min="0.1"
                step="any"
                value={newTaskAmount}
                onChange={(e) => setNewTaskAmount(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                Target Freelancer Wallet (Optional)
              </label>
              <input 
                type="text" 
                placeholder="G... (Leave blank for public marketplace)" 
                value={freelancerWallet}
                onChange={(e) => setFreelancerWallet(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '0.85rem' }} 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Self-dealing protection active: Cannot assign to your own wallet.
              </span>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isTransacting}
              style={{ marginTop: '0.5rem', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            >
              <PlusCircle size={18} /> {isTransacting ? 'Invoking Soroban RPC...' : 'Lock Funds in Escrow'}
            </button>
          </form>

          {/* Fee Comparison Widget */}
          {newTaskAmount && Number(newTaskAmount) > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--accent)' }}>💡 0% Escrow Advantage</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Traditional Fee (20%):</span>
                  <span style={{ color: '#ff4444' }}>${(Number(newTaskAmount) * 0.2).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Stellar Gas Fee:</span>
                  <span style={{ color: '#4ade80' }}>&lt; $0.0001</span>
                </div>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '0.25rem 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 'bold' }}>
                  <span>Total Savings:</span>
                  <span>${(Number(newTaskAmount) * 0.2 - 0.0001).toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dispute Reason Modal (Deliverable 3 - Armielyn Requirement) */}
      {taskToDispute && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem', boxSizing: 'border-box' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 'min(450px, calc(100vw - 2rem))', boxSizing: 'border-box', padding: '1.75rem', border: '1px solid #ef4444' }}>
            <h3 style={{ color: '#ef4444', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={20} /> Raise Escrow Dispute
            </h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Freezes the escrow milestone and blocks standard fund release. Dispute metadata will be logged to the task record.
            </p>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Dispute Reason / Required Revisions:
            </label>
            <textarea
              rows={3}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #ef4444', background: 'rgba(0,0,0,0.4)', color: 'white', marginBottom: '1.25rem', fontSize: '0.85rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setTaskToDispute(null)}
                style={{ borderColor: 'var(--text-muted)', color: 'var(--text-muted)', padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
              <button 
                className="btn" 
                onClick={handleDisputeSubmit}
                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '6px' }}
              >
                Confirm Dispute Freeze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Confirmation Modal: Strict CONFIRM Requirement (Armielyn Acceptance Criteria d) */}
      {taskToApprove && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)', padding: '1rem', boxSizing: 'border-box' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 'min(450px, calc(100vw - 2rem))', boxSizing: 'border-box', padding: '1.75rem', border: '1px solid #10b981' }}>
            <h3 style={{ color: '#10b981', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={22} /> Milestone Release Confirmation
            </h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
              You are about to release funds from the Soroban escrow contract (<code>CAUU2O...7RD3</code>) to the freelancer. This on-chain settlement is <strong>irreversible</strong>.
            </p>
            {taskToApprove?.title && (
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.82rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ color: 'white', fontWeight: 600 }}>{taskToApprove.title}</div>
                <div style={{ marginTop: '0.25rem', color: '#10b981', fontWeight: 'bold' }}>
                  Release Amount: {taskToApprove.amount} XLM
                </div>
              </div>
            )}
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
              <strong>⚠️ Armielyn Reviewer Requirement:</strong> To prevent accidental releases, please type <strong>CONFIRM</strong> in all-caps below:
            </div>
            <input 
              type="text" 
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              disabled={isTransacting}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: confirmText === 'CONFIRM' ? '1px solid #10b981' : '1px solid var(--border)', background: 'rgba(0,0,0,0.4)', color: 'white', marginBottom: '1.25rem', letterSpacing: '1px', fontWeight: 'bold' }} 
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => { if (!isTransacting) setTaskToApprove(null); }}
                disabled={isTransacting}
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderColor: 'var(--text-muted)', color: 'var(--text-muted)', opacity: isTransacting ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button 
                className="btn" 
                onClick={handleApprove}
                disabled={confirmText !== 'CONFIRM' || !publicKey || isTransacting}
                style={{ 
                  padding: '0.45rem 1.1rem', 
                  fontSize: '0.8rem',
                  backgroundColor: (confirmText === 'CONFIRM' && publicKey) ? '#10b981' : '#475569', 
                  color: 'white', 
                  cursor: (confirmText === 'CONFIRM' && publicKey && !isTransacting) ? 'pointer' : 'not-allowed',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600
                }}
              >
                {isTransacting ? 'Invoking Soroban RPC...' : 'Release Escrow Payout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
