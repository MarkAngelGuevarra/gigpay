import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as StellarSdk from '@stellar/stellar-sdk';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_KEY = StellarSdk.Keypair.random().publicKey();
const FREELANCER_KEY = StellarSdk.Keypair.random().publicKey();

describe('Phase 2 Slice 2: taskLifecycle merges, deletion sync, dispute preflight, and recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.doUnmock('../lib/supabase.js');
    vi.doUnmock('../lib/stellar.js');
  });

  it('promotes Confirming to Failed cleanly and merges fresher or backfilled equal-rank fields', async () => {
    const { mergeTaskRecords, STATUS_RANK } = await import('../lib/taskLifecycle.js');

    expect(STATUS_RANK.Failed).toBeGreaterThan(STATUS_RANK.Confirming);

    const confirming = { id: 't1', status: 'Confirming', tx_hash: 'a'.repeat(64), created_at: '2026-11-18T10:00:00Z' };
    const failed = { id: 't1', status: 'Failed', tx_hash: 'a'.repeat(64), created_at: '2026-11-18T10:00:00Z' };
    expect(mergeTaskRecords(confirming, failed).status).toBe('Failed');
    expect(mergeTaskRecords(failed, confirming).status).toBe('Failed');

    const staleCompleted = {
      id: 't2',
      status: 'Completed',
      completed_at: '2026-11-18T10:05:00Z',
      release_tx_hash: null,
      proof_attached: false,
    };
    const freshCompleted = {
      id: 't2',
      status: 'Completed',
      completed_at: '2026-11-18T10:05:00Z',
      submitted_at: '2026-11-18T10:06:00Z',
      release_tx_hash: 'b'.repeat(64),
      github_pr_url: 'https://github.com/org/repo/pull/9',
      proof_attached: true,
    };
    const mergedCompleted = mergeTaskRecords(staleCompleted, freshCompleted);
    expect(mergedCompleted.release_tx_hash).toBe('b'.repeat(64));
    expect(mergedCompleted.github_pr_url).toBe('https://github.com/org/repo/pull/9');
    expect(mergedCompleted.proof_attached).toBe(true);

    // Reverse order retains populated write-once fields when another equal-rank copy lacks them
    const reverseMerged = mergeTaskRecords(freshCompleted, staleCompleted);
    expect(reverseMerged.release_tx_hash).toBe('b'.repeat(64));

    // Newer equal-rank copy intentionally clearing optional PoW fields must not resurrect stale text
    const withOptionalPow = {
      id: 't3',
      status: 'Under Review',
      submitted_at: '2026-11-18T10:05:00Z',
      github_pr_url: 'https://github.com/org/repo/pull/10',
      doc_url: 'https://docs.google.com/doc/1',
      submission_notes: 'Old notes',
    };
    const clearedOptionalPow = {
      id: 't3',
      status: 'Under Review',
      submitted_at: '2026-11-18T10:07:00Z',
      github_pr_url: null,
      doc_url: 'https://docs.google.com/doc/2',
      submission_notes: '',
    };
    const mergedCleared = mergeTaskRecords(withOptionalPow, clearedOptionalPow);
    expect(mergedCleared.github_pr_url).toBeNull();
    expect(mergedCleared.submission_notes).toBe('');
    expect(mergedCleared.doc_url).toBe('https://docs.google.com/doc/2');

    // Resolved dispute preserves proof status ('Under Review') and binds dispute_reason to latest disputed_at
    const olderDispute = {
      id: 't4',
      status: 'Disputed',
      proof_attached: true,
      disputed_at: '2026-11-18T09:00:00Z',
      dispute_reason: 'Older reason',
    };
    const newerDisputeResolved = {
      id: 't4',
      status: 'Disputed',
      proof_attached: true,
      disputed_at: '2026-11-18T10:00:00Z',
      dispute_resolved_at: '2026-11-18T11:00:00Z',
      dispute_reason: 'Newer reason',
    };
    const resolvedMerged = mergeTaskRecords(olderDispute, newerDisputeResolved);
    expect(resolvedMerged.status).toBe('Under Review');
    expect(resolvedMerged.dispute_reason).toBe('Newer reason');
  });

  it('prunes server-deleted rows including empty fetchTasks, scopes contract_id, and applies Realtime DELETE', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    vi.stubEnv('VITE_GIGPAY_ESCROW_CONTRACT_ID', 'CA3KPJIZIW5NOU52NX46WBG4EXGKISB3U4YXQSV37M65HZAY27U35DDM');

    const fakeUser = { id: CLIENT_ID, email: 'c@gigpay.local', user_metadata: { role: 'client' } };
    const staleCached = {
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Deleted On Server',
      amount: '5',
      status: 'Available',
      contract_id: 'CA3KPJIZIW5NOU52NX46WBG4EXGKISB3U4YXQSV37M65HZAY27U35DDM',
      created_at: '2026-11-01T00:00:00Z',
    };
    localStorage.setItem('gigpay_tasks_owner_id', CLIENT_ID);
    localStorage.setItem('gigpay_shared_tasks', JSON.stringify([staleCached]));

    const matchingRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Current Contract Escrow',
      amount: '10',
      status: 'Available',
      contract_id: 'CA3KPJIZIW5NOU52NX46WBG4EXGKISB3U4YXQSV37M65HZAY27U35DDM',
      created_at: '2026-11-18T00:00:00Z',
    };
    const foreignRow = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Other Contract Escrow',
      amount: '25',
      status: 'Available',
      contract_id: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM',
      created_at: '2026-11-18T00:00:00Z',
    };

    let fetchResponses = [
      { data: [matchingRow, foreignRow], error: null },
      { data: [], error: null },
    ];
    let realtimeHandler = null;

    const makeBuilder = () => {
      const b = {
        select: () => b,
        order: () => Promise.resolve(fetchResponses.shift() || { data: [], error: null }),
        eq: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        update: () => b,
      };
      return b;
    };

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: fakeUser } }, error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
        },
        from: vi.fn(() => makeBuilder()),
        channel: vi.fn(() => ({
          on: function (_ev, _filter, cb) {
            realtimeHandler = cb;
            return this;
          },
          subscribe: function () { return this; },
        })),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn() },
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

    await waitFor(() => {
      expect(latestTasks.tasks.map((t) => t.id)).toEqual([matchingRow.id]);
    });

    // Realtime DELETE removes row cleanly instead of resurrecting it in mergeTaskLists
    act(() => {
      realtimeHandler({ eventType: 'DELETE', old: { id: matchingRow.id } });
    });
    await waitFor(() => {
      expect(latestTasks.tasks).toEqual([]);
    });

    // Empty authoritative fetch also clears any residual local rows
    await act(async () => {
      await latestTasks.refreshTasks();
    });
    expect(latestTasks.tasks).toEqual([]);
  });

  it('blocks stale-tab release by re-checking DB dispute state and recovers release hash in markAlreadyReleased', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const fakeUser = { id: CLIENT_ID, email: 'c@gigpay.local', user_metadata: { role: 'client' } };
    const disputedRow = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Disputed On Another Tab',
      amount: '8',
      status: 'Under Review',
      client_id: CLIENT_ID,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      on_chain_task_id: 11,
      tx_hash: 'c'.repeat(64),
      created_at: '2026-11-18T00:00:00Z',
    };
    const alreadyRow = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      title: 'Already Released On Chain',
      amount: '12',
      status: 'Under Review',
      client_id: CLIENT_ID,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      on_chain_task_id: 12,
      tx_hash: 'd'.repeat(64),
      created_at: '2026-11-18T00:00:00Z',
    };

    const recoveredRelHash = 'e'.repeat(64);
    const writes = [];
    const approveSpy = vi.fn().mockResolvedValue({
      success: true,
      alreadyReleased: true,
      hash: null,
      onChainTask: { client: CLIENT_KEY, freelancer: FREELANCER_KEY, is_approved: true },
    });

    const actualStellar = await vi.importActual('../lib/stellar.js');
    vi.doMock('../lib/stellar.js', () => ({
      ...actualStellar,
      submitApproveTask: approveSpy,
      getFundTaskOutcome: vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: fakeUser } }, error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
        },
        from: vi.fn(() => {
          let targetId = null;
          let isUpdate = false;
          const b = {
            select: () => b,
            order: () => Promise.resolve({ data: [disputedRow, alreadyRow], error: null }),
            update: (payload) => {
              isUpdate = true;
              writes.push(payload);
              return b;
            },
            eq: (_col, val) => {
              targetId = val;
              if (isUpdate) return Promise.resolve({ error: null });
              return b;
            },
            maybeSingle: async () => {
              if (targetId === disputedRow.id) {
                return { data: { status: 'Disputed', disputed_at: '2026-11-18T01:00:00Z', dispute_resolved_at: null }, error: null };
              }
              if (targetId === alreadyRow.id) {
                return { data: { status: 'Under Review', release_tx_hash: recoveredRelHash, completed_at: '2026-11-18T02:00:00Z' }, error: null };
              }
              return { data: null, error: null };
            },
          };
          return b;
        }),
        channel: vi.fn(() => ({ on: function () { return this; }, subscribe: function () { return this; } })),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn() },
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

    await waitFor(() => {
      expect(latestTasks.tasks).toHaveLength(2);
    });

    await expect(latestTasks.updateTaskStatus(disputedRow.id, 'Completed'))
      .rejects.toThrow(/Disputed/i);
    expect(approveSpy).not.toHaveBeenCalled();

    let out;
    await act(async () => {
      out = await latestTasks.updateTaskStatus(alreadyRow.id, 'Completed');
    });
    expect(out.alreadyReleased).toBe(true);
    expect(out.hash).toBe(recoveredRelHash);
    expect(writes.some((w) => w.release_tx_hash === recoveredRelHash && w.status === 'Completed')).toBe(true);
  });

  it('handles addTask notSent failures cleanly, skips in-flight Confirming tasks in resolver 2b, catches 0-row writeTask, rejects non-https PoW, and fails closed on dispute DB error', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const fakeUser = { id: CLIENT_ID, email: 'c@gigpay.local', user_metadata: { role: 'client' } };
    const { captureInviteFromUrl, peekInvitePayout } = await import('../lib/invite.js');
    captureInviteFromUrl(`?pay=${FREELANCER_KEY}`);
    expect(peekInvitePayout()).toBe(FREELANCER_KEY);

    const inProgressId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const existingTask = {
      id: inProgressId,
      title: 'Existing Escrow',
      amount: '5',
      status: 'In Progress',
      client_id: CLIENT_ID,
      freelancer_id: '22222222-2222-4222-8222-222222222222',
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      on_chain_task_id: 21,
      tx_hash: 'a'.repeat(64),
      created_at: '2026-11-18T00:00:00Z',
    };

    const writes = [];
    let forceZeroRowUpdate = false;
    let disputePreflightError = false;
    let resolveSlowFundTx;
    let fundAttempt = 0;

    const actualStellar = await vi.importActual('../lib/stellar.js');
    const approveSpy = vi.fn().mockResolvedValue({ success: true, hash: 'f'.repeat(64) });
    const getOutcomeSpy = vi.fn().mockResolvedValue({ status: 'SUCCESS', onChainTaskId: 99 });

    vi.doMock('../lib/stellar.js', () => ({
      ...actualStellar,
      getFundTaskOutcome: getOutcomeSpy,
      submitApproveTask: approveSpy,
      submitFundTask: vi.fn(async (_args, { onSigned }) => {
        fundAttempt++;
        if (fundAttempt === 1) {
          await onSigned({ hash: '1'.repeat(64), clientAddress: CLIENT_KEY, freelancerAddress: FREELANCER_KEY });
          const err = new Error('User rejected before broadcast');
          err.notSent = true;
          throw err;
        }
        await onSigned({ hash: '2'.repeat(64), clientAddress: CLIENT_KEY, freelancerAddress: FREELANCER_KEY });
        return new Promise((resolve) => {
          resolveSlowFundTx = resolve;
        });
      }),
    }));

    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: fakeUser } }, error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
        },
        from: vi.fn(() => {
          let isUpdate = false;
          let isProfiles = false;
          const b = {
            select: (cols) => {
              if (cols === 'role') isProfiles = true;
              return b;
            },
            order: () => Promise.resolve({ data: [existingTask], error: null }),
            insert: () => Promise.resolve({ error: null }),
            update: (payload) => {
              isUpdate = true;
              writes.push(payload);
              return b;
            },
            eq: () => {
              if (isUpdate) {
                return {
                  select: async () => ({
                    data: forceZeroRowUpdate ? [] : [{ id: existingTask.id }],
                    error: null,
                  }),
                };
              }
              return b;
            },
            single: async () => ({ data: isProfiles ? { role: 'client' } : existingTask, error: null }),
            maybeSingle: async () => {
              if (disputePreflightError) {
                return { data: null, error: new Error('db preflight failed') };
              }
              return { data: { status: 'In Progress', disputed_at: null, dispute_resolved_at: null }, error: null };
            },
          };
          return b;
        }),
        channel: vi.fn(() => ({ on: function () { return this; }, subscribe: function () { return this; } })),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn() },
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

    await waitFor(() => {
      expect(latestTasks.tasks).toHaveLength(1);
    });

    // 1. notSent error marks temp task Failed in DB, removes it locally, and keeps invite payout intact
    await expect(
      latestTasks.addTask({ title: 'Declined Fund', amount: '5', freelancer_wallet: FREELANCER_KEY })
    ).rejects.toThrow(/User rejected/);
    expect(writes.some((w) => w.status === 'Failed')).toBe(true);
    expect(latestTasks.tasks.map((t) => t.id)).toEqual([inProgressId]);
    expect(peekInvitePayout()).toBe(FREELANCER_KEY);

    // 2. While addTask is Confirming in flight, resolver 2b skips it instead of racing writes
    let inflightAddPromise;
    await act(async () => {
      inflightAddPromise = latestTasks.addTask({ title: 'Racing Fund', amount: '6', freelancer_wallet: FREELANCER_KEY });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(getOutcomeSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveSlowFundTx({ success: true, hash: '2'.repeat(64), onChainTaskId: 55, freelancerAddress: FREELANCER_KEY });
      await inflightAddPromise;
    });

    // 3. submitProofOfWork rejects non-https URLs and propagates 0-row writeTask failure
    await expect(
      latestTasks.submitProofOfWork(inProgressId, { docUrl: 'http://insecure.local/file' })
    ).rejects.toThrow(/valid https:\/\//i);

    forceZeroRowUpdate = true;
    await expect(
      latestTasks.submitProofOfWork(inProgressId, { docUrl: 'https://docs.google.com/valid' })
    ).rejects.toThrow(/couldn't save your proof of work/i);
    forceZeroRowUpdate = false;

    // 4. Dispute preflight DB error fails closed before requesting wallet release
    disputePreflightError = true;
    await expect(latestTasks.updateTaskStatus(inProgressId, 'Completed'))
      .rejects.toThrow(/verify dispute status before releasing/i);
    expect(approveSpy).not.toHaveBeenCalled();
  });

  it('emits balance refresh when an incoming Realtime UPDATE settles the freelancer escrow to Completed', async () => {
    vi.stubEnv('VITE_OFFLINE_DEMO', 'false');
    const flId = '22222222-2222-4222-8222-222222222222';
    const flUser = { id: flId, email: 'fl@gigpay.local', user_metadata: { role: 'freelancer' } };
    const reviewTask = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      title: 'Realtime Settlement Task',
      amount: '15',
      status: 'Under Review',
      client_id: CLIENT_ID,
      freelancer_id: flId,
      client_wallet: CLIENT_KEY,
      freelancer_wallet: FREELANCER_KEY,
      on_chain_task_id: 33,
      tx_hash: 'a'.repeat(64),
      created_at: '2026-11-18T00:00:00Z',
    };

    let realtimeHandler = null;
    vi.doMock('../lib/supabase.js', () => ({
      supabase: {
        auth: {
          getSession: vi.fn().mockResolvedValue({ data: { session: { user: flUser } }, error: null }),
          onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
        },
        from: vi.fn(() => {
          const b = {
            select: () => b,
            eq: () => b,
            order: () => Promise.resolve({ data: [reviewTask], error: null }),
            single: async () => ({ data: { role: 'freelancer' }, error: null }),
            maybeSingle: async () => ({ data: { role: 'freelancer' }, error: null }),
          };
          return b;
        }),
        channel: vi.fn(() => ({
          on: function (_ev, _filter, cb) {
            realtimeHandler = cb;
            return this;
          },
          subscribe: function () { return this; },
        })),
        removeChannel: vi.fn(),
        functions: { invoke: vi.fn() },
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

    let refreshCount = 0;
    const onBalanceRefresh = () => { refreshCount++; };
    window.addEventListener('gigpay:balance-refresh', onBalanceRefresh);

    try {
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
        expect(latestTasks.tasks).toHaveLength(1);
      });
      expect(refreshCount).toBe(0);

      act(() => {
        realtimeHandler({
          eventType: 'UPDATE',
          new: { ...reviewTask, status: 'Completed', release_tx_hash: 'b'.repeat(64), completed_at: '2026-11-18T00:05:00Z' },
        });
      });

      expect(refreshCount).toBe(1);
      expect(latestTasks.tasks[0].status).toBe('Completed');
    } finally {
      window.removeEventListener('gigpay:balance-refresh', onBalanceRefresh);
    }
  });
});
