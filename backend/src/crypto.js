/**
 * Cryptography that only uses the platform's own Web Crypto implementation.
 *
 *  · passwords  — PBKDF2-HMAC-SHA256, 600 000 iterations, 16-byte random salt,
 *                 constant-time comparison. Format: pbkdf2-sha256$iter$salt$hash
 *                 (Workers has no native Argon2id; this is the OWASP-recommended
 *                 PBKDF2 profile. See docs/migration/03-security.md.)
 *  · provider credentials — AES-256-GCM, byte-compatible with the format the app
 *                 used before the migration, so existing sealed rows are reusable.
 *  · tokens     — 256-bit random, stored only as SHA-256.
 */

const encoder = new TextEncoder();

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 100_000;

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function fromBase64(value) {
  const binary = atob(String(value));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 ? '='.repeat(4 - (base64.length % 4)) : '';
  return fromBase64(base64 + pad);
}

export function toHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export function fromHex(hex) {
  const clean = String(hex);
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Length-independent, branch-free comparison. */
export function timingSafeEqual(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a);
  const right = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function randomToken(bytes = 32) {
  return toBase64Url(randomBytes(bytes));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value)));
  return toHex(new Uint8Array(digest));
}

async function deriveBits(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password, iterations = PBKDF2_ITERATIONS) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const salt = randomBytes(16);
  const hash = await deriveBits(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterations || !salt || !hash) return false;
  const rounds = Number(iterations);
  if (!Number.isFinite(rounds) || rounds < MIN_ITERATIONS) return false;
  const expected = fromBase64(hash);
  const actual = await deriveBits(password, fromBase64(salt), rounds);
  return timingSafeEqual(actual, expected);
}

// ------------------------------------------------------------ AES-256-GCM

/** Accepts a 32-byte key as 64 hex chars or base64. */
export function keyBytes(material) {
  const raw = String(material || '').trim();
  if (!raw) return null;
  let bytes;
  if (/^[0-9a-f]{64}$/i.test(raw)) bytes = fromHex(raw);
  else {
    try { bytes = fromBase64(raw); } catch { return null; }
  }
  return bytes.length === 32 ? bytes : null;
}

export function cryptoReady(material) {
  return keyBytes(material) !== null;
}

async function aesKey(material, usage) {
  const bytes = keyBytes(material);
  if (!bytes) throw new Error('APP_ENCRYPTION_KEY is missing or is not 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [usage]);
}

/** Same wire format as the pre-migration app: "<iv-b64>.<ciphertext-b64>". */
export async function sealFields(material, fields) {
  const key = await aesKey(material, 'encrypt');
  const iv = randomBytes(12);
  const plain = encoder.encode(JSON.stringify(fields || {}));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return `${toBase64(iv)}.${toBase64(sealed)}`;
}

export async function openFields(material, cipher) {
  if (!cipher || typeof cipher !== 'string' || !cipher.includes('.')) return {};
  const [iv, data] = cipher.split('.');
  try {
    const key = await aesKey(material, 'decrypt');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(data));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return {};
  }
}

export function maskValue(value) {
  const text = String(value || '');
  if (!text) return '';
  const tail = text.length <= 4 ? text.slice(-1) : text.slice(-4);
  return `••••${tail}`;
}