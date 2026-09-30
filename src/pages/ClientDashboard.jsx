import React, { useState } from 'react';
import { PlusCircle, CheckCircle, Clock, ShieldAlert, AlertTriangle, Sparkles, ExternalLink } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { requestWalletSignature } from '../lib/stellar';
import TaskProgress from '../components/TaskProgress';

const ClientDashboard = () => {
  const { user, publicKey } = useAuth();
  const { tasks, isLoading, addTask, updateTaskStatus } = useTasks();
  const { addToast } = useToast();
  const clientTasks = tasks.filter(t => t.client_id === user?.id);
  
  const [isTransacting, setIsTransacting] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAmount, setNewTaskAmount] = useState('');
  const [taskToApprove, setTaskToApprove] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);

  const initiateApproval = (id) => {
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
      // Simple mock logic based on words
      const words = newTaskTitle.toLowerCase();
      let est = 100;
      if (words.includes('website') || words.includes('app')) est = 1000;
      if (words.includes('logo') || words.includes('design')) est = 300;
      if (words.includes('smart contract') || words.includes('blockchain')) est = 2500;
      
      setNewTaskAmount(est.toString());
      setIsEstimating(false);
      addToast(`AI estimated a fair market rate of $${est} USDC for this task.`, "success");
    }, 1500);
  };

  const handleApprove = async () => {
    if (confirmText !== 'CONFIRM' || !taskToApprove) return;
    setIsTransacting(true);
    const taskId = taskToApprove;
    setTaskToApprove(null);
    
    try {
      await updateTaskStatus(taskId, 'Completed');
      addToast("Transaction Confirmed! Funds released to freelancer.", "success");
    } catch (error) {
      addToast(error.message || "Transaction failed.", "error");
    } finally {
      setIsTransacting(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle || !newTaskAmount) return;
    setIsTransacting(true);
    
    try {
      const newTask = {
        title: newTaskTitle,
        amount: newTaskAmount
      };
      addTask(newTask);
      setNewTaskTitle('');
      setNewTaskAmount('');
      addToast("Task Escrow created successfully!", "success");
    } catch (error) {
      addToast(error.message || "Transaction failed.", "error");
    } finally {
      setIsTransacting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2>Client Portal</h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage your funded tasks and approve work.</p>
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
            <p style={{ color: 'var(--text-muted)' }}>No active tasks.</p>
          ) : null}
          {!isLoading && clientTasks.map(task => (
            <div key={task.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h3 style={{ marginBottom: '0.25rem', color: task.status === 'Disputed' ? '#ef4444' : 'white' }}>{task.title}</h3>
                  <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={14} /> {task.status}
                    </span>
                    <span>Freelancer: {task.freelancer_id ? task.freelancer_id.slice(0, 8) + '...' : 'Unassigned'}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: task.status === 'Disputed' ? '#ef4444' : 'var(--accent)' }}>
                    ${task.amount} USDC
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
                <label style={{ color: 'var(--text-muted)' }}>Amount (USDC)</label>
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
                placeholder="100" 
                value={newTaskAmount}
                onChange={(e) => setNewTaskAmount(e.target.value)}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', color: 'white' }} 
                required
              />
            </div>
            {!publicKey && (
              <div style={{ color: '#ef4444', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={16} /> Please connect Freighter Wallet first.
              </div>
            )}
            <button 
              className="btn btn-primary" 
              style={{ marginTop: '0.5rem', opacity: isTransacting || !publicKey ? 0.5 : 1 }}
              disabled={isTransacting || !publicKey}
            >
              <PlusCircle size={18}/> {isTransacting ? 'Locking...' : 'Lock Funds in Escrow'}
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
                disabled={confirmText !== 'CONFIRM'}
                style={{ padding: '0.5rem 1rem', backgroundColor: confirmText === 'CONFIRM' ? '#ff4444' : '#555', color: 'white', cursor: confirmText === 'CONFIRM' ? 'pointer' : 'not-allowed' }}
              >
                Force Release Funds
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDashboard;
