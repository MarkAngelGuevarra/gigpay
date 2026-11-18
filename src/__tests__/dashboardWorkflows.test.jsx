import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';
import { ToastProvider } from '../context/ToastContext';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const FREELANCER_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_WALLET = StellarSdk.Keypair.random().publicKey();
const FREELANCER_WALLET = StellarSdk.Keypair.random().publicKey();
const OTHER_FREELANCER_WALLET = StellarSdk.Keypair.random().publicKey();
const TX_A = 'a'.repeat(64);
const TX_B = 'b'.repeat(64);
const TX_C = 'c'.repeat(64);

const mockAuthState = {
  user: { id: CLIENT_ID, email: 'client-test@example.com' },
  publicKey: CLIENT_WALLET,
  connectTesterWallet: vi.fn(),
  switchRole: vi.fn(),
  isSimulationMode: false,
};

const mockTaskState = {
  tasks: [],
  refreshTasks: vi.fn(async () => true),
  addTask: vi.fn(async (t) => ({ ...t, hash: TX_A })),
  updateTaskStatus: vi.fn(async () => ({ success: true, hash: TX_B })),
  raiseDispute: vi.fn(async () => {}),
  resolveDispute: vi.fn(async () => {}),
  submitProofOfWork: vi.fn(async () => {}),
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../context/TaskContext', () => ({
  useTasks: () => mockTaskState,
}));

import ClientDashboard from '../pages/ClientDashboard';
import FreelancerDashboard from '../pages/FreelancerDashboard';

