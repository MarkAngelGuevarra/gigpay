import freighterApi from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';
import { isDisputeActive } from './taskLifecycle.js';

const {
  isAllowed,
  setAllowed,
  requestAccess,
  isConnected,
  getAddress,
  getPublicKey = getAddress,
  getNetwork,
  signTransaction
} = freighterApi || {};

// Utility to prevent infinite hanging if Freighter is blocked by Edge/Antivirus
const withTimeout = (promise, ms) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);
};

// A simulated public key used exclusively if the real wallet fails to load
export const DEMO_PUBLIC_KEY = 'GBDEMO_GIGPAY_WALLET_FALLBACK_ACTIVE_V9XQ3P';
export const DEMO_FREELANCER_KEY = 'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3';

export const isDemoWallet = (key) => {
  if (!key) return true;
  const str = typeof key === 'string' ? key.trim() : (key?.address?.trim() || String(key).trim());
  return str === DEMO_PUBLIC_KEY || str === DEMO_FREELANCER_KEY || str.startsWith('GBDEMO_');
};

// Placeholder hashes returned ONLY by the offline demo path (no wallet, or a seeded mock task).
// Results carrying them always have isDemo: true and no explorer link. They are deliberately not
// 64-hex strings, so they can never be mistaken for, or resolve to, a real Stellar transaction.
export const DEMO_FUND_TX_HASH = 'demo-offline-fund';
export const DEMO_RELEASE_TX_HASH = 'demo-offline-release';

// Before Nov 2026 the demo path reused these two REAL Sprint 1 Testnet transactions as placeholders.
// They remain valid evidence for their own ledger rows; they are only used to recognise old cached
// tasks that were funded in demo mode (no on_chain_task_id) so their release stays a demo release.
const LEGACY_DEMO_PLACEHOLDER_HASHES = new Set([
  '40df1a722e724daf317630345cc00d07a81344134938ea9745a0b6440d432dda',
  'c0611300fce324394b3d906faac63fbe1d376c007ad81b6d3bef8e3d5e7e0bc5'
]);

/**
 * True when a hash is a simulation placeholder rather than a confirmed transaction.
 */
export const isSimulatedTxHash = (hash) => {
  if (!hash || typeof hash !== 'string') return true;
  return hash === DEMO_FUND_TX_HASH || hash === DEMO_RELEASE_TX_HASH || /^(demo|sim|rel|resilient)[-_]/.test(hash);
};

/**
 * The auto-signing simulator wallet exists for Testnet pilots only. It keeps its secret key in
 * browser storage, so it must never sign on Mainnet, where that key would control real funds.
 */
export const isEphemeralSignerAllowed = (network = NETWORK) =>
  network === 'TESTNET' && !(typeof globalThis !== 'undefined' && globalThis.GIGPAY_DISABLE_SIMULATOR_SIGNER === true);
// GIGPAY_DISABLE_SIMULATOR_SIGNER lets test suites run the full flow in offline demo mode, so routine test
// runs do not create escrows on the shared production contract (and pollute its evidence).

// Friendbot routinely takes 10-25s to answer; an 8s cap left new simulator wallets unfunded.
const FRIENDBOT_TIMEOUT_MS = 30000;

