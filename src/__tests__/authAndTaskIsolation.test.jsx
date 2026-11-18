import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';

const mockSupabaseModule = (overrides = {}) => {
  const spies = {
    getSession: overrides.getSession || vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: overrides.onAuthStateChange || vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    from: overrides.from || vi.fn(),
    channel: overrides.channel || vi.fn(() => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    }),
    removeChannel: overrides.removeChannel || vi.fn(),
    invoke: overrides.invoke || vi.fn(),
  };

  vi.doMock('../lib/supabase.js', () => ({
    supabase: {
      auth: {
        getSession: spies.getSession,
        onAuthStateChange: spies.onAuthStateChange,
        signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: new Error('offline') }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      from: spies.from,
      channel: spies.channel,
      removeChannel: spies.removeChannel,
      functions: { invoke: spies.invoke },
    },
  }));

  return spies;
};

describe('AuthContext and TaskContext isolation and dual-role sandbox', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock('../lib/supabase.js');
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.doUnmock('../lib/supabase.js');
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps unauthenticated mount isolated with no wallet provisioning, Friendbot calls, or task fetching', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const supabaseSpies = mockSupabaseModule();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network fetch'));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');
    const { default: Navbar } = await import('../components/Navbar.jsx');

    let latestAuth = null;
    let latestTasks = null;
    const Probe = () => {
      latestAuth = useAuth();
      latestTasks = useTasks();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Probe />
              <Navbar />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(latestAuth.isLoading).toBe(false);
    });

    expect(latestAuth.user).toBeNull();
    expect(latestAuth.publicKey).toBeNull();
    expect(latestTasks.tasks).toEqual([]);
    expect(localStorage.getItem('gigpay_wallet_public_key')).toBeNull();
    expect(localStorage.getItem('gigpay_ephemeral_pubkey')).toBeNull();
    expect(localStorage.getItem('gigpay_ephemeral_seckey')).toBeNull();
    expect(sessionStorage.getItem('gigpay_ephemeral_pubkey')).toBeNull();
    expect(sessionStorage.getItem('gigpay_ephemeral_seckey')).toBeNull();
    expect(supabaseSpies.from).not.toHaveBeenCalled();
    expect(supabaseSpies.channel).not.toHaveBeenCalled();
    expect(supabaseSpies.invoke).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears user, wallet, and cached DB tasks on SIGNED_OUT auth state events', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    let authListener = null;
    const sampleUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'alice@umak.edu.ph',
      user_metadata: { role: 'client' },
    };

    const queryBuilder = {
      select: () => queryBuilder,
      order: () => Promise.resolve({
        data: [{
          id: '22222222-2222-4222-8222-222222222222',
          title: 'Secret escrow',
          amount: '5',
          status: 'Available',
          client_id: sampleUser.id,
          created_at: new Date().toISOString(),
        }],
        error: null,
      }),
    };

    mockSupabaseModule({
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: sampleUser } }, error: null }),
      onAuthStateChange: vi.fn((cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      from: vi.fn(() => queryBuilder),
    });

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');

    let latestAuth = null;
    let latestTasks = null;
    const Probe = () => {
      latestAuth = useAuth();
      latestTasks = useTasks();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Probe />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(latestAuth.user?.id).toBe(sampleUser.id);
      expect(latestTasks.tasks).toHaveLength(1);
    });
    expect(latestTasks.tasks[0].title).toBe('Secret escrow');
    expect(localStorage.getItem('gigpay_shared_tasks')).toContain('Secret escrow');
    expect(localStorage.getItem('gigpay_wallet_public_key')).toBeTruthy();

    await act(async () => {
      authListener('SIGNED_OUT', null);
    });

    await waitFor(() => {
      expect(latestAuth.user).toBeNull();
    });
    expect(latestAuth.publicKey).toBeNull();
    expect(latestTasks.tasks).toEqual([]);
    expect(localStorage.getItem('gigpay_shared_tasks')).toBeNull();
    expect(localStorage.getItem('gigpay_tasks_cache_v2')).toBeNull();
    expect(localStorage.getItem('gigpay_wallet_public_key')).toBeNull();
    expect(localStorage.getItem('gigpay_wallet_owner_id')).toBeNull();
    expect(localStorage.getItem('gigpay_pilot_feedback_v1')).toBeNull();
  });

  it('prevents User B from inheriting User A wallet or task caches on shared PC without explicit sign-out', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    const userAKey = StellarSdk.Keypair.random();
    const userB = {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'studentb@umak.edu.ph',
      user_metadata: { role: 'freelancer' },
    };

    localStorage.setItem('gigpay_wallet_owner_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    localStorage.setItem('gigpay_wallet_public_key', userAKey.publicKey());
    localStorage.setItem('gigpay_ephemeral_pubkey:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userAKey.publicKey());
    localStorage.setItem('gigpay_ephemeral_seckey:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userAKey.secret());
    localStorage.setItem('gigpay_tasks_owner_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    localStorage.setItem('gigpay_shared_tasks', JSON.stringify([{
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Student A confidential task',
      amount: '10',
      status: 'Available',
      client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }]));

    const queryBuilder = {
      select: () => queryBuilder,
      order: () => Promise.resolve({ data: [], error: null }),
    };

    mockSupabaseModule({
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: userB } }, error: null }),
      from: vi.fn(() => queryBuilder),
    });

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');
    const { isSimulatorWallet } = await import('../lib/stellar.js');

    let latestAuth = null;
    let latestTasks = null;
    const Probe = () => {
      latestAuth = useAuth();
      latestTasks = useTasks();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Probe />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(latestAuth.user?.id).toBe(userB.id);
      expect(latestAuth.publicKey).toBeTruthy();
    });

    expect(latestAuth.publicKey).not.toBe(userAKey.publicKey());
    expect(isSimulatorWallet(latestAuth.publicKey)).toBe(true);
    expect(latestTasks.tasks).toEqual([]);
    expect(localStorage.getItem('gigpay_wallet_owner_id')).toBe(userB.id);
  });

  it('keeps Dual-Role Sandbox offline even when VITE_OFFLINE_DEMO is false', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const supabaseSpies = mockSupabaseModule();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network must not run in simulation sandbox'));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');
    const stellar = await import('../lib/stellar.js');

    let latestAuth = null;
    let latestTasks = null;
    const Probe = () => {
      latestAuth = useAuth();
      latestTasks = useTasks();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Probe />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(latestAuth.isLoading).toBe(false);
    });

    act(() => {
      latestAuth.loginSimulationMode('client');
    });

    await waitFor(() => {
      expect(latestAuth.user?.id).toBe('demo-client-uuid-001');
      expect(latestAuth.publicKey).toBe(stellar.DEMO_PUBLIC_KEY);
    });

    await act(async () => {
      await latestTasks.addTask({
        title: 'Default-mode sandbox task',
        amount: '3',
        freelancer_wallet: '',
      });
    });

    expect(latestTasks.tasks).toHaveLength(1);
    const created = latestTasks.tasks[0];
    expect(created.status).toBe('Available');
    expect(created.client_wallet).toBe(stellar.DEMO_PUBLIC_KEY);
    expect(created.freelancer_wallet).toBe(stellar.DEMO_FREELANCER_KEY);
    expect(created.tx_hash).toBe(stellar.DEMO_FUND_TX_HASH);

    act(() => {
      latestAuth.switchRole('freelancer');
    });

    await waitFor(() => {
      expect(latestAuth.user?.id).toBe('demo-freelancer-uuid-002');
      expect(latestAuth.publicKey).toBe(stellar.DEMO_FREELANCER_KEY);
    });

    await act(async () => {
      await latestTasks.updateTaskStatus(created.id, 'In Progress', true);
    });
    expect(latestTasks.tasks[0].status).toBe('In Progress');

    await act(async () => {
      await latestTasks.submitProofOfWork(created.id, {
        githubPrUrl: 'https://github.com/gigpay/demo/pull/2',
      });
    });
    expect(latestTasks.tasks[0].status).toBe('Under Review');

    act(() => {
      latestAuth.switchRole('client');
    });

    await waitFor(() => {
      expect(latestAuth.user?.id).toBe('demo-client-uuid-001');
      expect(latestAuth.publicKey).toBe(stellar.DEMO_PUBLIC_KEY);
    });

    let releaseResult;
    await act(async () => {
      releaseResult = await latestTasks.updateTaskStatus(created.id, 'Completed');
    });

    expect(releaseResult.isDemo).toBe(true);
    expect(releaseResult.hash).toBe(stellar.DEMO_RELEASE_TX_HASH);
    expect(latestTasks.tasks[0].status).toBe('Completed');
    expect(localStorage.getItem('gigpay_ephemeral_pubkey')).toBeNull();
    expect(supabaseSpies.from).not.toHaveBeenCalled();
    expect(supabaseSpies.channel).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15000);

  it('exercises the real supabase.js offline stub end-to-end when VITE_OFFLINE_DEMO=true', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network must not run in offline mode'));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');
    const stellar = await import('../lib/stellar.js');

    let latestAuth = null;
    let latestTasks = null;
    const Probe = () => {
      latestAuth = useAuth();
      latestTasks = useTasks();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Probe />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(latestAuth.isLoading).toBe(false);
    });

    act(() => {
      latestAuth.loginSimulationMode('client');
    });

    await waitFor(() => {
      expect(latestAuth.publicKey).toBe(stellar.DEMO_PUBLIC_KEY);
    });

    await act(async () => {
      await latestTasks.addTask({ title: 'Offline stub task', amount: '2', freelancer_wallet: '' });
    });
    expect(latestTasks.tasks[0].status).toBe('Available');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores late in-flight fetchTasks responses after SIGNED_OUT and stamps owner on reconnect', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    let authListener = null;
    let resolveDelayedFetch;
    const delayedFetchPromise = new Promise((resolve) => {
      resolveDelayedFetch = resolve;
    });
    const sampleUser = {
      id: '55555555-5555-4555-8555-555555555555',
      email: 'studenta@umak.edu.ph',
      user_metadata: { role: 'client' },
    };

    const queryBuilder = {
      select: () => queryBuilder,
      order: () => delayedFetchPromise,
    };

    mockSupabaseModule({
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: sampleUser } }, error: null }),
      onAuthStateChange: vi.fn((cb) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      from: vi.fn(() => queryBuilder),
    });

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');
    const stellar = await import('../lib/stellar.js');

    let latestAuth = null;
    let latestTasks = null;
    const Probe = () => {
      latestAuth = useAuth();
      latestTasks = useTasks();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Probe />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(latestAuth.user?.id).toBe(sampleUser.id);
    });

    act(() => {
      latestAuth.disconnectWallet();
    });
    expect(localStorage.getItem('gigpay_wallet_owner_id')).toBeNull();

    act(() => {
      latestAuth.connectTesterWallet();
    });
    expect(localStorage.getItem('gigpay_wallet_owner_id')).toBe(sampleUser.id);

    await act(async () => {
      authListener('SIGNED_OUT', null);
    });
    await waitFor(() => {
      expect(latestAuth.user).toBeNull();
    });

    await act(async () => {
      resolveDelayedFetch({
        data: [{
          id: '66666666-6666-4666-8666-666666666666',
          title: 'Stale after sign-out',
          amount: '7',
          status: 'Available',
          client_id: sampleUser.id,
        }],
        error: null,
      });
      await delayedFetchPromise;
    });

    expect(latestTasks.tasks).toEqual([]);
    expect(localStorage.getItem('gigpay_shared_tasks')).toBeNull();

    fetchSpy.mockClear();
    const nonDemoKey = StellarSdk.Keypair.random().publicKey();
    const fundOut = await stellar.submitFundTask({
      clientAddress: nonDemoKey,
      amount: '4',
      offlineDemo: true,
    });
    expect(fundOut.isDemo).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
