/**
 * Runtime configuration. Everything sensitive comes from the runtime environment
 * (Worker bindings / process.env), never from the bundle and never from the client.
 *
 * Required: DATABASE_URL, APP_ENCRYPTION_KEY, SESSION_SECRET
 * Optional: APP_URL, RESEND_API_KEY, MAIL_FROM, ELEVENLABS_API_KEY, … provider keys
 */

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function readConfig(env = {}) {
  const appUrl = (env.APP_URL || 'http://localhost:8788').replace(/\/+$/, '');
  // The web app plus the Capacitor WebView origins (https://localhost on Android).
  const allowedOrigins = [appUrl]
    .concat(String(env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean))
    .concat(env.NODE_ENV === 'development' || env.INSECURE_COOKIES === 'true'
      ? ['http://localhost:5173', 'http://localhost:8788', 'capacitor://localhost', 'https://localhost']
      : []);

  return {
    appUrl,
    allowedOrigins: [...new Set(allowedOrigins)],
    databaseUrl: env.DATABASE_URL || '',
    encryptionKey: env.APP_ENCRYPTION_KEY || '',
    sessionSecret: env.SESSION_SECRET || '',
    sessionTtlDays: num(env.SESSION_TTL_DAYS, 30),
    cookieDomain: env.COOKIE_DOMAIN || '',
    secureCookies: env.NODE_ENV !== 'development' && env.INSECURE_COOKIES !== 'true',
    mailFrom: env.MAIL_FROM || 'YOUSIVAR <no-reply@yousivar.example>',
    resendApiKey: env.RESEND_API_KEY || '',
    maxUploadBytes: num(env.MAX_UPLOAD_BYTES, 15 * 1024 * 1024),
    env,
  };
}

/** Fails fast on the values no deployment can work without. */
export function assertConfig(config) {
  const missing = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.encryptionKey) missing.push('APP_ENCRYPTION_KEY');
  if (!config.sessionSecret) missing.push('SESSION_SECRET');
  return missing;
}