describe('Dashboard workflows and UI safety guards', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockAuthState.user = { id: CLIENT_ID, email: 'client-test@example.com' };
    mockAuthState.publicKey = CLIENT_WALLET;
    mockAuthState.isSimulationMode = false;
    mockTaskState.tasks = [];
  });

  it('computes client escrow metrics strictly from own funded on-chain tasks', () => {
    mockTaskState.tasks = [
      {
        id: 't-own-review',
        title: 'Landing UI',
        amount: '10',
        status: 'Under Review',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        on_chain_task_id: 11,
        tx_hash: TX_A,
        is_simulated: false,
      },
      {
        id: 't-own-completed',
        title: 'API Docs',
        amount: '5',
        status: 'Completed',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        on_chain_task_id: 12,
        tx_hash: TX_B,
        is_simulated: false,
      },
      {
        id: 't-own-confirming',
        title: 'Confirming Task',
        amount: '99',
        status: 'Confirming',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        tx_hash: TX_C,
        is_simulated: false,
      },
      {
        id: 't-own-sim',
        title: 'Simulated Demo Task',
        amount: '200',
        status: 'Completed',
        client_id: CLIENT_ID,
        is_simulated: true,
        tx_hash: 'demo_1234',
      },
      {
        id: 't-other-client',
        title: 'Other Client Task',
        amount: '500',
        status: 'Completed',
        client_id: OTHER_CLIENT_ID,
        on_chain_task_id: 19,
        tx_hash: TX_A,
        is_simulated: false,
      },
    ];

    render(
      <MemoryRouter>
        <ToastProvider>
          <ClientDashboard />
        </ToastProvider>
      </MemoryRouter>
    );

    const metrics = document.querySelector('.client-metrics');
    expect(metrics.textContent).toContain('15.0 XLM');
    expect(metrics.textContent).toContain('Active Escrows1');
    expect(metrics.textContent).toContain('5.0 XLM');
    expect(metrics.textContent).toContain('50%');
    expect(metrics.textContent).not.toContain('99');
    expect(metrics.textContent).not.toContain('200');
    expect(metrics.textContent).not.toContain('500');
  });

  it('auto-uppercases CONFIRM, blocks premature release, and calls updateTaskStatus once confirmed', async () => {
    mockTaskState.tasks = [
      {
        id: 't-avail',
        title: 'Available Task',
        amount: '4',
        status: 'Available',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        on_chain_task_id: 21,
        tx_hash: TX_A,
      },
      {
        id: 't-review',
        title: 'Ready For Release',
        amount: '8',
        status: 'Under Review',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        on_chain_task_id: 22,
        tx_hash: TX_B,
        github_pr_url: 'https://github.com/org/repo/pull/1',
        proof_attached: true,
      },
    ];

    render(
      <MemoryRouter>
        <ToastProvider>
          <ClientDashboard />
        </ToastProvider>
      </MemoryRouter>
    );

    const approveBtns = screen.getAllByRole('button', { name: /Approve & Release/i });
    expect(approveBtns[0]).toBeDisabled();
    expect(approveBtns[1]).toBeEnabled();

    fireEvent.click(approveBtns[1]);

    const dialog = await screen.findByRole('dialog', { name: /Milestone Release Confirmation/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByTestId('release-payout-address').textContent).toBe(FREELANCER_WALLET);

    const confirmInput = screen.getByLabelText('Type CONFIRM to release the payment');
    const releaseBtn = screen.getByRole('button', { name: /Release Escrow Payout/i });
    expect(releaseBtn).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'confir' } });
    expect(confirmInput.value).toBe('CONFIR');
    expect(releaseBtn).toBeDisabled();

    fireEvent.change(confirmInput, { target: { value: 'confirm' } });
    expect(confirmInput.value).toBe('CONFIRM');
    expect(releaseBtn).toBeEnabled();

    fireEvent.click(releaseBtn);

    await waitFor(() => {
      expect(mockTaskState.updateTaskStatus).toHaveBeenCalledWith('t-review', 'Completed');
    });
  });

  it('guards duplicate locks, blocks self-dealing or pasted G-addresses, and resets form on lock success', async () => {
    mockTaskState.tasks = [
      {
        id: 't-recent',
        title: 'Logo Draft',
        amount: '2',
        status: 'Available',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        on_chain_task_id: 66,
        created_at: new Date().toISOString(),
      },
    ];

    render(
      <MemoryRouter>
        <ToastProvider>
          <ClientDashboard />
        </ToastProvider>
      </MemoryRouter>
    );

    const titleInput = screen.getByLabelText('Task Title');
    const amountInput = screen.getByLabelText('Milestone Amount (XLM)');
    const walletInput = screen.getByLabelText("Freelancer's Payout Address");
    const submitBtn = screen.getByRole('button', { name: /Lock Funds in Escrow/i });

    // Self-dealing blocked
    fireEvent.change(titleInput, { target: { value: 'Self Pay Attempt' } });
    fireEvent.change(amountInput, { target: { value: '3' } });
    fireEvent.change(walletInput, { target: { value: CLIENT_WALLET } });
    fireEvent.click(submitBtn);
    expect(mockTaskState.addTask).not.toHaveBeenCalled();
    expect(await screen.findByText(/Self-dealing prevented/i)).toBeInTheDocument();

    // Pasting a G-address into the title with an empty wallet moves it to wallet field cleanly
    fireEvent.change(walletInput, { target: { value: '' } });
    fireEvent.change(titleInput, { target: { value: FREELANCER_WALLET } });
    fireEvent.submit(titleInput.closest('form'));
    expect(walletInput.value).toBe(FREELANCER_WALLET);
    expect(mockTaskState.addTask).not.toHaveBeenCalled();

    // Pasting another G-address while walletInput is already filled preserves existing wallet
    fireEvent.change(titleInput, { target: { value: OTHER_FREELANCER_WALLET } });
    fireEvent.click(submitBtn);
    expect(walletInput.value).toBe(FREELANCER_WALLET);
    expect(mockTaskState.addTask).not.toHaveBeenCalled();

    // Duplicate recent lock requires second tap, then forwards exact payload & clears form
    fireEvent.change(titleInput, { target: { value: 'Logo Revision' } });
    fireEvent.change(amountInput, { target: { value: '2' } });
    fireEvent.click(submitBtn);

    expect(mockTaskState.addTask).not.toHaveBeenCalled();
    expect(await screen.findByText(/already locked 2 XLM for this freelancer/i)).toBeInTheDocument();

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockTaskState.addTask).toHaveBeenCalledWith({
        title: 'Logo Revision',
        amount: '2',
        freelancer_wallet: FREELANCER_WALLET,
      });
    });
    expect(titleInput.value).toBe('');
    expect(amountInput.value).toBe('');
    expect(walletInput.value).toBe('');
  });

  it('resets custom dispute text on cancel, submits edited dispute reason, and resolves disputes', async () => {
    mockTaskState.tasks = [
      {
        id: 't-dispute',
        title: 'Design Package',
        amount: '6',
        status: 'In Progress',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        on_chain_task_id: 30,
        tx_hash: TX_A,
      },
      {
        id: 't-disputed-open',
        title: 'Paused Milestone',
        amount: '4',
        status: 'Disputed',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        disputed_at: '2026-11-18T10:00:00Z',
        dispute_reason: 'Need updated asset',
        tx_hash: TX_B,
      },
    ];

    render(
      <MemoryRouter>
        <ToastProvider>
          <ClientDashboard />
        </ToastProvider>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Pause Release & Dispute/i }));
    const reasonField = await screen.findByLabelText(/Dispute Reason/i);
    fireEvent.change(reasonField, { target: { value: 'Temporary draft text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: /Pause Release & Dispute/i }));
    const reopenedField = await screen.findByLabelText(/Dispute Reason/i);
    expect(reopenedField.value).toBe('Deliverables require revision or do not match agreed specification.');

    fireEvent.change(reopenedField, { target: { value: 'Missing vector source files' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Dispute/i }));

    await waitFor(() => {
      expect(mockTaskState.raiseDispute).toHaveBeenCalledWith('t-dispute', 'Missing vector source files');
    });

    fireEvent.click(screen.getByRole('button', { name: /Resolve Dispute/i }));
    await waitFor(() => {
      expect(mockTaskState.resolveDispute).toHaveBeenCalledWith('t-disputed-open');
    });
  });

  it('orders freelancer tasks, enforces single-flight Accept Work, validates https proof, and hides PoW when Disputed', async () => {
    mockAuthState.user = { id: FREELANCER_ID, email: 'freelancer-test@example.com' };
    mockAuthState.publicKey = FREELANCER_WALLET;

    let resolveAccept;
    mockTaskState.updateTaskStatus.mockImplementationOnce(
      () => new Promise((r) => { resolveAccept = r; })
    );

    mockTaskState.tasks = [
      {
        id: 'avail-other',
        title: 'Someone Else Task',
        amount: '3',
        status: 'Available',
        client_id: CLIENT_ID,
        freelancer_wallet: OTHER_FREELANCER_WALLET,
        tx_hash: TX_A,
      },
      {
        id: 'avail-mine',
        title: 'Reserved For Me',
        amount: '7',
        status: 'Available',
        client_id: CLIENT_ID,
        freelancer_wallet: FREELANCER_WALLET,
        tx_hash: TX_B,
      },
      {
        id: 'active-mine',
        title: 'Build Component',
        amount: '10',
        status: 'In Progress',
        client_id: CLIENT_ID,
        freelancer_id: FREELANCER_ID,
        freelancer_wallet: FREELANCER_WALLET,
        tx_hash: TX_C,
      },
      {
        id: 'disputed-mine',
        title: 'Frozen Task',
        amount: '5',
        status: 'Disputed',
        client_id: CLIENT_ID,
        freelancer_id: FREELANCER_ID,
        freelancer_wallet: FREELANCER_WALLET,
        dispute_reason: 'Revision needed',
        disputed_at: '2026-11-18T10:00:00Z',
        tx_hash: TX_A,
      },
    ];

    render(
      <MemoryRouter>
        <ToastProvider>
          <FreelancerDashboard />
        </ToastProvider>
      </MemoryRouter>
    );

    const headings = Array.from(document.querySelectorAll('h4')).map((el) => el.textContent);
    expect(headings.indexOf('Reserved For Me')).toBeLessThan(headings.indexOf('Someone Else Task'));

    const acceptButtons = screen.getAllByRole('button', { name: /Accept Work/i });
    expect(acceptButtons[0]).toBeEnabled();
    expect(acceptButtons[1]).toBeDisabled();

    // Verify single-flight click on Accept Work
    fireEvent.click(acceptButtons[0]);
    fireEvent.click(acceptButtons[0]);
    expect(mockTaskState.updateTaskStatus).toHaveBeenCalledTimes(1);
    expect(mockTaskState.updateTaskStatus).toHaveBeenCalledWith('avail-mine', 'In Progress', true);
    resolveAccept({ success: true });
    expect(await screen.findByText(/Task accepted/i)).toBeInTheDocument();

    // Only one "Attach Proof of Work Deliverables" button exists (Disputed task hides proof form)
    const powButtons = screen.getAllByRole('button', { name: /Attach Proof of Work Deliverables/i });
    expect(powButtons).toHaveLength(1);
    expect(screen.getByText(/Proof of work is paused while this dispute is open/i)).toBeInTheDocument();

    fireEvent.click(powButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: /1-Click Auto-Fill Sample/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit Deliverables/i }));
    expect(mockTaskState.submitProofOfWork).not.toHaveBeenCalled();

    const docInput = screen.getByLabelText(/Document, Design, or Work Link/i);
    fireEvent.change(docInput, { target: { value: 'http://insecure.example.com/file' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Deliverables/i }));
    expect(mockTaskState.submitProofOfWork).not.toHaveBeenCalled();

    fireEvent.change(docInput, { target: { value: 'https://docs.google.com/document/d/demo123' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Deliverables/i }));

    await waitFor(() => {
      expect(mockTaskState.submitProofOfWork).toHaveBeenCalledWith('active-mine', expect.objectContaining({
        docUrl: 'https://docs.google.com/document/d/demo123',
      }));
    });

    fireEvent.click(screen.getByTestId('show-invite-qr'));
    const qrImg = await screen.findByTestId('invite-qr-image');
    expect(qrImg.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByRole('dialog', { name: 'Invite QR code' }).textContent).toMatch(/camera app/i);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Invite QR code' })).not.toBeInTheDocument();
    });
  });
});