// Returns true when Friendbot accepted the request. It rate-limits by IP, so a room of testers on one
// Wi-Fi gets refusals (or timeouts) after the first few wallets.
const requestFriendbotFunding = async (publicKey) => {
  try {
    const res = await withTimeout(
      fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`),
      FRIENDBOT_TIMEOUT_MS
    );
    return !!res?.ok;
  } catch (err) {
    console.warn("[Friendbot] Ephemeral funding notice:", err.message);
    return false;
  }
};

// Backup funder for practice wallets when Friendbot is rate-limited: the app registers GigPay's
// Testnet pool (Supabase Edge Function `fund-practice-wallet`, one top-up per signed-in account).
// Kept as a hook so this module stays free of app/network wiring and the offline tests are unaffected.
let practiceWalletFundingFallback = null;
export const setPracticeWalletFundingFallback = (fn) => {
  practiceWalletFundingFallback = typeof fn === 'function' ? fn : null;
};

const waitForAccount = async (publicKey, attempts, delayMs) => {
  for (let i = 0; i < attempts; i++) {
    if ((await getAccountBalance(publicKey)).active) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
};

/**
 * Makes sure a simulator wallet exists on Testnet before it signs. Covers a fresh wallet whose
 * Friendbot request is still settling and a stored wallet whose first funding attempt failed;
 * if Friendbot can't fund it, falls back to the GigPay Testnet pool.
 * Returns false if the account still is not visible on Horizon after the retries.
 */
export const ensureEphemeralAccountFunded = async (publicKey, { attempts = 5, delayMs = 2000 } = {}) => {
  const first = await getAccountBalance(publicKey);
  if (first.active) return true;
  // Horizon can't be reached, so we can't tell whether the wallet is funded. Don't spend the funding pool on a
  // guess; let the signing step proceed through Soroban RPC, which fails clearly if the account is missing.
  if (first.unknown) return true;
  const friendbotAccepted = await requestFriendbotFunding(publicKey);
  // Friendbot refused: go to the pool right away. Friendbot accepted: give Horizon a moment first.
  if (friendbotAccepted && (await waitForAccount(publicKey, attempts, delayMs))) return true;
  if (!practiceWalletFundingFallback) return friendbotAccepted ? false : waitForAccount(publicKey, attempts, delayMs);
  try {
    await practiceWalletFundingFallback(publicKey);
  } catch (err) {
    console.warn("[GigPay pool] Practice wallet fallback notice:", err?.message || err);
  }
  return waitForAccount(publicKey, attempts, delayMs);
};

// Practice-wallet keys for extensionless / mobile testers (Testnet only; see isEphemeralSignerAllowed).
// Practice wallets belong to the signed-in account, not just the browser. Unscoped keys meant the next
// student on a shared lab PC inherited the previous student's wallet (and its escrows), merging two people
// into one wallet in the evidence. Once someone signs in, keys live under `<key>:<userId>`; the browser's
// unscoped wallet (created before sign-in) is handed to the first account that signs in here, so nobody
// loses a wallet that already funded an escrow.
const EPHEMERAL_PUB = 'gigpay_ephemeral_pubkey';
const EPHEMERAL_SEC = 'gigpay_ephemeral_seckey';
let practiceWalletOwner = null;
const scoped = (base) => (practiceWalletOwner ? `${base}:${practiceWalletOwner}` : base);

export const setPracticeWalletOwner = (userId) => {
  practiceWalletOwner = userId || null;
  if (!practiceWalletOwner || typeof localStorage === 'undefined') return;
  try {
    const looseSec = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(EPHEMERAL_SEC)) || localStorage.getItem(EPHEMERAL_SEC);
    const loosePub = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(EPHEMERAL_PUB)) || localStorage.getItem(EPHEMERAL_PUB);
    if (looseSec && loosePub && !localStorage.getItem(scoped(EPHEMERAL_SEC))) {
      localStorage.setItem(scoped(EPHEMERAL_PUB), loosePub);
      localStorage.setItem(scoped(EPHEMERAL_SEC), looseSec);
    }
    // The browser-level copy must not leak to the next account that signs in on this device.
    localStorage.removeItem(EPHEMERAL_PUB);
    localStorage.removeItem(EPHEMERAL_SEC);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(EPHEMERAL_PUB);
      sessionStorage.removeItem(EPHEMERAL_SEC);
    }
  } catch (e) {
    console.warn("Practice wallet storage notice:", e);
  }
};

const storeEphemeralKeys = (publicKey, secretKey) => {
  try {
    if (!practiceWalletOwner && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(EPHEMERAL_PUB, publicKey);
      sessionStorage.setItem(EPHEMERAL_SEC, secretKey);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(scoped(EPHEMERAL_PUB), publicKey);
      localStorage.setItem(scoped(EPHEMERAL_SEC), secretKey);
    }
  } catch (e) {
    console.warn("Session storage notice:", e);
  }
};

// One reader for every signing path (an earlier sessionStorage-only read made accepting a task hang for
// 30s on Freighter after the tab was reopened).
const readStoredEphemeralKeys = () => {
  try {
    if (practiceWalletOwner) {
      return {
        pub: (typeof localStorage !== 'undefined' && localStorage.getItem(scoped(EPHEMERAL_PUB))) || null,
        sec: (typeof localStorage !== 'undefined' && localStorage.getItem(scoped(EPHEMERAL_SEC))) || null
      };
    }
    return {
      pub: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(EPHEMERAL_PUB)) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem(EPHEMERAL_PUB)) || null,
      sec: (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(EPHEMERAL_SEC)) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem(EPHEMERAL_SEC)) || null
    };
  } catch {
    return { pub: null, sec: null };
  }
};

const readStoredEphemeralPublicKey = () => readStoredEphemeralKeys().pub;

/** True when this key is the practice wallet generated in this browser (used for the "Practice wallet" badge). */
export const isSimulatorWallet = (key) => !!key && key === readStoredEphemeralPublicKey();

/**
 * Returns this browser's own practice (simulator) wallet address, creating one if needed.
 * Synchronous so a "Use Test Wallet" tap responds instantly; Friendbot funding runs in the background
 * and ensureEphemeralAccountFunded() waits for it before anything is signed.
 *
 * Every tester gets a distinct real Testnet address, unlike the shared DEMO keys (one of which is the
 * team's own wallet), so a freelancer has a payout address of their own to give the client.
 * Returns null where the simulator is not allowed (anything other than Testnet).
 */
export const provisionSimulatorWallet = () => {
  if (!isEphemeralSignerAllowed()) return null;
  const existing = readStoredEphemeralPublicKey();
  if (existing) return existing;
  const keypair = StellarSdk.Keypair.random();
  storeEphemeralKeys(keypair.publicKey(), keypair.secret());
  requestFriendbotFunding(keypair.publicKey());
  return keypair.publicKey();
};

/**
 * Generates a new ephemeral Testnet keypair, stores it for this browser, and waits for Friendbot funding.
 */
export const createEphemeralTestnetWallet = async () => {
  if (!isEphemeralSignerAllowed()) {
    throw new Error('The simulator wallet is only available on Stellar Testnet.');
  }
  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  storeEphemeralKeys(publicKey, secretKey);

  await requestFriendbotFunding(publicKey);

  return {
    publicKey,
    secretKey,
    network: 'TESTNET',
    isEphemeral: true
  };
};

/**
 * Retrieves or automatically provisions a real Friendbot-funded Testnet keypair
 * for extensionless / mobile / simulator mode users so their actions execute on-chain.
 */
export const getOrProvisionEphemeralSigner = async (requestedAddress) => {
  if (!isEphemeralSignerAllowed()) return null;
  try {
    const { sec: storedSec, pub: storedPub } = readStoredEphemeralKeys();

    if (storedSec && storedPub && (requestedAddress === storedPub || isDemoWallet(requestedAddress))) {
      return {
        keypair: StellarSdk.Keypair.fromSecret(storedSec),
        publicKey: storedPub
      };
    }

    if (!requestedAddress || isDemoWallet(requestedAddress)) {
      const created = await createEphemeralTestnetWallet();
      return {
        keypair: StellarSdk.Keypair.fromSecret(created.secretKey),
        publicKey: created.publicKey
      };
    }
  } catch (err) {
    console.warn("[Ephemeral Signer] Provision notice:", err.message);
  }
  return null;
};

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
// GigPay is a Stellar Testnet pilot only (Sprint 2 SOW: mainnet is out of scope), so the network is fixed.
const NETWORK = 'TESTNET';
const HORIZON_URL = NETWORK === 'MAINNET' ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org";
const PASSPHRASE = NETWORK === 'MAINNET' ? StellarSdk.Networks.PUBLIC : StellarSdk.Networks.TESTNET;

export const GIGPAY_ESCROW_CONTRACT_ID = 'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3';
export const SOROBAN_RPC_URL = env.VITE_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
export const STELLAR_NETWORK_PASSPHRASE = PASSPHRASE;
export const STELLAR_NETWORK_NAME = NETWORK;
export const NATIVE_SAC_CONTRACT_ID = StellarSdk.Asset.native().contractId(PASSPHRASE);
export const DEFAULT_FREELANCER_TESTNET_ADDRESS = 'GAATY4U2IOYKFY2IAZ3W5VRZQME4UD2Z3TAVLOE5ONEICGXZX7HRX7D3';

// Initialize Soroban RPC Client for Protocol 22 Smart Contract Invocations
export const sorobanServer = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);

/**
 * Checks connection health of the Soroban Testnet RPC endpoint.
 * Returns healthy status or graceful fallback details if RPC is slow.
 */
export const checkSorobanRpcHealth = async () => {
  try {
    const health = await withTimeout(sorobanServer.getHealth(), 10000);
    return { status: health.status || 'HEALTHY', rpcUrl: SOROBAN_RPC_URL };
  } catch (err) {
    console.warn("[Soroban RPC Health] Warning or timeout:", err.message);
    return { status: 'DEGRADED', error: err.message, rpcUrl: SOROBAN_RPC_URL };
  }
};

/**
 * Checks if Freighter extension is installed and responds to ping.
 * @returns {Promise<boolean>}
 */
export const checkFreighterConnection = async () => {
  try {
    if (!isConnected) return false;
    return await withTimeout(isConnected(), 2000);
  } catch (err) {
    return false;
  }
};

/**
 * Checks if the user has Freighter installed and connected.
 * If Freighter is broken or blocked, it instantly falls back to a Demo Mode.
 */
export const connectWallet = async () => {
  try {
    // Try to connect, but give up after 2 seconds if the extension is frozen
    const connected = await withTimeout(isConnected(), 2000);
    
    if (!connected) {
      throw new Error("WALLET_NOT_INSTALLED");
    }

    let allowed = await withTimeout(isAllowed(), 2000);
    if (!allowed) {
      await withTimeout(setAllowed(), 5000);
      allowed = await withTimeout(isAllowed(), 2000);
      if (!allowed) throw new Error("Permission denied");
    }

    const access = await withTimeout(requestAccess(), 5000);
    if (access?.error) throw new Error(access.error);

    const keyResult = await withTimeout(getPublicKey(), 2000);
    const networkResult = await withTimeout(getNetwork(), 2000);
    
    // Normalize string public key defensively regardless of freighter-api object return shape
    const resolvedKey = typeof keyResult === 'string'
      ? keyResult
      : (keyResult?.address || access?.address || String(keyResult || ''));

    const resolvedNetwork = typeof networkResult === 'string'
      ? networkResult
      : (networkResult?.network || networkResult?.networkPassphrase || NETWORK);
    
    return {
      publicKey: resolvedKey,
      network: resolvedNetwork,
    };
  } catch (error) {
    if (error.message === 'WALLET_NOT_INSTALLED') {
      throw error; // Let the UI handle onboarding for missing wallets
    }
    console.error("Freighter Extension blocked/frozen. Activating Demo Fallback Mode.", error);
    // Silent fallback ensures the presentation NEVER fails, even if the browser breaks
    return { publicKey: DEMO_PUBLIC_KEY, network: NETWORK };
  }
};

/**
 * Fetches the real-time native XLM balance for a connected Stellar Testnet account.
 * Formats the balance cleanly and handles uninitialized/unfunded accounts gracefully.
 *
 * @param {string} publicKey - Stellar public address (G...)
 * @returns {Promise<{ balance: string, raw: number, active: boolean, isDemo: boolean }>}
 */
export const getAccountBalance = async (publicKey) => {
  if (!publicKey || isDemoWallet(publicKey)) {
    const isFreelancer = (typeof publicKey === 'string' ? publicKey.trim() : '') === DEMO_FREELANCER_KEY;
    const amount = isFreelancer ? "500.00" : "10,000.00";
    const rawVal = isFreelancer ? 500 : 10000;
    return { balance: amount, raw: rawVal, active: true, isDemo: true };
  }

  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    const account = await withTimeout(server.loadAccount(publicKey), 5000);
    const nativeBalance = account.balances.find((b) => b.asset_type === "native");
    const rawNum = nativeBalance ? parseFloat(nativeBalance.balance) : 0;

    return {
      balance: rawNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      raw: rawNum,
      active: true,
      isDemo: false
    };
  } catch (error) {
    // If account is not yet funded on Testnet (Horizon 404)
    if (error?.response?.status === 404 || error?.message?.includes("404")) {
      return { balance: "0.00 (Unfunded)", raw: 0, active: false, isDemo: false };
    }
    // Horizon unreachable (slow Wi-Fi, outage): say we don't know. Never show a placeholder balance for a real wallet.
    console.warn("[getAccountBalance] Could not reach Horizon:", error.message);
    return { balance: "unavailable", raw: 0, active: false, unknown: true, isDemo: false };
  }
};

/**
 * Triggers a Freighter popup asking the user to sign a transaction.
 * If in Demo Mode, automatically simulates a successful signature after a 1.5s delay.
 */
export const requestWalletSignature = async (publicKey, description) => {
  try {
    // If we are using the fallback demo wallet, simulate a successful transaction instantly
    if (isDemoWallet(publicKey)) {
      console.log(`[DEMO MODE] Simulating signature for: ${description}`);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Fake loading delay
      return { success: true, signedXdr: "DEMO_SIGNED_XDR_PAYLOAD" };
    }

    let account;
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    try {
      account = await withTimeout(server.loadAccount(publicKey), 5000);
    } catch (loadErr) {
      if (NETWORK === 'TESTNET' && (loadErr?.response?.status === 404 || loadErr?.message?.includes("404"))) {
        try {
          await withTimeout(fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`), 5000);
          account = await withTimeout(server.loadAccount(publicKey), 5000);
        } catch {
          account = new StellarSdk.Account(publicKey, "0");
        }
      } else {
        account = new StellarSdk.Account(publicKey, "0");
      }
    }
    
    const transaction = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(StellarSdk.Operation.manageData({
        name: "GigPay_Action",
        value: description.substring(0, 64)
      }))
      .setTimeout(30)
      .build();

    // If using an ephemeral student testnet wallet, sign directly with the stored keypair
    const { sec: storedSecKey, pub: storedPubKey } = readStoredEphemeralKeys();
    if (storedSecKey && storedPubKey && publicKey === storedPubKey) {
      try {
        const kp = StellarSdk.Keypair.fromSecret(storedSecKey);
        transaction.sign(kp);
        return { success: true, signedXdr: transaction.toXDR() };
      } catch (signErr) {
        console.warn("Ephemeral signature notice:", signErr);
      }
    }

    const xdr = transaction.toXDR();
    
    // Explicitly pass networkPassphrase so Freighter knows this is on Stellar Testnet
    const signedTx = await withTimeout(
      signTransaction(xdr, { 
        network: NETWORK, 
        networkPassphrase: PASSPHRASE,
        accountToSign: publicKey 
      }), 
      30000
    );
    
    if (signedTx?.error) {
      throw new Error(signedTx.error);
    }
    
    return { success: true, signedXdr: signedTx };
  } catch (error) {
    console.error("Wallet Signature Error or Timeout.", error);
    // Only simulate success in local development — production must surface real errors
    if (import.meta.env.DEV) {
      console.warn("[DEV ONLY] Simulating success for Demo.");
      return { success: true, signedXdr: "DEMO_SIGNED_XDR_PAYLOAD" };
    }
    throw error;
  }
};

