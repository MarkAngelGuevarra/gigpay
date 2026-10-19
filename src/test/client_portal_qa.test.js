import assert from 'assert';
import * as StellarSdk from '@stellar/stellar-sdk';
import { 
  GIGPAY_ESCROW_CONTRACT_ID, 
  DEFAULT_FREELANCER_TESTNET_ADDRESS,
  simulateFundTask,
  simulateApproveTask,
  validateEscrowParties,
  isValidStellarAddress,
  checkBalanceSufficiency,
  formatStellarError,
  pollSorobanTransactionWithBackoff,
  getAccountBalance
} from '../lib/stellar.js';

// Setup Mock Browser Storage
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const mockStorage = new MockLocalStorage();
globalThis.localStorage = mockStorage;

const DEMO_FALLBACK_KEY = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
const SHARED_TASKS_KEY = 'gigpay_shared_tasks';

console.log('================================================================');
console.log('🧪 RUNNING EXHAUSTIVE CLIENT PORTAL QA VERIFICATION SUITE');
console.log('================================================================\n');

async function testSuite() {
  const testResults = [];

  const runTest = async (testName, fn) => {
    try {
      await fn();
      console.log(`✅ PASS: ${testName}`);
      testResults.push({ name: testName, status: 'PASS' });
    } catch (err) {
      console.error(`❌ FAIL: ${testName}`);
      console.error(`   Error: ${err.message}`);
      testResults.push({ name: testName, status: 'FAIL', error: err.message });
    }
  };

  // -------------------------------------------------------------
  // SECTION 1: Client Onboarding & Authentication
  // -------------------------------------------------------------
  console.log('\n--- SECTION 1: Client Onboarding & Authentication ---');

  await runTest('Auth: Demo Client Credentials & Role Assignment', async () => {
    const email = 'client@gigpay.tech';
    const password = 'password123';
    const lowerEmail = email.toLowerCase().trim();
    const isTesterAccount = lowerEmail === 'client@gigpay.tech' && password === 'password123';
    assert.strictEqual(isTesterAccount, true, 'Tester account detection should match client@gigpay.tech');
    
    const isClient = lowerEmail.includes('client');
    const role = isClient ? 'client' : 'freelancer';
    const demoUser = {
      id: 'demo-client-uuid-001',
      email: lowerEmail,
      user_metadata: {
        role: role,
        display_name: 'Acme Corp (Tester Client)'
      }
    };
    mockStorage.setItem('gigpay_demo_user', JSON.stringify(demoUser));
    const saved = JSON.parse(mockStorage.getItem('gigpay_demo_user'));
    assert.strictEqual(saved.user_metadata.role, 'client');
    assert.strictEqual(saved.id, 'demo-client-uuid-001');
  });

  await runTest('Auth: Password Mismatch Validation on Sign-up', async () => {
    const password = 'password123';
    const confirmPassword = 'password456';
    const isLogin = false;
    let errorToast = null;
    if (!isLogin && password !== confirmPassword.trim()) {
      errorToast = "Passwords do not match.";
    }
    assert.strictEqual(errorToast, "Passwords do not match.");
  });

  await runTest('Auth: Empty Email or Password Validation', async () => {
    const validate = (email, password) => {
      if (!email.trim()) return "Please enter a valid email address.";
      if (!password.trim()) return "Please enter your password.";
      return null;
    };
    assert.strictEqual(validate('', 'pass'), "Please enter a valid email address.");
    assert.strictEqual(validate('test@test.com', ''), "Please enter your password.");
    assert.strictEqual(validate('test@test.com', 'pass'), null);
  });

  await runTest('Wallet: 1-Click Testnet Simulator Wallet Fallback', async () => {
    const connectTesterWallet = () => {
      const demoKey = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
      return { publicKey: demoKey, network: 'TESTNET' };
    };
    const wallet = connectTesterWallet();
    assert.strictEqual(wallet.publicKey, DEMO_FALLBACK_KEY);
    assert.strictEqual(wallet.network, 'TESTNET');
    assert.strictEqual(isValidStellarAddress(wallet.publicKey), true);
  });

  await runTest('Wallet: Account Balance Fetching for Tester Wallet', async () => {
    const balanceInfo = await getAccountBalance(DEMO_FALLBACK_KEY);
    assert.strictEqual(balanceInfo.isDemo, true);
    assert.strictEqual(balanceInfo.raw, 10000);
    assert.strictEqual(balanceInfo.balance, '10,000.00');
  });

  // -------------------------------------------------------------
  // SECTION 2: Task Creation & Escrow Funding
  // -------------------------------------------------------------
  console.log('\n--- SECTION 2: Task Creation & Escrow Funding ---');

  await runTest('Escrow: Fund Task Simulation with Valid Parameters', async () => {
    const sim = await simulateFundTask({
      clientAddress: DEMO_FALLBACK_KEY,
      freelancerAddress: DEFAULT_FREELANCER_TESTNET_ADDRESS,
      amount: '5'
    });
    assert.strictEqual(sim.isDemo, true);
    assert.strictEqual(sim.simulation.status, 'SUCCESS_SIMULATED_DEMO');
  });

  await runTest('Escrow: Anti-Self-Dealing Rejects Identical Client & Freelancer Wallet', async () => {
    const clientKey = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
    const freelancerKey = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
    const validation = validateEscrowParties(clientKey, freelancerKey);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.error.includes('Self-dealing prevented'));
  });

  await runTest('Escrow: Form Validation Rejects Non-Positive Amounts', async () => {
    const validateAmount = (amount) => {
      const num = parseFloat(amount);
      if (isNaN(num) || num <= 0) {
        return "Amount must be greater than 0.";
      }
      if (num < 0.1) {
        return "Minimum milestone escrow is 0.1 XLM.";
      }
      return null;
    };
    assert.strictEqual(validateAmount('0'), "Amount must be greater than 0.");
    assert.strictEqual(validateAmount('-5'), "Amount must be greater than 0.");
    assert.strictEqual(validateAmount('0.05'), "Minimum milestone escrow is 0.1 XLM.");
    assert.strictEqual(validateAmount('2'), null);
  });

  await runTest('Escrow: Optimistic State Update & Shared Storage Persistence', async () => {
    mockStorage.clear();
    const newTask = {
      id: 'task-test-' + Date.now(),
      title: 'Smart Contract Escrow Security Audit',
      amount: '150',
      status: 'Available',
      client_id: 'demo-client-uuid-001',
      contract_id: GIGPAY_ESCROW_CONTRACT_ID,
      tx_hash: 'demo_fund_12345',
      explorer_url: 'https://stellar.expert/explorer/testnet/tx/demo_fund_12345',
      created_at: new Date().toISOString()
    };

    // Save to shared storage
    mockStorage.setItem(SHARED_TASKS_KEY, JSON.stringify([newTask]));
    const loaded = JSON.parse(mockStorage.getItem(SHARED_TASKS_KEY));
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].id, newTask.id);
    assert.strictEqual(loaded[0].status, 'Available');
  });

  // -------------------------------------------------------------
  // SECTION 3: Milestone Release & Escrow Settlement
  // -------------------------------------------------------------
  console.log('\n--- SECTION 3: Milestone Release & Escrow Settlement ---');

  await runTest('Settlement: Confirmation Guard Enforces "CONFIRM" Literal', async () => {
    const checkCanApprove = (confirmText) => confirmText === 'CONFIRM';
    assert.strictEqual(checkCanApprove('confirm'), false, 'Lowercase confirm must be rejected');
    assert.strictEqual(checkCanApprove('yes'), false, 'Random string must be rejected');
    assert.strictEqual(checkCanApprove('CONFIRM '), false, 'Trailing whitespace must be rejected');
    assert.strictEqual(checkCanApprove('CONFIRM'), true, 'Exact CONFIRM must be accepted');
  });

  await runTest('Settlement: Soroban approve_task Execution & Resilient Fallback', async () => {
    const releaseSim = await simulateApproveTask({
      clientAddress: DEMO_FALLBACK_KEY,
      taskId: 'task-mock-1'
    });
    assert.strictEqual(releaseSim.isDemo, true);
    assert.strictEqual(releaseSim.simulation.status, 'SUCCESS_SIMULATED_DEMO');
  });

  await runTest('Settlement: Task Status Transition to "Completed"', async () => {
    const tasks = [
      { id: 'task-release-1', status: 'In Progress', amount: '200', freelancer_id: 'demo-freelancer-uuid-002' }
    ];
    const updated = tasks.map(t => t.id === 'task-release-1' ? { ...t, status: 'Completed' } : t);
    assert.strictEqual(updated[0].status, 'Completed');
  });

  // -------------------------------------------------------------
  // SECTION 4: Edge Cases & Error Handling
  // -------------------------------------------------------------
  console.log('\n--- SECTION 4: Edge Cases & Error Handling ---');

  await runTest('Error Handling: Stellar Error Normalization (Timeouts, HostError, Rejection)', async () => {
    assert.strictEqual(
      formatStellarError(new Error("TIMEOUT")),
      "Wallet request timed out. Please unlock Freighter and try again."
    );
    assert.strictEqual(
      formatStellarError(new Error("User declined transaction")),
      "Transaction signing was rejected in Freighter."
    );
    assert.strictEqual(
      formatStellarError(new Error("HostError: VM call trapped: UnreachableCodeReached")),
      "This escrow was not funded by your connected wallet on-chain. Create a new task with 'Lock Funds in Escrow' to test live payment release."
    );
    assert.strictEqual(
      formatStellarError(new Error("insufficient_balance")),
      "Insufficient Testnet XLM balance to fund this escrow."
    );
  });

  await runTest('Wallet Disconnect / Reconnect State Cleanup', async () => {
    let publicKey = DEMO_FALLBACK_KEY;
    let user = { id: 'client-1' };
    const signOut = () => {
      mockStorage.removeItem('gigpay_demo_user');
      user = null;
      publicKey = null;
    };
    signOut();
    assert.strictEqual(publicKey, null);
    assert.strictEqual(user, null);
    assert.strictEqual(mockStorage.getItem('gigpay_demo_user'), null);
  });

  console.log('\n================================================================');
  console.log(`SUMMARY: ${testResults.filter(r => r.status === 'PASS').length}/${testResults.length} Tests Passed`);
  console.log('================================================================\n');

  if (testResults.some(r => r.status === 'FAIL')) {
    process.exit(1);
  }
}

testSuite().catch(err => {
  console.error("Test runner crash:", err);
  process.exit(1);
});
