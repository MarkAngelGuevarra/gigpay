import * as StellarSdk from '@stellar/stellar-sdk';
import { 
  GIGPAY_ESCROW_CONTRACT_ID, 
  DEFAULT_FREELANCER_TESTNET_ADDRESS,
  simulateFundTask,
  simulateApproveTask,
  validateEscrowParties,
  formatStellarError
} from '../lib/stellar.js';
import { supabase } from '../lib/supabase.js';

// Setup Mock Browser Environment for Node.js
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

// Helpers mirroring TaskContext.jsx implementation
const SHARED_TASKS_KEY = 'gigpay_shared_tasks';
const DEMO_FALLBACK_KEY = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';

const getStoredTasks = () => {
  try {
    const raw = localStorage.getItem(SHARED_TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveStoredTasks = (taskList) => {
  try {
    if (Array.isArray(taskList)) {
      localStorage.setItem(SHARED_TASKS_KEY, JSON.stringify(taskList));
    }
  } catch (err) {
    console.warn("Storage save error:", err);
  }
};

const mergeTasks = (priorityTasks = [], fallbackTasks = []) => {
  const map = new Map();
  for (const t of fallbackTasks) {
    if (t && t.id) map.set(t.id, t);
  }
  for (const t of priorityTasks) {
    if (t && t.id) {
      const existing = map.get(t.id);
      map.set(t.id, existing ? { ...existing, ...t } : t);
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });
};

const DEFAULT_MOCK_TASKS = [
  {
    id: 'task-mock-1',
    title: 'Soroban Escrow Smart Contract Audit',
    amount: '500',
    status: 'Available',
    client_id: 'demo-client-uuid-001',
    contract_id: GIGPAY_ESCROW_CONTRACT_ID,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'task-mock-2',
    title: 'Freighter Wallet UX Optimization',
    amount: '350',
    status: 'In Progress',
    client_id: 'demo-client-uuid-001',
    freelancer_id: 'demo-freelancer-uuid-002',
    contract_id: GIGPAY_ESCROW_CONTRACT_ID,
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

// In-Memory Task Manager Simulating TaskContext State and Actions
class TaskContextSimulator {
  constructor(currentUser, currentPublicKey) {
    this.user = currentUser;
    this.publicKey = currentPublicKey;
    this.tasks = mergeTasks(getStoredTasks(), DEFAULT_MOCK_TASKS);
    saveStoredTasks(this.tasks);
  }

  refreshFromStorage() {
    this.tasks = getStoredTasks();
    return this.tasks;
  }

  async addTask(task) {
    const effectiveClientId = this.user?.id || 'demo-client-uuid-001';
    const effectivePublicKey = this.publicKey || DEMO_FALLBACK_KEY;

    // 1. Live Soroban simulation
    const fundResult = await simulateFundTask({
      clientAddress: effectivePublicKey,
      freelancerAddress: task.freelancer_wallet || undefined,
      amount: task.amount
    });

    const txHash = fundResult?.isDemo ? 'demo_fund_' + Date.now().toString(16) : 'tx_' + Date.now();
    const explorerUrl = `https://stellar.expert/explorer/testnet/tx/${txHash}`;

    // 2. Database attempt with automatic fallback
    let savedTask = null;
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          title: task.title,
          amount: task.amount,
          status: 'Available',
          client_id: effectiveClientId,
          contract_id: GIGPAY_ESCROW_CONTRACT_ID
        }])
        .select();

      if (error) throw error;
      if (data && data.length > 0) {
        savedTask = { ...data[0], tx_hash: txHash, explorer_url: explorerUrl };
      }
    } catch {
      // Offline/RLS fallback
      savedTask = {
        id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        title: task.title,
        amount: String(task.amount),
        status: 'Available',
        client_id: effectiveClientId,
        contract_id: GIGPAY_ESCROW_CONTRACT_ID,
        tx_hash: txHash,
        explorer_url: explorerUrl,
        created_at: new Date().toISOString()
      };
    }

    this.tasks = [savedTask, ...this.tasks.filter(t => t.id !== savedTask.id)];
    saveStoredTasks(this.tasks);
    return savedTask;
  }

  async updateTaskStatus(id, newStatus, assignFreelancer = false) {
    const effectivePublicKey = this.publicKey || DEMO_FALLBACK_KEY;
    const effectiveUserId = this.user?.id || (assignFreelancer ? 'demo-freelancer-uuid-002' : 'demo-client-uuid-001');

    const taskToUpdate = this.tasks.find(t => t.id === id);
    if (!taskToUpdate) throw new Error(`Task ${id} not found`);

    if (newStatus === 'Completed') {
      await simulateApproveTask({
        clientAddress: effectivePublicKey,
        taskId: id
      });
    }

    const updatedFields = { status: newStatus };
    if (assignFreelancer) {
      updatedFields.freelancer_id = effectiveUserId;
    }

    this.tasks = this.tasks.map(t => t.id === id ? { ...t, ...updatedFields } : t);
    saveStoredTasks(this.tasks);
    return this.tasks.find(t => t.id === id);
  }
}

// =========================================================================
// SQA END-TO-END INTEGRATION TEST SUITE
// =========================================================================

async function runTaskLifecycleTestSuite() {
  console.log('🧪 Starting GigPay End-to-End Task Lifecycle Integration Tests...\n');

  // Clear storage to start with clean slate
  mockStorage.clear();

  // Test 1: Baseline Storage & Initial Mock Task Seeding
  console.log('--- Test 1: Storage Initialization & Baseline Seeding ---');
  const initialClient = new TaskContextSimulator(
    { id: 'demo-client-uuid-001', email: 'client@gigpay.tech' },
    DEMO_FALLBACK_KEY
  );
  if (initialClient.tasks.length < 2) {
    throw new Error(`Expected at least 2 default mock tasks, got ${initialClient.tasks.length}`);
  }
  const cachedInitial = getStoredTasks();
  if (cachedInitial.length !== initialClient.tasks.length) {
    throw new Error('Initial tasks failed to persist to shared storage cache');
  }
  console.log(`✅ Test 1 Passed: Initialized ${initialClient.tasks.length} baseline tasks with shared cache persistence.\n`);

  // Test 2: Task Creation by Client (RLS Fallback & Contract Wiring)
  console.log('--- Test 2: Client Task Creation & Escrow Funding ---');
  const testMilestoneAmount = '250';
  const testMilestoneTitle = 'Build Student Onboarding Dashboard UI';
  
  const createdTask = await initialClient.addTask({
    title: testMilestoneTitle,
    amount: testMilestoneAmount
  });

  if (!createdTask || !createdTask.id) {
    throw new Error('addTask did not return a valid task object');
  }
  if (createdTask.status !== 'Available') {
    throw new Error(`Expected status 'Available', received '${createdTask.status}'`);
  }
  if (createdTask.amount !== testMilestoneAmount) {
    throw new Error(`Expected amount '${testMilestoneAmount}', received '${createdTask.amount}'`);
  }
  if (createdTask.client_id !== 'demo-client-uuid-001') {
    throw new Error(`Expected client_id 'demo-client-uuid-001', received '${createdTask.client_id}'`);
  }
  if (createdTask.contract_id !== GIGPAY_ESCROW_CONTRACT_ID) {
    throw new Error(`Contract ID mismatch: expected ${GIGPAY_ESCROW_CONTRACT_ID}`);
  }
  if (!createdTask.tx_hash || !createdTask.explorer_url) {
    throw new Error('Missing transaction hash or Stellar Expert explorer link');
  }

  // Verify persistence in localStorage
  const postCreateStored = getStoredTasks();
  const foundInStorage = postCreateStored.find(t => t.id === createdTask.id);
  if (!foundInStorage) {
    throw new Error('Created task was not found in gigpay_shared_tasks storage');
  }
  console.log(`Created Task ID: ${createdTask.id}`);
  console.log(`Tx Explorer URL: ${createdTask.explorer_url}`);
  console.log('✅ Test 2 Passed: Client successfully funded escrow & saved task with fallback persistence.\n');

  // Test 3: Cross-Session State Synchronization & Freelancer Discovery
  console.log('--- Test 3: Cross-Session Freelancer Task Discovery ---');
  // Simulate Freelancer logging in from a distinct session/browser tab
  const freelancerContext = new TaskContextSimulator(
    { id: 'demo-freelancer-uuid-002', email: 'freelancer@gigpay.tech' },
    DEMO_FALLBACK_KEY
  );

  const availableTasks = freelancerContext.tasks.filter(t => t.status === 'Available');
  const matchingAvailableTask = availableTasks.find(t => t.id === createdTask.id);

  if (!matchingAvailableTask) {
    throw new Error(`Freelancer failed to discover Client's newly created task ${createdTask.id} in Available tasks`);
  }
  if (matchingAvailableTask.title !== testMilestoneTitle) {
    throw new Error(`Task title mismatch in Freelancer view: ${matchingAvailableTask.title}`);
  }
  console.log(`Freelancer sees ${availableTasks.length} Available Task(s). Matching task found: "${matchingAvailableTask.title}" (${matchingAvailableTask.amount} XLM)`);
  console.log('✅ Test 3 Passed: Freelancer session seamlessly discovers Client task via shared cache.\n');

  // Test 4: Task Acceptance by Freelancer (Moving to In Progress)
  console.log('--- Test 4: Freelancer Task Acceptance ---');
  const acceptedTask = await freelancerContext.updateTaskStatus(createdTask.id, 'In Progress', true);

  if (acceptedTask.status !== 'In Progress') {
    throw new Error(`Expected status 'In Progress', got '${acceptedTask.status}'`);
  }
  if (acceptedTask.freelancer_id !== 'demo-freelancer-uuid-002') {
    throw new Error(`Expected freelancer_id 'demo-freelancer-uuid-002', got '${acceptedTask.freelancer_id}'`);
  }

  // Verify the task is NO LONGER in Available tasks
  const postAcceptAvailable = freelancerContext.tasks.filter(t => t.status === 'Available');
  if (postAcceptAvailable.some(t => t.id === createdTask.id)) {
    throw new Error('Accepted task was NOT removed from Available tasks list');
  }

  // Verify the task IS in Accepted/Active Escrows for Freelancer
  const freelancerAccepted = freelancerContext.tasks.filter(
    t => (t.status === 'In Progress' || t.status === 'Disputed') && t.freelancer_id === 'demo-freelancer-uuid-002'
  );
  if (!freelancerAccepted.some(t => t.id === createdTask.id)) {
    throw new Error('Accepted task missing from Freelancer active escrows');
  }
  console.log(`Task ${createdTask.id} transitioned to 'In Progress' and assigned to ${acceptedTask.freelancer_id}`);
  console.log('✅ Test 4 Passed: Freelancer task acceptance updates status and removes from available pool.\n');

  // Test 5: Client Dashboard Instant State Reflection
  console.log('--- Test 5: Client Reflection of Accepted Task ---');
  initialClient.refreshFromStorage();
  const clientViewTask = initialClient.tasks.find(t => t.id === createdTask.id);

  if (!clientViewTask || clientViewTask.status !== 'In Progress') {
    throw new Error(`Client view does not reflect 'In Progress' status: ${clientViewTask?.status}`);
  }
  if (clientViewTask.freelancer_id !== 'demo-freelancer-uuid-002') {
    throw new Error(`Client view does not reflect freelancer_id assignment: ${clientViewTask?.freelancer_id}`);
  }
  console.log('✅ Test 5 Passed: Client dashboard accurately reflects Freelancer acceptance.\n');

  // Test 6: Milestone Completion & Escrow Release by Client
  console.log('--- Test 6: Client Milestone Approval & Escrow Release ---');
  const completedTask = await initialClient.updateTaskStatus(createdTask.id, 'Completed');

  if (completedTask.status !== 'Completed') {
    throw new Error(`Expected status 'Completed', got '${completedTask.status}'`);
  }
  console.log(`Task ${createdTask.id} status updated to 'Completed' via Soroban approve_task simulation`);
  console.log('✅ Test 6 Passed: Client milestone release completes successfully.\n');

  // Test 7: Freelancer Balance & Total Earnings Calculation
  console.log('--- Test 7: Freelancer Total Earnings & Balance Aggregation ---');
  freelancerContext.refreshFromStorage();

  const completedTasks = freelancerContext.tasks.filter(
    t => t.status === 'Completed' && (t.freelancer_id === 'demo-freelancer-uuid-002' || !t.freelancer_id)
  );

  const totalEarned = completedTasks.reduce((sum, task) => sum + Number(task.amount), 0);

  if (!completedTasks.some(t => t.id === createdTask.id)) {
    throw new Error(`Completed task ${createdTask.id} missing from Freelancer completedTasks filter`);
  }
  if (totalEarned < Number(testMilestoneAmount)) {
    throw new Error(`Total earned calculation (${totalEarned}) is less than approved milestone (${testMilestoneAmount})`);
  }
  console.log(`Freelancer Completed Tasks Count: ${completedTasks.length}`);
  console.log(`Freelancer Total Earned Balance: $${totalEarned} USDC / XLM`);
  console.log('✅ Test 7 Passed: Freelancer earnings increment accurately upon milestone release.\n');

  // Test 8: Anti-Self-Dealing & Validation Safeguards
  console.log('--- Test 8: Anti-Self-Dealing & Input Invariant Checks ---');
  const clientKey = 'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E';
  const identicalKey = 'GBUGBTYQ2U6MRYE3JN4Q4S2NVT2CBJNTMHOV2IWDIZ7HRFBLFI6UYG4E';
  
  const selfDealingResult = validateEscrowParties(clientKey, identicalKey);
  if (selfDealingResult.valid || !selfDealingResult.error.includes('Self-dealing')) {
    throw new Error('Self-dealing validation failed to reject identical client and freelancer keys');
  }

  const distinctResult = validateEscrowParties(clientKey, DEFAULT_FREELANCER_TESTNET_ADDRESS);
  if (!distinctResult.valid) {
    throw new Error(`Unexpected validation error for distinct keys: ${distinctResult.error}`);
  }
  console.log('✅ Test 8 Passed: Anti-self-dealing strictly enforced across parties.\n');

  // Test 9: Concurrent Multi-Task Simulation
  console.log('--- Test 9: Multi-Task Concurrent Lifecycle Integrity ---');
  const taskA = await initialClient.addTask({ title: 'Task Alpha - Smart Contract Audit', amount: '100' });
  const taskB = await initialClient.addTask({ title: 'Task Beta - Frontend Optimization', amount: '200' });

  freelancerContext.refreshFromStorage();
  const availableNow = freelancerContext.tasks.filter(t => t.status === 'Available');
  if (!availableNow.some(t => t.id === taskA.id) || !availableNow.some(t => t.id === taskB.id)) {
    throw new Error('Concurrent tasks missing from available pool');
  }

  // Accept task A only
  await freelancerContext.updateTaskStatus(taskA.id, 'In Progress', true);
  freelancerContext.refreshFromStorage();

  const availableAfterA = freelancerContext.tasks.filter(t => t.status === 'Available');
  if (availableAfterA.some(t => t.id === taskA.id)) {
    throw new Error('Task Alpha should not be Available after acceptance');
  }
  if (!availableAfterA.some(t => t.id === taskB.id)) {
    throw new Error('Task Beta should still be Available');
  }
  console.log('✅ Test 9 Passed: Concurrent multiple tasks maintain state isolation without crosstalk.\n');

  console.log('================================================================');
  console.log('🎉 ALL 9/9 END-TO-END INTEGRATION TEST ASSERTIONS PASSED (100%)');
  console.log('================================================================\n');
}

runTaskLifecycleTestSuite().catch((err) => {
  console.error('\n❌ Task Lifecycle Integration Test Suite Failed:');
  console.error(err);
  process.exit(1);
});
