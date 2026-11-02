/**
 * Developer access: workspace API keys and the caller's own usage.
 *
 * A key is shown once, stored only as SHA-256, and authenticates the API through
 * `Authorization: Bearer ysv_…` (see middleware/session.js).
 */
import { Hono } from 'hono';
import { randomToken, sha256Hex } from '../crypto.js';
import * as v from '../validate.js';
import { notFound } from '../errors.js';
import { requireUser } from '../middleware/session.js';
import { recordAction } from '../services/audit.js';

const developer = new Hono();

developer.get('/keys', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const rows = await db.many`
    select id, name, prefix, revoked, last_used, created_at from api_keys
    where user_id = ${user.id} order by created_at desc limit 50
  `;
  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      revoked: row.revoked,
      last_used: row.last_used,
      created_date: row.created_at,
    })),
  });
});

developer.post('/keys', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const name = v.text(body.name, { field: 'name', min: 1, max: 80 });

  const existing = await db.one`select count(*)::int as total from api_keys where user_id = ${user.id} and revoked = false`;
  if (existing.total >= 10) throw new (await import('../errors.js')).HttpError(429, 'Revoke a key before creating another');

  const key = `ysv_${randomToken(24)}`;
  const hash = await sha256Hex(key);
  const prefix = key.slice(0, 12);

  const row = await db.one`
    insert into api_keys (user_id, name, prefix, hash) values (${user.id}, ${name}, ${prefix}, ${hash})
    returning id, name, prefix, revoked, last_used, created_at
  `;
  await recordAction(db, { userId: user.id, action: 'apikey.create', detail: name });

  // The only time the plaintext key ever exists in a response.
  return c.json({ id: row.id, name: row.name, prefix: row.prefix, key, created_date: row.created_at }, 201);
});

developer.delete('/keys/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const row = await db.one`
    update api_keys set revoked = true where id = ${id} and user_id = ${user.id} returning id
  `;
  if (!row) throw notFound('Key not found');
  return c.json({ ok: true });
});

developer.get('/usage', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const [totals] = await db.many`
    select
      count(*) filter (where action = 'provider.chat')::int as chat_calls,
      coalesce(sum(chars) filter (where action = 'provider.chat'), 0)::int as chars,
      coalesce(avg(latency_ms) filter (where action = 'provider.chat'), 0)::int as avg_latency
    from audit_logs where user_id = ${user.id} and created_at > now() - interval '30 days'
  `;
  const recent = await db.many`
    select action, model, latency_ms, chars, created_at from audit_logs
    where user_id = ${user.id} order by created_at desc limit 25
  `;
  return c.json({
    totals: {
      chat_calls: totals?.chat_calls || 0,
      chars: totals?.chars || 0,
      avg_latency: totals?.avg_latency || 0,
    },
    recent: recent.map((row) => ({
      action: row.action,
      model: row.model,
      latency_ms: row.latency_ms,
      chars: row.chars,
      when: row.created_at,
    })),
  });
});

export default developer;