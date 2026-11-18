const getRuntimeEnv = () => {
  const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const procEnv = typeof process !== 'undefined' && process.env ? process.env : {};
  return { ...procEnv, ...metaEnv };
};

export const getEnvVar = (key, fallback = '') => {
  const env = getRuntimeEnv();
  const value = env[key];
  return value !== undefined && value !== '' ? value : fallback;
};

export const isEnvFlagEnabled = (key) => getEnvVar(key) === 'true';

export const isDevMode = () => {
  const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : null;
  if (metaEnv && typeof metaEnv.DEV === 'boolean') return metaEnv.DEV;
  return getEnvVar('NODE_ENV') === 'development';
};

export const isProdMode = () => {
  const metaEnv = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : null;
  if (metaEnv && typeof metaEnv.PROD === 'boolean') return metaEnv.PROD;
  return getEnvVar('NODE_ENV') === 'production';
};

export const isPilotToolsEnabled = () => isEnvFlagEnabled('VITE_ENABLE_PILOT_TOOLS');

export const isOfflineDemoEnabled = () =>
  isEnvFlagEnabled('VITE_OFFLINE_DEMO') ||
  (typeof globalThis !== 'undefined' && globalThis.GIGPAY_OFFLINE_MODE === true);

export const getGoogleSheetsWebhookUrl = () => getEnvVar('VITE_GOOGLE_SHEETS_WEBHOOK_URL', '');

export const isLocalhostHostname = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
