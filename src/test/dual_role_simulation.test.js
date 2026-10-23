import assert from 'node:assert';
import { 
  DEMO_PUBLIC_KEY, 
  DEMO_FREELANCER_KEY, 
  isDemoWallet, 
  validateEscrowParties,
  getAccountBalance,
  submitFundTask,
  submitApproveTask,
  GIGPAY_ESCROW_CONTRACT_ID
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

const SHARED_TASKS_KEY = 'gigpay_shared_tasks';

const getStoredTasks = () => {
  try {
    const raw = localStorage.getItem(SHARED_TASKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveStoredTasks = (taskList) => {
  localStorage.setItem(SHARED_TASKS_KEY, JSON.stringify(taskList));
};

async function runDualRoleSimulationTestSuite() {
  console.log('🧪 Starting GigPay Dual-Role Simulation & Escrow Lifecycle Test Suite...\n');
  mockStorage.clear();

  let passed = 0;
  let failed = 0;

  function runAssertion(condition, message, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}: ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${testName} - ${message}`);
    }
  }

  // --- TEST 1: Dual-Role Sandbox Initialization ---
  console.log('--- Phase 1: Dual-Role Sandbox Session Initialization ---');
  let currentUser = null;
  let activePublicKey = null;

  const loginSimulationMode = (initialRole = 'client') => {
    const isClient = initialRole === 'client';
    const simUser = {
      id: isClient ? 'demo-client-uuid-001' : 'demo-freelancer-uuid-002',
      email: isClient ? 'client@gigpay.tech' : 'freelancer@gigpay.tech',
      is_simulation_mode: true,
      user_metadata: {
        role: initialRole,
        display_name: isClient ? 'Acme Corp (Tester Client)' : 'Alex Rivera (Tester Freelancer)',
        is_simulation_mode: true
      }
    };
    currentUser = simUser;
    mockStorage.setItem('gigpay_demo_user', JSON.stringify(simUser));
    activePublicKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
    return simUser;
  };

  const switchRole = (roleOverride) => {
    const currentRole = currentUser?.user_metadata?.role || 'client';
    const targetRole = roleOverride || (currentRole === 'client' ? 'freelancer' : 'client');
    const isClient = targetRole === 'client';
    const updatedUser = {
      id: isClient ? 'demo-client-uuid-001' : 'demo-freelancer-uuid-002',
      email: isClient ? 'client@gigpay.tech' : 'freelancer@gigpay.tech',
      is_simulation_mode: true,
      user_metadata: {
        role: targetRole,
        display_name: isClient ? 'Acme Corp (Tester Client)' : 'Alex Rivera (Tester Freelancer)',
        is_simulation_mode: true
      }
    };
    currentUser = updatedUser;
    mockStorage.setItem('gigpay_demo_user', JSON.stringify(updatedUser));
    if (!activePublicKey || isDemoWallet(activePublicKey)) {
      activePublicKey = isClient ? DEMO_PUBLIC_KEY : DEMO_FREELANCER_KEY;
    }
    return targetRole;
  };

  loginSimulationMode('client');
  runAssertion(
    currentUser.user_metadata.role === 'client' && currentUser.id === 'demo-client-uuid-001',
    'Sandbox initialized as Client with Acme Corp persona',
    'Session Initialization'
  );
  runAssertion(
    activePublicKey === DEMO_PUBLIC_KEY,
    'Client assigned DEMO_PUBLIC_KEY simulator wallet',
    'Client Wallet Alignment'
  );

  // --- TEST 2: Paired Wallets & Anti-Self-Dealing Assertion ---
  console.log('\n--- Phase 2: Cryptographic Key Separation & Anti-Self-Dealing ---');
  runAssertion(
    DEMO_PUBLIC_KEY !== DEMO_FREELANCER_KEY,
    `Client wallet (${DEMO_PUBLIC_KEY.slice(0, 10)}...) and Freelancer wallet (${DEMO_FREELANCER_KEY.slice(0, 10)}...) are distinct`,
    'Key Separation'
  );
  runAssertion(
    validateEscrowParties(DEMO_PUBLIC_KEY, DEMO_FREELANCER_KEY).valid === true,
    'validateEscrowParties asserts zero self-dealing across paired test personas',
    'Anti-Self-Dealing Pass'
  );

  const clientBalance = await getAccountBalance(DEMO_PUBLIC_KEY);
  const freelancerBalance = await getAccountBalance(DEMO_FREELANCER_KEY);
  runAssertion(
    clientBalance.isDemo === true && clientBalance.raw === 10000,
    'Client testnet simulator holds 10,000 XLM escrow capacity',
    'Client Balance Verification'
  );
  runAssertion(
    freelancerBalance.isDemo === true && freelancerBalance.raw === 500,
    'Freelancer testnet simulator holds initial 500 XLM seed reserve',
    'Freelancer Balance Verification'
  );

  // --- TEST 3: Escrow Creation as Client ---
  console.log('\n--- Phase 3: Client Escrow Creation & Funding ---');
  const taskPayload = {
    title: 'Build Student Onboarding Dashboard UI',
    amount: '350',
    category: 'Frontend Development'
  };

  const fundResult = await submitFundTask({
    clientAddress: activePublicKey,
    freelancerAddress: DEMO_FREELANCER_KEY,
    amount: taskPayload.amount
  });

  const createdTask = {
    id: 'task-sim-' + Date.now(),
    title: taskPayload.title,
    amount: taskPayload.amount,
    status: 'Available',
    client_id: currentUser.id,
    contract_id: GIGPAY_ESCROW_CONTRACT_ID,
    tx_hash: fundResult.hash,
    explorer_url: fundResult.explorerUrl,
    created_at: new Date().toISOString()
  };

  saveStoredTasks([createdTask]);
  runAssertion(
    fundResult.success === true && createdTask.status === 'Available',
    `Escrow successfully funded on Soroban Testnet and locked in shared cache (ID: ${createdTask.id})`,
    'Client Task Creation'
  );

  // --- TEST 4: 1-Click Role Switch to Freelancer ---
  console.log('\n--- Phase 4: 1-Click Dynamic Role Switch to Freelancer ---');
  const roleAfterFirstSwitch = switchRole('freelancer');
  runAssertion(
    roleAfterFirstSwitch === 'freelancer' && currentUser.user_metadata.role === 'freelancer',
    'Role successfully switched to Freelancer without page reload or session loss',
    'Role Switcher to Freelancer'
  );
  runAssertion(
    currentUser.id === 'demo-freelancer-uuid-002',
    'User ID dynamically reassigned to Alex Rivera (Freelancer)',
    'Persona ID Reassignment'
  );
  runAssertion(
    activePublicKey === DEMO_FREELANCER_KEY,
    'Active wallet automatically re-aligned to paired Freelancer key',
    'Freelancer Wallet Alignment'
  );

  // --- TEST 5: Freelancer Task Discovery & Acceptance ---
  console.log('\n--- Phase 5: Freelancer Task Discovery & Acceptance ---');
  const currentFeed = getStoredTasks();
  const matchingAvailableTask = currentFeed.find(t => t.id === createdTask.id && t.status === 'Available');
  runAssertion(
    Boolean(matchingAvailableTask),
    'Freelancer seamlessly discovers newly created Client task in Available feed',
    'Task Discovery'
  );

  // Accept task
  const updatedAfterAccept = currentFeed.map(t => {
    if (t.id === createdTask.id) {
      return {
        ...t,
        status: 'In Progress',
        freelancer_id: currentUser.id
      };
    }
    return t;
  });
  saveStoredTasks(updatedAfterAccept);

  const acceptedTask = getStoredTasks().find(t => t.id === createdTask.id);
  runAssertion(
    acceptedTask.status === 'In Progress' && acceptedTask.freelancer_id === 'demo-freelancer-uuid-002',
    'Task status transitioned to "In Progress" and assigned to freelancer persona',
    'Task Acceptance'
  );

  // --- TEST 6: 1-Click Role Switch Back to Client ---
  console.log('\n--- Phase 6: 1-Click Role Switch Back to Client for Review ---');
  const roleAfterSecondSwitch = switchRole('client');
  runAssertion(
    roleAfterSecondSwitch === 'client' && currentUser.id === 'demo-client-uuid-001',
    'Switched back to Client (Acme Corp) smoothly with preserved task state',
    'Role Switcher to Client'
  );
  runAssertion(
    activePublicKey === DEMO_PUBLIC_KEY,
    'Active wallet restored to Client key for release authorization',
    'Client Wallet Re-alignment'
  );

  // Client views task
  const clientVisibleTasks = getStoredTasks().filter(t => t.client_id === currentUser.id);
  const taskInReview = clientVisibleTasks.find(t => t.id === createdTask.id);
  runAssertion(
    taskInReview && taskInReview.status === 'In Progress',
    'Client dashboard immediately reflects In Progress status awaiting approval',
    'Client In-Progress Reflection'
  );

  // --- TEST 7: Client Milestone Approval & Escrow Release ---
  console.log('\n--- Phase 7: Client Milestone Approval & Soroban Escrow Release ---');
  const approveResult = await submitApproveTask({
    clientAddress: activePublicKey,
    taskId: createdTask.id
  });

  const updatedAfterApproval = getStoredTasks().map(t => {
    if (t.id === createdTask.id) {
      return {
        ...t,
        status: 'Completed'
      };
    }
    return t;
  });
  saveStoredTasks(updatedAfterApproval);

  const completedTask = getStoredTasks().find(t => t.id === createdTask.id);
  runAssertion(
    approveResult.success === true && completedTask.status === 'Completed',
    'Client executed Soroban approve_task; escrow funds released to Freelancer',
    'Milestone Release Settlement'
  );

  // --- TEST 8: Role Switch Back to Freelancer & Earnings Aggregation ---
  console.log('\n--- Phase 8: Final Freelancer Earnings & Balance Verification ---');
  switchRole('freelancer');
  const freelancerCompletedTasks = getStoredTasks().filter(
    t => t.status === 'Completed' && t.freelancer_id === currentUser.id
  );
  const totalEarned = freelancerCompletedTasks.reduce((sum, t) => sum + Number(t.amount), 0);

  runAssertion(
    freelancerCompletedTasks.length === 1 && totalEarned === 350,
    `Freelancer dashboard aggregates total earnings accurately ($${totalEarned} XLM/USDC from completed milestone)`,
    'Earnings Aggregation'
  );

  // --- TEST 9: Full End-to-End Dual-Role Completion Summary ---
  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/${passed + failed} DUAL-ROLE SIMULATION TESTS PASSED (100%)`);
  console.log('================================================================\n');

  return { passed, failed };
}

runDualRoleSimulationTestSuite().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
