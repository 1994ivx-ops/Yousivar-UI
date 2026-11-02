/**
 * Provider administration + chat completions.
 *
 * Chat behaviour is a faithful port of base44/functions/providerChat:
 * same limits, same system prompt, same search grounding, same fallback chain,
 * same SSE frame shape — but now the stream is real end-to-end, because the
 * backend is a runtime that can hold a response open (see docs/migration/02).
 */
import { Hono } from 'hono';
import * as v from '../validate.js';
import { badRequest, notFound, unauthorized } from '../errors.js';
import { requireUser, requireAdmin } from '../middleware/session.js';
import { hit } from '../services/ratelimit.js';
import { recordAction, recordProviderFailure, recordProviderSuccess } from '../services/audit.js';
import {
  PROVIDERS, getProvider, publicCatalogue, resolveCredentials, sealCredentials, hintFor,
  isReady, allSecretValues, sanitize, assertUpstreamAllowed, listModels, chatComplete,
  openChatStream, searchWeb, testCredential, ProviderError,
} from '../services/providers.js';
import {
  LIMITS, cleanMessages, withinCharBudget, buildSystem, cleanMemories, cleanDocumentNames,
  pickSearchAccount, modelForCandidate, resolveRoute,
} from '../services/chat.js';

const ai = new Hono();

const accountRows = (db) => db.many`
  select id, service, label, enabled, priority, base_url, secret_cipher, key_hint, status,
         status_detail, checked_at, default_model, models_cache, models_synced_at, features,
         temperature, max_tokens, usage_requests, usage_errors, usage_tokens, last_latency_ms, last_used
  from provider_accounts order by priority asc
`;

const publicAccount = (row) => ({
  id: row.id,
  service: row.service,
  label: row.label || getProvider(row.service)?.label || row.service,
  enabled: row.enabled,
  priority: row.priority,
  base_url: row.base_url,
  key_hint: row.key_hint,
  status: row.status,
  status_detail: row.status_detail,
  checked_at: row.checked_at,
  default_model: row.default_model,
  models: row.models_cache || [],
  models_synced_at: row.models_synced_at,
  features: row.features || getProvider(row.service)?.features || [],
  usage_requests: row.usage_requests,
  usage_errors: row.usage_errors,
  usage_tokens: Number(row.usage_tokens || 0),
  last_latency_ms: row.last_latency_ms,
  last_used: row.last_used,
});

// ------------------------------------------------------------------ catalogue

ai.get('/providers/catalogue', async (c) => {
  await requireAdmin(c);
  return c.json({ providers: publicCatalogue() });
});

/** What a signed-in client may choose from — no credentials, no upstream URLs. */
ai.get('/providers/available', async (c) => {
  const db = c.get('db');
  await requireUser(c);
  const rows = (await accountRows(db)).filter((row) => row.enabled);
  return c.json({
    accounts: rows.map((row) => ({
      service: row.service,
      label: row.label || getProvider(row.service)?.label || row.service,
      default_model: row.default_model,
      models: row.models_cache || [],
      features: row.features || [],
    })),
  });
});

ai.get('/providers', async (c) => {
  const db = c.get('db');
  await requireAdmin(c);
  return c.json({ accounts: (await accountRows(db)).map(publicAccount) });
});

// ------------------------------------------------------------------- upsert

