/**
 * Administration: people, the audit trail and workspace counters.
 * Every route here is admin-only.
 */
import { Hono } from 'hono';
import * as v from '../validate.js';
import { badRequest, notFound } from '../errors.js';
import { requireAdmin } from '../middleware/session.js';
import { recordAction } from '../services/audit.js';

const admin = new Hono();

admin.get('/users', async (c) => {
  const db = c.get('db');
  await requireAdmin(c);
  const limit = v.integer(c.req.query('limit'), { field: 'limit', min: 1, max: 200, fallback: 100 });
  const rows = await db.many`
    select id, email, full_name, role, email_verified_at, disabled, created_at
    from users order by created_at desc limit ${limit}
  `;
  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      email_verified: Boolean(row.email_verified_at),
      disabled: row.disabled,
      created_date: row.created_at,
    })),
  });
});

admin.patch('/users/:id', async (c) => {
  const db = c.get('db');
  const actor = await requireAdmin(c);
  const id = v.uuid(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));

  const role = body.role === undefined ? null : v.oneOf(body.role, ['admin', 'user'], 'role');
  const disabled = body.disabled === undefined ? null : Boolean(body.disabled);

  // An admin cannot remove their own last key to the building.
  if (id === actor.id && (disabled === true || role === 'user')) {
    throw badRequest('You cannot demote or disable your own administrator account');
  }

  const row = await db.one`
    update users set
      role = coalesce(${role}, role),
      disabled = coalesce(${disabled}, disabled)
    where id = ${id}
    returning id, email, full_name, role, email_verified_at, disabled, created_at
  `;
  if (!row) throw notFound('User not found');
  if (disabled === true) await db.many`delete from sessions where user_id = ${id}`;

  await recordAction(db, { userId: actor.id, action: 'admin.user_update', detail: `role:${role || '-'} disabled:${disabled}` });
  return c.json({
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    email_verified: Boolean(row.email_verified_at),
    disabled: row.disabled,
    created_date: row.created_at,
  });
});

admin.get('/audit', async (c) => {
  const db = c.get('db');
  await requireAdmin(c);
  const limit = v.integer(c.req.query('limit'), { field: 'limit', min: 1, max: 300, fallback: 100 });
  const action = (c.req.query('action') || '').trim().slice(0, 60);
  const rows = await db.many`
    select action, actor_email, model, latency_ms, chars, detail, created_at
    from audit_logs
    where (${action || null}::text is null or action = ${action})
    order by created_at desc limit ${limit}
  `;
  return c.json({ items: rows });
});

admin.get('/stats', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  await requireAdmin(c);
  const row = await db.one`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from conversations) as conversations,
      (select count(*)::int from messages) as messages,
      (select count(*)::int from documents) as documents,
      (select count(*)::int from provider_accounts where enabled) as providers,
      (select count(*)::int from provider_accounts where enabled and status = 'connected') as providers_connected
  `;
  return c.json({ ...row, mail_configured: Boolean(config.resendApiKey), storage_configured: Boolean(config.env?.BUCKET || config.env?.storageAdapter) });
});

export default admin;