import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';

const VALID_ADDRESS = StellarSdk.Keypair.random().publicKey();

function buildSupabaseMock(initialUser, extraSpies = {}) {
  const makeBuilder = () => {
    const b = {
      select: () => b,
      insert: () => b,
      update: (payload) => {
        extraSpies.profileUpdate?.(payload);
        return b;
      },
      upsert: () => b,
      delete: () => b,
      eq: () => b,
      neq: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      single: () => Promise.resolve({ data: { role: initialUser?.user_metadata?.role || 'client' }, error: null }),
      maybeSingle: () => Promise.resolve({ data: { role: initialUser?.user_metadata?.role || 'client' }, error: null }),
      then: (onF, onR) => Promise.resolve({ data: [], error: null }).then(onF, onR),
      catch: (onR) => Promise.resolve({ data: [], error: null }).catch(onR),
    };
    return b;
  };

  return {
    supabase: {
      auth: {
        getSession: extraSpies.getSession || vi.fn().mockResolvedValue({
          data: { session: initialUser ? { user: initialUser } : null },
          error: null,
        }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
        signUp: extraSpies.signUp || vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
        signInWithPassword: extraSpies.signInWithPassword || vi.fn().mockResolvedValue({ data: { user: initialUser, session: null }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        updateUser: extraSpies.updateUser || vi.fn().mockResolvedValue({ data: { user: initialUser }, error: null }),
      },
      from: vi.fn(() => makeBuilder()),
      channel: vi.fn(() => ({ on: function () { return this; }, subscribe: function () { return this; } })),
      removeChannel: vi.fn(),
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    },
  };
}

describe('Phase 2 Slice 1: role boundaries, Freighter v6 API, and auth confirmation', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('@stellar/freighter-api');
    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('../pages/ClientDashboard.jsx');
    vi.doUnmock('../pages/FreelancerDashboard.jsx');
    vi.doUnmock('../pages/LandingPage.jsx');
    vi.doUnmock('../pages/AuthPage.jsx');
    vi.doUnmock('../pages/ProfilePage.jsx');
  });

  it('enforces ProtectedRoute requiredRole and hides role switching in Navbar for real accounts while keeping sandbox open', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const profileUpdate = vi.fn();
    const realClient = {
      id: '22222222-2222-4222-8222-222222222222',
      email: 'student-client@gigpay.local',
      user_metadata: { role: 'client' },
    };

    vi.doMock('../lib/supabase.js', () => buildSupabaseMock(realClient, { updateUser, profileUpdate }));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { default: Navbar } = await import('../components/Navbar.jsx');

    let latestAuth = null;
    const AuthProbe = () => {
      latestAuth = useAuth();
      return null;
    };

    render(
      <MemoryRouter initialEntries={['/freelancer']}>
        <ToastProvider>
          <AuthProvider>
            <TaskProvider>
              <AuthProbe />
              <Navbar />
              <Routes>
                <Route path="/client" element={<div data-testid="client-view">Client View</div>} />
                <Route path="/freelancer" element={<div data-testid="freelancer-view">Freelancer View</div>} />
              </Routes>
            </TaskProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('navbar-role-badge')).toHaveTextContent('client');
    });

    const workspaceLink = screen.getByRole('link', { name: 'Workspace' });
    expect(workspaceLink).toHaveAttribute('href', '/client');
    expect(screen.queryByRole('link', { name: 'Freelancer' })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Toggle active role/i)).not.toBeInTheDocument();

    let switched;
    act(() => {
      switched = latestAuth.switchRole('freelancer');
    });
    expect(switched).toBeNull();
    expect(latestAuth.activeRole).toBe('client');
    expect(updateUser).not.toHaveBeenCalled();
    expect(profileUpdate).not.toHaveBeenCalled();
    expect(await latestAuth.ensureDbRole('freelancer')).toBe(false);

    act(() => {
      latestAuth.loginSimulationMode('client');
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Client' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Freelancer' })).toBeInTheDocument();
      expect(screen.getByTitle(/Toggle active role/i)).toBeInTheDocument();
    });
  });

  it('redirects real accounts away from mismatched dashboards inside App ProtectedRoute while letting sandbox switch roles', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const realFreelancer = {
      id: '33333333-3333-4333-8333-333333333333',
      email: 'student-fl@gigpay.local',
      user_metadata: { role: 'freelancer' },
    };

    vi.doMock('../lib/supabase.js', () => buildSupabaseMock(realFreelancer));
    vi.doMock('../pages/ClientDashboard.jsx', () => ({ default: () => <div>Mock Client Dashboard</div> }));
    vi.doMock('../pages/FreelancerDashboard.jsx', () => ({ default: () => <div>Mock Freelancer Dashboard</div> }));
    vi.doMock('../pages/LandingPage.jsx', () => ({ default: () => <div>Landing</div> }));
    vi.doMock('../pages/AuthPage.jsx', () => ({ default: () => <div>Auth</div> }));
    vi.doMock('../pages/ProfilePage.jsx', () => ({ default: () => <div>Profile</div> }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { ProtectedRoute } = await import('../App.jsx');
    const { default: Navbar } = await import('../components/Navbar.jsx');

    render(
      <MemoryRouter initialEntries={['/client']}>
        <ToastProvider>
          <AuthProvider>
            <TaskProvider>
              <Navbar />
              <Routes>
                <Route path="/auth" element={<div>Auth View</div>} />
                <Route path="/client" element={<ProtectedRoute requiredRole="client"><div>Client Portal Page</div></ProtectedRoute>} />
                <Route path="/freelancer" element={<ProtectedRoute requiredRole="freelancer"><div>Freelancer Portal Page</div></ProtectedRoute>} />
              </Routes>
            </TaskProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Freelancer Portal Page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Client Portal Page')).not.toBeInTheDocument();
  });

  it('ignores spoofed user_metadata.is_simulation_mode on real UUID users and derives role from profiles.role while allowing true sandbox switching', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const spoofedRealUser = {
      id: '55555555-5555-4555-8555-555555555555',
      email: 'spoof@gigpay.local',
      user_metadata: { role: 'freelancer', is_simulation_mode: true },
    };

    const makeSpoofSupabase = () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: spoofedRealUser } }, error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
          signOut: vi.fn().mockResolvedValue({ error: null }),
          updateUser: vi.fn().mockResolvedValue({ data: { user: spoofedRealUser }, error: null }),
        },
        from: vi.fn(() => {
          const b = {
            select: () => b,
            eq: () => b,
            order: () => Promise.resolve({ data: [], error: null }),
            single: () => Promise.resolve({ data: { role: 'client' }, error: null }),
            maybeSingle: () => Promise.resolve({ data: { role: 'client' }, error: null }),
          };
          return b;
        }),
        channel: vi.fn(() => ({ on: function () { return this; }, subscribe: function () { return this; } })),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      },
    });

    vi.doMock('../lib/supabase.js', makeSpoofSupabase);
    vi.doMock('../pages/ClientDashboard.jsx', () => ({ default: () => <div>Mock Client Dashboard</div> }));
    vi.doMock('../pages/FreelancerDashboard.jsx', () => ({ default: () => <div>Mock Freelancer Dashboard</div> }));
    vi.doMock('../pages/LandingPage.jsx', () => ({ default: () => <div>Landing</div> }));
    vi.doMock('../pages/AuthPage.jsx', () => ({ default: () => <div>Auth</div> }));
    vi.doMock('../pages/ProfilePage.jsx', () => ({ default: () => <div>Profile</div> }));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { ProtectedRoute } = await import('../App.jsx');

    let latestAuth = null;
    const AuthProbe = () => {
      latestAuth = useAuth();
      return null;
    };

    render(
      <MemoryRouter initialEntries={['/freelancer']}>
        <AuthProvider>
          <AuthProbe />
          <Routes>
            <Route path="/client" element={<ProtectedRoute requiredRole="client"><div>Authoritative Client Route</div></ProtectedRoute>} />
            <Route path="/freelancer" element={<ProtectedRoute requiredRole="freelancer"><div>Freelancer Route</div></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // profiles.role='client' overrides user_metadata.role='freelancer', and isSimulationMode stays false
    await waitFor(() => {
      expect(screen.getByText('Authoritative Client Route')).toBeInTheDocument();
    });
    expect(latestAuth.isSimulationMode).toBe(false);
    expect(latestAuth.activeRole).toBe('client');
    expect(screen.queryByText('Freelancer Route')).not.toBeInTheDocument();

    // True demo sandbox allows access to /freelancer
    act(() => {
      latestAuth.loginSimulationMode('freelancer');
    });
    await waitFor(() => {
      expect(latestAuth.isSimulationMode).toBe(true);
      expect(latestAuth.activeRole).toBe('freelancer');
    });
  });

  it('normalizes Freighter v6 objects, rejects denied permission cleanly, and unwraps signedTxXdr and error objects', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');
    vi.stubEnv('VITE_STELLAR_NETWORK_PASSPHRASE', undefined);
    vi.stubEnv('VITE_HORIZON_URL', undefined);
    vi.stubEnv('VITE_SOROBAN_RPC_URL', undefined);
    const signCalls = [];
    const mockIsConnected = vi.fn()
      .mockResolvedValueOnce({ isConnected: false })
      .mockResolvedValueOnce({ isConnected: false })
      .mockResolvedValueOnce({ isConnected: true })
      .mockResolvedValueOnce({ isConnected: true });

    const mockIsAllowed = vi.fn()
      .mockResolvedValueOnce({ isAllowed: false })
      .mockResolvedValueOnce({ isAllowed: false })
      .mockResolvedValueOnce({ isAllowed: true });

    const mockApi = {
      isConnected: mockIsConnected,
      isAllowed: mockIsAllowed,
      setAllowed: vi.fn().mockResolvedValue({ isAllowed: false }),
      requestAccess: vi.fn().mockResolvedValue({ address: VALID_ADDRESS }),
      getAddress: vi.fn().mockResolvedValue({ address: VALID_ADDRESS }),
      getNetwork: vi.fn().mockResolvedValue({ network: 'TESTNET', networkPassphrase: StellarSdk.Networks.TESTNET }),
      signTransaction: vi.fn(async (xdr, opts) => {
        signCalls.push({ xdr, opts });
        if (signCalls.length === 1) {
          return { signedTxXdr: 'SIGNED_XDR_FROM_V6', signerAddress: VALID_ADDRESS };
        }
        return { error: { code: -4, message: 'User declined access' } };
      }),
    };

    vi.doMock('@stellar/freighter-api', () => ({ default: mockApi, ...mockApi }));

    const stellar = await import('../lib/stellar.js');

    expect(await stellar.checkFreighterConnection()).toBe(false);
    await expect(stellar.connectWallet()).rejects.toThrow('WALLET_NOT_INSTALLED');
    expect(await stellar.checkFreighterConnection()).toBe(true);
    await expect(stellar.connectWallet()).rejects.toThrow(/Permission denied/i);

    const kp = StellarSdk.Keypair.random();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ sequence: '1' }),
    });
    const signed = await stellar.requestWalletSignature(kp.publicKey(), 'Sign milestone test');
    expect(signed).toEqual({ success: true, signedXdr: 'SIGNED_XDR_FROM_V6' });
    expect(signCalls[0].opts.networkPassphrase).toBe(StellarSdk.Networks.TESTNET);
    expect(signCalls[0].opts.address).toBe(kp.publicKey());

    await expect(stellar.requestWalletSignature(kp.publicKey(), 'Declined sign'))
      .rejects.toThrow('User declined access');
    fetchSpy.mockRestore();
  });

  it('handles email confirmation signup without logging in and survives getSession delays beyond 2.5s', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const signUpMock = vi.fn().mockResolvedValue({
      data: { user: { id: 'u-pending', email: 'student@school.edu' }, session: null },
      error: null,
    });
    vi.doMock('../lib/supabase.js', () => buildSupabaseMock(null, { signUp: signUpMock }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { default: AuthPage } = await import('../pages/AuthPage.jsx');

    render(
      <MemoryRouter initialEntries={['/auth?mode=signup']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/client" element={<div>Client Dashboard Should Not Open</div>} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /^Client\b/i }));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'student@school.edu' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'StrongPass123!' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(screen.getByTestId('email-confirmation-banner')).toHaveTextContent('student@school.edu');
    });
    expect(screen.getAllByRole('button', { name: 'Sign In' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Client Dashboard Should Not Open')).not.toBeInTheDocument();
  });

  it('keeps ProtectedRoute waiting when getSession takes 3.5s instead of dropping session at 2.5s', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const realClient = {
      id: '44444444-4444-4444-8444-444444444444',
      email: 'slow-session@gigpay.local',
      user_metadata: { role: 'client' },
    };
    const delayedSession = new Promise((resolve) => {
      setTimeout(() => resolve({ data: { session: { user: realClient } }, error: null }), 3500);
    });
    vi.doMock('../lib/supabase.js', () => buildSupabaseMock(realClient, { getSession: () => delayedSession }));
    vi.doMock('../pages/ClientDashboard.jsx', () => ({ default: () => <div>Client Dashboard</div> }));
    vi.doMock('../pages/FreelancerDashboard.jsx', () => ({ default: () => <div>Freelancer Dashboard</div> }));
    vi.doMock('../pages/LandingPage.jsx', () => ({ default: () => <div>Landing</div> }));
    vi.doMock('../pages/AuthPage.jsx', () => ({ default: () => <div>Auth</div> }));
    vi.doMock('../pages/ProfilePage.jsx', () => ({ default: () => <div>Profile</div> }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ProtectedRoute } = await import('../App.jsx');

    render(
      <MemoryRouter initialEntries={['/client']}>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<div>Redirected To Auth</div>} />
            <Route path="/client" element={<ProtectedRoute requiredRole="client"><div>Slow Session Dashboard</div></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(screen.getByText('Loading session...')).toBeInTheDocument();
    expect(screen.queryByText('Redirected To Auth')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText('Slow Session Dashboard')).toBeInTheDocument();
  });

  it('preserves pending invite payout across signUp and clears it on signOut', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const invitedFreelancer = StellarSdk.Keypair.random().publicKey();
    const { captureInviteFromUrl, peekInvitePayout } = await import('../lib/invite.js');
    captureInviteFromUrl(`?pay=${invitedFreelancer}`);
    expect(peekInvitePayout()).toBe(invitedFreelancer);

    const newClient = {
      id: '66666666-6666-4666-8666-666666666666',
      email: 'invited-client@gigpay.local',
      user_metadata: { role: 'client' },
    };
    const signUpMock = vi.fn().mockResolvedValue({
      data: { user: newClient, session: { user: newClient } },
      error: null,
    });
    vi.doMock('../lib/supabase.js', () => buildSupabaseMock(null, { signUp: signUpMock }));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    let latestAuth = null;
    const AuthProbe = () => {
      latestAuth = useAuth();
      return null;
    };

    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(latestAuth.isLoading).toBe(false));

    await act(async () => {
      await latestAuth.signUp(newClient.email, 'StrongPass123!', { role: 'client' });
    });
    expect(peekInvitePayout()).toBe(invitedFreelancer);

    await act(async () => {
      await latestAuth.signOut();
    });
    expect(peekInvitePayout()).toBeNull();
  });
});