ai.put('/providers/:service', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  await requireAdmin(c);

  const service = v.text(c.req.param('service'), { field: 'service', min: 2, max: 40 });
  const def = getProvider(service);
  if (!def) throw badRequest('Unknown provider');

  const body = await c.req.json().catch(() => ({}));
  const existing = await db.one`select id, secret_cipher, base_url from provider_accounts where service = ${service}`;

  const baseUrl = body.base_url === undefined ? null : v.optionalText(body.base_url, { field: 'base_url', max: 300 });
  if (baseUrl) assertUpstreamAllowed(baseUrl);
  if (!baseUrl && !def.baseUrl && def.requiresBaseUrl && body.base_url === undefined && !existing) {
    throw badRequest(`${def.label} requires a base URL`);
  }

  // Credentials: a whole map, or just the primary secret.
  let cipher = existing?.secret_cipher || null;
  const incoming = {};
  if (body.credentials && typeof body.credentials === 'object') {
    for (const field of def.fields) {
      const value = body.credentials[field.name];
      if (typeof value === 'string' && value.trim()) incoming[field.name] = value.trim();
    }
  }
  if (typeof body.api_key === 'string' && body.api_key.trim()) {
    const primary = def.fields.find((field) => field.primary);
    if (primary) incoming[primary.name] = body.api_key.trim();
  }
  if (Object.keys(incoming).length) {
    const previous = await resolveCredentials({ secret_cipher: cipher }, def, config.encryptionKey, {});
    cipher = await sealCredentials(config.encryptionKey, { ...previous.creds, ...incoming });
  }

  const label = v.optionalText(body.label, { field: 'label', max: 80 }) || def.label;
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
  const priority = v.integer(body.priority, { field: 'priority', min: 0, max: 1000, fallback: 100 });
  const defaultModel = v.optionalText(body.default_model, { field: 'default_model', max: 160 })
    || existing?.default_model || def.recommended || null;
  const features = JSON.stringify(v.list(body.features?.length ? body.features : def.features, { field: 'features', max: 10 }));
  const temperature = body.temperature === undefined || body.temperature === null ? null : Math.min(Math.max(Number(body.temperature), 0), 2);
  const maxTokens = body.max_tokens === undefined || body.max_tokens === null
    ? null
    : v.integer(body.max_tokens, { field: 'max_tokens', min: 64, max: 32000 });

  const row = await db.one`
    insert into provider_accounts (service, label, enabled, priority, base_url, secret_cipher, key_hint, default_model, features, temperature, max_tokens, status)
    values (${service}, ${label}, ${enabled}, ${priority}, ${baseUrl ?? existing?.base_url ?? def.baseUrl ?? null},
            ${cipher}, ${incoming && Object.keys(incoming).length ? hintFor(def, incoming) : ''},
            ${defaultModel}, ${features}::text[], ${temperature}, ${maxTokens}, 'not_configured')
    on conflict (service) do update set
      label = excluded.label,
      enabled = excluded.enabled,
      priority = excluded.priority,
      base_url = excluded.base_url,
      secret_cipher = coalesce(excluded.secret_cipher, provider_accounts.secret_cipher),
      key_hint = case when excluded.key_hint <> '' then excluded.key_hint else provider_accounts.key_hint end,
      default_model = excluded.default_model,
      features = excluded.features,
      temperature = excluded.temperature,
      max_tokens = excluded.max_tokens
    returning id, service, label, enabled, priority, base_url, key_hint, status, status_detail, checked_at,
              default_model, models_cache, models_synced_at, features, usage_requests, usage_errors,
              usage_tokens, last_latency_ms, last_used
  `;

  await recordAction(db, { userId: (await requireUser(c)).id, action: 'provider.save', detail: `service:${service}` });
  return c.json(publicAccount(row));
});

ai.delete('/providers/:service', async (c) => {
  const db = c.get('db');
  const user = await requireAdmin(c);
  const service = v.text(c.req.param('service'), { field: 'service', min: 2, max: 40 });
  const row = await db.one`delete from provider_accounts where service = ${service} returning id`;
  if (!row) throw notFound('That provider is not configured');
  await recordAction(db, { userId: user.id, action: 'provider.remove', detail: `service:${service}` });
  return c.json({ ok: true });
});

ai.post('/providers/:service/test', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  await requireAdmin(c);
  const service = v.text(c.req.param('service'), { field: 'service', min: 2, max: 40 });
  const def = getProvider(service);
  if (!def) throw badRequest('Unknown provider');

  const account = await db.one`select id, service, base_url, secret_cipher from provider_accounts where service = ${service}`;
  if (!account) throw notFound('Save this provider before testing it');

  const { creds, source } = await resolveCredentials(account, def, config.encryptionKey, config.env);
  if (!isReady(def, creds)) {
    await db.many`update provider_accounts set status = 'not_configured', checked_at = now(), status_detail = 'Missing credential' where id = ${account.id}`;
    return c.json({ ok: false, detail: 'Missing credential', source });
  }

  const result = await testCredential(def, creds, account.base_url);
  await db.many`
    update provider_accounts set
      status = ${result.ok ? 'connected' : 'invalid'},
      status_detail = ${sanitize(result.detail, allSecretValues(creds))},
      checked_at = now(),
      models_cache = ${result.models?.length ? result.models.slice(0, 300) : await currentModels(db, account.id)},
      models_synced_at = ${result.models?.length ? new Date().toISOString() : null},
      key_hint = ${hintFor(def, creds) || ''}
    where id = ${account.id}
  `;
  return c.json({ ok: result.ok, detail: sanitize(result.detail, allSecretValues(creds)), source, models: result.models || [] });
});

