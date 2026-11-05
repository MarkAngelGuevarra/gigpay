import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { connectWallet as connectFreighter, DEMO_PUBLIC_KEY, DEMO_FREELANCER_KEY, createEphemeralTestnetWallet, checkFreighterConnection, isDemoWallet, provisionSimulatorWallet, setPracticeWalletFundingFallback, setPracticeWalletOwner, isSimulatorWallet } from '../lib/stellar';

// Friendbot rate-limits by IP, so a room of testers on one Wi-Fi can't all be funded by it. GigPay's
// Testnet pool (Edge Function `fund-practice-wallet`) tops up a signed-in tester's practice wallet once.
setPracticeWalletFundingFallback(async (address) => {
  const { data, error } = await supabase.functions.invoke('fund-practice-wallet', { body: { address } });
  if (error) throw error;
  return data;
});

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// The shared DEMO keys are placeholders (DEMO_FREELANCER_KEY is the team's own Testnet wallet), so
// activity under them can never count as a real tester's. Wherever the app would hand a tester a demo
// key, give them this browser's own practice wallet instead (Testnet only; falls back to the demo key).
const upgradeDemoKey = (key) => (key && isDemoWallet(key) ? (provisionSimulatorWallet() || key) : key);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Resilient wallet initialization so mobile/tablet users are never left in disconnected limbo
  const [publicKey, setRawPublicKey] = useState(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const savedKey = localStorage.getItem('gigpay_wallet_public_key');
        if (savedKey && (savedKey.startsWith('G') || savedKey.startsWith('GBDEMO_'))) {
          return upgradeDemoKey(savedKey);
        }
      }
    } catch (e) {
      console.warn("[AuthContext] Local storage wallet read warning:", e);
    }
    return upgradeDemoKey(DEMO_PUBLIC_KEY);
  });

  const setPublicKey = (key) => {
    const next = upgradeDemoKey(key);
    setRawPublicKey(next);
    if (next && next !== key) {
      try {
        localStorage.setItem('gigpay_wallet_public_key', next);
      } catch {
        // storage unavailable: the key is still used for this session
      }
    }
  };

  // Each signed-in account gets its own practice wallet (see setPracticeWalletOwner in stellar.js), so a
  // shared lab PC never hands one student's wallet to the next. A Freighter wallet is left untouched.
  useEffect(() => {
    const realUserId = user && !user.is_simulation_mode && !String(user.id || '').startsWith('demo-') ? user.id : null;
    const usingPracticeWallet = !publicKey || isDemoWallet(publicKey) || isSimulatorWallet(publicKey);
    setPracticeWalletOwner(realUserId);
    if (realUserId && usingPracticeWallet) {
      const own = provisionSimulatorWallet();
      if (own && own !== publicKey) {
        setRawPublicKey(own);
        try { localStorage.setItem('gigpay_wallet_public_key', own); } catch { /* storage unavailable */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let mounted = true;
    // Safety timeout in case network delays Supabase response on Vercel
    const timeoutId = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 2500);

    // Check localStorage for demo tester session first
    const savedDemoUser = localStorage.getItem('gigpay_demo_user');
    if (savedDemoUser) {
      try {
        const parsed = JSON.parse(savedDemoUser);
        setUser(parsed);
        setIsLoading(false);
        // Ensure wallet key is immediately paired with demo session
        const cachedKey = localStorage.getItem('gigpay_wallet_public_key');
        if (!cachedKey) {
          const defaultKey = parsed.user_metadata?.role === 'freelancer' ? DEMO_FREELANCER_KEY : DEMO_PUBLIC_KEY;
          setPublicKey(defaultKey);
          localStorage.setItem('gigpay_wallet_public_key', defaultKey);
        }
      } catch (e) {
        localStorage.removeItem('gigpay_demo_user');
      }
    }

    // Rehydrate and verify Freighter wallet connection resilience
    try {
      const cachedKey = localStorage.getItem('gigpay_wallet_public_key');
      if (cachedKey) {
        setPublicKey(cachedKey);
        // Optionally verify with isConnected()
        checkFreighterConnection().then(connected => {
          if (!connected && !cachedKey.startsWith('GBDEMO_') && cachedKey !== DEMO_FREELANCER_KEY && cachedKey !== DEMO_PUBLIC_KEY) {
            console.info("[AuthContext] Cached wallet session loaded; Freighter active check:", connected);
          }
        }).catch(() => {});
      } else {
        // Auto-connect default testnet wallet for extensionless mobile/tablet sessions
        setPublicKey(DEMO_PUBLIC_KEY);
        localStorage.setItem('gigpay_wallet_public_key', DEMO_PUBLIC_KEY);
      }
    } catch (storageErr) {
      console.warn("[AuthContext] Wallet persistence check notice:", storageErr);
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
      }
      setIsLoading(false);
    }).catch((err) => {
      console.warn("Supabase session fetch error (using fallback mode):", err);
      if (mounted) setIsLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password, metadata) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata, // e.g., { role: 'client' | 'freelancer', display_name: 'John Doe' }
      }
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      localStorage.removeItem('gigpay_demo_user');
      if (data?.user) {
        const role = data.user.user_metadata?.role || 'client';
        const defaultKey = role === 'freelancer' ? DEMO_FREELANCER_KEY : DEMO_PUBLIC_KEY;
        const cachedKey = localStorage.getItem('gigpay_wallet_public_key');
        if (!cachedKey) {
          setPublicKey(defaultKey);
          localStorage.setItem('gigpay_wallet_public_key', defaultKey);
        }
      }
      return data;
    } catch (supabaseError) {
      // Resilient tester login: support tester accounts even if Supabase project is paused or offline
      const lowerEmail = (email || '').toLowerCase().trim();
      // Only the two shared reviewer accounts may fall back to the offline demo. Any other failed
      // sign-in (a tester's mistyped email or password) must show the error, not open a fake session
      // whose activity is never saved or counted.
      const isTesterAccount =
        (lowerEmail === 'client@gigpay.tech' || lowerEmail === 'freelancer@gigpay.tech') &&
        password === 'password123';

      if (isTesterAccount) {
        const isClient = lowerEmail.includes('client') || !lowerEmail.includes('freelancer');
        const role = isClient ? 'client' : 'freelancer';
        const demoUser = {
          id: isClient ? 'demo-client-uuid-001' : 'demo-freelancer-uuid-002',
          email: lowerEmail,
          user_metadata: {
            role: role,
            display_name: isClient ? 'Acme Corp (Tester Client)' : 'Alex Rivera (Tester Freelancer)'
          }
        };
        const demoKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
        setUser(demoUser);
        setPublicKey(demoKey);
        localStorage.setItem('gigpay_demo_user', JSON.stringify(demoUser));
        localStorage.setItem('gigpay_wallet_public_key', demoKey);
        return { user: demoUser, session: { user: demoUser } };
      }

      throw supabaseError;
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('gigpay_demo_user');
      localStorage.removeItem('gigpay_wallet_public_key');
      // The next person on this device must not inherit this account's task cache. (The account's own
      // practice wallet stays stored under its user id, so signing back in restores it.)
      localStorage.removeItem('gigpay_shared_tasks');
    } catch (e) {
      console.warn("Storage cleanup notice:", e);
    }
    setPracticeWalletOwner(null);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Supabase signOut notice:", e);
    }
    setUser(null);
    setPublicKey(null);
  };

  const disconnectWallet = () => {
    try {
      localStorage.removeItem('gigpay_wallet_public_key');
    } catch (e) {
      console.warn("[AuthContext] Storage cleanup notice:", e);
    }
    setPublicKey(null);
  };

  const connectWallet = async () => {
    try {
      const res = await connectFreighter();
      if (res?.error) throw new Error(res.error);
      const key = typeof res.publicKey === 'string'
        ? res.publicKey
        : (res.publicKey?.address || String(res.publicKey || ''));
      setPublicKey(key);
      try {
        if (key) {
          localStorage.setItem('gigpay_wallet_public_key', key);
        }
      } catch (err) {
        console.warn("[AuthContext] Could not cache wallet public key:", err);
      }
      return { publicKey: key, network: res.network };
    } catch (error) {
      console.error("[AuthContext] Wallet connection error:", error);
      throw error;
    }
  };

  const connectTesterWallet = (roleOverride) => {
    const effectiveRole = roleOverride || user?.user_metadata?.role || 'client';
    const demoKey = effectiveRole === 'freelancer' ? DEMO_FREELANCER_KEY : DEMO_PUBLIC_KEY;
    setPublicKey(demoKey);
    try {
      localStorage.setItem('gigpay_wallet_public_key', demoKey);
    } catch (err) {
      console.warn("[AuthContext] Could not cache demo wallet key:", err);
    }
    return { publicKey: demoKey, network: 'TESTNET' };
  };

  const connectEphemeralWallet = async () => {
    try {
      const res = await createEphemeralTestnetWallet();
      setPublicKey(res.publicKey);
      try {
        localStorage.setItem('gigpay_wallet_public_key', res.publicKey);
      } catch (err) {
        console.warn("[AuthContext] Could not cache ephemeral wallet key:", err);
      }
      return res;
    } catch (err) {
      console.warn("Ephemeral connect notice:", err);
      return connectTesterWallet();
    }
  };

  const switchRole = (roleOverride) => {
    const currentRole = user?.user_metadata?.role || 'client';
    const targetRole = roleOverride || (currentRole === 'client' ? 'freelancer' : 'client');
    const isClient = targetRole === 'client';
    const isSimulation = !!(user?.is_simulation_mode || user?.user_metadata?.is_simulation_mode || user?.id?.startsWith?.('demo-'));

    // Signed-out visitors used to be turned into a shared offline demo user ("Alex Rivera"), whose tasks
    // no partner can see and which can never count. They now have to sign up with their own email.
    if (!user) return null;

    let updatedUser;
    if (isSimulation) {
      updatedUser = {
        id: isClient ? 'demo-client-uuid-001' : 'demo-freelancer-uuid-002',
        email: isClient ? 'client@gigpay.tech' : 'freelancer@gigpay.tech',
        is_simulation_mode: true,
        user_metadata: {
          role: targetRole,
          display_name: isClient ? 'Acme Corp (Tester Client)' : 'Alex Rivera (Tester Freelancer)',
          is_simulation_mode: true
        }
      };
      try {
        localStorage.setItem('gigpay_demo_user', JSON.stringify(updatedUser));
      } catch (e) {
        console.warn("Could not cache switched user:", e);
      }
    } else {
      updatedUser = {
        ...user,
        user_metadata: {
          ...(user.user_metadata || {}),
          role: targetRole
        }
      };
      // Asynchronously sync role to Supabase metadata and profiles table without blocking
      try {
        supabase.auth.updateUser({
          data: { role: targetRole }
        }).catch(err => console.warn("Supabase background role sync notice:", err));

        if (user.id && !user.id.startsWith?.('demo-')) {
          // The profiles role is what RLS checks when a client creates or a freelancer accepts a task.
          // Supabase query builders have no .catch(): calling it threw before the request was sent, so
          // the role never synced and a switched user's tasks were silently rejected by the database.
          supabase
            .from('profiles')
            .update({ role: targetRole })
            .eq('id', user.id)
            .then(({ error }) => {
              if (error) console.warn("Supabase profiles table role sync notice:", error);
            });
        }
      } catch (e) {
        console.warn("Supabase updateUser invocation notice:", e);
      }
    }

    setUser(updatedUser);
    
    // Automatically sync paired simulator wallet so anti-self-dealing assertion always passes
    const cachedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gigpay_wallet_public_key') : null;
    if (!cachedKey || cachedKey.startsWith('GBDEMO_') || cachedKey === DEMO_PUBLIC_KEY || cachedKey === DEMO_FREELANCER_KEY) {
      const nextKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
      setPublicKey(nextKey);
      try {
        localStorage.setItem('gigpay_wallet_public_key', nextKey);
      } catch (err) {
        console.warn("Could not cache switched demo key:", err);
      }
    }
    return targetRole;
  };

  const loginSimulationMode = (initialRole = 'client') => {
    const isClient = initialRole === 'client';
    const simKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
    const simUser = {
      id: isClient ? 'demo-client-uuid-001' : 'demo-freelancer-uuid-002',
      email: isClient ? 'client@gigpay.tech' : 'freelancer@gigpay.tech',
      is_simulation_mode: true,
      user_metadata: {
        role: initialRole,
        display_name: isClient ? 'Acme Corp (Tester Client)' : 'Alex Rivera (Tester Freelancer)',
        is_simulation_mode: true
      }
    };
    setUser(simUser);
    try {
      localStorage.setItem('gigpay_demo_user', JSON.stringify(simUser));
      localStorage.setItem('gigpay_wallet_public_key', simKey);
    } catch (e) {
      console.warn("Could not cache simulation user/key:", e);
    }
    setPublicKey(simKey);
    return simUser;
  };

  const isSimulationMode = !!(user?.is_simulation_mode || user?.user_metadata?.is_simulation_mode);

  // RLS lets only role='client' profiles create tasks and role='freelancer' profiles accept them. Await
  // the role in the database before any money moves, so an escrow is never locked on-chain and then
  // rejected by the database (a stranded escrow) because the role still said otherwise.
  const ensureDbRole = async (role) => {
    if (!user?.id || String(user.id).startsWith('demo-') || isSimulationMode) return true;
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id);
    if (error) {
      console.warn("[AuthContext] Role sync before action failed:", error);
      return false;
    }
    if (user.user_metadata?.role !== role) {
      setUser((prev) => (prev ? { ...prev, user_metadata: { ...(prev.user_metadata || {}), role } } : prev));
      supabase.auth.updateUser({ data: { role } }).catch(() => {});
    }
    return true;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      signUp, 
      signIn, 
      signOut, 
      publicKey, 
      connectWallet, 
      disconnectWallet,
      connectTesterWallet,
      connectEphemeralWallet,
      switchRole,
      ensureDbRole,
      loginSimulationMode,
      isSimulationMode,
      activeRole: user?.user_metadata?.role || 'client'
    }}>
      {children}
    </AuthContext.Provider>
  );
};
