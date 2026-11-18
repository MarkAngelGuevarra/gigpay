import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';
import { ToastProvider } from '../context/ToastContext';
import onchainData from '../data/onchainEscrows.json';
import { csvCell } from '../lib/ledgerIntegrity';

const mockNavigate = vi.fn();
const mockAuthState = {
  user: null,
  publicKey: '',
  switchRole: vi.fn(),
  connectTesterWallet: vi.fn(),
  connectWallet: vi.fn(),
};
const mockTaskState = {
  tasks: [],
  ledgerRecords: [],
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../context/TaskContext', () => ({
  useTasks: () => mockTaskState,
}));

import PilotGuideWidget from '../components/PilotGuideWidget';
import VerificationLedgerModal from '../components/VerificationLedgerModal';

describe('PilotGuideWidget and VerificationLedgerModal behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockAuthState.user = { id: 'client-1', email: 'student@umak.edu.ph' };
    mockAuthState.publicKey = '';
    mockTaskState.tasks = [];
    mockTaskState.ledgerRecords = [];
  });

  it('starts minimized, switches tour tabs without mutating role, and sends signed-out taps to /auth', () => {
    mockAuthState.user = null;

    render(
      <MemoryRouter initialEntries={['/client']}>
        <ToastProvider>
          <PilotGuideWidget />
        </ToastProvider>
      </MemoryRouter>
    );

    const pill = screen.getByTitle('Open Testnet Guide Coach');
    expect(pill).toBeInTheDocument();
    expect(pill.textContent).toContain('Step 1/4');

    fireEvent.click(pill);
    expect(screen.getByText(/Live Coach Guidance/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Freelancer \(5\)/i }));
    expect(mockAuthState.switchRole).not.toHaveBeenCalled();
    expect(screen.getByTitle('Restart Tour from Step 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(JSON.parse(localStorage.getItem('gigpay_guide_state_v1')).freelancerStep).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: /Restart/i }));
    expect(JSON.parse(localStorage.getItem('gigpay_guide_state_v1')).freelancerStep).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /Open Freelancer Portal/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/auth');
    expect(mockAuthState.switchRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Open Testnet Guide Coach'));
    fireEvent.click(screen.getByTitle('Minimize (Esc)'));
    fireEvent.click(screen.getByTitle('Dismiss Guide'));
    expect(screen.getByTitle('Open Testnet Guide Coach').textContent).not.toContain('Step');
  });

  it('does not advance Step 2 when pre-existing or other testers tasks hydrate into TaskContext', () => {
    localStorage.setItem('gigpay_guide_state_v1', JSON.stringify({
      clientStep: 2,
      freelancerStep: 1,
      activeTour: 'client',
      isMinimized: false,
      isDismissed: false,
    }));

    const { rerender } = render(
      <MemoryRouter initialEntries={['/client']}>
        <ToastProvider>
          <PilotGuideWidget />
        </ToastProvider>
      </MemoryRouter>
    );

    mockTaskState.tasks = [
      {
        id: 'old-foreign-task',
        title: 'Pre-existing Other Task',
        client_id: 'other-client',
        created_at: new Date().toISOString(),
      },
      {
        id: 'old-own-task',
        title: 'Yesterday Task',
        client_id: 'client-1',
        created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      },
    ];

    rerender(
      <MemoryRouter initialEntries={['/client']}>
        <ToastProvider>
          <PilotGuideWidget />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(JSON.parse(localStorage.getItem('gigpay_guide_state_v1')).clientStep).toBe(2);

    mockTaskState.tasks = [
      ...mockTaskState.tasks,
      {
        id: 'brand-new-own',
        title: 'Fresh Lock',
        client_id: 'client-1',
        created_at: new Date().toISOString(),
      },
    ];

    rerender(
      <MemoryRouter initialEntries={['/client']}>
        <ToastProvider>
          <PilotGuideWidget />
        </ToastProvider>
      </MemoryRouter>
    );

    expect(JSON.parse(localStorage.getItem('gigpay_guide_state_v1')).clientStep).toBe(3);
  });

  it('deduplicates on-chain escrows, redacts PII explicitly, neutralizes CSV formulas, and exports CSV cleanly', () => {
    const walletA = StellarSdk.Keypair.random().publicKey();
    const walletB = StellarSdk.Keypair.random().publicKey();
    const firstEscrow = onchainData.escrows[0];
    const dupHash = firstEscrow.releaseTxHash || firstEscrow.fundTxHash;
    const dbOnlyHash = 'd'.repeat(64);

    mockTaskState.tasks = [
      {
        id: 't-onchain',
        on_chain_task_id: firstEscrow.onChainTaskId,
        title: 'Matched On-Chain Row student-secret@example.com',
        amount: firstEscrow.amount,
        status: 'Completed',
        client_id: 'c1',
        client_wallet: firstEscrow.clientWallet,
        freelancer_wallet: firstEscrow.freelancerWallet,
        tx_hash: firstEscrow.fundTxHash,
        release_tx_hash: firstEscrow.releaseTxHash,
      },
      {
        id: 't-db-only',
        title: '=cmd|"/c calc"!A0 Fresh Task',
        amount: '3',
        status: 'Disputed',
        client_id: 'c2',
        client_wallet: walletA,
        freelancer_wallet: walletB,
        tx_hash: dbOnlyHash,
        disputed_by: 'c2',
        disputed_at: '2026-11-18T10:00:00Z',
        dispute_reason: 'Contact leak@example.com for revisions',
      },
    ];

    mockTaskState.ledgerRecords = [
      {
        id: 'dup-row',
        taskId: 'Duplicate Row Should Be Dropped',
        method: 'approve_task',
        amount: '1 XLM',
        contractId: 'C_TEST',
        clientWallet: firstEscrow.clientWallet,
        freelancerWallet: firstEscrow.freelancerWallet,
        txHash: dupHash,
        status: 'Completed & Released',
        timestamp: '2026-11-18 10:00:00 UTC',
      },
      {
        id: 'db-only-row',
        taskId: '=cmd|"/c calc"!A0 Fresh Task',
        method: 'fund_task',
        amount: '3 XLM',
        contractId: 'C_TEST',
        clientWallet: walletA,
        freelancerWallet: walletB,
        txHash: dbOnlyHash,
        status: 'Escrow Locked',
        timestamp: '2026-11-18 10:00:00 UTC',
      },
    ];

    expect(csvCell('=cmd|"/c calc"!A0')).toBe('"\'=cmd|""/c calc""!A0"');

    const blobs = [];
    const originalBlob = globalThis.Blob;
    globalThis.Blob = function MockBlob(parts, options) {
      blobs.push(parts.join(''));
      return new originalBlob(parts, options);
    };
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock-csv');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      render(
        <ToastProvider>
          <VerificationLedgerModal isOpen={true} onClose={vi.fn()} />
        </ToastProvider>
      );

      const modal = screen.getByRole('dialog', { name: 'Public On-Chain Verification Ledger' });
      expect(modal.textContent).not.toContain('student-secret@example.com');
      expect(modal.textContent).not.toContain('leak@example.com');
      expect(modal.textContent).toContain('[address removed]');
      expect(modal.textContent).not.toContain('Duplicate Row Should Be Dropped');
      expect(modal.textContent).toContain(`${walletA.slice(0, 6)}…${walletA.slice(-4)}`);
      expect(modal.textContent).toContain('Database only');

      fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(blobs).toHaveLength(1);
      expect(blobs[0]).toContain('Counts As Outside User');
      expect(blobs[0]).not.toContain('student-secret@example.com');
      expect(blobs[0]).not.toContain('leak@example.com');
      expect(blobs[0]).not.toContain('Duplicate Row Should Be Dropped');
      expect(blobs[0]).toContain('[address removed]');
      expect(blobs[0]).toContain('"\'=cmd|""/c calc""!A0 Fresh Task"');
      expect(blobs[0]).toContain(walletA);
    } finally {
      globalThis.Blob = originalBlob;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});
