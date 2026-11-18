import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { clearInvitePayout } from '../lib/invite';
import { connectWallet as connectFreighter, DEMO_PUBLIC_KEY, DEMO_FREELANCER_KEY, createEphemeralTestnetWallet, checkFreighterConnection, isDemoWallet, provisionSimulatorWallet, setPracticeWalletFundingFallback, setPracticeWalletOwner, isSimulatorWallet, STELLAR_NETWORK_NAME } from '../lib/stellar';

// Friendbot rate-limits by IP, so a room of testers on one Wi-Fi can't all be funded by it. GigPay's
// Testnet pool (Edge Function `fund-practice-wallet`) tops up a signed-in tester's practice wallet once.
setPracticeWalletFundingFallback(async (address) => {
  const { data, error } = await supabase.functions.invoke('fund-practice-wallet', { body: { address } });
  if (error) throw error;
  return data;
});

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const isSimulationUser = (u) => Boolean(u?.is_simulation_mode || u?.user_metadata?.is_simulation_mode || String(u?.id || '').startsWith('demo-'));

// The shared DEMO keys are placeholders (DEMO_FREELANCER_KEY is the team's own Testnet wallet), so
// activity under them can never count as a real tester's. Wherever the app would hand a tester a demo
// key, give them this browser's own practice wallet instead (Testnet only; falls back to the demo key).
const upgradeDemoKey = (key) => (key && isDemoWallet(key) ? (provisionSimulatorWallet() || key) : key);

const clearStoredSessionCaches = () => {
  try {
    localStorage.removeItem('gigpay_demo_user');
    localStorage.removeItem('gigpay_wallet_public_key');
    localStorage.removeItem('gigpay_wallet_owner_id');
    localStorage.removeItem('gigpay_shared_tasks');
    localStorage.removeItem('gigpay_tasks_cache_v2');
    localStorage.removeItem('gigpay_verification_ledger_v1');
    localStorage.removeItem('gigpay_tasks_owner_id');
    localStorage.removeItem('gigpay_pilot_feedback_v1');
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('gigpay_event_source');
    }
  } catch (e) {
    console.warn("Storage cleanup notice:", e);
  }
  clearInvitePayout();
};

const applySessionPublicKey = (setRawPublicKey, key, { upgrade = true } = {}) => {
  const next = key && upgrade ? upgradeDemoKey(key) : key;
  setRawPublicKey(next);
  if (next && next !== key) {
    try {
      localStorage.setItem('gigpay_wallet_public_key', next);
    } catch {
      // storage unavailable: the key is still used for this session
    }
  }
  return next;
};