/**
 * Assembles and simulates a Soroban fund_task invocation.
 * Converts amount to stroops (7 decimals) and builds Soroban host function call.
 * 
 * @param {Object} params
 * @param {string} params.clientAddress - Public key of client funding the escrow
 * @param {string} [params.freelancerAddress] - Public key of freelancer (defaults to testnet QA recipient)
 * @param {number|string} params.amount - Amount of tokens (e.g. 1.5 XLM)
 * @param {string} [params.tokenAddress] - SAC contract address (defaults to native XLM SAC)
 * @returns {Promise<{ simulation: Object, preparedTx: StellarSdk.Transaction, minResourceFee: string, isDemo: boolean }>}
 */
export const simulateFundTask = async ({
  clientAddress,
  freelancerAddress = DEFAULT_FREELANCER_TESTNET_ADDRESS,
  amount,
  tokenAddress = NATIVE_SAC_CONTRACT_ID
}) => {
  if (!clientAddress || isDemoWallet(clientAddress)) {
    return {
      simulation: { status: 'SUCCESS_SIMULATED_DEMO', minResourceFee: '100' },
      preparedTx: null,
      minResourceFee: '100',
      isDemo: true
    };
  }

  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await withTimeout(horizon.loadAccount(clientAddress), 5000);
  const contract = new StellarSdk.Contract(GIGPAY_ESCROW_CONTRACT_ID);

  // Convert decimal amount to 7-decimal Stroops (i128 BigInt)
  const stroops = BigInt(Math.round(parseFloat(amount) * 10_000_000));

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: PASSPHRASE
  })
    .addOperation(
      contract.call(
        'fund_task',
        StellarSdk.nativeToScVal(clientAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(freelancerAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(tokenAddress, { type: 'address' }),
        StellarSdk.nativeToScVal(stroops, { type: 'i128' })
      )
    )
    .setTimeout(60)
    .build();

  const simResult = await withTimeout(sorobanServer.simulateTransaction(tx), 10000);

  if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  const preparedTx = await withTimeout(sorobanServer.prepareTransaction(tx), 10000);

  return {
    simulation: simResult,
    preparedTx,
    minResourceFee: simResult.minResourceFee || preparedTx.fee,
    isDemo: false
  };
};

/**
 * Executes the complete fund_task flow:
 * 1. Simulates & prepares the Soroban invocation transaction.
 * 2. Prompts Freighter wallet for user signature.
 * 3. Submits signed transaction to Soroban Testnet RPC.
 * 4. Polls for final on-chain transaction confirmation.
 *
 * @param {Object} params
 * @param {string} params.clientAddress - Public key of client
 * @param {string} [params.freelancerAddress] - Public key of freelancer
 * @param {number|string} params.amount - Escrow amount in XLM
 * @param {string} [params.tokenAddress] - SAC token contract
 * @returns {Promise<{ success: boolean, hash: string, explorerUrl: string, isDemo: boolean }>}
 */
/**
 * Normalizes blockchain and Freighter wallet error messages for clean user presentation.
 * 
 * @param {Error|Object|string} error 
 * @returns {string} Human-friendly error description
 */
export const formatStellarError = (error) => {
  if (!error) return "Unknown transaction error occurred.";
  const msg = typeof error === 'string' ? error : error.message || JSON.stringify(error);

  if (msg.includes("TIMEOUT")) {
    return "Wallet request timed out. Please unlock Freighter and try again.";
  }
  if (msg.includes("User declined") || msg.includes("User rejected") || msg.includes("declined")) {
    return "Transaction signing was rejected in Freighter.";
  }
  if (msg.includes("Self-dealing")) {
    return msg;
  }
  if (msg.includes("already approved")) {
    return "This payment was already released to the freelancer. No new payment was sent.";
  }
  if (error?.name === 'NotFoundError' || msg === 'Not Found' || msg.includes('status code 404')) {
    return "Your practice wallet is still being set up with free Testnet funds. Wait a few seconds, then try again. No money was moved.";
  }
  if (msg.includes("HostError") || msg.includes("UnreachableCodeReached")) {
    // Never tell people to lock funds again: the cause may be the contract's capacity, not their task.
    return "The escrow contract rejected this transaction, so nothing was sent and no money moved. Please don't lock funds again; tell the GigPay team which task this was.";
  }
  if (msg.includes("insufficient_balance") || msg.includes("Insufficient balance") || msg.includes("balance")) {
    return msg.includes("Account holds") ? msg : "Insufficient Testnet XLM balance to fund this escrow.";
  }
  if (msg.includes("Failed to fetch")) {
    return "Network connection to Stellar RPC interrupted. Please check connection and retry.";
  }
  return msg;
};

/**
 * Validates whether a provided string is a syntactically valid Stellar Ed25519 public address (G...).
 * 
 * @param {string} address - Public key to validate
 * @returns {boolean} True if address is valid G... public key
 */
export const isValidStellarAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  if (address === DEMO_PUBLIC_KEY || address === DEMO_FREELANCER_KEY || address.startsWith('GBDEMO_')) return true;
  return StellarSdk.StrKey.isValidEd25519PublicKey(address);
};

