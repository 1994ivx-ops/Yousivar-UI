import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, sealFields, openFields, maskValue, keyBytes,
  sha256Hex, timingSafeEqual, randomToken, toBase64, fromBase64,
} from '../src/crypto.js';
import {
  parseCookies, serializeCookie, clearCookie, bearerToken, SESSION_COOKIE,
} from '../src/cookies.js';

// 100k iterations keeps the suite fast; production uses 600k.
const FAST = 100_000;

test('password hashing round-trips and rejects the wrong password', async () => {
  const stored = await hashPassword('correct horse battery', FAST);
  assert.match(stored, /^pbkdf2-sha256\$100000\$[\w+/=]+\$[\w+/=]+$/);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('wrong password', stored), false);
});

test('a stored hash with a weak iteration count is refused', async () => {
  const weak = await hashPassword('correct horse battery', FAST);
  const downgraded = weak.replace('100000', '1000');
  assert.equal(await verifyPassword('correct horse battery', downgraded), false);
});

test('malformed stored hashes never throw, they just fail', async () => {
  for (const value of ['', 'nonsense', 'pbkdf2-sha256$abc$x$y', 'bcrypt$100000$a$b']) {
    assert.equal(await verifyPassword('anything', value), false);
  }
});

test('short passwords are refused at hash time', async () => {
  await assert.rejects(() => hashPassword('short', FAST), /at least 8/);
});

test('AES-GCM sealing round-trips and the ciphertext is not the plaintext', async () => {
  const key = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  const sealed = await sealFields(key, { API_KEY: 'sk-or-v1-secret-value' });
  assert.ok(sealed.includes('.'));
  assert.ok(!sealed.includes('sk-or-v1-secret-value'));
  assert.deepEqual(await openFields(key, sealed), { API_KEY: 'sk-or-v1-secret-value' });
});

test('a different key cannot open a sealed map', async () => {
  const key = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  const other = toBase64(crypto.getRandomValues(new Uint8Array(32)));
  const sealed = await sealFields(key, { API_KEY: 'x'.repeat(20) });
  assert.deepEqual(await openFields(other, sealed), {});
});

test('key material is accepted as hex or base64 and rejected when the wrong size', () => {
  assert.equal(keyBytes('a'.repeat(64))?.length, 32);
  assert.equal(keyBytes(toBase64(new Uint8Array(32)))?.length, 32);
  assert.equal(keyBytes('too-short'), null);
  assert.equal(keyBytes(''), null);
});

test('secrets are masked to their last four characters', () => {
  assert.equal(maskValue('sk-ant-123456789'), '••••6789');
  assert.equal(maskValue('abc'), '••••c');
  assert.equal(maskValue(''), '');
});

test('tokens are unique, URL safe and hash deterministically', async () => {
  const tokens = new Set(Array.from({ length: 50 }, () => randomToken(16)));
  assert.equal(tokens.size, 50);
  for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(await sha256Hex('abc'), await sha256Hex('abc'));
  assert.notEqual(await sha256Hex('abc'), await sha256Hex('abd'));
});

test('constant-time comparison compares content, not identity', () => {
  assert.equal(timingSafeEqual(new TextEncoder().encode('abcd'), new TextEncoder().encode('abcd')), true);
  assert.equal(timingSafeEqual(new TextEncoder().encode('abcd'), new TextEncoder().encode('abce')), false);
  assert.equal(timingSafeEqual(new TextEncoder().encode('abcd'), new TextEncoder().encode('abc')), false);
});

test('base64 round-trips arbitrary bytes', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test('cookie parsing reads every pair and tolerates junk', () => {
  assert.deepEqual(parseCookies(`${SESSION_COOKIE}=abc.def; other=1`), { [SESSION_COOKIE]: 'abc.def', other: '1' });
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies('novalue; =broken'), {});
});

test('session cookies are HttpOnly, SameSite=Lax and Secure in production', () => {
  const cookie = serializeCookie(SESSION_COOKIE, 'token', { maxAge: 60, secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=60/);
  assert.match(cookie, /Path=\//);

  const dev = serializeCookie(SESSION_COOKIE, 'token', { secure: false });
  assert.ok(!dev.includes('Secure'));
});

test('clearing a cookie expires it', () => {
  assert.match(clearCookie(SESSION_COOKIE, { secure: true }), /Max-Age=0/);
});

test('bearer extraction ignores malformed headers', () => {
  assert.equal(bearerToken('Bearer ysv_abc'), 'ysv_abc');
  assert.equal(bearerToken('basic abc'), '');
  assert.equal(bearerToken(undefined), '');
});