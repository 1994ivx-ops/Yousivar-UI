/**
 * Authorisation, enforced in code because the database is reached only by the API.
 *
 * Each Base44 entity carried an `rls` block. Those rules are reproduced here:
 *   owned  → the row belongs to one user (conversations, messages, documents,
 *            memories, api keys, sessions, tokens)
 *   admin  → readable/writable by admins only (provider accounts, model registry,
 *            users, audit log)
 */

export const OWNED_TABLES = new Set([
  'conversations', 'messages', 'documents', 'memories', 'api_keys', 'sessions', 'auth_tokens',
]);

export const GLOBAL_TABLES = new Set(['ai_models', 'provider_accounts', 'users', 'audit_logs']);

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,40}$/;

/**
 * Guards every place a table name is interpolated into SQL. Anything not on the
 * allow-list throws instead of reaching the database.
 */
export function table(name) {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) throw new Error('Invalid table name');
  if (!OWNED_TABLES.has(name) && !GLOBAL_TABLES.has(name)) throw new Error(`Unknown table: ${name}`);
  return name;
}

export const isOwnedTable = (name) => OWNED_TABLES.has(name);

export function ownsRow(row, user) {
  return Boolean(user && row && row.user_id && row.user_id === user.id);
}

/** Mirrors the old read rules, one table at a time. */
export function canRead(name, row, user) {
  if (!user) return false;
  const isAdmin = user.role === 'admin';
  switch (name) {
    case 'conversations':
    case 'messages':
    case 'documents':
    case 'memories':
    case 'api_keys':
    case 'sessions':
    case 'auth_tokens':
      return ownsRow(row, user);
    case 'users':
      return row?.id === user.id || isAdmin;
    case 'audit_logs':
    case 'provider_accounts':
    case 'ai_models':
      return isAdmin || (name === 'ai_models' && Boolean(row));
    default:
      return false;
  }
}

/** Mirrors the old write rules. */
export function canWrite(name, user) {
  if (!user) return false;
  const isAdmin = user.role === 'admin';
  switch (name) {
    case 'provider_accounts':
    case 'ai_models':
    case 'users':
    case 'audit_logs':
      return isAdmin;
    case 'conversations':
    case 'messages':
    case 'documents':
    case 'memories':
    case 'api_keys':
      return true;
    default:
      return false;
  }
}

/** A parent row must be owned by the caller before a child row may be created. */
export function assertOwns(parentRow, user, label = 'record') {
  if (!parentRow) throw Object.assign(new Error(`${label} not found`), { status: 404, code: 'not_found' });
  if (parentRow.user_id !== user.id) {
    throw Object.assign(new Error('Forbidden'), { status: 403, code: 'forbidden' });
  }
  return parentRow;
}