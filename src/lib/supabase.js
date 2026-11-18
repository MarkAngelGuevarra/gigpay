import { createClient } from '@supabase/supabase-js'
import { getEnvVar, isLocalhostHostname, isOfflineDemoEnabled } from './env.js'

const DEFAULT_SUPABASE_URL = 'https://gulshfticoirrpuohdxk.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_uimxpjAcUVlf4mqite3pZg_zhrrzy3Y';

const rawSupabaseUrl = String(getEnvVar('VITE_SUPABASE_URL', DEFAULT_SUPABASE_URL)).trim();
const configuredSupabaseUrl = (/^https?:\/\//i.test(rawSupabaseUrl)
  ? rawSupabaseUrl
  : DEFAULT_SUPABASE_URL).replace(/\/+$/, '');

const rawAnonKey = String(getEnvVar('VITE_SUPABASE_ANON_KEY', DEFAULT_SUPABASE_ANON_KEY)).trim();
const supabaseAnonKey = rawAnonKey && rawAnonKey !== 'YOUR_SUPABASE_ANON_KEY'
  ? rawAnonKey
  : DEFAULT_SUPABASE_ANON_KEY;

// Smart routing: Bypass Windows Antivirus on localhost via Proxy, use direct URL on Vercel
const isLocalhost = isLocalhostHostname();
const localOrigin = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
  ? window.location.origin
  : 'http://localhost:5173';
const supabaseUrl = isLocalhost ? `${localOrigin}/api/supabase` : configuredSupabaseUrl;

const createOfflineSupabaseStub = () => {
  const emptyResult = { data: [], error: null };
  const makeQueryBuilder = () => {
    const builder = {
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      upsert: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (onFulfilled, onRejected) => Promise.resolve(emptyResult).then(onFulfilled, onRejected),
      catch: (onRejected) => Promise.resolve(emptyResult).catch(onRejected),
    };
    return builder;
  };
  const channelStub = {
    on: () => channelStub,
    subscribe: () => channelStub,
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: async () => ({ data: { user: null, session: null }, error: new Error('Offline demo mode: account sign-up requires Supabase.') }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: new Error('Offline demo mode') }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: null }, error: null }),
    },
    from: () => makeQueryBuilder(),
    channel: () => channelStub,
    removeChannel: () => {},
    functions: {
      invoke: async () => ({ data: null, error: new Error('Offline demo mode: edge functions are disabled.') }),
    },
  };
};

const resolveRequestUrl = (input) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return '';
};

// Custom fetcher with auto-fallback to proxy to prevent "Failed to fetch" when Windows Antivirus blocks .supabase.co on Vercel
const customFetch = async (url, options) => {
  if (isOfflineDemoEnabled()) {
    throw new Error('Offline demo mode: Supabase network requests are disabled.');
  }
  try {
    return await fetch(url, options);
  } catch (error) {
    const rawUrl = resolveRequestUrl(url);
    console.warn("Direct Supabase fetch failed (likely blocked by Antivirus or firewall). Retrying via /api/supabase proxy...", error);
    if (rawUrl && (rawUrl.startsWith(configuredSupabaseUrl) || rawUrl.includes('supabase.co'))) {
      try {
        const parsed = new URL(rawUrl);
        const proxyUrl = `/api/supabase${parsed.pathname}${parsed.search}`;
        return await fetch(proxyUrl, options);
      } catch {
        // Invalid URL: fall through and rethrow the original fetch error.
      }
    }
    throw error;
  }
};

const createProtectedSupabaseClient = () => {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: customFetch
    }
  });
  const liveChannel = client.channel.bind(client);
  client.channel = (...args) => {
    if (isOfflineDemoEnabled()) {
      return createOfflineSupabaseStub().channel(...args);
    }
    return liveChannel(...args);
  };
  return client;
};

export const supabase = isOfflineDemoEnabled()
  ? createOfflineSupabaseStub()
  : createProtectedSupabaseClient();