/**
 * Validates the parties of an escrow task to enforce multi-wallet separation and prevent self-dealing.
 * 
 * @param {string} clientAddress - Address of the client funding escrow
 * @param {string} freelancerAddress - Destination address of the freelancer
 * @returns {{ valid: boolean, error?: string }} Validation result with descriptive error
 */
export const validateEscrowParties = (clientAddress, freelancerAddress) => {
  if (!clientAddress) {
    return { valid: false, error: "Client wallet address is required." };
  }
  if (!freelancerAddress) {
    return { valid: false, error: "Freelancer recipient wallet address is required." };
  }
  if (!isValidStellarAddress(clientAddress)) {
    return { valid: false, error: "Client address is not a valid Stellar public key." };
  }
  if (!isValidStellarAddress(freelancerAddress)) {
    return { valid: false, error: "Freelancer address is not a valid Stellar public key." };
  }
  if (clientAddress === freelancerAddress) {
    return { 
      valid: false, 
      error: "Self-dealing prevented: Client wallet and Freelancer destination wallet cannot be identical. Multi-wallet separation is required." 
    };
  }
  return { valid: true };
};

/**
 * Asserts that the client account holds sufficient balance to cover the task amount
 * plus the required base reserve (1.0 XLM) and network transaction gas fee buffer.
 *
 * @param {string} clientAddress - Client public key
 * @param {number|string} amount - Task amount in XLM
 * @returns {Promise<{ sufficient: boolean, balance: number, required: number, error?: string }>}
 */
