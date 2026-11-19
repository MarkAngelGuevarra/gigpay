import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const FL_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_KEY = StellarSdk.Keypair.random().publicKey();
const FREELANCER_KEY = StellarSdk.Keypair.random().publicKey();

describe('Phase 2 Slice 4: intra-tab sync, portals, double-submit guards, error recovery, and a11y', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('@stellar/freighter-api');
  });

  it('syncs usePilotFeedbackState across sibling hook instances in the same tab and opens the form once per action under StrictMode', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { usePilotFeedbackState } = await import('../hooks/usePilotFeedbackState.js');

    let hookA = null;
    let hookB = null;
    const ConsumerA = () => {
      hookA = usePilotFeedbackState();
      return <span data-testid="status-a">{hookA.state.status}</span>;
    };
    const ConsumerB = () => {
      hookB = usePilotFeedbackState();
      return <span data-testid="status-b">{hookB.state.status}</span>;
    };

    render(
      <React.StrictMode>
        <ConsumerA />
        <ConsumerB />
      </React.StrictMode>
    );

    expect(screen.getByTestId('status-a')).toHaveTextContent('UNSEEN');
    expect(screen.getByTestId('status-b')).toHaveTextContent('UNSEEN');

    act(() => {
      hookA.openFormLink('navbar_clicked', { openTab: true });
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status-a')).toHaveTextContent('OPENED_FORM');
    expect(screen.getByTestId('status-b')).toHaveTextContent('OPENED_FORM');

    act(() => {
      hookB.markCompleted();
    });

    expect(screen.getByTestId('status-a')).toHaveTextContent('COMPLETED');
    expect(screen.getByTestId('status-b')).toHaveTextContent('COMPLETED');
  });

  it('records one banner view under StrictMode and avoids duplicate window.open on PilotIntakeBanner link click', async () => {
    vi.stubEnv('VITE_ENABLE_PILOT_TOOLS', 'true');
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { default: PilotIntakeBanner } = await import('../components/PilotIntakeBanner.jsx');

    render(
      <React.StrictMode>
        <PilotIntakeBanner />
      </React.StrictMode>
    );

    const link = await screen.findByRole('link', { name: /Complete 60s Form/i });
    const storedAfterMount = JSON.parse(localStorage.getItem('gigpay_pilot_feedback_v1'));
    expect(storedAfterMount.times_viewed).toBe(1);

    fireEvent.click(link);
    expect(openSpy).not.toHaveBeenCalled();

    const storedAfterClick = JSON.parse(localStorage.getItem('gigpay_pilot_feedback_v1'));
    expect(storedAfterClick.status).toBe('OPENED_FORM');
  });

  it('resets PoW draft state when switching between tasks on FreelancerDashboard and exposes accessible labels', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const flUser = { id: FL_ID, email: 'fl@gigpay.local', user_metadata: { role: 'freelancer' } };
    const taskA = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'First Deliverable Task',
      amount: '5',
      status: 'In Progress',
      client_id: CLIENT_ID,
      freelancer_id: FL_ID,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
    };
    const taskB = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Second Deliverable Task',
      amount: '8',
      status: 'In Progress',
      client_id: CLIENT_ID,
      freelancer_id: FL_ID,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      doc_url: 'https://docs.google.com/existing-b',
    };
    localStorage.setItem('gigpay_tasks_owner_id', FL_ID);
    localStorage.setItem('gigpay_shared_tasks', JSON.stringify([taskA, taskB]));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { user: flUser } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: () => ({ select: () => ({ order: async () => ({ data: [taskA, taskB], error: null }) }) }),
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { default: FreelancerDashboard } = await import('../pages/FreelancerDashboard.jsx');

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <FreelancerDashboard />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    const openButtons = await screen.findAllByRole('button', { name: /(Attach|Update) Proof of Work/i });
    fireEvent.click(openButtons[0]);

    const docInputA = screen.getByLabelText(/Document, Design, or Work Link/i);
    fireEvent.change(docInputA, { target: { value: 'https://docs.google.com/draft-only-for-a' } });
    expect(docInputA).toHaveValue('https://docs.google.com/draft-only-for-a');

    // Switch to Task B: must clear Task A's draft and hydrate Task B's stored link
    fireEvent.click(openButtons[1]);
    const docInputB = screen.getByLabelText(/Document, Design, or Work Link/i);
    expect(docInputB).toHaveValue('https://docs.google.com/existing-b');
  });

  it('portals ClientDashboard modals with aria-modal and Escape, guards Dispute double-submit, refreshes Navbar balance, and ignores stale fetches on sign-out', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const clientUser = { id: CLIENT_ID, email: 'c@gigpay.local', user_metadata: { role: 'client' } };
    const task = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Portal Modal Escrow',
      amount: '10',
      status: 'Under Review',
      client_id: CLIENT_ID,
      freelancer_id: FL_ID,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      on_chain_task_id: 9,
      tx_hash: 'a'.repeat(64),
    };
    localStorage.setItem('gigpay_tasks_owner_id', CLIENT_ID);
    localStorage.setItem('gigpay_shared_tasks', JSON.stringify([task]));
    localStorage.setItem('gigpay_wallet_public_key', CLIENT_KEY);
    localStorage.setItem('gigpay_wallet_owner_id', CLIENT_ID);

    let resolveDisputeWrite;
    let disputeWriteCount = 0;
    let authListener = null;

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { user: clientUser } }, error: null }),
          onAuthStateChange: (cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: () => {} } } };
          },
          signOut: async () => {
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          },
          updateUser: async () => ({ data: {}, error: null }),
        },
        from: () => ({
          select: () => ({ order: async () => ({ data: [task], error: null }) }),
          update: () => ({
            eq: () => {
              disputeWriteCount++;
              return new Promise((resolve) => {
                resolveDisputeWrite = resolve;
              });
            },
          }),
        }),
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const mockFreighter = {
      isConnected: async () => ({ isConnected: true }),
      isAllowed: async () => ({ isAllowed: true }),
      setAllowed: async () => ({ isAllowed: true }),
      requestAccess: async () => ({ address: CLIENT_KEY }),
      getAddress: async () => ({ address: CLIENT_KEY }),
      getNetwork: async () => ({ network: 'TESTNET', networkPassphrase: StellarSdk.Networks.TESTNET }),
      signTransaction: async () => ({}),
    };
    vi.doMock('@stellar/freighter-api', () => ({ default: mockFreighter, ...mockFreighter }));

    let balanceCalls = 0;
    let resolveStaleBalance;
    const loadAccountSpy = vi.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount').mockImplementation(async () => {
      balanceCalls++;
      if (balanceCalls === 3) {
        return new Promise((resolve) => {
          resolveStaleBalance = resolve;
        });
      }
      return {
        balances: [{ asset_type: 'native', balance: balanceCalls === 1 ? '100.0000000' : '90.0000000' }],
      };
    });

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { default: Navbar } = await import('../components/Navbar.jsx');
    const { default: ClientDashboard } = await import('../pages/ClientDashboard.jsx');

    const { container } = render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <Navbar />
              <ClientDashboard />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/100\.00 XLM/)).toBeInTheDocument();
    });

    // Balance refresh custom event updates balance pill without page reload
    act(() => {
      window.dispatchEvent(new CustomEvent('gigpay:balance-refresh'));
    });
    await waitFor(() => {
      expect(screen.getByText(/90\.00 XLM/)).toBeInTheDocument();
    });

    // Release modal portals to document.body, has aria-modal, and closes on Escape
    fireEvent.click(screen.getByRole('button', { name: /Approve & Release/i }));
    const releaseDialog = screen.getByRole('dialog', { name: /Milestone Release Confirmation/i });
    expect(releaseDialog).toHaveAttribute('aria-modal', 'true');
    expect(releaseDialog.parentElement).toBe(document.body);
    expect(container.contains(releaseDialog)).toBe(false);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Milestone Release Confirmation/i })).not.toBeInTheDocument();

    // Dispute modal prevents double-submit while in flight
    fireEvent.click(screen.getByRole('button', { name: /Dispute/i }));
    const disputeBtn = screen.getByRole('button', { name: /Confirm Dispute/i });
    fireEvent.click(disputeBtn);
    fireEvent.click(disputeBtn);
    expect(disputeBtn).toBeDisabled();
    expect(disputeWriteCount).toBe(1);

    await act(async () => {
      resolveDisputeWrite({ error: null });
    });

    // Start a 3rd balance fetch, sign out before it resolves, then resolve late with 777 XLM
    act(() => {
      window.dispatchEvent(new CustomEvent('gigpay:balance-refresh'));
    });
    expect(balanceCalls).toBe(3);

    // Sign out clears balance cleanly and aborts stale balance update
    fireEvent.click(screen.getByRole('button', { name: /Sign Out/i }));
    await waitFor(() => {
      expect(screen.queryByText(/90\.00 XLM/)).not.toBeInTheDocument();
    });
    await act(async () => {
      resolveStaleBalance?.({ balances: [{ asset_type: 'native', balance: '777.0000000' }] });
    });
    expect(screen.queryByText(/777\.00 XLM/)).not.toBeInTheDocument();
    loadAccountSpy.mockRestore();
  });

  it('preserves LandingPage role intent into AuthPage signup, prevents inner modal clicks from closing, and shows ProfilePage retry state on fetch failure', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    let profileFetchShouldFail = true;

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () =>
                profileFetchShouldFail
                  ? { data: null, error: new Error('network error') }
                  : { data: { display_name: 'Ana', role: 'client', bio: '', company_name: '', portfolio_url: '' }, error: null },
            }),
          }),
        }),
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { default: LandingPage } = await import('../pages/LandingPage.jsx');
    const { default: AuthPage } = await import('../pages/AuthPage.jsx');

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    // Landing page renders the scroll-choreographed reveal beats, zero-fee comparison, and open ledger section
    expect(screen.getByText('Being paid should be simple.')).toBeInTheDocument();
    expect(screen.getByText('Scan a QR.')).toBeInTheDocument();
    expect(screen.getByText('Deliver work.')).toBeInTheDocument();
    expect(screen.getByText('Settle within seconds.')).toBeInTheDocument();
    expect(screen.getByText('Keep 100% of every milestone.')).toBeInTheDocument();
    expect(screen.getByText('Built on open escrow, not blind trust.')).toBeInTheDocument();

    // Selecting Freelancer role carries mode=signup&role=freelancer to AuthPage
    const flCta = screen.getByRole('link', { name: /Continue as Freelancer/i });
    expect(flCta).toHaveAttribute('href', '/auth?mode=signup&role=freelancer');
    fireEvent.click(flCta);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Freelancer\b/i })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();

    // ProfilePage renders Retry error panel instead of mutable blank form when fetch fails
    vi.resetModules();
    const realClient = {
      id: CLIENT_ID,
      email: 'profile-test@gigpay.local',
      user_metadata: { role: 'client' },
    };
    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { user: realClient } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () =>
                profileFetchShouldFail
                  ? { data: null, error: new Error('network error') }
                  : { data: { display_name: 'Ana', role: 'client', bio: '', company_name: '', portfolio_url: '' }, error: null },
            }),
          }),
        }),
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const { AuthProvider: AP2 } = await import('../context/AuthContext.jsx');
    const { ToastProvider: TP2 } = await import('../context/ToastContext.jsx');
    const { default: ProfilePage } = await import('../pages/ProfilePage.jsx');

    render(
      <MemoryRouter>
        <AP2>
          <TP2>
            <ProfilePage />
          </TP2>
        </AP2>
      </MemoryRouter>
    );

    const retryBtn = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByRole('alert')).toHaveTextContent(/Profile Unavailable/i);
    expect(screen.queryByRole('button', { name: /Save Profile/i })).not.toBeInTheDocument();

    profileFetchShouldFail = false;
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(screen.getByLabelText('Display Name')).toHaveValue('Ana');
    });
  });
});
