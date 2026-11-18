import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';

const CLIENT_KEY = StellarSdk.Keypair.random().publicKey();
const FREELANCER_KEY = StellarSdk.Keypair.random().publicKey();

describe('Phase 2 Slice 3: URL validation, stroop precision, single-sim RPC, timeouts, and ledger hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('../data/onchainEscrows.json');
  });

  it('rejects unsafe proof URLs while preserving valid https URLs across safeHttpsUrl and dashboards', async () => {
    const { safeHttpsUrl } = await import('../lib/taskLifecycle.js');

    expect(safeHttpsUrl('https://github.com/org/repo/pull/1')).toBe('https://github.com/org/repo/pull/1');
    expect(safeHttpsUrl('  https://docs.google.com/document/d/123  ')).toBe('https://docs.google.com/document/d/123');
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpsUrl('http://example.com/insecure')).toBeNull();
    expect(safeHttpsUrl('//evil.com/path')).toBeNull();
    expect(safeHttpsUrl('https://')).toBeNull();
    expect(safeHttpsUrl('')).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();

    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');
    const fakeUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'client@gigpay.local',
      user_metadata: { role: 'client' },
    };
    const maliciousTask = {
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Audit Task',
      amount: '5',
      status: 'Under Review',
      client_id: fakeUser.id,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      github_pr_url: 'javascript:alert(document.cookie)',
      doc_url: 'https://docs.google.com/safe-doc',
      loom_url: 'http://insecure.example/video',
      proof_attached: true,
    };

    localStorage.setItem('gigpay_tasks_owner_id', fakeUser.id);
    localStorage.setItem('gigpay_shared_tasks', JSON.stringify([maliciousTask]));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { user: fakeUser } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        from: () => ({ select: () => ({ order: async () => ({ data: [maliciousTask], error: null }) }) }),
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { default: ClientDashboard } = await import('../pages/ClientDashboard.jsx');

    render(
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <TaskProvider>
              <ClientDashboard />
            </TaskProvider>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    );

    const safeLink = await screen.findByRole('link', { name: /Inspect Document/i });
    expect(safeLink).toHaveAttribute('href', 'https://docs.google.com/safe-doc');
    expect(safeLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: /Inspect GitHub PR/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Watch Loom Demo/i })).not.toBeInTheDocument();
  });

  it('parses XLM to integer stroops cleanly and rejects sub-stroop, zero, or malformed amounts', async () => {
    const { parseXlmToStroops } = await import('../lib/stellar.js');

    expect(parseXlmToStroops('19.99')).toBe(199900000n);
    expect(parseXlmToStroops('.5')).toBe(5000000n);
    expect(parseXlmToStroops(1.5)).toBe(15000000n);
    expect(parseXlmToStroops('0.0000001')).toBe(1n);
    expect(() => parseXlmToStroops('0')).toThrow(/positive amount/i);
    expect(() => parseXlmToStroops('-2')).toThrow(/positive amount/i);
    expect(() => parseXlmToStroops('0.00000001')).toThrow(/7 decimal places/i);
    expect(() => parseXlmToStroops(0.12345678)).toThrow(/7 decimal places/i);
    expect(() => parseXlmToStroops(1e-8)).toThrow(/7 decimal places/i);
    expect(() => parseXlmToStroops('NaN')).toThrow(/positive amount/i);
  });

  it('simulates once per transaction build, times out hung getTransaction calls, and handles missing created_at in resolveConfirmingFunding', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const stellar = await import('../lib/stellar.js');

    const simPayload = {
      id: 'sim-1',
      latestLedger: 1,
      minResourceFee: '2500',
      transactionData: new StellarSdk.SorobanDataBuilder().build().toXDR('base64'),
      events: [],
      results: [{ auth: [], xdr: StellarSdk.xdr.ScVal.scvVoid().toXDR('base64') }],
    };

    const simSpy = vi.spyOn(stellar.sorobanServer, 'simulateTransaction').mockResolvedValue(simPayload);
    const prepSpy = vi.spyOn(stellar.sorobanServer, 'prepareTransaction');
    const loadSpy = vi.spyOn(StellarSdk.Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue(new StellarSdk.Account(CLIENT_KEY, '10'));

    await stellar.simulateFundTask({
      clientAddress: CLIENT_KEY,
      freelancerAddress: FREELANCER_KEY,
      amount: '2.5',
    });
    expect(simSpy).toHaveBeenCalledTimes(1);
    expect(prepSpy).not.toHaveBeenCalled();

    simSpy.mockClear();
    await stellar.simulateApproveTask({
      clientAddress: CLIENT_KEY,
      taskId: { on_chain_task_id: 7 },
    });
    expect(simSpy).toHaveBeenCalledTimes(1);
    expect(prepSpy).not.toHaveBeenCalled();

    loadSpy.mockRestore();

    expect(
      await stellar.resolveConfirmingFunding(
        { status: 'Confirming', amount: '5', created_at: null },
        { status: 'NOT_FOUND' }
      )
    ).toEqual({ status: 'Failed' });

    vi.useFakeTimers();
    const hungServer = { getTransaction: () => new Promise(() => {}) };
    const outcomePromise = stellar.getFundTaskOutcome('a'.repeat(64), { server: hungServer });
    const assertion = expect(outcomePromise).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(stellar.NETWORK_RPC_TIMEOUT_MS + 50);
    await assertion;
  });

  it('counts Paid escrows in onChainEarnings, redacts G/S/C keys in describeDispute, supports bounded duplicateLock clock skew, and issues unique toast keys', async () => {
    const { onChainEarnings, describeDispute } = await import('../lib/ledgerIntegrity.js');
    const { findRecentDuplicateLock } = await import('../lib/duplicateLock.js');
    const { ToastProvider, useToast } = await import('../context/ToastContext.jsx');

    const paidHash = 'f'.repeat(64);
    const earnings = onChainEarnings(
      [
        { status: 'Paid', amount: '12.5', freelancer_wallet: FREELANCER_KEY, release_tx_hash: paidHash },
        { status: 'Completed', amount: '7.5', freelancer_wallet: FREELANCER_KEY, release_tx_hash: 'e'.repeat(64) },
      ],
      FREELANCER_KEY
    );
    expect(earnings).toEqual({ total: 20, count: 2 });

    const secretLike = 'SCZANGBA5YHTNYVVV4C3U252E2B6P6F5T3U6MM63WBSBZATAQI3EBTQ4';
    const desc = describeDispute({
      status: 'Disputed',
      disputed_at: '2026-11-18T10:00:00Z',
      dispute_reason: `Send refund to ${CLIENT_KEY} or email me@test.org (${secretLike})`,
    });
    expect(desc).not.toContain(CLIENT_KEY);
    expect(desc).not.toContain(secretLike);
    expect(desc).not.toContain('me@test.org');
    expect(desc).toContain('[address removed]');

    const now = Date.parse('2026-11-18T10:00:00Z');
    const skewedTask = {
      freelancer_wallet: FREELANCER_KEY,
      amount: '10',
      status: 'Available',
      created_at: '2026-11-18T10:00:25Z', // 25s ahead of client clock
    };
    expect(findRecentDuplicateLock([skewedTask], { freelancerWallet: FREELANCER_KEY, amount: '10', now })).toBe(skewedTask);

    let addToastFn = null;
    const Probe = () => {
      addToastFn = useToast().addToast;
      return null;
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>
    );
    act(() => {
      addToastFn('First toast', 'info');
      addToastFn('Second toast', 'info');
    });
    expect(screen.getByText('First toast')).toBeInTheDocument();
    expect(screen.getByText('Second toast')).toBeInTheDocument();
    expect(errorSpy.mock.calls.some((args) => String(args[0]).includes('same key'))).toBe(false);
  });

  it('handles null timestamps on static on-chain ledger snapshots (including C-contract callers) without crashing', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');
    vi.stubEnv('VITE_GIGPAY_ESCROW_CONTRACT_ID', undefined);
    const contractAddr = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
    vi.doMock('../data/onchainEscrows.json', () => ({
      default: {
        generatedAt: '2026-11-18T00:00:00Z',
        escrows: [
          {
            onChainTaskId: 77,
            clientWallet: contractAddr,
            freelancerWallet: FREELANCER_KEY,
            amount: '5',
            released: false,
            fundedAt: null,
            releasedAt: null,
            fundTxHash: 'c'.repeat(64),
            releaseTxHash: null,
            walletKind: 'Contract Caller',
            countsAsOutsideUser: true,
          },
        ],
      },
    }));
    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { TaskProvider, useTasks } = await import('../context/TaskContext.jsx');

    let latestTasks = null;
    const Probe = () => {
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

    const row = latestTasks.ledgerRecords.find((r) => r.id === 'onchain-77');
    expect(row).toBeDefined();
    expect(row.timestamp).toBe('Unknown UTC');
    expect(row.clientWallet).toBe(contractAddr);
  });
});
