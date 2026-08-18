import { createClient } from '@supabase/supabase-js'

// Smart routing: Bypass Windows Antivirus on localhost via Proxy, use direct URL on Vercel
const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const supabaseUrl = isLocalhost ? 'http://localhost:5173/api/supabase' : 'https://gulshfticoirrpuohdxk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom fetcher with auto-fallback to proxy to prevent "Failed to fetch" when Windows Antivirus blocks .supabase.co on Vercel
const customFetch = async (url, options) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    console.warn("Direct Supabase fetch failed (likely blocked by Antivirus or firewall). Retrying via /api/supabase proxy...", error);
    if (typeof url === 'string' && url.includes('supabase.co')) {
      const proxyUrl = url.replace('https://gulshfticoirrpuohdxk.supabase.co', '/api/supabase');
      return await fetch(proxyUrl, options);
    }
    throw error;
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: customFetch
  }
})