const rehydrateSessionWallet = (sessionUser, setRawPublicKey) => {
  try {
    const sim = isSimulationUser(sessionUser);
    const realUserId = sessionUser && !sim ? sessionUser.id : null;
    const previousOwner = localStorage.getItem('gigpay_wallet_owner_id');
    const ownerMismatch =
      Boolean(previousOwner) &&
      Boolean(sessionUser?.id) &&
      previousOwner !== sessionUser.id &&
      !(isSimulationUser({ id: previousOwner }) && sim);

    if (ownerMismatch) {
      clearStoredSessionCaches();
    }

    // Bind the practice-wallet owner namespace before inspecting or provisioning keys.
    setPracticeWalletOwner(realUserId);

    const allowUpgrade = !sim;
    const cachedKey = localStorage.getItem('gigpay_wallet_public_key');
    if (cachedKey) {
      const resolved = applySessionPublicKey(setRawPublicKey, cachedKey, { upgrade: allowUpgrade });
      if (resolved) localStorage.setItem('gigpay_wallet_public_key', resolved);
      if (sessionUser?.id) localStorage.setItem('gigpay_wallet_owner_id', sessionUser.id);
      // Optionally verify with isConnected()
      checkFreighterConnection().then(connected => {
        if (!connected && !cachedKey.startsWith('GBDEMO_') && cachedKey !== DEMO_FREELANCER_KEY && cachedKey !== DEMO_PUBLIC_KEY) {
          console.info("[AuthContext] Cached wallet session loaded; Freighter active check:", connected);
        }
      }).catch(() => {});
    } else if (sessionUser) {
      const role = sessionUser.user_metadata?.role || 'client';
      const defaultKey = role === 'freelancer' ? DEMO_FREELANCER_KEY : DEMO_PUBLIC_KEY;
      const resolved = applySessionPublicKey(setRawPublicKey, defaultKey, { upgrade: allowUpgrade });
      if (resolved) localStorage.setItem('gigpay_wallet_public_key', resolved);
      if (sessionUser?.id) localStorage.setItem('gigpay_wallet_owner_id', sessionUser.id);
    }
  } catch (storageErr) {
    console.warn("[AuthContext] Wallet persistence check notice:", storageErr);
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore wallet key only when a local demo session already exists; signed-out visitors stay null
  // until authentication finishes so visiting landing/auth never provisions or funds a Testnet wallet.
  const [publicKey, setRawPublicKey] = useState(() => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('gigpay_demo_user')) {
        const parsedDemo = JSON.parse(localStorage.getItem('gigpay_demo_user'));
        const sim = isSimulationUser(parsedDemo);
        setPracticeWalletOwner(!sim && parsedDemo?.id ? parsedDemo.id : null);
        const savedKey = localStorage.getItem('gigpay_wallet_public_key');
        if (savedKey && (savedKey.startsWith('G') || savedKey.startsWith('GBDEMO_'))) {
          return sim ? savedKey : upgradeDemoKey(savedKey);
        }
        return parsedDemo?.user_metadata?.role === 'freelancer' ? DEMO_FREELANCER_KEY : DEMO_PUBLIC_KEY;
      }
    } catch (e) {
      console.warn("[AuthContext] Local storage wallet read warning:", e);
    }
    return null;
  });

  const setPublicKey = (key, options) => applySessionPublicKey(setRawPublicKey, key, options);
  const rehydrateWalletForSession = (sessionUser) => rehydrateSessionWallet(sessionUser, setRawPublicKey);

  // Each signed-in account gets its own practice wallet (see setPracticeWalletOwner in stellar.js), so a
  // shared lab PC never hands one student's wallet to the next. A Freighter wallet is left untouched.
  useEffect(() => {
    const realUserId = user && !isSimulationUser(user) ? user.id : null;
    setPracticeWalletOwner(realUserId);
    const usingPracticeWallet = !publicKey || isDemoWallet(publicKey) || isSimulatorWallet(publicKey);
    if (realUserId && usingPracticeWallet) {
      const own = provisionSimulatorWallet();
      if (own && own !== publicKey) {
        setRawPublicKey(own);
        try {
          localStorage.setItem('gigpay_wallet_public_key', own);
          localStorage.setItem('gigpay_wallet_owner_id', realUserId);
        } catch { /* storage unavailable */ }
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
        rehydrateSessionWallet(parsed, setRawPublicKey);
      } catch (_e) {
        localStorage.removeItem('gigpay_demo_user');
      }
    }

    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        rehydrateSessionWallet(session.user, setRawPublicKey);
      }
      setIsLoading(false);
    }).catch((err) => {
      console.warn("Supabase session fetch error (using fallback mode):", err);
      if (mounted) setIsLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        rehydrateSessionWallet(session.user, setRawPublicKey);
      } else if (event === 'SIGNED_OUT') {
        const hasDemoSession = typeof localStorage !== 'undefined' && !!localStorage.getItem('gigpay_demo_user');
        if (!hasDemoSession) {
          clearStoredSessionCaches();
          setPracticeWalletOwner(null);
          setUser(null);
          setRawPublicKey(null);
        }
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
    const previousUser = user;
    clearStoredSessionCaches();
    setPracticeWalletOwner(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata, // e.g., { role: 'client' | 'freelancer', display_name: 'John Doe' }
      }
    });
    if (error) {
      if (previousUser && !isSimulationUser(previousUser)) {
        setPracticeWalletOwner(previousUser.id);
      }
      throw error;
    }
    if (data?.session && data?.user) {
      rehydrateWalletForSession(data.user);
    }
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
        rehydrateWalletForSession(data.user);
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
          is_simulation_mode: true,
          user_metadata: {
            role: role,
            display_name: isClient ? 'Demo client' : 'Demo freelancer',
            is_simulation_mode: true
          }
        };
        const demoKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
        clearStoredSessionCaches();
        setPracticeWalletOwner(null);
        setUser(demoUser);
        setPublicKey(demoKey, { upgrade: false });
        localStorage.setItem('gigpay_demo_user', JSON.stringify(demoUser));
        localStorage.setItem('gigpay_wallet_public_key', demoKey);
        localStorage.setItem('gigpay_wallet_owner_id', demoUser.id);
        return { user: demoUser, session: { user: demoUser } };
      }

      throw supabaseError;
    }
  };

  const signOut = async () => {
    try {
      clearStoredSessionCaches();
      // The next person on this device must not inherit this account's task cache. (The account's own
      // practice wallet stays stored under its user id, so signing back in restores it.)
      // Older cache keys the task list still falls back to; left behind, the next student on a lab PC
      // loaded the previous student's tasks and ledger rows.
      localStorage.removeItem('gigpay_tasks_cache_v2');
      localStorage.removeItem('gigpay_verification_ledger_v1');
    } catch (e) {
      console.warn("Storage cleanup notice:", e);
    }
    setPracticeWalletOwner(null);
    // A freelancer's invite address must not pre-fill the next student's task form on a shared PC.
    clearInvitePayout();
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
      localStorage.removeItem('gigpay_wallet_owner_id');
    } catch (e) {
      console.warn("[AuthContext] Storage cleanup notice:", e);
    }
    setPublicKey(null);
  };

  const connectWallet = async () => {
    if (isSimulationUser(user)) {
      throw new Error('Sign in with a tester account to connect Freighter.');
    }
    try {
      const res = await connectFreighter();
      if (res?.error) throw new Error(res.error);
      const rawKey = typeof res.publicKey === 'string'
        ? res.publicKey
        : (res.publicKey?.address || String(res.publicKey || ''));
      const key = setPublicKey(rawKey, { upgrade: !isSimulationUser(user) });
      try {
        if (key) {
          localStorage.setItem('gigpay_wallet_public_key', key);
          if (user?.id) localStorage.setItem('gigpay_wallet_owner_id', user.id);
        }
      } catch (err) {
        console.warn("[AuthContext] Could not cache wallet public key:", err);
      }
      return { publicKey: key, network: res.network, networkPassphrase: res.networkPassphrase };
    } catch (error) {
      console.error("[AuthContext] Wallet connection error:", error);
      throw error;
    }
  };

  const connectTesterWallet = (roleOverride) => {
    const effectiveRole = roleOverride || user?.user_metadata?.role || 'client';
    const demoKey = effectiveRole === 'freelancer' ? DEMO_FREELANCER_KEY : DEMO_PUBLIC_KEY;
    const allowUpgrade = !!user && !isSimulationUser(user);
    const resolved = setPublicKey(demoKey, { upgrade: allowUpgrade });
    try {
      localStorage.setItem('gigpay_wallet_public_key', resolved || demoKey);
      if (user?.id) localStorage.setItem('gigpay_wallet_owner_id', user.id);
    } catch (err) {
      console.warn("[AuthContext] Could not cache demo wallet key:", err);
    }
    return { publicKey: resolved || demoKey, network: STELLAR_NETWORK_NAME };
  };

  const connectEphemeralWallet = async () => {
    if (!user) {
      throw new Error('Sign in before creating a practice wallet.');
    }
    if (isSimulationUser(user)) {
      return connectTesterWallet();
    }
    try {
      setPracticeWalletOwner(user.id);
      const res = await createEphemeralTestnetWallet();
      setPublicKey(res.publicKey);
      try {
        localStorage.setItem('gigpay_wallet_public_key', res.publicKey);
        localStorage.setItem('gigpay_wallet_owner_id', user.id);
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

    // Signed-out visitors used to be turned into a shared offline demo user, whose tasks
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
          display_name: isClient ? 'Demo client' : 'Demo freelancer',
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
    const isExternalFreighter = isSimulation && cachedKey && !isDemoWallet(cachedKey) && !isSimulatorWallet(cachedKey);
    if (!isExternalFreighter && (isSimulation || !cachedKey || cachedKey.startsWith('GBDEMO_') || cachedKey === DEMO_PUBLIC_KEY || cachedKey === DEMO_FREELANCER_KEY)) {
      const nextKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
      const resolved = setPublicKey(nextKey, { upgrade: !isSimulation });
      try {
        localStorage.setItem('gigpay_wallet_public_key', resolved || nextKey);
        if (updatedUser?.id) localStorage.setItem('gigpay_wallet_owner_id', updatedUser.id);
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
        display_name: isClient ? 'Demo client' : 'Demo freelancer',
        is_simulation_mode: true
      }
    };
    clearStoredSessionCaches();
    setPracticeWalletOwner(null);
    setUser(simUser);
    try {
      localStorage.setItem('gigpay_demo_user', JSON.stringify(simUser));
      localStorage.setItem('gigpay_wallet_public_key', simKey);
      localStorage.setItem('gigpay_wallet_owner_id', simUser.id);
    } catch (e) {
      console.warn("Could not cache simulation user/key:", e);
    }
    setPublicKey(simKey, { upgrade: false });
    supabase.auth.signOut().catch(() => {});
    return simUser;
  };

  const isSimulationMode = isSimulationUser(user);

  // RLS lets only role='client' profiles create tasks and role='freelancer' profiles accept them. Await
  // the role in the database before any money moves, so an escrow is never locked on-chain and then
  // rejected by the database (a stranded escrow) because the role still said otherwise.
  const ensureDbRole = async (role) => {
    if (!user?.id) return false;
    if (isSimulationUser(user)) return true;
    try {
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
    } catch (err) {
      console.warn("[AuthContext] Role sync network notice:", err);
      return false;
    }
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
