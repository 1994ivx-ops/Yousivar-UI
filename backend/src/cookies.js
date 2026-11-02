/**
 * Cookie parsing / serialisation. Kept dependency-free and pure so it can be
 * unit tested and reused by both the Worker and the Node dev server.
 */

export const SESSION_COOKIE = 'ysv_session';

export function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    out[name] = decodeURIComponent(value);
  }
  return out;
}

export function serializeCookie(name, value, options = {}) {
  const {
    maxAge, path = '/', domain, secure = true, httpOnly = true, sameSite = 'Lax',
  } = options;
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`];
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.floor(maxAge)}`);
  if (domain) parts.push(`Domain=${domain}`);
  parts.push(`SameSite=${sameSite}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}

/** Reads the session token from a Cookie header or an Authorization bearer. */
export function bearerToken(header) {
  if (!header || typeof header !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}