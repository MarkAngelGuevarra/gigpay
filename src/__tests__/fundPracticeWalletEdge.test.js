import { describe, it, expect, vi } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  DEFAULT_TESTNET_HORIZON,
  createFundPracticeWalletHandler,
  resolveNetworkPassphrase,
  sanitizeHorizonUrl,
} from '../../supabase/functions/fund-practice-wallet/handler.ts';

function buildDeps(overrides = {}) {
  const poolKeypair = StellarSdk.Keypair.random();
  const targetAddress = StellarSdk.Keypair.random().publicKey();
  const claims = [];
  const releases = [];
  const txHashes = [];
  const sleepSpy = vi.fn(async () => {});

  const adminStore = {
    claimFunding: vi.fn(async (userId, address, amountXlm) => {
      claims.push({ userId, address, amountXlm });
      return { error: null };
    }),
    releaseClaim: vi.fn(async (userId) => {
      releases.push(userId);
      return { error: null };
    }),
    setTxHash: vi.fn(async (userId, hash) => {
      txHashes.push({ userId, hash });
      return { error: null };
    }),
    getPoolSecret: vi.fn(async () => ({ data: poolKeypair.secret(), error: null })),
    ...overrides.adminStore,
  };

  const fetchImpl = overrides.fetchImpl || vi.fn(async (url) => {
    const target = String(url);
    if (target.includes(`/accounts/${poolKeypair.publicKey()}`)) {
      return new Response(JSON.stringify({ sequence: '10' }), { status: 200 });
    }
    if (target.includes('/accounts/')) {
      return new Response('{}', { status: 404 });
    }
    if (target.endsWith('/transactions')) {
      return new Response(JSON.stringify({ hash: 'f'.repeat(64) }), { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${target}`);
  });

  const handler = createFundPracticeWalletHandler({
    horizonUrl: DEFAULT_TESTNET_HORIZON,
    networkPassphrase: StellarSdk.Networks.TESTNET,
    fetchImpl,
    sleep: sleepSpy,
    random: () => 0,
    getAuthenticatedUser: vi.fn(async (authHeader) => (authHeader ? { id: 'user-1' } : null)),
    getAdminStore: () => adminStore,
    stellar: {
      isValidPublicKey: (key) => StellarSdk.StrKey.isValidEd25519PublicKey(key),
      derivePublicKey: (secret) => StellarSdk.Keypair.fromSecret(secret).publicKey(),
      buildAndSignCreateAccountTx: ({
        poolSecret,
        poolPublicKey,
        poolSequence,
        destination,
        startingBalance,
        networkPassphrase,
      }) => {
        const tx = new StellarSdk.TransactionBuilder(
          new StellarSdk.Account(poolPublicKey, poolSequence),
          { fee: '1000', networkPassphrase },
        )
          .addOperation(StellarSdk.Operation.createAccount({ destination, startingBalance }))
          .setTimeout(60)
          .build();
        tx.sign(StellarSdk.Keypair.fromSecret(poolSecret));
        return tx.toXDR();
      },
    },
    ...overrides.handlerDeps,
  });

  return { handler, poolKeypair, targetAddress, adminStore, claims, releases, txHashes, fetchImpl, sleepSpy };
}

describe('fund-practice-wallet Edge Function handler', () => {
  it('sanitizes Horizon URLs against Mainnet hosts, credentials, and non-local HTTP', () => {
    expect(sanitizeHorizonUrl('')).toBe(DEFAULT_TESTNET_HORIZON);
    expect(sanitizeHorizonUrl('https://horizon.stellar.org')).toBe(DEFAULT_TESTNET_HORIZON);
    expect(sanitizeHorizonUrl('https://user:pass@horizon-testnet.stellar.org')).toBe(DEFAULT_TESTNET_HORIZON);
    expect(sanitizeHorizonUrl('http://horizon-testnet.stellar.org')).toBe(DEFAULT_TESTNET_HORIZON);
    expect(sanitizeHorizonUrl('http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000');
    expect(sanitizeHorizonUrl('https://horizon-testnet.stellar.org/')).toBe(DEFAULT_TESTNET_HORIZON);
  });

  it('never permits Mainnet passphrase and falls back cleanly between Testnet and Standalone', () => {
    const nets = {
      PUBLIC: StellarSdk.Networks.PUBLIC,
      TESTNET: StellarSdk.Networks.TESTNET,
      STANDALONE: StellarSdk.Networks.STANDALONE,
    };
    expect(resolveNetworkPassphrase('TESTNET', StellarSdk.Networks.PUBLIC, nets)).toBe(StellarSdk.Networks.TESTNET);
    expect(resolveNetworkPassphrase('LOCAL', StellarSdk.Networks.PUBLIC, nets)).toBe(StellarSdk.Networks.STANDALONE);
    expect(resolveNetworkPassphrase('LOCAL', StellarSdk.Networks.TESTNET, nets)).toBe(StellarSdk.Networks.STANDALONE);
    expect(resolveNetworkPassphrase('STANDALONE', 'Custom Local Net ; 2026', nets)).toBe('Custom Local Net ; 2026');
  });

  it('handles CORS OPTIONS, rejects non-POST (405), unauthenticated (401), invalid key (400), and malformed JSON (400)', async () => {
    const { handler } = buildDeps();

    const optRes = await handler(new Request('https://edge.local/fund', { method: 'OPTIONS' }));
    expect(optRes.status).toBe(200);
    expect(optRes.headers.get('Access-Control-Allow-Methods')).toContain('POST');

    const getRes = await handler(new Request('https://edge.local/fund', { method: 'GET' }));
    expect(getRes.status).toBe(405);

    const noAuthRes = await handler(new Request('https://edge.local/fund', {
      method: 'POST',
      body: JSON.stringify({ address: 'G' }),
    }));
    expect(noAuthRes.status).toBe(401);

    const badKeyRes = await handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: 'GB_NOT_VALID' }),
    }));
    expect(badKeyRes.status).toBe(400);

    const badJsonRes = await handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: '{bad json',
    }));
    expect(badJsonRes.status).toBe(400);
  });

  it('returns already_active without claiming when Horizon knows the wallet, and returns 502 without claiming on 429/5xx', async () => {
    const targetAddress = StellarSdk.Keypair.random().publicKey();
    const { handler, claims } = buildDeps({
      fetchImpl: vi.fn(async () => new Response('{}', { status: 200 })),
    });

    const activeRes = await handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: targetAddress }),
    }));
    expect(activeRes.status).toBe(200);
    expect(await activeRes.json()).toEqual({ status: 'already_active' });
    expect(claims).toHaveLength(0);

    const rateLimited = buildDeps({
      fetchImpl: vi.fn(async () => new Response('rate limited', { status: 429 })),
    });
    const rlRes = await rateLimited.handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: targetAddress }),
    }));
    expect(rlRes.status).toBe(502);
    expect(rateLimited.claims).toHaveLength(0);
  });

  it('returns 409 when user already claimed a one-time top-up and releases claim if pool secret is missing', async () => {
    const dupClaim = buildDeps({
      adminStore: {
        claimFunding: vi.fn(async () => ({ error: { code: '23505', message: 'duplicate' } })),
      },
    });
    const res = await dupClaim.handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: dupClaim.targetAddress }),
    }));
    expect(res.status).toBe(409);

    const missingPool = buildDeps({
      adminStore: {
        getPoolSecret: vi.fn(async () => ({ data: null, error: null })),
      },
    });
    const poolErrRes = await missingPool.handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: missingPool.targetAddress }),
    }));
    expect(poolErrRes.status).toBe(502);
    expect(missingPool.releases).toEqual(['user-1']);
  });

  it('retries tx_bad_seq with refreshed sequence number, verifies submitted XDR, and records funded hash', async () => {
    const poolKeypair = StellarSdk.Keypair.random();
    const targetAddress = StellarSdk.Keypair.random().publicKey();
    let seqCalls = 0;
    const submittedTxs = [];

    const { handler, claims, releases, txHashes } = buildDeps({
      adminStore: {
        getPoolSecret: vi.fn(async () => ({ data: poolKeypair.secret(), error: null })),
      },
      fetchImpl: vi.fn(async (url, init) => {
        const target = String(url);
        if (target.includes(`/accounts/${poolKeypair.publicKey()}`)) {
          seqCalls += 1;
          return new Response(JSON.stringify({ sequence: String(100 + seqCalls) }), { status: 200 });
        }
        if (target.includes('/accounts/')) {
          return new Response('{}', { status: 404 });
        }
        if (target.endsWith('/transactions')) {
          const xdrStr = new URLSearchParams(String(init.body)).get('tx');
          const decoded = StellarSdk.TransactionBuilder.fromXDR(xdrStr, StellarSdk.Networks.TESTNET);
          submittedTxs.push({
            sequence: decoded.sequence,
            op: decoded.operations[0],
          });
          if (submittedTxs.length === 1) {
            return new Response(
              JSON.stringify({ extras: { result_codes: { transaction: 'tx_bad_seq' } } }),
              { status: 400 },
            );
          }
          return new Response(JSON.stringify({ hash: 'a'.repeat(64) }), { status: 200 });
        }
        throw new Error(`Unexpected URL ${target}`);
      }),
    });

    const res = await handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: targetAddress }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'funded', hash: 'a'.repeat(64), amount: '25' });
    expect(seqCalls).toBe(2);
    expect(submittedTxs).toHaveLength(2);
    expect(submittedTxs[0].sequence).toBe('102');
    expect(submittedTxs[1].sequence).toBe('103');
    expect(submittedTxs[1].op.type).toBe('createAccount');
    expect(submittedTxs[1].op.destination).toBe(targetAddress);
    expect(submittedTxs[1].op.startingBalance).toBe('25.0000000');
    expect(claims).toHaveLength(1);
    expect(releases).toHaveLength(0);
    expect(txHashes).toEqual([{ userId: 'user-1', hash: 'a'.repeat(64) }]);
  });

  it('skips sleep after final tx_bad_seq attempt, handles late Friendbot activation, and retains claim on network drops', async () => {
    const poolKeypair = StellarSdk.Keypair.random();
    const targetAddress = StellarSdk.Keypair.random().publicKey();

    const exhausted = buildDeps({
      handlerDeps: { maxAttempts: 2 },
      adminStore: {
        getPoolSecret: vi.fn(async () => ({ data: poolKeypair.secret(), error: null })),
      },
      fetchImpl: vi.fn(async (url) => {
        const target = String(url);
        if (target.includes(`/accounts/${poolKeypair.publicKey()}`)) {
          return new Response(JSON.stringify({ sequence: '10' }), { status: 200 });
        }
        if (target.includes('/accounts/')) {
          return new Response('{}', { status: 404 });
        }
        return new Response(
          JSON.stringify({ extras: { result_codes: { transaction: 'tx_bad_seq' } } }),
          { status: 400 },
        );
      }),
    });

    const exRes = await exhausted.handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: targetAddress }),
    }));
    expect(exRes.status).toBe(502);
    expect(exhausted.sleepSpy).toHaveBeenCalledTimes(1);
    expect(exhausted.releases).toEqual(['user-1']);

    let accountCheckCount = 0;
    const fundedMeanwhile = buildDeps({
      adminStore: {
        getPoolSecret: vi.fn(async () => ({ data: poolKeypair.secret(), error: null })),
      },
      fetchImpl: vi.fn(async (url) => {
        const target = String(url);
        if (target.includes(`/accounts/${poolKeypair.publicKey()}`)) {
          return new Response(JSON.stringify({ sequence: '10' }), { status: 200 });
        }
        if (target.includes('/accounts/')) {
          accountCheckCount += 1;
          return new Response('{}', { status: accountCheckCount === 1 ? 404 : 200 });
        }
        return new Response(
          JSON.stringify({ extras: { result_codes: { transaction: 'tx_failed' } } }),
          { status: 400 },
        );
      }),
    });
    const meanRes = await fundedMeanwhile.handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: targetAddress }),
    }));
    expect(meanRes.status).toBe(200);
    expect(await meanRes.json()).toEqual({ status: 'already_active' });
    expect(fundedMeanwhile.releases).toEqual(['user-1']);

    const dropped = buildDeps({
      adminStore: {
        getPoolSecret: vi.fn(async () => ({ data: poolKeypair.secret(), error: null })),
      },
      fetchImpl: vi.fn(async (url) => {
        const target = String(url);
        if (target.includes(`/accounts/${poolKeypair.publicKey()}`)) {
          return new Response(JSON.stringify({ sequence: '10' }), { status: 200 });
        }
        if (target.includes('/accounts/')) {
          return new Response('{}', { status: 404 });
        }
        throw new Error('network timeout after POST');
      }),
    });

    const dropRes = await dropped.handler(new Request('https://edge.local/fund', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt' },
      body: JSON.stringify({ address: targetAddress }),
    }));
    expect(dropRes.status).toBe(502);
    expect(dropped.releases).toEqual([]);
  });
});
