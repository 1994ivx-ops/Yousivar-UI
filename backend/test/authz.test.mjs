import test from 'node:test';
import assert from 'node:assert/strict';
import {
  table, canRead, canWrite, ownsRow, isOwnedTable, assertOwns,
} from '../src/authz.js';
import { sniff, storageKey, ALLOWED_MIME } from '../src/services/storage.js';
import { windowStart } from '../src/services/ratelimit.js';

const admin = { id: 'user-admin', role: 'admin' };
const user = { id: 'user-1', role: 'user' };
const other = { id: 'user-2', role: 'user' };

test('only known tables survive the identifier guard', () => {
  assert.equal(table('conversations'), 'conversations');
  assert.equal(table('ai_models'), 'ai_models');
  for (const bad of ['conversations; drop table users', 'users--', 'Users', 'pg_catalog.pg_user', '', null, 'sessions)']) {
    assert.throws(() => table(bad), /Invalid table name|Unknown table/);
  }
  assert.throws(() => table('unknown_table'), /Unknown table/);
});

test('owned tables are recognised and global ones are not', () => {
  assert.equal(isOwnedTable('conversations'), true);
  assert.equal(isOwnedTable('provider_accounts'), false);
});

test('a user reads only their own rows', () => {
  const own = { user_id: user.id };
  const theirs = { user_id: other.id };
  for (const name of ['conversations', 'messages', 'documents', 'memories', 'api_keys']) {
    assert.equal(canRead(name, own, user), true, `${name} own`);
    assert.equal(canRead(name, theirs, user), false, `${name} foreign`);
  }
});

test('anonymous callers read nothing', () => {
  assert.equal(canRead('conversations', { user_id: 'x' }, null), false);
  assert.equal(canWrite('conversations', null), false);
});

test('provider credentials and the audit trail are admin-only', () => {
  const row = { user_id: other.id };
  assert.equal(canRead('provider_accounts', row, user), false);
  assert.equal(canRead('provider_accounts', row, admin), true);
  assert.equal(canRead('audit_logs', row, user), false);
  assert.equal(canRead('audit_logs', row, admin), true);
  assert.equal(canWrite('provider_accounts', user), false);
  assert.equal(canWrite('provider_accounts', admin), true);
  assert.equal(canWrite('ai_models', user), false);
});

test('the model registry is readable by any signed-in user', () => {
  assert.equal(canRead('ai_models', { key: 'automatic' }, user), true);
});

test('a user may see their own profile but not someone else', () => {
  assert.equal(canRead('users', { id: user.id }, user), true);
  assert.equal(canRead('users', { id: other.id }, user), false);
  assert.equal(canRead('users', { id: other.id }, admin), true);
});

test('child rows require an owned parent', () => {
  assert.equal(ownsRow({ user_id: user.id }, user), true);
  assert.equal(ownsRow({ user_id: other.id }, user), false);
  assert.throws(() => assertOwns(null, user, 'Conversation'), (error) => error.status === 404);
  assert.throws(() => assertOwns({ user_id: other.id }, user), (error) => error.status === 403);
  assert.equal(assertOwns({ user_id: user.id }, user).user_id, user.id);
});

test('upload sniffing validates both the declared type and the magic bytes', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]).buffer;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  const text = new TextEncoder().encode('hello world').buffer;

  assert.equal(sniff(pdf, 'application/pdf').ok, true);
  assert.equal(sniff(pdf, 'image/png').ok, false);
  assert.equal(sniff(png, 'image/png').ok, true);
  assert.equal(sniff(text, 'text/plain').ok, true);
  assert.equal(sniff(pdf, 'text/plain').ok, false);
  assert.equal(sniff(text, 'application/zip').ok, false);
  assert.ok(!ALLOWED_MIME.includes('application/zip'));
});

test('storage keys are namespaced per user and cannot traverse', () => {
  const key = storageKey('user-1', '../../etc/passwd');
  assert.match(key, /^documents\/user-1\//);
  assert.ok(!key.includes('..'));
  assert.ok(!key.includes('/etc/'));
});

test('rate-limit windows are stable inside a window and advance across it', () => {
  const start = new Date('2026-01-01T00:00:00Z');
  assert.equal(windowStart(start, 60).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(windowStart(new Date('2026-01-01T00:00:59Z'), 60).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(windowStart(new Date('2026-01-01T00:01:00Z'), 60).toISOString(), '2026-01-01T00:01:00.000Z');
});