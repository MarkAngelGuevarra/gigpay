import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const devCspPlugin = () => ({
  name: 'gigpay-dev-csp',
  apply: 'serve',
  transformIndexHtml(html) {
    return html.replace(
      /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]+)(")/i,
      (_, prefix, content, suffix) => {
        const relaxed = content
          .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
          .replace(
            "connect-src 'self'",
            "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
          );
        return `${prefix}${relaxed}${suffix}`;
      }
    );
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawSupabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
  const supabaseTarget = (/^https?:\/\//i.test(rawSupabaseUrl)
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

  return {
    plugins: [react(), devCspPlugin()],
    server: {
      proxy: supabaseProxy,
    },
    preview: {
      proxy: supabaseProxy,
    },
  };
})
