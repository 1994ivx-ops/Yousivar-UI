/**
 * Documents, memories and the model registry — the library the chat screen reads.
 */
import { Hono } from 'hono';
import * as v from '../validate.js';
import { badRequest, notFound } from '../errors.js';
import { requireUser, requireAdmin } from '../middleware/session.js';
import { storageFor, storageKey, sniff } from '../services/storage.js';
import { recordAction } from '../services/audit.js';

const library = new Hono();

const docRow = (row) => ({
  id: row.id,
  name: row.name,
  mime_type: row.mime_type,
  size_bytes: Number(row.size_bytes || 0),
  status: row.status,
  created_date: row.created_at,
});

const memoryRow = (row) => ({
  id: row.id,
  content: row.content,
  type: row.type,
  active: row.active,
  created_date: row.created_at,
});

// ---------------------------------------------------------------- documents

library.get('/documents', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const limit = v.integer(c.req.query('limit'), { field: 'limit', min: 1, max: 100, fallback: 100 });
  const rows = await db.many`
    select id, name, mime_type, size_bytes, status, created_at
    from documents where user_id = ${user.id} order by created_at desc limit ${limit}
  `;
  return c.json({ items: rows.map(docRow) });
});

library.post('/documents', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const user = await requireUser(c);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') throw badRequest('Attach a file');

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw badRequest('That file is empty');
  if (bytes.length > config.maxUploadBytes) {
    throw badRequest(`That file is larger than ${Math.round(config.maxUploadBytes / 1048576)} MB`);
  }

  const check = sniff(bytes.buffer.slice(0, 16), file.type);
  if (!check.ok) throw badRequest(check.reason);

  const name = String(file.name || 'document').slice(0, 200);
  const key = storageKey(user.id, name);
  await storageFor(config.env).put(key, bytes, check.type);

  const row = await db.one`
    insert into documents (user_id, name, storage_key, mime_type, size_bytes, status)
    values (${user.id}, ${name}, ${key}, ${check.type}, ${bytes.length}, 'ready')
    returning id, name, mime_type, size_bytes, status, created_at
  `;
  await recordAction(db, { userId: user.id, action: 'document.upload', detail: `bytes:${bytes.length}` });
  return c.json(docRow(row), 201);
});

library.get('/documents/:id/download', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));

  const row = await db.one`
    select id, name, storage_key, mime_type from documents where id = ${id} and user_id = ${user.id}
  `;
  if (!row) throw notFound('Document not found');

  const object = await storageFor(config.env).get(row.storage_key);
  if (!object) throw notFound('That file is no longer stored');

  return c.body(object.body, 200, {
    'Content-Type': object.contentType || row.mime_type || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${row.name.replace(/["\\]/g, '_')}"`,
    'Cache-Control': 'private, no-store',
  });
});

library.delete('/documents/:id', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));

  const row = await db.one`
    delete from documents where id = ${id} and user_id = ${user.id}
    returning storage_key
  `;
  if (!row) throw notFound('Document not found');
  await storageFor(config.env).remove(row.storage_key).catch(() => {});
  return c.json({ ok: true });
});

// ----------------------------------------------------------------- memories

library.get('/memories', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const rows = await db.many`
    select id, content, type, active, created_at from memories
    where user_id = ${user.id} order by created_at desc limit 200
  `;
  return c.json({ items: rows.map(memoryRow) });
});

library.post('/memories', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const content = v.text(body.content, { field: 'content', min: 1, max: 2000 });
  const type = v.oneOf(body.type || 'fact', ['preference', 'fact', 'project', 'instruction'], 'type');

  const row = await db.one`
    insert into memories (user_id, content, type) values (${user.id}, ${content}, ${type})
    returning id, content, type, active, created_at
  `;
  return c.json(memoryRow(row), 201);
});

library.patch('/memories/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const content = body.content === undefined ? null : v.text(body.content, { field: 'content', min: 1, max: 2000 });
  const active = body.active === undefined ? null : Boolean(body.active);
  const type = body.type === undefined ? null : v.oneOf(body.type, ['preference', 'fact', 'project', 'instruction'], 'type');

  const row = await db.one`
    update memories set
      content = coalesce(${content}, content),
      active = coalesce(${active}, active),
      type = coalesce(${type}, type)
    where id = ${id} and user_id = ${user.id}
    returning id, content, type, active, created_at
  `;
  if (!row) throw notFound('Memory not found');
  return c.json(memoryRow(row));
});

library.delete('/memories/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const row = await db.one`delete from memories where id = ${id} and user_id = ${user.id} returning id`;
  if (!row) throw notFound('Memory not found');
  return c.json({ ok: true });
});

// ------------------------------------------------------------------- models

library.get('/models', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const rows = await db.many`
    select key, label, provider, description, context_window,
           supports_vision, supports_web_search, supports_documents, enabled, sort_order
    from ai_models
    where ${user.role === 'admin'} or enabled = true
    order by sort_order asc
  `;
  return c.json({ items: rows });
});

library.patch('/models/:key', async (c) => {
  const db = c.get('db');
  await requireAdmin(c);
  const key = v.text(c.req.param('key'), { field: 'key', min: 1, max: 120 });
  const body = await c.req.json().catch(() => ({}));
  const enabled = body.enabled === undefined ? null : Boolean(body.enabled);
  const label = body.label === undefined ? null : v.text(body.label, { field: 'label', min: 1, max: 120 });

  const row = await db.one`
    update ai_models set enabled = coalesce(${enabled}, enabled), label = coalesce(${label}, label)
    where key = ${key}
    returning key, label, enabled
  `;
  if (!row) throw notFound('Model not found');
  return c.json(row);
});

export default library;