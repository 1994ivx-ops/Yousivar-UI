/**
 * Conversations and messages.
 *
 * Ownership replaces the old per-entity RLS: every statement carries
 * `user_id = $caller`, so a guessed id returns 404 rather than another user's data.
 */
import { Hono } from 'hono';
import * as v from '../validate.js';
import { notFound } from '../errors.js';
import { requireUser } from '../middleware/session.js';

const data = new Hono();

const conversationRow = (row) => ({
  id: row.id,
  title: row.title,
  model: row.model,
  archived: row.archived,
  pinned: row.pinned,
  message_count: row.message_count,
  last_message_at: row.last_message_at,
  created_date: row.created_at,
  updated_date: row.updated_at,
});

const messageRow = (row) => ({
  id: row.id,
  conversation_id: row.conversation_id,
  role: row.role,
  content: row.content,
  model: row.model,
  latency_ms: row.latency_ms,
  attachments: row.attachments || [],
  created_date: row.created_at,
});

// -------------------------------------------------------------- conversations

data.get('/conversations', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const limit = v.integer(c.req.query('limit'), { field: 'limit', min: 1, max: 100, fallback: 50 });
  const archived = c.req.query('archived') === 'true';
  const search = (c.req.query('q') || '').trim().slice(0, 120);
  const before = c.req.query('before') || null;

  const rows = await db.many`
    select id, title, model, archived, pinned, message_count, last_message_at, created_at, updated_at
    from conversations
    where user_id = ${user.id}
      and archived = ${archived}
      and (${search || null}::text is null or title ilike ${`%${search}%`})
      and (${before}::timestamptz is null or coalesce(last_message_at, created_at) < ${before}::timestamptz)
    order by pinned desc, coalesce(last_message_at, created_at) desc
    limit ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  return c.json({
    items: rows.slice(0, limit).map(conversationRow),
    has_more: hasMore,
    next_before: hasMore ? rows[limit - 1].last_message_at || rows[limit - 1].created_at : null,
  });
});

data.post('/conversations', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const title = v.text(body.title, { field: 'title', min: 1, max: 200 });
  const model = v.optionalText(body.model, { field: 'model', max: 120 });

  const row = await db.one`
    insert into conversations (user_id, title, model, last_message_at)
    values (${user.id}, ${title}, ${model}, now())
    returning id, title, model, archived, pinned, message_count, last_message_at, created_at, updated_at
  `;
  return c.json(conversationRow(row), 201);
});

data.get('/conversations/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const row = await db.one`
    select id, title, model, archived, pinned, message_count, last_message_at, created_at, updated_at
    from conversations where id = ${id} and user_id = ${user.id}
  `;
  if (!row) throw notFound('Conversation not found');
  return c.json(conversationRow(row));
});

data.patch('/conversations/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));

  const title = body.title === undefined ? null : v.text(body.title, { field: 'title', min: 1, max: 200 });
  const archived = body.archived === undefined ? null : Boolean(body.archived);
  const pinned = body.pinned === undefined ? null : Boolean(body.pinned);
  const model = body.model === undefined ? null : v.optionalText(body.model, { field: 'model', max: 120 });

  const row = await db.one`
    update conversations set
      title = coalesce(${title}, title),
      archived = coalesce(${archived}, archived),
      pinned = coalesce(${pinned}, pinned),
      model = coalesce(${model}, model)
    where id = ${id} and user_id = ${user.id}
    returning id, title, model, archived, pinned, message_count, last_message_at, created_at, updated_at
  `;
  if (!row) throw notFound('Conversation not found');
  return c.json(conversationRow(row));
});

data.delete('/conversations/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const row = await db.one`delete from conversations where id = ${id} and user_id = ${user.id} returning id`;
  if (!row) throw notFound('Conversation not found');
  return c.json({ ok: true });
});

// ----------------------------------------------------------------- messages

data.get('/conversations/:id/messages', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const limit = v.integer(c.req.query('limit'), { field: 'limit', min: 1, max: 300, fallback: 200 });

  const owner = await db.one`select id from conversations where id = ${id} and user_id = ${user.id}`;
  if (!owner) throw notFound('Conversation not found');

  const rows = await db.many`
    select id, conversation_id, role, content, model, latency_ms, attachments, created_at
    from messages where conversation_id = ${id} and user_id = ${user.id}
    order by created_at asc limit ${limit}
  `;
  return c.json({ items: rows.map(messageRow) });
});

data.post('/conversations/:id/messages', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));

  const role = v.oneOf(body.role, ['user', 'assistant'], 'role');
  const content = v.text(body.content, { field: 'content', min: 1, max: 60000 });
  const model = v.optionalText(body.model, { field: 'model', max: 120 });
  const latency = body.latency_ms === undefined ? null : v.integer(body.latency_ms, { field: 'latency_ms', min: 0, max: 600000 });
  const attachments = JSON.stringify(v.list(body.attachments, { field: 'attachments', max: 10 }));

  const owner = await db.one`select id from conversations where id = ${id} and user_id = ${user.id}`;
  if (!owner) throw notFound('Conversation not found');

  const row = await db.one`
    with inserted as (
      insert into messages (conversation_id, user_id, role, content, model, latency_ms, attachments)
      values (${id}, ${user.id}, ${role}, ${content}, ${model}, ${latency}, ${attachments}::jsonb)
      returning id, conversation_id, role, content, model, latency_ms, attachments, created_at
    ), touched as (
      update conversations
      set message_count = message_count + 1, last_message_at = now()
      where id = ${id} and user_id = ${user.id}
    )
    select * from inserted
  `;
  return c.json(messageRow(row), 201);
});

data.patch('/messages/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const content = v.text(body.content, { field: 'content', min: 1, max: 60000 });
  const model = v.optionalText(body.model, { field: 'model', max: 120 });

  const row = await db.one`
    update messages set content = ${content}, model = coalesce(${model}, model)
    where id = ${id} and user_id = ${user.id}
    returning id, conversation_id, role, content, model, latency_ms, attachments, created_at
  `;
  if (!row) throw notFound('Message not found');
  return c.json(messageRow(row));
});

data.delete('/messages/:id', async (c) => {
  const db = c.get('db');
  const user = await requireUser(c);
  const id = v.uuid(c.req.param('id'));
  const row = await db.one`delete from messages where id = ${id} and user_id = ${user.id} returning id`;
  if (!row) throw notFound('Message not found');
  return c.json({ ok: true });
});

export default data;