import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { requestWalletSignature, GIGPAY_ESCROW_CONTRACT_ID } from '../lib/stellar';

const TaskContext = createContext();

export const useTasks = () => useContext(TaskContext);

export const TaskProvider = ({ children }) => {
  const { user, publicKey } = useAuth();
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error || !data || data.length === 0) {
        console.warn("Supabase tasks unavailable, using fallback mock tasks:", error);
        setTasks([
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
        ]);
      } else if (data) {
        setTasks(data);
      }
      setIsLoading(false);
    };

    fetchTasks();

    // Set up Realtime Subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) => prev.map((t) => t.id === payload.new.id ? payload.new : t));
            
            // Check if we need to show a realtime notification
            if (user) {
              if (payload.new.status === 'In Progress' && payload.old.status === 'Available' && payload.new.client_id === user.id) {
                addToast("A freelancer has accepted your task!", "success");
              }
              if (payload.new.status === 'Completed' && payload.old.status === 'In Progress' && payload.new.freelancer_id === user.id) {
                addToast("The client has released your funds!", "success");
              }
            }

          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter((t) => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addTask = async (task) => {
    if (!user || !publicKey) throw new Error("Wallet not connected");
    try {
      // 1. Request Wallet Signature for the Smart Contract (Mocked via manageData)
      await requestWalletSignature(publicKey, `Deposit ${task.amount} USDC to Escrow`);

      // 2. If signed successfully, save to Database (with local fallback if Supabase is offline)
      try {
        const { error } = await supabase
          .from('tasks')
          .insert([{
            title: task.title,
            amount: task.amount,
            status: 'Available',
            client_id: user.id,
            contract_id: GIGPAY_ESCROW_CONTRACT_ID
          }]);

        if (error) throw error;
      } catch (dbErr) {
        console.warn("Supabase insert notice (using local state fallback):", dbErr);
        const newTask = {
          id: 'task-' + Date.now(),
          title: task.title,
          amount: task.amount,
          status: 'Available',
          client_id: user.id,
          contract_id: GIGPAY_ESCROW_CONTRACT_ID,
          created_at: new Date().toISOString()
        };
        setTasks((prev) => [newTask, ...prev]);
      }
    } catch (err) {
      console.error("Failed to add task:", err);
      throw err;
    }
  };

  const updateTaskStatus = async (id, newStatus, assignFreelancer = false) => {
    if (!user || !publicKey) throw new Error("Wallet not connected");
    try {
      const taskToUpdate = tasks.find(t => t.id === id);
      if (!taskToUpdate) return;
      
      // Request signature based on the action
      const actionDesc = newStatus === 'Completed' ? 'Release Funds' : 'Accept Escrow Work';
      await requestWalletSignature(publicKey, `${actionDesc}: Task ${id.slice(0, 8)}`);

      const updatedFields = { 
        status: newStatus 
      };

      if (assignFreelancer) {
        updatedFields.freelancer_id = user.id;
      }

      try {
        const { error } = await supabase
          .from('tasks')
          .update(updatedFields)
          .eq('id', id);

        if (error) throw error;
      } catch (dbErr) {
        console.warn("Supabase update notice (using local state fallback):", dbErr);
        setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...updatedFields } : t));
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