export const checkBalanceSufficiency = async (clientAddress, amount) => {
  const taskAmount = parseFloat(amount) || 0;
  const reserveBuffer = 1.5; // 1.0 XLM base reserve + 0.5 XLM fee buffer
  const totalRequired = taskAmount + reserveBuffer;

  const { raw: currentBalance, active, isDemo, unknown } = await getAccountBalance(clientAddress);

  if (isDemo) {
    return { sufficient: true, balance: 10000, required: totalRequired };
  }
  if (unknown) {
    // Balance can't be checked right now; the contract call itself rejects an underfunded account.
    return { sufficient: true, balance: null, required: totalRequired, unchecked: true };
  }

  if (!active || currentBalance < totalRequired) {
    return {
      sufficient: false,
      balance: currentBalance,
      required: totalRequired,
      error: `Insufficient balance: Account holds ${currentBalance.toFixed(2)} XLM, but ${totalRequired.toFixed(2)} XLM is required (including 1.5 XLM base reserve & gas buffer).`
    };
  }

  return { sufficient: true, balance: currentBalance, required: totalRequired };
};

/**
 * Polls the Soroban RPC for transaction finality using an exponential backoff schedule.
 * Mitigates network latency, prevents RPC rate-limiting, and catches temporary transport errors.
 *
 * @param {string} txHash - Transaction hash to query
 * @param {Object} [options]
 * @param {number} [options.maxAttempts=8] - Maximum number of polling retries
 * @param {number} [options.initialDelayMs=1500] - Initial delay in milliseconds
 * @param {number} [options.backoffMultiplier=1.5] - Exponential multiplier per attempt
 * @param {number} [options.maxDelayMs=5000] - Maximum delay ceiling
 * @returns {Promise<{ status: string, hash: string, explorerUrl: string, attempts: number }>}
 */
export const pollSorobanTransactionWithBackoff = async (
  txHash,
  {
    maxAttempts = 8,
    initialDelayMs = 1500,
    backoffMultiplier = 1.5,
    maxDelayMs = 5000
  } = {}
) => {
  let attempts = 0;
  let currentDelay = initialDelayMs;

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, currentDelay));

    try {
      const txStatus = await sorobanServer.getTransaction(txHash);
      if (txStatus.status === 'SUCCESS') {
        let returnValue = null;
        try {
          if (txStatus.returnValue) {
            returnValue = Number(StellarSdk.scValToNative(txStatus.returnValue));
          }
        } catch {
          // ignore returnValue parse warning
        }
        return {
          status: 'SUCCESS',
          hash: txHash,
          returnValue,
          explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
          attempts
        };
      } else if (txStatus.status === 'FAILED') {
        throw new Error(`Soroban contract invocation failed on-chain: ${txHash}`);
      }
    } catch (queryErr) {
      if (queryErr.message.includes("failed on-chain")) {
        throw queryErr;
      }
      console.warn(`[Soroban RPC Poll] Attempt ${attempts}/${maxAttempts} transient notice:`, queryErr.message);
    }

    currentDelay = Math.min(Math.round(currentDelay * backoffMultiplier), maxDelayMs);
  }

  return {
    status: 'SUBMITTED',
    hash: txHash,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    attempts
  };
};

export const NETWORK_BUSY_MESSAGE =
  "The Stellar network is busy right now, so nothing was sent and no money moved. Wait a few seconds and try again.";
export const RELEASE_PENDING_MESSAGE =
  "The release is still confirming on Stellar. Nothing is marked as paid yet. Wait a minute, refresh, then press Release again: if it already went through, GigPay will tell you.";

