import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isLocalTargetConfigured = (env) => {
  const network = String(env.VITE_STELLAR_NETWORK || '').trim().toUpperCase();
  if (network === 'LOCAL' || network === 'STANDALONE') return true;
  return [
    env.VITE_SUPABASE_URL,
    env.VITE_HORIZON_URL,
    env.VITE_SOROBAN_RPC_URL,
    env.VITE_FRIENDBOT_URL,
  ].some((val) => /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(String(val || '').trim()));
};

const createCspPlugin = ({ allowInlineScript, allowLocalhostConnect }) => ({
  name: 'gigpay-dev-csp',
  transformIndexHtml(html) {
    if (!allowInlineScript && !allowLocalhostConnect) return html;
    return html.replace(
      /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]+)(")/i,
      (_, prefix, content, suffix) => {
        let next = content;
        if (allowInlineScript) {
          next = next.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
        }
        if (allowLocalhostConnect) {
          next = next.replace(
            "connect-src 'self'",
            "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
          );
        }
        return `${prefix}${next}${suffix}`;
      }
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawSupabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
  const hasExplicitUrl = /^https?:\/\//i.test(rawSupabaseUrl) && rawSupabaseUrl !== 'YOUR_SUPABASE_URL';
  const supabaseTarget = (hasExplicitUrl
    ? rawSupabaseUrl
    : 'https://gulshfticoirrpuohdxk.supabase.co').replace(/\/+$/, '');
  const supabaseProxy = {
    '/api/supabase': {
      target: supabaseTarget,
      changeOrigin: true,
      ws: true,
      rewrite: (path) => path.replace(/^\/api\/supabase/, ''),
    },
  };

  const allowInlineScript = command === 'serve';
  const allowLocalhostConnect = command === 'serve' || isLocalTargetConfigured(env);

  return {
    plugins: [react(), tailwindcss(), createCspPlugin({ allowInlineScript, allowLocalhostConnect })],
    server: {
      proxy: supabaseProxy,
    },
    preview: {
      proxy: supabaseProxy,
    },
  };
})
