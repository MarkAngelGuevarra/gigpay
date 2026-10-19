import React, { useState } from 'react';
import { PlusCircle, CheckCircle, Clock, ShieldAlert, AlertTriangle, Sparkles, ExternalLink, Zap } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { requestWalletSignature, formatStellarError } from '../lib/stellar';
import TaskProgress from '../components/TaskProgress';

const ClientDashboard = () => {
  const { user, publicKey, connectTesterWallet } = useAuth();
  const { tasks, isLoading, addTask, updateTaskStatus } = useTasks();
  const { addToast } = useToast();
  const clientTasks = tasks.filter(t => t.client_id === user?.id || (user?.id === 'demo-client-uuid-001' && (!t.client_id || t.client_id === 'demo-client-uuid-001')));
  
  const [isTransacting, setIsTransacting] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAmount, setNewTaskAmount] = useState('');
  const [freelancerWallet, setFreelancerWallet] = useState('');
  const [taskToApprove, setTaskToApprove] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [justCreatedTask, setJustCreatedTask] = useState(null);

  const initiateApproval = (id) => {
    if (!publicKey) {
      connectTesterWallet();
      addToast("Connected Testnet Simulator Wallet for milestone release.", "info");
    }
    setTaskToApprove(id);
    setConfirmText('');
  };

  const handleDispute = async (id) => {
    try {
      await updateTaskStatus(id, 'Disputed');
      addToast("Task has been disputed. Funds are frozen until arbitration resolves.", "success");
    } catch (error) {
      addToast("Failed to raise dispute.", "error");
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
      connectTesterWallet();
    }
    setIsTransacting(true);
    const taskId = taskToApprove;
    setTaskToApprove(null);
    
    try {
      await updateTaskStatus(taskId, 'Completed');
      addToast("Transaction Confirmed! Funds released to freelancer.", "success");
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

    if (!publicKey) {
      connectTesterWallet();
      addToast("Connected Testnet Simulator Wallet with 10,000 XLM for escrow funding.", "info");
    }

    const safeClientKey = typeof publicKey === 'string' ? publicKey.trim() : (publicKey?.address?.trim() || '');
    if (freelancerWallet && safeClientKey && freelancerWallet.trim() === safeClientKey) {
      addToast("Self-dealing prevented: Client and Freelancer wallets cannot be identical.", "warning");
      return;
    }

    setIsTransacting(true);
    
    try {
      const newTask = {
        title: newTaskTitle.trim(),
        amount: newTaskAmount.trim(),
        freelancer_wallet: freelancerWallet.trim() || undefined
      };
      const created = await addTask(newTask);
      setJustCreatedTask(created || { id: 'temp-' + Date.now(), title: newTask.title, amount: newTask.amount });
      setNewTaskTitle('');
      setNewTaskAmount('');
      setFreelancerWallet('');
      addToast(`Task "${newTask.title}" created and locked in Soroban Escrow!`, "success");
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
          <p style={{ color: 'var(--text-muted)' }}>Manage your funded Stellar Soroban escrow tasks and approve milestone releases.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
        {/* Task List */}
        <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {justCreatedTask && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              animation: 'fadeIn 0.3s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CheckCircle size={22} style={{ color: '#4ade80', flexShrink: 0 }} />
                <div>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem' }}>
                    Milestone Escrow Successfully Created & Funded!
                  </div>
                  <div style={{ color: '#86efac', fontSize: '0.85rem' }}>
                    "{justCreatedTask.title}" ({justCreatedTask.amount} XLM) is now available for freelancers to accept.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setJustCreatedTask(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem' }}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          )}
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
                    if (!publicKey) {
                      connectTesterWallet();
                    }
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
          {!isLoading && clientTasks.map(task => (
            <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: task.status === 'Disputed' ? '#ef4444' : 'white' }}>{task.title}</h3>
                    {task.id === justCreatedTask?.id && (
                      <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 'bold' }}>
                        ✨ Just Created
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={14} /> {task.status}
                    </span>
                    <span>Freelancer: {task.freelancer_id ? task.freelancer_id.slice(0, 8) + '...' : 'Unassigned'}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: task.status === 'Disputed' ? '#ef4444' : 'var(--accent)' }}>
                    {task.amount} XLM
                  </div>
                  
                  {task.status === 'In Progress' && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-outline" 
                        onClick={() => handleDispute(task.id)}
                        disabled={isTransacting}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderColor: '#ef4444', color: '#ef4444' }}
                        title="Freeze funds and request arbitration"
                      >
                        <AlertTriangle size={14} /> Dispute
                      </button>
                      <button 
                        className="btn btn-outline" 
                        onClick={() => initiateApproval(task.id)}
                        disabled={isTransacting}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', borderColor: 'var(--accent)', color: 'var(--accent)', opacity: isTransacting ? 0.5 : 1 }}
                      >
                        <CheckCircle size={14} /> {isTransacting ? 'Processing...' : 'Approve & Pay'}
                      </button>
                    </div>
                  )}
                  {task.tx_hash ? (
                    <a 
                      href={`https://stellar.expert/explorer/testnet/tx/${task.tx_hash}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#4ade80', fontSize: '0.8rem', background: 'rgba(74, 222, 128, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', textDecoration: 'none', border: '1px solid rgba(74, 222, 128, 0.3)' }}
                    >
                      On-Chain Tx: {task.tx_hash.slice(0, 6)}...{task.tx_hash.slice(-4)} <ExternalLink size={11} />
                    </a>
                  ) : (
                    <a 
                      href={`https://stellar.expert/explorer/testnet/contract/${task.contract_id || 'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3'}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem', textDecoration: 'none' }}
                    >
                      Contract: CAUU2O...7RD3 <ExternalLink size={11} />
                    </a>
                  )}
                  {task.status === 'Disputed' && (
                    <span style={{ color: '#ef4444', fontSize: '0.9rem', fontWeight: 'bold' }}>Awaiting Arbitration</span>
                  )}
                </div>
              </div>
              <TaskProgress status={task.status} />
            </div>
          ))}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.5rem' }}>
                <label style={{ color: 'var(--text-muted)' }}>Escrow Amount (Testnet XLM)</label>
                <button 
                  type="button" 
                  onClick={simulateAIEstimate}
                  disabled={isEstimating}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
                >
                  <Sparkles size={12} /> {isEstimating ? 'Estimating...' : 'AI Estimate'}
                </button>
              </div>
              <input 
                type="number" 
                step="any"
                min="0.1"
                placeholder="2" 
                value={newTaskAmount}
                onChange={(e) => setNewTaskAmount(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
                required
              />
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                {['1', '2', '5'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewTaskAmount(preset)}
                    style={{
                      flex: 1,
                      padding: '0.3rem 0.5rem',
                      fontSize: '0.75rem',
                      borderRadius: '0.35rem',
                      border: newTaskAmount === preset ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.12)',
                      background: newTaskAmount === preset ? 'rgba(0, 242, 254, 0.14)' : 'rgba(0,0,0,0.25)',
                      color: newTaskAmount === preset ? '#00f2fe' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {preset} XLM
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Freelancer Destination Wallet (Optional)
              </label>
              <input 
                type="text" 
                placeholder="GAAT... (Defaults to QA recipient)" 
                value={freelancerWallet}
                onChange={(e) => setFreelancerWallet(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '0.75rem', 
                  borderRadius: '0.5rem', 
                  border: freelancerWallet && freelancerWallet.trim() === publicKey?.trim() ? '1px solid #ef4444' : '1px solid var(--border)', 
                  background: 'rgba(0,0,0,0.2)', 
                  color: 'white', 
                  fontSize: '0.8rem' 
                }} 
              />
              {freelancerWallet && freelancerWallet.trim() === publicKey?.trim() && (
                <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  ⚠️ Anti-Self-Dealing: Cannot send escrow to your own connected client wallet.
                </span>
              )}
            </div>

            {!publicKey ? (
              <div style={{ 
                padding: '0.85rem', 
                background: 'rgba(0, 242, 254, 0.08)', 
                border: '1px solid rgba(0, 242, 254, 0.3)', 
                borderRadius: '0.5rem',
                marginBottom: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem'
              }}>
                <div style={{ color: '#00f2fe', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                  <Zap size={15} /> Student / Mobile Tester Mode
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0, lineHeight: 1.4 }}>
                  No Freighter wallet extension? Connect a pre-funded Testnet Simulator Wallet with 1 click to test escrows without setup.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    connectTesterWallet();
                    addToast("Simulator Testnet Wallet (10,000 XLM) connected!", "success");
                  }}
                  className="btn btn-outline"
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    fontSize: '0.8rem',
                    borderColor: '#00f2fe',
                    color: '#00f2fe',
                    background: 'rgba(0, 242, 254, 0.12)',
                    fontWeight: 600
                  }}
                >
                  ⚡ Connect Testnet Simulator Wallet
                </button>
              </div>
            ) : null}
            <button 
              className="btn btn-primary" 
              style={{ marginTop: '0.5rem', opacity: isTransacting ? 0.6 : 1 }}
              disabled={isTransacting}
            >
              <PlusCircle size={18}/> {isTransacting ? 'Signing & Locking Escrow on Testnet...' : 'Lock Funds in Escrow'}
            </button>
          </form>

          {/* The GigPay Advantage Widget */}
          {newTaskAmount && !isNaN(newTaskAmount) && Number(newTaskAmount) > 0 && (
            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.5rem' }}>
              <h4 style={{ color: '#4ade80', marginBottom: '0.5rem', fontSize: '0.9rem' }}>✨ The GigPay Advantage</h4>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Upwork Fee (20%):</span>
                  <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>${(Number(newTaskAmount) * 0.2).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Stellar Network Fee:</span>
                  <span style={{ color: '#4ade80' }}>$0.0001</span>
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

      {/* AWS-style Confirmation Modal */}
      {taskToApprove && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
          <div className="glass-panel" style={{ width: '400px', padding: '2rem', border: '1px solid #ff4444' }}>
            <h3 style={{ color: '#ff4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚠️ Danger Zone
            </h3>
            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
              You are about to release funds from escrow. This action is irreversible on the blockchain.
            </p>
            <p style={{ marginBottom: '0.5rem' }}>
              To proceed, please type <strong>CONFIRM</strong> below:
            </p>
            <input 
              type="text" 
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRM"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #ff4444', background: 'rgba(0,0,0,0.4)', color: 'white', marginBottom: '1.5rem' }} 
            />
            {!publicKey && (
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ color: '#f59e0b', fontSize: '0.85rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <AlertTriangle size={14} /> Wallet not connected.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    connectTesterWallet();
                    addToast("Simulator Testnet Wallet connected!", "success");
                  }}
                  className="btn btn-outline"
                  style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem', borderColor: '#00f2fe', color: '#00f2fe', background: 'rgba(0, 242, 254, 0.08)' }}
                >
                  ⚡ Connect Simulator Wallet to Release Funds
                </button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setTaskToApprove(null)}
                style={{ padding: '0.5rem 1rem', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button 
                className="btn" 
                onClick={handleApprove}
                disabled={confirmText !== 'CONFIRM' || isTransacting}
                style={{ padding: '0.5rem 1rem', backgroundColor: confirmText === 'CONFIRM' ? '#ff4444' : '#555', color: 'white', cursor: confirmText === 'CONFIRM' ? 'pointer' : 'not-allowed' }}
              >
                {isTransacting ? 'Processing...' : 'Force Release Funds'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