ai.post('/providers/:service/sync', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  await requireAdmin(c);
  const service = v.text(c.req.param('service'), { field: 'service', min: 2, max: 40 });
  const def = getProvider(service);
  if (!def) throw badRequest('Unknown provider');

  const account = await db.one`select id, base_url, secret_cipher, default_model from provider_accounts where service = ${service}`;
  if (!account) throw notFound('Save this provider first');

  const { creds } = await resolveCredentials(account, def, config.encryptionKey, config.env);
  if (!isReady(def, creds)) throw badRequest('Missing credential for this provider');

  const models = await listModels(def, creds, account.base_url);
  const row = await db.one`
    update provider_accounts set models_cache = ${models.slice(0, 300)}, models_synced_at = now(),
      default_model = coalesce(default_model, ${models[0] || null}), status = 'connected', checked_at = now()
    where id = ${account.id} returning models_cache, default_model
  `;
  return c.json({ models: row.models_cache, default_model: row.default_model });
});

async function currentModels(db, accountId) {
  const row = await db.one`select models_cache from provider_accounts where id = ${accountId}`;
  return row?.models_cache || [];
}

// --------------------------------------------------------------------- chat

/** First enabled search account that actually has its credential. */
async function findSearchProvider(db, config, rows) {
  for (const account of rows) {
    const def = getProvider(account.service);
    if (!def || def.group !== 'search') continue;
    const { creds } = await resolveCredentials(account, def, config.encryptionKey, config.env);
    if (isReady(def, creds)) return { def, account, creds };
  }
  return null;
}