/**
 * Sends a signed Soroban transaction and waits for the ledger to confirm it.
 *  - TRY_AGAIN_LATER / ERROR: the network did not accept it, so nothing was sent -> throw.
 *  - send timed out: it may still have been accepted, so keep polling by the hash computed locally.
 *  - accepted but not confirmed within the poll window -> { status: 'PENDING' }, never success.
 */
export const sendAndConfirm = async (signedTx, { server = sorobanServer, poll = pollSorobanTransactionWithBackoff } = {}) => {
  const localHash = signedTx.hash().toString('hex');
  let sendResult = null;
  try {
    sendResult = await withTimeout(server.sendTransaction(signedTx), 10000);
  } catch (sendErr) {
    if (!String(sendErr?.message || '').includes('TIMEOUT')) throw sendErr;
    console.warn('[sendAndConfirm] send timed out; checking whether the network accepted it:', localHash);
  }
  if (sendResult?.status === 'TRY_AGAIN_LATER') throw new Error(NETWORK_BUSY_MESSAGE);
  if (sendResult?.status === 'ERROR') {
    throw new Error(`Transaction submission error: ${JSON.stringify(sendResult.errorResultXdr || sendResult)}`);
  }
  const txHash = sendResult?.hash || localHash;
  const pollResult = await poll(txHash);
  if (pollResult.status !== 'SUCCESS') {
    return { status: 'PENDING', hash: txHash, explorerUrl: `https://stellar.expert/explorer/testnet/tx/${txHash}` };
  }
  return pollResult;
};

/**
 * Looks up a fund_task transaction that was still pending when the client's page gave up waiting.
 * Returns { status: 'SUCCESS', onChainTaskId } | { status: 'FAILED' } | { status: 'NOT_FOUND' }.
 */
export const getFundTaskOutcome = async (txHash, { server = sorobanServer } = {}) => {
  const tx = await server.getTransaction(txHash);
  if (tx.status === 'SUCCESS') {
    let onChainTaskId = null;
    try { onChainTaskId = tx.returnValue ? Number(StellarSdk.scValToNative(tx.returnValue)) : null; } catch { /* no return value */ }
    return { status: 'SUCCESS', onChainTaskId };
  }
  return { status: tx.status === 'FAILED' ? 'FAILED' : 'NOT_FOUND' };
};

/**
 * Executes the complete fund_task flow:
 * 1. Simulates & prepares the Soroban invocation transaction.
 * 2. Signs via Freighter OR automatically via a real Friendbot-funded Ephemeral Testnet keypair in Simulator/Mobile mode.
 * 3. Submits signed transaction to Soroban Testnet RPC.
 * 4. Polls for final on-chain transaction confirmation and records the u32 onChainTaskId.
 *
 * @param {Object} params
 * @param {string} params.clientAddress - Public key of client
 * @param {string} [params.freelancerAddress] - Public key of freelancer
 * @param {number|string} params.amount - Escrow amount in XLM
 * @param {string} [params.tokenAddress] - SAC token contract
 * @returns {Promise<{ success: boolean, hash: string, onChainTaskId?: number, clientAddress?: string, explorerUrl: string, isDemo: boolean }>}
 */
export const submitFundTask = async ({
  clientAddress,
  freelancerAddress = DEFAULT_FREELANCER_TESTNET_ADDRESS,
  amount,
  tokenAddress = NATIVE_SAC_CONTRACT_ID
}) => {
  // 1. Enforce multi-wallet separation and anti-self-dealing check
  const partyValidation = validateEscrowParties(clientAddress, freelancerAddress);
  if (!partyValidation.valid) {
    throw new Error(partyValidation.error);
  }

  // 2. Resolve the signer: Ephemeral / Simulator / Extensionless mode signs on-chain automatically,
  //    once its Testnet account is confirmed to exist.
  const ephemeralSigner = await getOrProvisionEphemeralSigner(clientAddress);
  const effectiveClientAddress = ephemeralSigner ? ephemeralSigner.publicKey : clientAddress;
  if (ephemeralSigner && !(await ensureEphemeralAccountFunded(effectiveClientAddress))) {
    throw new Error(formatStellarError({ name: 'NotFoundError', message: 'Not Found' }));
  }

  // 3. Pre-flight base reserve and gas fee check against the wallet that will actually pay
  //    (checking the placeholder demo key here always reported 10,000 XLM).
  const balanceCheck = await checkBalanceSufficiency(effectiveClientAddress, amount);
  if (!balanceCheck.sufficient) {
    throw new Error(balanceCheck.error);
  }

  if (!effectiveClientAddress || isDemoWallet(effectiveClientAddress)) {
    console.log(`[DEMO MODE] Offline fallback for fund_task (${amount} XLM)`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      success: true,
      hash: DEMO_FUND_TX_HASH,
      explorerUrl: null, // demo: no on-chain transaction to link
      isDemo: true
    };
  }

  try {
    // 4. Prepare & simulate transaction on Soroban Testnet RPC
    const { preparedTx } = await simulateFundTask({
      clientAddress: effectiveClientAddress,
      freelancerAddress,
      amount,
      tokenAddress
    });

    let signedTx;
    if (ephemeralSigner && ephemeralSigner.keypair) {
      preparedTx.sign(ephemeralSigner.keypair);
      signedTx = preparedTx;
    } else {
      // Request user signature via Freighter
      const signResult = await withTimeout(
        signTransaction(preparedTx.toXDR(), { 
          network: NETWORK, 
          networkPassphrase: PASSPHRASE,
          accountToSign: effectiveClientAddress 
        }),
        30000
      );

      if (signResult?.error) {
        throw new Error(signResult.error);
      }

      const rawXdr = typeof signResult === 'string'
        ? signResult
        : (signResult?.signedTxXdr || signResult?.signedTransaction || signResult);

      signedTx = StellarSdk.TransactionBuilder.fromXDR(rawXdr, PASSPHRASE);
    }

    // 5-6. Submit and wait for confirmation. Not confirmed yet is reported as pending, never as success.
    const outcome = await sendAndConfirm(signedTx);
    if (outcome.status === 'PENDING') {
      return {
        success: false,
        pending: true,
        hash: outcome.hash,
        onChainTaskId: null,
        clientAddress: effectiveClientAddress,
        explorerUrl: outcome.explorerUrl,
        isDemo: false
      };
    }

    return {
      success: true,
      hash: outcome.hash,
      onChainTaskId: outcome.returnValue || null,
      clientAddress: effectiveClientAddress,
      explorerUrl: outcome.explorerUrl,
      isDemo: false
    };
  } catch (error) {
    // A real signer attempted a real transaction. Never convert that failure into a success:
    // the caller must roll back its optimistic card and show the user that no funds moved.
    console.error("[submitFundTask] Error:", error);
    throw new Error(formatStellarError(error));
  }
};

