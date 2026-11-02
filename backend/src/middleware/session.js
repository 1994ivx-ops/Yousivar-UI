/**
 * Sessions and request identity.
 *
 *  · cookie `ysv_session` — HttpOnly, Secure in production, SameSite=Lax,
 *    bounded lifetime; the database row stores only the SHA-256 of the token
 *  · CSRF — every state-changing request must come from the app's own origin
 *    (Origin/Referer check), which SameSite=Lax alone does not guarantee
 *  · developer keys — `Authorization: Bearer ysv_…`, verified by SHA-256
 */
import { clearCookie, parseCookies, SESSION_COOKIE, serializeCookie } from '../cookies.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { forbidden, unauthorized } from '../errors.js';

export async function createSession(db, config, { userId, userAgent = '', ip = '' }) {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const days = config.sessionTtlDays;
  await db.many`
    insert into sessions (id, user_id, expires_at, user_agent, ip)
    values (${id}, ${userId}, now() + ${`${days} days`}::interval, ${userAgent.slice(0, 300)}, ${ip.slice(0, 60)})
  `;
  return { token, cookie: sessionCookie(config, token, days * 86400) };
}

export function sessionCookie(config, token, maxAge) {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge,
    domain: config.cookieDomain || undefined,
    secure: config.secureCookies,
    sameSite: 'Lax',
  });
}

export const forgetCookie = (config) => clearCookie(SESSION_COOKIE, {
  domain: config.cookieDomain || undefined,
  secure: config.secureCookies,
  sameSite: 'Lax',
});

/** Resolves the caller from the session cookie, then from a developer key. */
export async function identify(db, c) {
  const cookies = parseCookies(c.req.header('cookie'));
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const id = await sha256Hex(token);
    const row = await db.one`
      select u.id, u.email, u.full_name, u.role, u.email_verified_at, u.disabled, s.id as session_id
      from sessions s join users u on u.id = s.user_id
      where s.id = ${id} and s.expires_at > now()
    `;
    if (row && !row.disabled) {
      // Sliding last_seen, bounded by the fixed expiry set at login.
      db.many`update sessions set last_seen_at = now() where id = ${row.session_id}`.catch(() => {});
      return { id: row.id, email: row.email, full_name: row.full_name, role: row.role, verified: Boolean(row.email_verified_at), via: 'session' };
    }
  }

  const header = c.req.header('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (bearer && bearer[1].startsWith('ysv_')) {
    const hash = await sha256Hex(bearer[1]);
    const key = await db.one`
      select k.id as key_id, u.id, u.email, u.full_name, u.role, u.email_verified_at, u.disabled
      from api_keys k join users u on u.id = k.user_id
      where k.hash = ${hash} and k.revoked = false
    `;
    if (key && !key.disabled) {
      db.many`update api_keys set last_used = now() where id = ${key.key_id}`.catch(() => {});
      return { id: key.id, email: key.email, full_name: key.full_name, role: key.role, verified: Boolean(key.email_verified_at), via: 'api_key' };
    }
  }

  return null;
}

/** Blocks cross-site form posts and scripted writes from another origin. */
export function assertSameOrigin(c, config) {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const origin = c.req.header('origin') || '';
  const referer = c.req.header('referer') || '';
  const allowed = new Set(config.allowedOrigins || [config.appUrl]);
  const source = origin || referer;
  if (!source) throw forbidden('Missing origin — request refused');
  let url;
  try {
    url = new URL(source);
  } catch {
    throw forbidden('Cross-origin request refused');
  }
  if (![...allowed].some((value) => url.origin === new URL(value).origin)) {
    throw forbidden('Cross-origin request refused');
  }
}

export async function requireUser(c) {
  if (!c.get('user')) throw unauthorized();
  return c.get('user');
}

export async function requireAdmin(c) {
  const user = await requireUser(c);
  if (user.role !== 'admin') throw forbidden('Administrator access required');
  return user;
}