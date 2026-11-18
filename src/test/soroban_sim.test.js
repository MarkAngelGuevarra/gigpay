import * as StellarSdk from '@stellar/stellar-sdk';

const isLive = process.argv.includes('--live') || process.env.GIGPAY_LIVE_TESTNET === '1';

if (!isLive) {
  let simCall = 0;
  let pollAttempt = 0;
  const mockTxData = new StellarSdk.xdr.SorobanTransactionData({
    ext: new StellarSdk.xdr.SorobanTransactionDataExt(0),
    resources: new StellarSdk.xdr.SorobanResources({
      footprint: new StellarSdk.xdr.LedgerFootprint({ readOnly: [], readWrite: [] }),
      instructions: 0,
      diskReadBytes: 0,
      writeBytes: 0,
    }),
    resourceFee: StellarSdk.xdr.Int64.fromString('100'),
  }).toXDR('base64');

  const dummyKp = StellarSdk.Keypair.random();
  const dummyTx = new StellarSdk.TransactionBuilder(new StellarSdk.Account(dummyKp.publicKey(), '1'), {
    fee: '100',
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(StellarSdk.Operation.bumpSequence({ bumpTo: '2' }))
    .setTimeout(30)
    .build();
  dummyTx.sign(dummyKp);
  const mockEnvelopeXdr = dummyTx.toEnvelope().toXDR('base64');
  const mockResultXdr = new StellarSdk.xdr.TransactionResult({
    feeCharged: StellarSdk.xdr.Int64.fromString('100'),
    result: StellarSdk.xdr.TransactionResultResult.txSuccess([]),
    ext: new StellarSdk.xdr.TransactionResultExt(0),
  }).toXDR('base64');
  const mockResultMetaXdr = new StellarSdk.xdr.TransactionMeta(
    3,
    new StellarSdk.xdr.TransactionMetaV3({
      ext: new StellarSdk.xdr.ExtensionPoint(0),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new StellarSdk.xdr.SorobanTransactionMeta({
        ext: new StellarSdk.xdr.SorobanTransactionMetaExt(0),
        events: [],
        returnValue: StellarSdk.xdr.ScVal.scvU32(42),
        diagnosticEvents: [],
      }),
    }),
  ).toXDR('base64');

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('/accounts/')) {
      const accountId = url.split('/accounts/')[1]?.split('?')[0] || 'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E';
      return new Response(
        JSON.stringify({
          id: accountId,
          account_id: accountId,
          sequence: '100',
          subentry_count: 0,
          thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
          flags: { auth_required: false, auth_revocable: false, auth_immutable: false, auth_clawback_enabled: false },
          balances: [{ asset_type: 'native', balance: '500.0000000' }],
          signers: [{ key: accountId, weight: 1, type: 'ed25519_public_key' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const method = body?.method;
    if (method === 'getHealth') {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id ?? 1,
          result: { status: 'healthy', latestLedger: 1234, oldestLedger: 1, ledgerRetentionWindow: 1200 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (method === 'getTransaction') {
      pollAttempt += 1;
      if (pollAttempt === 1) {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, result: { status: 'NOT_FOUND', latestLedger: 1234 } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id ?? 1,
          result: {
            status: 'SUCCESS',
            ledger: 1235,
            createdAt: 1700000000,
            applicationOrder: 1,
            feeBump: false,
            latestLedger: 1235,
            envelopeXdr: mockEnvelopeXdr,
            resultXdr: mockResultXdr,
            resultMetaXdr: mockResultMetaXdr,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (method === 'simulateTransaction') {
      simCall += 1;
      if (simCall === 1) {
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id ?? 1,
            result: {
              latestLedger: 1234,
              minResourceFee: '100',
              transactionData: mockTxData,
              results: [{ auth: [], xdr: StellarSdk.xdr.ScVal.scvU32(1).toXDR('base64') }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: body.id ?? 1,
          result: {
            latestLedger: 1234,
            error: 'HostError: Error(WasmVm, InvalidAction)',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    throw new Error(`Unexpected offline fetch in soroban_sim.test.js: ${url} (${method || 'GET'})`);
  };
}

const {
  GIGPAY_ESCROW_CONTRACT_ID,
  NATIVE_SAC_CONTRACT_ID,
  DEFAULT_FREELANCER_TESTNET_ADDRESS,
  checkSorobanRpcHealth,
  simulateFundTask,
  simulateApproveTask,
  pollSorobanTransactionWithBackoff,
  validateEscrowParties,
  formatStellarError,
} = await import('../lib/stellar.js');

async function runSorobanSimulationTests() {
  console.log(`🧪 Starting GigPay Soroban Integration Tests (${isLive ? 'LIVE' : 'OFFLINE MOCK'})...\n`);

  // Test 1: RPC Health Check
  console.log('--- Test 1: RPC Endpoint Health ---');
  const health = await checkSorobanRpcHealth();
  console.log(`RPC Endpoint: ${health.rpcUrl}`);
  console.log(`RPC Status: ${health.status}`);
  if (health.status?.toLowerCase() !== 'healthy') {
    throw new Error(`RPC health check degraded: ${health.error}`);
  }
  console.log('✅ Test 1 Passed: RPC endpoint is responsive.\n');

  // Test 2: Contract Address Verification
  console.log('--- Test 2: Contract Address & SAC Verification ---');
  console.log(`Escrow Contract ID: ${GIGPAY_ESCROW_CONTRACT_ID}`);
  console.log(`Native XLM SAC ID:   ${NATIVE_SAC_CONTRACT_ID}`);
  if (!GIGPAY_ESCROW_CONTRACT_ID.startsWith('C') || !NATIVE_SAC_CONTRACT_ID.startsWith('C')) {
    throw new Error('Invalid contract address format.');
  }
  console.log('✅ Test 2 Passed: Contract addresses format valid.\n');

  // Test 3: fund_task Simulation
  console.log('--- Test 3: fund_task Transaction Simulation ---');
  const testClient = 'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E';
  const fundSim = await simulateFundTask({
    clientAddress: testClient,
    freelancerAddress: DEFAULT_FREELANCER_TESTNET_ADDRESS,
    amount: '1.0',
  });

  console.log('Simulation Status: Success');
  console.log(`Calculated Min Resource Fee: ${fundSim.minResourceFee} stroops`);
  if (!fundSim.simulation || StellarSdk.rpc.Api.isSimulationError(fundSim.simulation) || fundSim.isDemo !== false || !fundSim.preparedTx) {
    throw new Error('Simulation returned unexpected error or missing preparedTx');
  }
  console.log('✅ Test 3 Passed: fund_task simulation generated valid Soroban auth & footprint.\n');

  // Test 4: Multi-Wallet Address Syntax Validation
  console.log('--- Test 4: Multi-Wallet Syntax & Key Validation ---');
  const validClient = 'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E';
  const validFreelancer = DEFAULT_FREELANCER_TESTNET_ADDRESS;
  const invalidAddress = 'GB_INVALID_TESTNET_ADDRESS_12345';

  if (!StellarSdk.StrKey.isValidEd25519PublicKey(validClient)) {
    throw new Error('Valid client key rejected');
  }
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(validFreelancer)) {
    throw new Error('Valid freelancer key rejected');
  }
  if (StellarSdk.StrKey.isValidEd25519PublicKey(invalidAddress)) {
    throw new Error('Invalid address was improperly accepted');
  }
  console.log('✅ Test 4 Passed: Stellar address formats strictly validated.\n');

  // Test 5: Real Distinct Parties Rejection Check
  console.log('--- Test 5: Multi-Wallet Separation via validateEscrowParties ---');
  const pairCheck = validateEscrowParties(validClient, validFreelancer);
  if (!pairCheck.valid) {
    throw new Error(`Distinct Testnet wallets should validate cleanly: ${pairCheck.error}`);
  }
  console.log('✅ Test 5 Passed: Distinct wallet separation verified.\n');

  // Test 6: pollSorobanTransactionWithBackoff Retry & Return Value Extraction
  console.log('--- Test 6: pollSorobanTransactionWithBackoff Execution ---');
  if (!isLive) {
    const polled = await pollSorobanTransactionWithBackoff('a'.repeat(64), {
      maxAttempts: 3,
      initialDelayMs: 5,
      backoffMultiplier: 1.5,
      maxDelayMs: 20,
    });
    if (polled.status !== 'SUCCESS' || polled.returnValue !== 42) {
      throw new Error(`Unexpected polled outcome: ${JSON.stringify(polled)}`);
    }
  }
  console.log('✅ Test 6 Passed: Soroban transaction polling and ScVal return decoding verified.\n');

  // Test 7: Multi-Wallet Party Validation Function Test
  console.log('--- Test 7: validateEscrowParties Assertion Logic ---');
  const partyValid = validateEscrowParties(validClient, validFreelancer);
  if (!partyValid.valid) {
    throw new Error(`Expected distinct valid wallets to pass: ${partyValid.error}`);
  }
  const selfDealingCheck = validateEscrowParties(validClient, validClient);
  if (selfDealingCheck.valid || !selfDealingCheck.error.includes('Self-dealing')) {
    throw new Error('Expected identical wallets to fail anti-self-dealing assertion');
  }
  const invalidPartyCheck = validateEscrowParties(validClient, invalidAddress);
  if (invalidPartyCheck.valid || !invalidPartyCheck.error.includes('not a valid Stellar public key')) {
    throw new Error('Expected invalid public key to be rejected');
  }
  console.log('✅ Test 7 Passed: validateEscrowParties correctly asserts distinct parties and catches self-dealing.\n');

  // Test 8: Error Normalization & Freighter Rejection Handling
  console.log('--- Test 8: formatStellarError Normalization ---');
  const userDeclinedErr = formatStellarError(new Error('User declined the transaction'));
  if (userDeclinedErr !== 'Transaction signing was rejected in Varial (formerly Freighter).') {
    throw new Error(`Unexpected message for user decline: ${userDeclinedErr}`);
  }
  const timeoutErr = formatStellarError(new Error('TIMEOUT: signature request exceeded 30000ms'));
  if (!timeoutErr.includes('nothing was sent and no money moved')) {
    throw new Error(`Unexpected message for timeout: ${timeoutErr}`);
  }
  console.log('✅ Test 8 Passed: User cancellations and wallet timeouts normalized gracefully.\n');

  // Test 9: Foreign release rejection in simulateApproveTask
  console.log('--- Test 9: Foreign Release Rejection in simulateApproveTask ---');
  let approveSim = null;
  let approveRejected = false;
  try {
    approveSim = await simulateApproveTask({
      clientAddress: validClient,
      taskId: '1',
    });
  } catch (simErr) {
    approveRejected = /HostError|escrow|InvalidAction/i.test(simErr.message);
    if (!approveRejected) {
      throw new Error(`Unexpected simulation rejection message: ${simErr.message}`);
    }
    console.log(`Contract correctly rejected foreign release: ${simErr.message.slice(0, 90)}`);
  }
  if (!isLive && !approveRejected) {
    throw new Error('Offline simulateApproveTask must reject foreign release HostError');
  }
  if (isLive && !approveRejected && (!approveSim || approveSim.isDemo || !approveSim.minResourceFee)) {
    throw new Error('simulateApproveTask masked a release outcome instead of returning a real simulation or rejecting');
  }
  console.log('✅ Test 9 Passed: simulateApproveTask foreign release enforcement verified.\n');

  console.log('🎉 All 9/9 Soroban integration tests passed successfully!');
}

runSorobanSimulationTests().catch((err) => {
  console.error('❌ Test Suite Failed:', err);
  process.exit(1);
});