const U32_MAX = 4294967295;
const toU32TaskId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) && num > 0 && num <= U32_MAX ? num : null;
};

/**
 * Resolves the u32 on-chain task ID that fund_task returned for this task.
 * Returns null when it is unknown. Callers must NOT substitute a guess (such as the last task this
 * browser funded, or #1): approve_task pays whichever escrow the ID names, so a guess can release
 * a different freelancer's locked funds.
 */
export const resolveOnChainTaskId = (taskId) => {
  if (taskId && typeof taskId === 'object') {
    return toU32TaskId(taskId.on_chain_task_id);
  }
  return toU32TaskId(taskId);
};

// Read-only simulations still need a source account; this existing Testnet account is never charged or signed for.
const READ_ONLY_SOURCE_ACCOUNT = DEFAULT_FREELANCER_TESTNET_ADDRESS;
// get_task on an ID the contract never issued traps on unwrap() (panic = "abort" in release builds).
const isMissingTaskError = (msg) => /UnreachableCodeReached|InvalidAction|MissingValue/i.test(String(msg || ''));

/**
 * Reads one escrow through the contract's read-only get_task, by simulation: nothing is signed or sent.
 * Returns { client, freelancer, amount (stroops, BigInt), token, is_funded, is_approved }, or null when the
 * contract has no task with that ID. Throws when Soroban RPC can't answer, so "unknown" is never read as "not found".
 */
export const getOnChainTask = async (onChainTaskId, { server = sorobanServer } = {}) => {
  const id = toU32TaskId(onChainTaskId);
  if (id === null) return null;
  const tx = new StellarSdk.TransactionBuilder(new StellarSdk.Account(READ_ONLY_SOURCE_ACCOUNT, '0'), {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: PASSPHRASE
  })
    .addOperation(new StellarSdk.Contract(GIGPAY_ESCROW_CONTRACT_ID).call('get_task', StellarSdk.nativeToScVal(id, { type: 'u32' })))
    .setTimeout(60)
    .build();
  const sim = await withTimeout(server.simulateTransaction(tx), 10000);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    if (isMissingTaskError(sim.error)) return null;
    throw new Error(`get_task simulation failed: ${sim.error}`);
  }
  if (!sim?.result?.retval) throw new Error('get_task returned no value');
  const t = StellarSdk.scValToNative(sim.result.retval);
  return {
    client: String(t.client),
    freelancer: String(t.freelancer),
    amount: BigInt(t.amount),
    token: String(t.token),
    is_funded: !!t.is_funded,
    is_approved: !!t.is_approved
  };
};

/**
 * Assembles and simulates a Soroban approve_task invocation.
 * Releases the escrowed funds from contract to the designated freelancer.
 *
 * @param {Object} params
 * @param {string} params.clientAddress - Public key of client authorizing the release
 * @param {number|string} params.taskId - On-chain task ID (u32)
 * @returns {Promise<{ simulation: Object, preparedTx: StellarSdk.Transaction, minResourceFee: string, isDemo: boolean }>}
 */
export const simulateApproveTask = async ({ clientAddress, taskId }) => {
  const resolvedTaskId = (taskId && typeof taskId === 'object') ? (taskId.id || taskId.taskId) : taskId;
  const isMockTask = typeof resolvedTaskId === 'string' && resolvedTaskId.startsWith('task-mock');
  if (!clientAddress || isDemoWallet(clientAddress) || isMockTask) {
    return {
      simulation: { status: 'SUCCESS_SIMULATED_DEMO', minResourceFee: '100' },
      preparedTx: null,
      minResourceFee: '100',
      isDemo: true
    };
  }

  const numericTaskId = resolveOnChainTaskId(taskId);
  if (numericTaskId === null) {
    throw new Error(ESCROW_NOT_FOUND_MESSAGE);
  }
  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await withTimeout(horizon.loadAccount(clientAddress), 5000);
  const contract = new StellarSdk.Contract(GIGPAY_ESCROW_CONTRACT_ID);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: PASSPHRASE
  })
    .addOperation(
      contract.call('approve_task', StellarSdk.nativeToScVal(numericTaskId, { type: 'u32' }))
    )
    .setTimeout(60)
    .build();

  const simResult = await withTimeout(sorobanServer.simulateTransaction(tx), 10000);

  if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
    // The contract rejected this release (wrong signer, already released, unknown task...).
    // Surface it, same as simulateFundTask, instead of reporting a simulated success.
    throw new Error(`Soroban simulation failed: ${simResult.error}`);
  }

  const preparedTx = await withTimeout(sorobanServer.prepareTransaction(tx), 10000);

  return {
    simulation: simResult,
    preparedTx,
    minResourceFee: simResult.minResourceFee || preparedTx.fee,
    isDemo: false
  };
};

const ESCROW_NOT_FOUND_MESSAGE =
  "We couldn't find this task's locked payment on Stellar Testnet, so nothing was released. Please refresh the page and try again.";

const DISPUTE_FROZEN_MESSAGE =
  "This payment is on hold because the task is in dispute. Resolve the dispute first, then release the payment.";

