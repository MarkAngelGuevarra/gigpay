import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { requestWalletSignature, submitFundTask, submitApproveTask, GIGPAY_ESCROW_CONTRACT_ID } from '../lib/stellar';

const SHARED_TASKS_KEY = 'gigpay_shared_tasks';
const DEMO_FALLBACK_KEY = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';

const getStoredTasks = () => {
  try {
    const raw = localStorage.getItem(SHARED_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to load tasks from shared storage:", err);
    return [];
  }
};

const saveStoredTasks = (taskList) => {
  try {
    if (Array.isArray(taskList)) {
      localStorage.setItem(SHARED_TASKS_KEY, JSON.stringify(taskList));
    }
  } catch (err) {
    console.warn("Failed to save tasks to shared storage:", err);
  }
};

const mergeTasks = (priorityTasks = [], fallbackTasks = []) => {
  const map = new Map();
  for (const t of fallbackTasks) {
    if (t && t.id) map.set(t.id, t);
  }
  for (const t of priorityTasks) {
    if (t && t.id) {
      const existing = map.get(t.id);
      map.set(t.id, existing ? { ...existing, ...t } : t);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });
};

const DEFAULT_MOCK_TASKS = [
  {
    id: 'task-mock-1',
    title: 'Soroban Escrow Smart Contract Audit',
    amount: '500',
    status: 'Available',
    client_id: 'demo-client-uuid-001',
    contract_id: GIGPAY_ESCROW_CONTRACT_ID,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'task-mock-2',
    title: 'Freighter Wallet UX Optimization',
    amount: '350',
    status: 'In Progress',
    client_id: 'demo-client-uuid-001',
    freelancer_id: 'demo-freelancer-uuid-002',
    contract_id: GIGPAY_ESCROW_CONTRACT_ID,
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

const TaskContext = createContext();

export const useTasks = () => useContext(TaskContext);

export const TaskProvider = ({ children }) => {
  const { user, publicKey } = useAuth();
  const { addToast } = useToast();
  const [tasks, setTasks] = useState(() => {
    const cached = getStoredTasks();
    return cached.length > 0 ? cached : [];
  });
  const [isLoading, setIsLoading] = useState(true);

  const updateAndPersistTasks = useCallback((updater) => {
    setTasks((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveStoredTasks(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true);
      const cached = getStoredTasks();

      try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error || !data || data.length === 0) {
          console.warn("Supabase tasks unavailable or empty, merging with shared storage & defaults:", error);
          const base = cached.length > 0 ? cached : DEFAULT_MOCK_TASKS;
          const merged = mergeTasks(base, DEFAULT_MOCK_TASKS);
          updateAndPersistTasks(merged);
        } else {
          // Merge Supabase tasks with shared storage tasks (e.g. offline created tasks)
          const merged = mergeTasks(data, cached);
          updateAndPersistTasks(merged);
        }
      } catch (fetchErr) {
        console.warn("Supabase fetch exception, using shared storage fallback:", fetchErr);
        if (cached.length > 0) {
          setTasks(cached);
        } else {
          updateAndPersistTasks(DEFAULT_MOCK_TASKS);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();

    // Cross-tab synchronization via storage event
    const handleStorageChange = (e) => {
      if (e.key === SHARED_TASKS_KEY && e.newValue) {
        try {
          const syncedTasks = JSON.parse(e.newValue);
          if (Array.isArray(syncedTasks)) {
            setTasks(syncedTasks);
          }
        } catch (storageErr) {
          console.warn("Failed to parse synced tasks from storage event:", storageErr);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Set up Realtime Subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            updateAndPersistTasks((prev) => {
              if (prev.some((t) => t.id === payload.new.id)) {
                return prev.map((t) => t.id === payload.new.id ? { ...t, ...payload.new } : t);
              }
              return [payload.new, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            updateAndPersistTasks((prev) => prev.map((t) => t.id === payload.new.id ? { ...t, ...payload.new } : t));
            
            // Realtime notification
            if (user) {
              if (payload.new.status === 'In Progress' && payload.old?.status === 'Available' && payload.new.client_id === user.id) {
                addToast("A freelancer has accepted your task!", "success");
              }
              if (payload.new.status === 'Completed' && payload.old?.status === 'In Progress' && payload.new.freelancer_id === user.id) {
                addToast("The client has released your funds!", "success");
              }
            }

          } else if (payload.eventType === 'DELETE') {
            updateAndPersistTasks((prev) => prev.filter((t) => t.id !== payload.old?.id));
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      supabase.removeChannel(channel);
    };
  }, [user, addToast, updateAndPersistTasks]);

  const addTask = async (task) => {
    const effectiveClientId = user?.id || 'demo-client-uuid-001';
    const effectivePublicKey = publicKey || DEMO_FALLBACK_KEY;

    try {
      // 1. Execute live Soroban fund_task invocation via Freighter & Testnet RPC
      const fundResult = await submitFundTask({
        clientAddress: effectivePublicKey,
        freelancerAddress: task.freelancer_wallet || undefined,
        amount: task.amount
      });

      const txHash = fundResult?.hash || null;
      const explorerUrl = fundResult?.explorerUrl || null;

      // 2. If signed successfully, save to Database with immediate local update
      let savedTask = null;
      try {
        const { data, error } = await supabase
          .from('tasks')
          .insert([{
            title: task.title,
            amount: task.amount,
            status: 'Available',
            client_id: effectiveClientId,
            contract_id: GIGPAY_ESCROW_CONTRACT_ID
          }])
          .select();

        if (error) throw error;
        if (data && data.length > 0) {
          savedTask = {
            ...data[0],
            tx_hash: txHash,
            explorer_url: explorerUrl
          };
        }
      } catch (dbErr) {
        console.warn("Supabase insert notice (using local shared cache fallback):", dbErr);
      }

      // If Supabase insert failed or returned nothing (RLS error 42501, offline, demo mode), use local fallback
      if (!savedTask) {
        savedTask = {
          id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          title: task.title,
          amount: task.amount,
          status: 'Available',
          client_id: effectiveClientId,
          contract_id: GIGPAY_ESCROW_CONTRACT_ID,
          tx_hash: txHash,
          explorer_url: explorerUrl,
          created_at: new Date().toISOString()
        };
      }

      // Immediately update local state and sync across tabs via shared localStorage cache
      updateAndPersistTasks((prev) => [savedTask, ...prev.filter(t => t.id !== savedTask.id)]);

      if (fundResult?.explorerUrl && !fundResult?.isDemo) {
        addToast(`Escrow funded on Testnet! Tx: ${txHash.slice(0, 10)}...`, "success");
      }
      return savedTask;
    } catch (err) {
      console.error("Failed to add task:", err);
      throw err;
    }
  };

  const updateTaskStatus = async (id, newStatus, assignFreelancer = false, extraData = {}) => {
    const effectivePublicKey = publicKey || DEMO_FALLBACK_KEY;
    const effectiveUserId = user?.id || (assignFreelancer ? 'demo-freelancer-uuid-002' : 'demo-client-uuid-001');

    try {
      const taskToUpdate = tasks.find(t => t.id === id);
      if (!taskToUpdate) return;
      
      let releaseResult = null;
      if (newStatus === 'Completed') {
        releaseResult = await submitApproveTask({
          clientAddress: effectivePublicKey,
          taskId: id
        });
      } else if (newStatus === 'Under Review') {
        const actionDesc = 'Submit Work Proof';
        await requestWalletSignature(effectivePublicKey, `${actionDesc}: Task ${String(id).slice(0, 8)}`);
      } else {
        const actionDesc = 'Accept Escrow Work';
        await requestWalletSignature(effectivePublicKey, `${actionDesc}: Task ${String(id).slice(0, 8)}`);
      }

      const updatedFields = { 
        status: newStatus,
        ...extraData
      };

      if (assignFreelancer) {
        updatedFields.freelancer_id = effectiveUserId;
      }

      // Immediately update tasks state and persist in shared localStorage cache
      updateAndPersistTasks((prev) => 
        prev.map((t) => t.id === id ? { ...t, ...updatedFields } : t)
      );

      try {
        const { error } = await supabase
          .from('tasks')
          .update(updatedFields)
          .eq('id', id);

        if (error) {
          console.warn("Supabase update notice (persisted in shared cache):", error);
        }
      } catch (dbErr) {
        console.warn("Supabase update notice (persisted in shared cache):", dbErr);
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