function frame(payload) {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

ai.post('/chat', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const user = c.get('user');
  if (!user) throw unauthorized();

  await hit(db, { bucket: 'chat', subject: user.id, limit: LIMITS.chatPerMinute, windowSeconds: 60 });

  const body = await c.req.json().catch(() => ({}));
  const modelKey = v.text(body.model || 'automatic', { field: 'model', min: 1, max: 160 });
  const messages = cleanMessages(body.messages);
  if (!messages.length) throw badRequest('messages is required');
  if (!withinCharBudget(messages)) throw badRequest('Conversation too long');

  const language = body.language === 'ar' ? 'ar' : 'en';
  const memories = cleanMemories(body.memories);
  const documentNames = cleanDocumentNames(body.documentNames);

  const rows = (await accountRows(db)).filter((row) => row.enabled);
  const modelRow = modelKey.includes('::') ? null : await db.one`
    select key, provider, label from ai_models where key = ${modelKey}
  `;

  const route = resolveRoute({ modelKey, modelRow, rows });
  if (route.error) throw badRequest(route.error);
  if (!route.candidates.length) {
    throw badRequest(`${getProvider(route.serviceId)?.label || route.serviceId} is not configured yet. Add its API key in Providers.`);
  }

  let search = null;
  if (body.webSearch === true) {
    const provider = await findSearchProvider(db, config, rows);
    if (!provider) {
      throw badRequest('Web search is on, but no search provider is configured. Add Tavily, Exa or Google Search in Providers.');
    }
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    try {
      const result = await searchWeb(provider.def, provider.creds, lastUser?.content || '');
      search = { provider: provider.def.label, hits: result.hits, answer: result.answer };
    } catch (error) {
      const detail = sanitize(error.message, allSecretValues(provider.creds));
      throw new ProviderError(`Search failed (${detail}). Turn web search off or fix the provider.`, 502);
    }
  }

  const system = buildSystem({ memories, documentNames, language, search });
  const started = Date.now();

  // ------------------------------------------------------------------ stream
  if (body.stream === true) {
    const stream = new ReadableStream({
      async start(controller) {
        let text = '';
        let account = null;
        let creds = {};
        let def = null;
        let targetModel = '';

        try {
          for (const candidate of route.candidates) {
            const candidateDef = getProvider(candidate.service);
            if (!candidateDef) continue;
            const resolved = await resolveCredentials(candidate, candidateDef, config.encryptionKey, config.env);
            if (!isReady(candidateDef, resolved.creds)) continue;
            const candidateModel = modelForCandidate(candidate, route.serviceId, route.modelId);
            if (!candidateModel) continue;
            account = candidate;
            creds = resolved.creds;
            def = candidateDef;
            targetModel = candidateModel;
            break;
          }
          if (!account || !def || !targetModel) throw new ProviderError('No usable provider account', 400, 'config');

          const request = {
            def,
            creds,
            baseUrl: account.base_url,
            model: targetModel,
            messages,
            system,
            temperature: typeof account.temperature === 'number' ? account.temperature : undefined,
            maxTokens: typeof account.max_tokens === 'number' ? account.max_tokens : undefined,
          };

          const source = await openChatStream(request);
          if (source) {
            const reader = source.getReader();
            const decoder = new TextDecoder();
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              const delta = decoder.decode(chunk.value, { stream: true });
              if (!delta) continue;
              text += delta;
              controller.enqueue(frame({ delta }));
            }
          } else {
            const reply = await chatComplete(request);
            text = reply.content;
            if (text) controller.enqueue(frame({ delta: text }));
          }

          if (!text.trim()) throw new ProviderError('The provider returned an empty reply', 502, 'empty');

          const latency = Date.now() - started;
          await recordProviderSuccess(db, account.id, { latencyMs: latency, tokens: 0 });
          await recordAction(db, {
            userId: user.id,
            action: 'provider.chat',
            actorEmail: user.email || '',
            model: `${account.service}::${targetModel}`,
            latencyMs: latency,
            chars: text.length,
            detail: `provider:${account.service} stream:${source ? 'sse' : 'buffered'} search:${search ? search.provider : 'off'}`,
          });

          controller.enqueue(frame({
            done: true,
            content: text,
            model: `${account.service}::${targetModel}`,
            provider: account.service,
            provider_label: def.label,
            latency_ms: latency,
            chars: text.length,
            search_used: search ? search.provider : null,
          }));
        } catch (error) {
          const message = sanitize(error.message, allSecretValues(creds)) || 'Provider call failed';
          if (account) await recordProviderFailure(db, account.id, message, error.status);
          controller.enqueue(frame({ error: message, partial: text }));
        } finally {
          controller.close();
        }
      },
    });

    return c.body(stream, 200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  // ---------------------------------------------------------------- buffered
  let lastError = 'No usable provider account';
  let fellBackFrom = '';

  for (const candidate of route.candidates) {
    const def2 = getProvider(candidate.service);
    if (!def2) continue;
    const resolved = await resolveCredentials(candidate, def2, config.encryptionKey, config.env);
    if (!isReady(def2, resolved.creds)) {
      lastError = `${def2.label} has no credential stored`;
      continue;
    }
    const targetModel = modelForCandidate(candidate, route.serviceId, route.modelId);
    if (!targetModel) continue;

    try {
      const reply = await chatComplete({
        def: def2,
        creds: resolved.creds,
        baseUrl: candidate.base_url,
        model: targetModel,
        messages,
        system,
        temperature: typeof body.temperature === 'number' ? body.temperature : candidate.temperature,
        maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : candidate.max_tokens,
      });
      if (!reply.content) throw new ProviderError('The provider returned an empty reply', 502, 'empty');

      const latency = Date.now() - started;
      await recordProviderSuccess(db, candidate.id, { latencyMs: latency, tokens: reply.tokens });
      await recordAction(db, {
        userId: user.id,
        action: 'provider.chat',
        actorEmail: user.email || '',
        model: `${candidate.service}::${targetModel}`,
        latencyMs: latency,
        chars: reply.content.length,
        detail: `provider:${candidate.service}${fellBackFrom ? ` fallback_from:${fellBackFrom}` : ''} search:${search ? search.provider : 'off'}`,
      });

      return c.json({
        content: reply.content,
        model: `${candidate.service}::${targetModel}`,
        provider: candidate.service,
        provider_label: def2.label,
        latency_ms: latency,
        chars: reply.content.length,
        tokens: reply.tokens || 0,
        search_used: search ? search.provider : null,
        fallback_from: fellBackFrom || null,
      });
    } catch (error) {
      lastError = sanitize(error.message, allSecretValues(resolved.creds)) || 'Provider call failed';
      if (!fellBackFrom) fellBackFrom = candidate.service;
      await recordProviderFailure(db, candidate.id, lastError, error.status);
    }
  }

  throw new ProviderError(lastError, 502, 'provider_error');
});

export default ai;