const demoReleaseResult = async (label) => {
  console.log(`[DEMO MODE] Simulating approve_task release for ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return {
    success: true,
    hash: DEMO_RELEASE_TX_HASH,
    explorerUrl: null, // demo: no on-chain transaction to link
    isDemo: true
  };
};

/**
 * Executes the complete approve_task flow:
 * 1. Simulates & prepares the Soroban release invocation.
 * 2. Signs via Freighter OR automatically via Ephemeral Testnet keypair in Simulator/Mobile mode.
 * 3. Submits signed transaction to Soroban Testnet RPC.
 * 4. Polls for final transaction confirmation.
 *
 * @param {Object} params
 * @param {string} params.clientAddress - Public key of client
 * @param {number|string|Object} params.taskId - On-chain task ID
 * @param {Object} [deps] - Injectable network steps (offline tests): prepare, send, readTask
 * @returns {Promise<{ success: boolean, hash: string|null, explorerUrl: string|null, isDemo: boolean, alreadyReleased?: boolean }>}
 *
 * If the release fails or is still pending, the contract's get_task decides: when it says the escrow is
 * already approved, this returns { success: true, alreadyReleased: true, hash: null } (no new release is
 * sent, and no release hash is invented). The contract's own "Task already approved" text often never
 * reaches the app, because release builds abort on panic.
 */
export const submitApproveTask = async (
  { clientAddress, taskId },
  { prepare = simulateApproveTask, send = sendAndConfirm, readTask = getOnChainTask } = {}
) => {
  const taskRecord = (taskId && typeof taskId === 'object') ? taskId : null;
  const resolvedTaskId = taskRecord ? (taskRecord.id || taskRecord.taskId) : taskId;
  const isMockTask = typeof resolvedTaskId === 'string' && resolvedTaskId.startsWith('task-mock');

  // 0. Dispute freeze (SOW Deliverable 3b). The deployed contract has no dispute state, so this
  // signing layer is the last point that can refuse a release while a task is Disputed.
  // The dispute timestamps decide, not just the status, so a stale "In Progress" copy can't slip through.
  if (isDisputeActive(taskRecord)) {
    throw new Error(DISPUTE_FROZEN_MESSAGE);
  }

  const ephemeralSigner = await getOrProvisionEphemeralSigner(clientAddress);
  const effectiveClientAddress = ephemeralSigner ? ephemeralSigner.publicKey : clientAddress;

  if (!effectiveClientAddress || isDemoWallet(effectiveClientAddress) || isMockTask) {
    return demoReleaseResult(`Task #${resolvedTaskId}`);
  }

  // A task funded in demo mode has no on-chain escrow, so its release is a demo too (isDemo: true).
  // A task funded on-chain whose ID is missing is an error: releasing by guesswork could pay the wrong escrow.
  if (resolveOnChainTaskId(taskId) === null) {
    if (taskRecord && (isSimulatedTxHash(taskRecord.tx_hash) || LEGACY_DEMO_PLACEHOLDER_HASHES.has(taskRecord.tx_hash))) {
      return demoReleaseResult(`demo-funded Task #${resolvedTaskId}`);
    }
    throw new Error(ESCROW_NOT_FOUND_MESSAGE);
  }

  // Returns the on-chain escrow when get_task says it was already paid out, otherwise null
  // (including when get_task can't be reached: then the original error stands).
  const findAlreadyReleased = async () => {
    try {
      const onChain = await readTask(resolveOnChainTaskId(taskId));
      return onChain?.is_approved ? onChain : null;
    } catch (readErr) {
      console.warn("[submitApproveTask] get_task check notice:", readErr?.message || readErr);
      return null;
    }
  };
  const alreadyReleasedResult = (onChainTask) => ({
    success: true,
    alreadyReleased: true,
    hash: null,
    explorerUrl: null,
    isDemo: false,
    onChainTask
  });

  try {
    // 1. Prepare & simulate transaction (throws if the contract would reject the release)
    const { preparedTx } = await prepare({ clientAddress: effectiveClientAddress, taskId });

    let signedTx;
    if (ephemeralSigner && ephemeralSigner.keypair) {
      preparedTx.sign(ephemeralSigner.keypair);
      signedTx = preparedTx;
    } else {
      // 2. Request user signature via Freighter
      const signResult = await withTimeout(
        signTransaction(preparedTx.toXDR(), { 
          network: NETWORK, 
          networkPassphrase: PASSPHRASE,
          accountToSign: effectiveClientAddress 
        }),
        30000
      );

      if (signResult?.error) {
        throw new Error(signResult.error);
      }

      const rawXdr = typeof signResult === 'string'
        ? signResult
        : (signResult?.signedTxXdr || signResult?.signedTransaction || signResult);

      signedTx = StellarSdk.TransactionBuilder.fromXDR(rawXdr, PASSPHRASE);
    }

    // 3-4. Submit and wait for confirmation. A release that is not confirmed yet must not mark the task
    // as paid: throw, so the task stays unreleased; pressing Release again later either confirms it or
    // reports "already released" if this one landed in the meantime.
    const outcome = await send(signedTx);
    if (outcome.status === 'PENDING') {
      const released = await findAlreadyReleased();
      if (released) return alreadyReleasedResult(released);
      throw new Error(RELEASE_PENDING_MESSAGE);
    }

    return {
      success: true,
      hash: outcome.hash,
      explorerUrl: outcome.explorerUrl,
      isDemo: false
    };
  } catch (error) {
    // Never report a failed release as a success: TaskContext rolls back the optimistic
    // "Completed" state on throw, which is what keeps every open tab truthful.
    // The one exception is an escrow the contract itself reports as already paid out.
    if (error?.message !== RELEASE_PENDING_MESSAGE) {
      const released = await findAlreadyReleased();
      if (released) return alreadyReleasedResult(released);
    }
    console.error("[submitApproveTask] Error:", error);
    throw new Error(formatStellarError(error));
  }
};

export const approveMilestone = submitApproveTask;
export const releaseMilestone = submitApproveTask;
