import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { requestWalletSignature, submitFundTask, submitApproveTask, GIGPAY_ESCROW_CONTRACT_ID } from '../lib/stellar';

const TaskContext = createContext();

export const useTasks = () => useContext(TaskContext);

// Resilient cache key for instantaneous cross-tab state persistence
const GIGPAY_TASKS_CACHE_KEY = 'gigpay_tasks_cache_v2';

const getLocalTasks = () => {
  try {
    const raw = localStorage.getItem(GIGPAY_TASKS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[GigPay Sync] Local cache read warning:", err);
    return [];
  }
};

const setLocalTasks = (tasksList) => {
  try {
    localStorage.setItem(GIGPAY_TASKS_CACHE_KEY, JSON.stringify(tasksList));
  } catch (err) {
    console.warn("[GigPay Sync] Local cache write warning:", err);
  }
};

export const TaskProvider = ({ children }) => {
  const { user, publicKey } = useAuth();
  const { addToast } = useToast();

  // 1. Zero-Flash Hydration: initialize immediately from local cache so the UI renders in 0ms
  const [tasks, setTasks] = useState(() => {
    const cached = getLocalTasks();
    return cached.length > 0 ? cached : [];
  });
  const [isLoading, setIsLoading] = useState(() => getLocalTasks().length === 0);

  // Helper to update state and atomic localStorage cache simultaneously
  const updateTasksAndCache = (updater) => {
    setTasks((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setLocalTasks(next);
      return next;
    });
  };

  // 2. Real-Time Cross-Tab / Multi-Window Synchronization
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === GIGPAY_TASKS_CACHE_KEY && e.newValue) {
        try {
          const syncedTasks = JSON.parse(e.newValue);
          if (Array.isArray(syncedTasks)) {
            setTasks(syncedTasks);
          }
        } catch (err) {
          console.warn("[GigPay Sync] Cross-tab storage parse exception:", err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // 3. Database Fetch & Supabase Realtime Pipeline
  useEffect(() => {
    const fetchTasks = async () => {
      if (getLocalTasks().length === 0) {
        setIsLoading(true);
      }
      
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error || !data || data.length === 0) {
          console.warn("Supabase tasks unavailable, using resilient fallback cache or mocks:", error);
          const cached = getLocalTasks();
          if (cached.length > 0) {
            setTasks(cached);
          } else {
            const fallback = [
              {
                id: 'task-mock-1',
                title: 'Soroban Escrow Smart Contract Audit',
                amount: '500',
                status: 'Available',
                client_id: user?.id || 'demo-client-uuid-001',
                contract_id: GIGPAY_ESCROW_CONTRACT_ID,
                created_at: new Date().toISOString()
              },
              {
                id: 'task-mock-2',
                title: 'Freighter Wallet UX Optimization',
                amount: '350',
                status: 'In Progress',
                client_id: user?.id || 'demo-client-uuid-001',
                freelancer_id: 'demo-freelancer-uuid-002',
                contract_id: GIGPAY_ESCROW_CONTRACT_ID,
                created_at: new Date().toISOString()
              }
            ];
            updateTasksAndCache(fallback);
          }
        } else if (data) {
          updateTasksAndCache(data);
        }
      } catch (err) {
        console.warn("[GigPay Sync] Fetch tasks exception, preserving existing cached data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();

    // Supabase Realtime Webhook Channel
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            updateTasksAndCache((prev) => [payload.new, ...prev.filter(t => t.id !== payload.new.id)]);
          } else if (payload.eventType === 'UPDATE') {
            updateTasksAndCache((prev) => prev.map((t) => t.id === payload.new.id ? payload.new : t));
            
            // Realtime notification logic
            if (user) {
              if (payload.new.status === 'In Progress' && payload.old?.status === 'Available' && payload.new.client_id === user.id) {
                addToast("A freelancer has accepted your task!", "success");
              }
              if (payload.new.status === 'Completed' && payload.old?.status === 'In Progress' && payload.new.freelancer_id === user.id) {
                addToast("The client has released your funds!", "success");
              }
            }
          } else if (payload.eventType === 'DELETE') {
            updateTasksAndCache((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // 4. Add Task with Optimistic Local Cache & Background DB Sync
  const addTask = async (task) => {
    if (!user || !publicKey) throw new Error("Wallet not connected");
    try {
      // 1. Execute live Soroban fund_task invocation via Freighter & Testnet RPC
      const fundResult = await submitFundTask({
        clientAddress: publicKey,
        amount: task.amount
      });

      const txHash = fundResult?.hash || null;
      const explorerUrl = fundResult?.explorerUrl || null;

      const newTask = {
        id: 'task-' + Date.now(),
        title: task.title,
        amount: task.amount,
        status: 'Available',
        client_id: user.id,
        contract_id: GIGPAY_ESCROW_CONTRACT_ID,
        tx_hash: txHash,
        explorer_url: explorerUrl,
        created_at: new Date().toISOString()
      };

      // Optimistically update state & local cache immediately
      updateTasksAndCache((prev) => [newTask, ...prev]);

      // 2. Persist to Database with fallback
      try {
        const { data, error } = await supabase
          .from('tasks')
          .insert([{
            title: task.title,
            amount: task.amount,
            status: 'Available',
            client_id: user.id,
            contract_id: GIGPAY_ESCROW_CONTRACT_ID
          }])
          .select();

        if (error) throw error;
        if (data && data[0]) {
          updateTasksAndCache((prev) => prev.map(t => t.id === newTask.id ? { ...data[0], tx_hash: txHash, explorer_url: explorerUrl } : t));
        }
      } catch (dbErr) {
        console.warn("Supabase insert notice (using local synced state):", dbErr);
      }

      if (fundResult?.explorerUrl && !fundResult?.isDemo) {
        addToast(`Escrow funded on Testnet! Tx: ${txHash.slice(0, 10)}...`, "success");
      }
    } catch (err) {
      console.error("Failed to add task:", err);
      throw err;
    }
  };

  // 5. Update Task Status with Optimistic UI & Revert on Cancellation
  const updateTaskStatus = async (id, newStatus, assignFreelancer = false) => {
    if (!user || !publicKey) throw new Error("Wallet not connected");
    try {
      const taskToUpdate = tasks.find(t => t.id === id);
      if (!taskToUpdate) return;
      
      const previousTasks = [...tasks];
      const updatedFields = { 
        status: newStatus 
      };

      if (assignFreelancer) {
        updatedFields.freelancer_id = user.id;
      }

      // Optimistic Update: instantly update UI & broadcast across all open tabs/windows
      updateTasksAndCache((prev) => prev.map((t) => t.id === id ? { ...t, ...updatedFields } : t));

      let releaseResult = null;
      try {
        if (newStatus === 'Completed') {
          releaseResult = await submitApproveTask({
            clientAddress: publicKey,
            taskId: id
          });
          if (releaseResult?.hash) {
            updatedFields.release_tx_hash = releaseResult.hash;
          }
        } else {
          const actionDesc = 'Accept Escrow Work';
          await requestWalletSignature(publicKey, `${actionDesc}: Task ${String(id).slice(0, 8)}`);
        }
      } catch (signErr) {
        // Rollback optimistic update if signature was rejected or aborted
        updateTasksAndCache(previousTasks);
        throw signErr;
      }

      // Persist update to Database
      try {
        const { error } = await supabase
          .from('tasks')
          .update(updatedFields)
          .eq('id', id);

        if (error) throw error;
      } catch (dbErr) {
        console.warn("Supabase update notice (using local state fallback):", dbErr);
      }

      if (releaseResult?.explorerUrl && !releaseResult?.isDemo) {
        addToast(`Escrow released on Testnet! Tx: ${releaseResult.hash.slice(0, 10)}...`, "success");
      }
    } catch (err) {
      console.error("Failed to update task:", err);
      throw err;
    }
  };

  return (
    <TaskContext.Provider value={{ tasks, isLoading, addTask, updateTaskStatus }}>
      {children}
    </TaskContext.Provider>
  );
};
