import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

const normalizeAppRole = (value) => (value === 'client' || value === 'freelancer' ? value : null);
const isSimulationUser = (u) => Boolean(u?.is_simulation_mode && String(u?.id || '').startsWith('demo-'));
const isNetworkOrOfflineError = (err) => {
  const msg = String(err?.message || err || '').toLowerCase();
  return !msg.includes('invalid login credentials') && !msg.includes('email not confirmed');
};

// The shared DEMO keys are placeholders (DEMO_FREELANCER_KEY is the team's own Testnet wallet), so
// activity under them can never count as a real tester's. Wherever the app would hand a tester a demo
// key, give them this browser's own practice wallet instead (Testnet only; falls back to the demo key).
const upgradeDemoKey = (key) => (key && isDemoWallet(key) ? (provisionSimulatorWallet() || key) : key);

const clearStoredSessionCaches = ({ preserveInvite = false } = {}) => {
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
  if (!preserveInvite) {
    clearInvitePayout();
  }
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
      clearStoredSessionCaches({ preserveInvite: true });
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
  const [dbRole, setDbRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef(null);
  const sessionOverrideRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const loadDbRole = async (sessionUser) => {
    if (!sessionUser?.id || isSimulationUser(sessionUser)) {
      setDbRole(normalizeAppRole(sessionUser?.user_metadata?.role));
      return;
    }
    try {
      const builder = supabase.from('profiles').select('role').eq('id', sessionUser.id);
      const res = typeof builder?.maybeSingle === 'function'
        ? await builder.maybeSingle()
        : (typeof builder?.single === 'function' ? await builder.single() : null);
      if (userRef.current && userRef.current.id !== sessionUser.id) return;
      const fetchedRole = normalizeAppRole(res?.data?.role);
      setDbRole(fetchedRole || normalizeAppRole(sessionUser?.user_metadata?.role));
    } catch {
      setDbRole(normalizeAppRole(sessionUser?.user_metadata?.role));
    }
  };

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
    // Safety circuit-breaker if the Supabase network request hangs indefinitely
    const timeoutId = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 8000);

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
      clearTimeout(timeoutId);
      if (!mounted) return;
      if (session?.user && !sessionOverrideRef.current) {
        localStorage.removeItem('gigpay_demo_user');
        setUser(session.user);
        loadDbRole(session.user);
        rehydrateSessionWallet(session.user, setRawPublicKey);
      }
      setIsLoading(false);
    }).catch((err) => {
      clearTimeout(timeoutId);
      console.warn("Supabase session fetch error (using fallback mode):", err);
      if (mounted) setIsLoading(false);
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      clearTimeout(timeoutId);
      if (!mounted) return;
      if (session?.user) {
        sessionOverrideRef.current = true;
        localStorage.removeItem('gigpay_demo_user');
        setUser(session.user);
        loadDbRole(session.user);
        rehydrateSessionWallet(session.user, setRawPublicKey);
      } else if (event === 'SIGNED_OUT') {
        const hasDemoSession = typeof localStorage !== 'undefined' && !!localStorage.getItem('gigpay_demo_user');
        if (!hasDemoSession) {
          clearStoredSessionCaches();
          setPracticeWalletOwner(null);
          setUser(null);
          setDbRole(null);
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata, // e.g., { role: 'client' | 'freelancer', display_name: 'John Doe' }
      }
    });
    if (error) {
      throw error;
    }
    sessionOverrideRef.current = true;
    clearStoredSessionCaches({ preserveInvite: true });
    setPracticeWalletOwner(null);
    if (data?.session && data?.user) {
      await loadDbRole(data.user);
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
      sessionOverrideRef.current = true;
      localStorage.removeItem('gigpay_demo_user');
      if (data?.user) {
        await loadDbRole(data.user);
        rehydrateWalletForSession(data.user);
      }
      return data;
    } catch (supabaseError) {
      // Resilient tester login: support tester accounts only when Supabase is unreachable or offline
      const lowerEmail = (email || '').toLowerCase().trim();
      // Only the two shared reviewer accounts may fall back to the offline demo. Any other failed
      // sign-in (a tester's mistyped email or password) must show the error, not open a fake session
      // whose activity is never saved or counted.
      const isTesterAccount =
        (lowerEmail === 'client@gigpay.tech' || lowerEmail === 'freelancer@gigpay.tech') &&
        password === 'password123';

      if (isTesterAccount && isNetworkOrOfflineError(supabaseError)) {
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
        sessionOverrideRef.current = true;
        clearStoredSessionCaches();
        setPracticeWalletOwner(null);
        setUser(demoUser);
        setDbRole(role);
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
    sessionOverrideRef.current = true;
    setUser(null);
    setDbRole(null);
    setPublicKey(null);
    try {
      clearStoredSessionCaches();
      localStorage.removeItem('gigpay_tasks_cache_v2');
      localStorage.removeItem('gigpay_verification_ledger_v1');
    } catch (e) {
      console.warn("Storage cleanup notice:", e);
    }
    setPracticeWalletOwner(null);
    clearInvitePayout();
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    } catch (e) {
      console.warn("Supabase signOut notice:", e);
    }
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
    const isSimulation = isSimulationUser(user);

    // Signed-out visitors used to be turned into a shared offline demo user, whose tasks
    // no partner can see and which can never count. They now have to sign up with their own email.
    if (!user) return null;
    if (!isSimulation) return null;

    const updatedUser = {
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

    setUser(updatedUser);

    // Automatically sync paired simulator wallet so anti-self-dealing assertion always passes
    const cachedKey = typeof localStorage !== 'undefined' ? localStorage.getItem('gigpay_wallet_public_key') : null;
    const isExternalFreighter = isSimulation && cachedKey && !isDemoWallet(cachedKey) && !isSimulatorWallet(cachedKey);
    if (!isExternalFreighter) {
      const nextKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
      const resolved = setPublicKey(nextKey, { upgrade: false });
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
    sessionOverrideRef.current = true;
    setUser(simUser);
    setDbRole(initialRole === 'freelancer' ? 'freelancer' : 'client');
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
    const declaredRole = dbRole || normalizeAppRole(user.user_metadata?.role);
    if (declaredRole && declaredRole !== role) {
      return false;
    }
    try {
      const updateBuilder = supabase.from('profiles').update({ role }).eq('id', user.id);
      const res = typeof updateBuilder?.select === 'function'
        ? await updateBuilder.select('role')
        : await updateBuilder;
      if (res?.error) {
        console.warn("[AuthContext] Role sync before action failed:", res.error);
        return false;
      }
      if (Array.isArray(res?.data) && res.data.length === 0) {
        return false;
      }
      setDbRole(role);
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
      activeRole: isSimulationMode
        ? (normalizeAppRole(user?.user_metadata?.role) || 'client')
        : (dbRole || normalizeAppRole(user?.user_metadata?.role) || 'client')
    }}>
      {children}
    </AuthContext.Provider>
  );
};
