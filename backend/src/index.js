/**
 * YOUSIVAR–Ω API — application root.
 *
 * Runs unchanged on Cloudflare Workers (`worker.fetch`), and on Node for local
 * development (`node src/node.js`). PostgreSQL is Neon over HTTPS; files are R2.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { readConfig, assertConfig } from './config.js';
import { getDb } from './db.js';
import { identify, assertSameOrigin } from './middleware/session.js';
import { jsonError } from './errors.js';
import { prune } from './services/ratelimit.js';
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import libraryRoutes from './routes/library.js';
import aiRoutes from './routes/ai.js';
import developerRoutes from './routes/developer.js';
import adminRoutes from './routes/admin.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const config = readConfig(c.env);
  c.set('config', config);

  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  c.header('Cross-Origin-Resource-Policy', 'same-site');
  if (config.secureCookies) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const missing = assertConfig(config);
  if (missing.length) {
    return c.json({ error: 'Server configuration is incomplete', code: 'setup', missing }, 503);
  }
  c.set('db', getDb(config.databaseUrl));
  await next();
});

app.use('/api/*', cors({
  origin: (origin, c) => {
    const config = readConfig(c.env);
    return config.allowedOrigins.includes(origin) ? origin : config.appUrl;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// Identity + CSRF for every API call. GETs resolve the caller; writes must be same-origin.
app.use('/api/*', async (c, next) => {
  const config = c.get('config');
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'OPTIONS') {
    assertSameOrigin(c, config);
  }
  try {
    c.set('user', await identify(c.get('db'), c));
  } catch {
    c.set('user', null);
  }
  await next();
});

app.get('/health', (c) => c.json({ ok: true, service: 'yousivar-api', time: new Date().toISOString() }));

app.route('/api/auth', authRoutes);
app.route('/api', dataRoutes);
app.route('/api', libraryRoutes);
app.route('/api', aiRoutes);
app.route('/api', developerRoutes);
app.route('/api/admin', adminRoutes);

app.notFound((c) => c.json({ error: 'Not found', code: 'not_found' }, 404));

app.onError((error, c) => {
  const { status, body } = jsonError(error);
  if (status >= 500) {
    // Server-side detail stays in the logs; the client gets a generic message.
    console.error(JSON.stringify({ level: 'error', message: String(error?.message || error).slice(0, 300), path: c.req.path }));
  }
  return c.json(body, status);
});

/** Scheduled housekeeping (wrangler cron): drop expired sessions and counters. */
export async function scheduled(event, env) {
  const config = readConfig(env);
  if (assertConfig(config).length) return;
  const db = getDb(config.databaseUrl);
  await db.many`delete from sessions where expires_at < now()`;
  await db.many`delete from auth_tokens where expires_at < now() - interval '7 days'`;
  await prune(db, 86400);
}

export { app };
export default { fetch: app.fetch, scheduled };