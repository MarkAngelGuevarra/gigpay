import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';
import fs from 'node:fs';
import path from 'node:path';

const VALID_TX_HASH = 'a'.repeat(64);
const VALID_ADDRESS = StellarSdk.Keypair.random().publicKey();

describe('Phase 1B local Supabase schema and Stellar parameterization', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.doUnmock('@stellar/freighter-api');
    vi.doUnmock('../lib/supabase.js');
  });

  it('defaults stellar.js to Testnet and validates explorer URLs and hashes strictly', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', undefined);
    vi.stubEnv('VITE_STELLAR_NETWORK_PASSPHRASE', undefined);
    vi.stubEnv('VITE_HORIZON_URL', undefined);
    vi.stubEnv('VITE_SOROBAN_RPC_URL', undefined);
    vi.stubEnv('VITE_FRIENDBOT_URL', undefined);
    vi.stubEnv('VITE_GIGPAY_ESCROW_CONTRACT_ID', undefined);
    vi.stubEnv('VITE_EXPLORER_BASE_URL', undefined);
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');

    const stellar = await import('../lib/stellar.js');

    expect(stellar.STELLAR_NETWORK_NAME).toBe('TESTNET');
    expect(stellar.STELLAR_NETWORK_PASSPHRASE).toBe(StellarSdk.Networks.TESTNET);
    expect(stellar.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(stellar.SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    expect(stellar.FRIENDBOT_URL).toBe('https://friendbot.stellar.org');
    expect(stellar.GIGPAY_ESCROW_CONTRACT_ID).toBe(stellar.DEFAULT_TESTNET_CONTRACT_ID);
    expect(stellar.buildExplorerTxUrl(VALID_TX_HASH)).toBe(`https://stellar.expert/explorer/testnet/tx/${VALID_TX_HASH}`);
    expect(stellar.buildExplorerAccountUrl(VALID_ADDRESS)).toBe(`https://stellar.expert/explorer/testnet/account/${VALID_ADDRESS}`);
    expect(stellar.buildExplorerTxUrl('abc123')).toBeNull();
    expect(stellar.buildExplorerTxUrl('demo_1234')).toBeNull();
    expect(stellar.buildExplorerAccountUrl('NOT_A_KEY')).toBeNull();
    expect(stellar.isStaticTestnetSnapshotEnabled()).toBe(true);
    expect(stellar.isEphemeralSignerAllowed('TESTNET')).toBe(true);
    expect(stellar.isEphemeralSignerAllowed('MAINNET')).toBe(false);
    expect(stellar.isEphemeralSignerAllowed('PUBLIC')).toBe(false);
  });

  it('allows explicit empty VITE_EXPLORER_BASE_URL to disable links and rejects unsafe schemes or userinfo URLs', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', 'TESTNET');
    vi.stubEnv('VITE_EXPLORER_BASE_URL', '');
    vi.stubEnv('VITE_HORIZON_URL', 'http://localhost:80@attacker.example');
    vi.stubEnv('VITE_SOROBAN_RPC_URL', 'http://horizon-testnet.stellar.org');
    vi.stubEnv('VITE_FRIENDBOT_URL', 'https://horizon.stellar.org');
    const disabled = await import('../lib/stellar.js');

    expect(disabled.EXPLORER_BASE_URL).toBe('');
    expect(disabled.buildExplorerTxUrl(VALID_TX_HASH)).toBeNull();
    expect(disabled.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(disabled.SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
    expect(disabled.FRIENDBOT_URL).toBe('https://friendbot.stellar.org');
    expect(disabled.isLocalHttpUrl('http://localhost:8000')).toBe(true);
    expect(disabled.isLocalHttpUrl('http://127.0.0.1:8000/soroban/rpc')).toBe(true);
    expect(disabled.isLocalHttpUrl('http://[::1]:8000')).toBe(true);
    expect(disabled.isLocalHttpUrl('http://localhost:80@attacker.example')).toBe(false);

    vi.resetModules();
    vi.stubEnv('VITE_EXPLORER_BASE_URL', 'javascript:alert(1)');
    const blockedScheme = await import('../lib/stellar.js');
    expect(blockedScheme.EXPLORER_BASE_URL).toBe('https://stellar.expert/explorer/testnet');

    vi.resetModules();
    vi.stubEnv('VITE_EXPLORER_BASE_URL', 'https://stellar.expert/explorer/public');
    const blockedPublicExplorer = await import('../lib/stellar.js');
    expect(blockedPublicExplorer.EXPLORER_BASE_URL).toBe('https://stellar.expert/explorer/testnet');
  });

  it('refuses Mainnet network, hostnames, and padded Mainnet passphrase overrides in stellar.js', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', 'MAINNET');
    vi.stubEnv('VITE_STELLAR_NETWORK_PASSPHRASE', `  ${StellarSdk.Networks.PUBLIC}  `);
    vi.stubEnv('VITE_HORIZON_URL', 'https://horizon.stellar.org');
    vi.stubEnv('VITE_SOROBAN_RPC_URL', 'https://soroban.stellar.org');

    const stellar = await import('../lib/stellar.js');

    expect(stellar.STELLAR_NETWORK_NAME).toBe('TESTNET');
    expect(stellar.STELLAR_NETWORK_PASSPHRASE).toBe(StellarSdk.Networks.TESTNET);
    expect(stellar.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    expect(stellar.SOROBAN_RPC_URL).toBe('https://soroban-testnet.stellar.org');
  });

  it('suppresses static Testnet snapshot with real TaskProvider in STANDALONE mode and sanitizes stored explorerUrl', async () => {
    const customContract = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    vi.stubEnv('VITE_STELLAR_NETWORK', 'STANDALONE');
    vi.stubEnv('VITE_STELLAR_NETWORK_PASSPHRASE', undefined);
    vi.stubEnv('VITE_HORIZON_URL', undefined);
    vi.stubEnv('VITE_SOROBAN_RPC_URL', undefined);
    vi.stubEnv('VITE_FRIENDBOT_URL', undefined);
    vi.stubEnv('VITE_EXPLORER_BASE_URL', undefined);
    vi.stubEnv('VITE_GIGPAY_ESCROW_CONTRACT_ID', customContract);
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');

    localStorage.setItem('gigpay_verification_ledger_v1', JSON.stringify([
      {
        id: 'tx-local-1',
        taskId: 'Local Escrow',
        method: 'fund_task',
        amount: '25 XLM',
        contractId: customContract,
        clientWallet: VALID_ADDRESS,
        freelancerWallet: StellarSdk.Keypair.random().publicKey(),
        txHash: VALID_TX_HASH,
        status: 'Escrow Locked',
        timestamp: '2026-11-18 18:50:00 UTC',
        explorerUrl: 'javascript:alert(1)'
      }
    ]));

    const stellar = await import('../lib/stellar.js');
    expect(stellar.STELLAR_NETWORK_NAME).toBe('STANDALONE');
    expect(stellar.STELLAR_NETWORK_PASSPHRASE).toBe(StellarSdk.Networks.STANDALONE);
    expect(stellar.HORIZON_URL).toBe('http://localhost:8000');
    expect(stellar.SOROBAN_RPC_URL).toBe('http://localhost:8000/soroban/rpc');
    expect(stellar.FRIENDBOT_URL).toBe('http://localhost:8000/friendbot');
    expect(stellar.isStaticTestnetSnapshotEnabled()).toBe(false);

    const { AuthProvider } = await import('../context/AuthContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { default: VerificationLedgerModal } = await import('../components/VerificationLedgerModal.jsx');

    render(
      <ToastProvider>
        <AuthProvider>
          <TaskProvider>
            <VerificationLedgerModal isOpen={true} onClose={() => {}} />
          </TaskProvider>
        </AuthProvider>
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Stellar Local')).toBeInTheDocument();
    });
    expect(screen.getByText(customContract)).toBeInTheDocument();
    expect(screen.getByText('http://localhost:8000/soroban/rpc')).toBeInTheDocument();
    expect(screen.getByText(/Static Testnet snapshot disabled/)).toBeInTheDocument();
    expect(screen.queryByText(/Escrow #1 \(/)).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('accepts STANDALONE wallets, warns on TESTNET mismatch, and blocks MAINNET wallets in Navbar', async () => {
    vi.stubEnv('VITE_STELLAR_NETWORK', 'LOCAL');
    vi.stubEnv('VITE_OFFLINE_DEMO', 'true');

    const fakeUser = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'wallet-tester@gigpay.local',
      user_metadata: { role: 'client' },
    };
    const makeBuilder = () => {
      const b = {
        select: () => b, insert: () => b, update: () => b, upsert: () => b, delete: () => b,
        eq: () => b, neq: () => b, in: () => b, order: () => b, limit: () => b,
        single: () => Promise.resolve({ data: { role: 'client' }, error: null }),
        maybeSingle: () => Promise.resolve({ data: { role: 'client' }, error: null }),
        then: (onF, onR) => Promise.resolve({ data: [], error: null }).then(onF, onR),
        catch: (onR) => Promise.resolve({ data: [], error: null }).catch(onR),
      };
      return b;
    };
    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: { user: fakeUser } }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signOut: async () => ({ error: null }),
          updateUser: async () => ({ data: { user: fakeUser }, error: null }),
        },
        from: () => makeBuilder(),
        channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
        removeChannel: () => {},
        functions: { invoke: async () => ({ data: null, error: null }) },
      },
    }));

    const mockNetworkFn = vi.fn()
      .mockResolvedValueOnce({ network: 'TESTNET', networkPassphrase: StellarSdk.Networks.TESTNET })
      .mockResolvedValueOnce({ network: 'PUBLIC', networkPassphrase: StellarSdk.Networks.PUBLIC })
      .mockResolvedValueOnce({ network: 'STANDALONE', networkPassphrase: StellarSdk.Networks.STANDALONE });
    const mockApi = {
      isAllowed: async () => ({ isAllowed: true }),
      setAllowed: async () => ({ isAllowed: true }),
      isConnected: async () => ({ isConnected: true }),
      requestAccess: async () => ({ address: VALID_ADDRESS }),
      getAddress: async () => ({ address: VALID_ADDRESS }),
      getNetwork: mockNetworkFn,
      signTransaction: async () => ({}),
    };
    vi.doMock('@stellar/freighter-api', () => ({ default: mockApi, ...mockApi }));

    const { AuthProvider, useAuth } = await import('../context/AuthContext.jsx');
    const { TaskProvider } = await import('../context/TaskContext.jsx');
    const { ToastProvider } = await import('../context/ToastContext.jsx');
    const { default: Navbar } = await import('../components/Navbar.jsx');

    const DisconnectHelper = () => {
      const { disconnectWallet } = useAuth();
      return <button type="button" onClick={disconnectWallet}>Disconnect</button>;
    };

    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <TaskProvider>
              <DisconnectHelper />
              <Navbar />
            </TaskProvider>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Local')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Wallet' }));
    await waitFor(() => {
      expect(screen.getAllByText(/Please switch it to Stellar Local \(Standalone\)/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Connect Wallet' }));
    await waitFor(() => {
      expect(screen.getAllByText(/Mainnet wallets are disabled/i).length).toBeGreaterThan(0);
    });
    expect(localStorage.getItem('gigpay_wallet_public_key')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Wallet' }));
    await waitFor(() => {
      expect(screen.getByText(/Connected to Stellar Local \(Standalone\):/)).toBeInTheDocument();
    });
    expect(screen.getByText('Local')).toBeInTheDocument();
  });

  it('keeps local Supabase config and ordered SQL migrations consistent for clean db reset', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
    const configToml = fs.readFileSync(path.join(repoRoot, 'supabase/config.toml'), 'utf8');
    const schemaSql = fs.readFileSync(path.join(repoRoot, 'supabase_schema.sql'), 'utf8');
    const migrationsDir = path.join(repoRoot, 'supabase/migrations');
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    expect(configToml).toContain('project_id = "gigpay"');
    expect(configToml).toContain('[functions.fund-practice-wallet]');
    expect(configToml).toContain('enable_confirmations = false');
    expect(configToml).toContain('enabled = true');

    expect(files[0]).toBe('20261104000000_baseline_schema.sql');
    const baselineSql = fs.readFileSync(path.join(migrationsDir, files[0]), 'utf8');
    const guardSql = fs.readFileSync(path.join(migrationsDir, '20261105023600_guard_task_updates_and_harden_auth_functions.sql'), 'utf8');
    const poolSql = fs.readFileSync(path.join(migrationsDir, '20261105120000_practice_wallet_funding_pool.sql'), 'utf8');
    const hardeningSql = fs.readFileSync(path.join(migrationsDir, '20261119000000_harden_task_guards_and_constraints.sql'), 'utf8');
    const edgeFn = fs.readFileSync(path.join(repoRoot, 'supabase/functions/fund-practice-wallet/index.ts'), 'utf8');

    expect(baselineSql).toContain('create table if not exists public.profiles');
    expect(baselineSql).toContain('create table if not exists public.tasks');
    expect(baselineSql).toContain('completed_at timestamp with time zone');
    expect(schemaSql).toContain('completed_at timestamp with time zone');
    expect(schemaSql).toContain("set search_path = ''");
    expect(baselineSql).toContain('create or replace function public.handle_new_user()');

    expect(guardSql).toContain("to_regprocedure('public.handle_user_update()')");
    expect(guardSql).toContain('add column if not exists completed_at');
    expect(poolSql).toContain('gigpay_testnet_pool_secret');
    expect(hardeningSql).toContain('not valid');
    expect(hardeningSql).toContain('enforce_profile_update');
    expect(hardeningSql).toContain('enforce_task_insert');
    expect(hardeningSql).toContain('enforce_task_update');
    expect(hardeningSql).toContain('^https://');
    expect(hardeningSql).toContain("p.role = 'client'");
    expect(edgeFn).toContain('STELLAR_HORIZON_URL');
    expect(edgeFn).toContain('STELLAR_NETWORK_PASSPHRASE');
    expect(edgeFn).toContain('STELLAR_NETWORK');
    expect(edgeFn).toContain('Networks.PUBLIC');
    expect(edgeFn).toContain('Networks.TESTNET');
  });
});
