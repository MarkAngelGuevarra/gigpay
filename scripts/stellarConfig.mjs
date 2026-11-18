import * as S from '@stellar/stellar-sdk';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const BLOCKED_MAINNET_HOSTS = new Set(['horizon.stellar.org', 'soroban.stellar.org', 'mainnet.sorobanrpc.com']);
const DEFAULT_TESTNET_CONTRACT = 'CAUU2O5Z3XPYEXPS4RNHSEEROBCF3BNUFLFL5XRCPAISV3B56SOB7RD3';

export const isLocalHttpUrl = (raw) => {
  try {
    const parsed = new URL(String(raw || '').trim());
    return parsed.protocol === 'http:' && !parsed.username && !parsed.password && LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const sanitizeEndpoint = (raw, fallback) => {
  try {
    const parsed = new URL(String(raw || '').trim());
    if (parsed.username || parsed.password || BLOCKED_MAINNET_HOSTS.has(parsed.hostname.toLowerCase())) {
      return fallback;
    }
    if (parsed.protocol === 'https:' || isLocalHttpUrl(raw)) {
      return parsed.href.replace(/\/+$/, '');
    }
  } catch {
    // Fall back to default endpoint on malformed input.
  }
  return fallback;
};

export const sanitizeExplorerBase = (raw, fallback) => {
  if (raw !== undefined && String(raw).trim() === '') return '';
  try {
    const parsed = new URL(String(raw || '').trim());
    if (parsed.username || parsed.password || BLOCKED_MAINNET_HOSTS.has(parsed.hostname.toLowerCase())) {
      return fallback;
    }
    if (/^\/explorer\/public(?:\/|$)/i.test(parsed.pathname)) {
      return fallback;
    }
    if (parsed.protocol === 'https:' || isLocalHttpUrl(raw)) {
      return parsed.href.replace(/\/+$/, '');
    }
  } catch {
    // Fall back to default explorer on malformed input.
  }
  return fallback;
};

export const loadScriptStellarConfig = (env = process.env) => {
  const rawNetwork = String(env.STELLAR_NETWORK || env.VITE_STELLAR_NETWORK || 'TESTNET').trim().toUpperCase();
  const isLocalChain = rawNetwork === 'LOCAL' || rawNetwork === 'STANDALONE';
  const defaultRpcUrl = isLocalChain ? 'http://localhost:8000/soroban/rpc' : 'https://soroban-testnet.stellar.org';
  const defaultHorizonUrl = isLocalChain ? 'http://localhost:8000' : 'https://horizon-testnet.stellar.org';
  const defaultFriendbotUrl = isLocalChain ? 'http://localhost:8000/friendbot' : 'https://friendbot.stellar.org';
  const defaultExplorer = isLocalChain ? '' : 'https://stellar.expert/explorer/testnet';

  const explicitContract = String(
    env.GIGPAY_CONTRACT_ID || env.GIGPAY_ESCROW_CONTRACT_ID || env.VITE_GIGPAY_ESCROW_CONTRACT_ID || ''
  ).trim();
  if (isLocalChain && !explicitContract) {
    throw new Error('Set GIGPAY_CONTRACT_ID or GIGPAY_ESCROW_CONTRACT_ID when running against LOCAL / STANDALONE.');
  }

  const rawExplorer = env.EXPLORER_BASE_URL ?? env.VITE_EXPLORER_BASE_URL;
  const rawPassphrase = String(env.STELLAR_NETWORK_PASSPHRASE || env.VITE_STELLAR_NETWORK_PASSPHRASE || '').trim();
  const networkPassphrase = isLocalChain
    ? (rawPassphrase && rawPassphrase !== S.Networks.PUBLIC && rawPassphrase !== S.Networks.TESTNET ? rawPassphrase : S.Networks.STANDALONE)
    : S.Networks.TESTNET;

  return {
    isLocalChain,
    contractId: explicitContract || DEFAULT_TESTNET_CONTRACT,
    readSource: String(env.STELLAR_READ_SOURCE || '').trim(),
    rpcUrl: sanitizeEndpoint(env.SOROBAN_RPC_URL || env.VITE_SOROBAN_RPC_URL || defaultRpcUrl, defaultRpcUrl),
    horizonUrl: sanitizeEndpoint(env.HORIZON_URL || env.VITE_HORIZON_URL || defaultHorizonUrl, defaultHorizonUrl),
    friendbotUrl: sanitizeEndpoint(env.FRIENDBOT_URL || env.VITE_FRIENDBOT_URL || defaultFriendbotUrl, defaultFriendbotUrl),
    explorerBase: sanitizeExplorerBase(rawExplorer !== undefined ? rawExplorer : defaultExplorer, defaultExplorer),
    networkPassphrase,
  };
};
