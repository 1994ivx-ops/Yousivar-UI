/**
 * Provider-routed chat. The model key is "<service>::<model>" and is resolved
 * against the admin-managed ProviderAccount rows. Nothing here is simulated:
 * the reply comes from the provider's own HTTP API, and failures fall back
 * along the configured priority order.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  getProvider, resolveCredentials, chatComplete, openChatStream, searchWeb, envFields,
  sanitize, allSecretValues, withinRate, ProviderError,
} from '../../shared/providers.ts';

const MAX_MESSAGES = 40;
const MAX_CHARS = 30000;
const MAX_MEMORY = 20;

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) || '').slice(0, 8000),
    }))
    .filter((m) => m.content.trim().length > 0);
}

async function findSearchProvider(admin) {
  const page = await admin.entities.ProviderAccount.filter({ enabled: true }, { sort: 'priority', limit: 50 });
  for (const account of page.items || page || []) {
    const def = getProvider(account.service);
    if (!def || def.group !== 'search') continue;
    const resolved = await resolveCredentials(account, def);
    const ready = def.fields.filter((f) => !f.optional).every((f) => resolved.creds[f.name]);
    if (ready) return { def, account, creds: resolved.creds };
  }
  return null;
}

function buildSystem({ memories, documentNames, language, search }) {
  const lines = [
    'You are YOUSIVAR, a precise, calm AI assistant inside a private multi-model workspace.',
    language === 'ar'
      ? 'Answer in Modern Standard Arabic unless the user writes in another language.'
      : 'Answer in the language the user writes in.',
    'Use markdown: short paragraphs, lists, and fenced code blocks tagged with a language.',
    'Never invent citations. If something is uncertain, say so plainly.',
  ];
  if (memories.length) {
    lines.push(`User-approved memory:\n${memories.map((m) => `- ${m}`).join('\n')}`);
  }
  if (documentNames.length) {
    lines.push(`The user attached: ${documentNames.join(', ')}. Ground claims in their content.`);
  }
  if (search) {
    const rows = search.hits.map((h, i) => `[${i + 1}] ${h.title} — ${h.url}\n${h.snippet}`).join('\n\n');
    lines.push(
      `Live web results from ${search.provider} for this message. Cite them by number when you use them:\n${rows}` +
        (search.answer ? `\n\nProvider summary: ${search.answer}` : ''),
    );
  }
  return lines.join('\n\n');
}

function streamReply({ admin, base44, user, candidates, serviceId, modelId, messages, system, search }) {
  const encoder = new TextEncoder();
  const frame = (payload) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      let text = '';
      let account = null;
      let resolved = null;
      let def = null;
      let targetModel = '';

      try {
        for (const candidate of candidates) {
          const candidateDef = getProvider(candidate.service);
          if (!candidateDef) continue;
          const creds = await resolveCredentials(candidate, candidateDef);
          const ready = candidateDef.fields.filter((f) => !f.optional).every((f) => creds.creds[f.name]);
          if (!ready) continue;
          const candidateModel = candidate.service === serviceId
            ? modelId
            : (candidate.default_model || (candidate.models_cache || [])[0]);
          if (!candidateModel) continue;
          account = candidate;
          resolved = creds;
          def = candidateDef;
          targetModel = candidateModel;
          break;
        }
        if (!account || !def || !targetModel) throw new ProviderError('No usable provider account', 400, 'config');

        const request = {
          def,
          creds: resolved.creds,
          baseUrl: account.base_url,
          model: targetModel,
          messages,
          system,
          temperature: typeof account.temperature === 'number' ? account.temperature : undefined,
          maxTokens: typeof account.max_tokens === 'number' ? account.max_tokens : undefined,
        };

        // Providers without an SSE surface answer in one frame — real output, just not incremental.
        const source = await openChatStream(request);

        if (source) {
          const reader = source.getReader();
          const decoder = new TextDecoder();
          while (true) {
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
        await admin.entities.ProviderAccount.update(account.id, {
          usage_requests: (account.usage_requests || 0) + 1,
          last_latency_ms: latency,
          last_used: new Date().toISOString(),
          status: 'connected',
          status_detail: 'Last call succeeded',
          checked_at: new Date().toISOString(),
        }).catch(() => {});

        await base44.entities.AuditLog.create({
          action: 'provider.chat',
          actor_email: user.email || '',
          model: `${account.service}::${targetModel}`,
          latency_ms: latency,
          chars: text.length,
          detail: `provider:${account.service} stream:${source ? 'sse' : 'buffered'} search:${search ? search.provider : 'off'}`,
        }).catch(() => {});

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
        const err = error as ProviderError;
        const message = sanitize(err.message, resolved ? allSecretValues(resolved.creds) : []) || 'Provider call failed';
        if (account) {
          await admin.entities.ProviderAccount.update(account.id, {
            usage_errors: (account.usage_errors || 0) + 1,
            status: err.status === 401 || err.status === 403 ? 'invalid' : 'error',
            status_detail: message.slice(0, 300),
            checked_at: new Date().toISOString(),
          }).catch(() => {});
        }
        controller.enqueue(frame({ error: message, partial: text }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = base44.asServiceRole;
    if (!(await withinRate(admin, user.id, 'provider.chat', 40, 60))) {
      return Response.json({ error: 'Rate limit reached — wait a minute before sending again' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const modelKey = String(body.model || '');
    if (!modelKey.includes('::')) return Response.json({ error: 'A provider model key is required' }, { status: 400 });
    const [serviceId, modelId] = modelKey.split('::');
    const def = getProvider(serviceId);
    if (!def || !def.chat) return Response.json({ error: 'Unknown provider' }, { status: 400 });

    const messages = cleanMessages(body.messages);
    if (!messages.length) return Response.json({ error: 'messages is required' }, { status: 400 });
    if (messages.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS) {
      return Response.json({ error: 'Conversation too long' }, { status: 400 });
    }

    const language = body.language === 'ar' ? 'ar' : 'en';
    const memories = Array.isArray(body.memories)
      ? body.memories.slice(0, MAX_MEMORY).map((m) => String(m || '').trim().slice(0, 300)).filter(Boolean)
      : [];
    const documentNames = Array.isArray(body.documentNames)
      ? body.documentNames.slice(0, 4).map((n) => String(n || '').slice(0, 120))
      : [];

    // Web grounding through a configured search provider — never a silent no-op.
    let search = null;
    if (body.webSearch === true) {
      const provider = await findSearchProvider(admin);
      if (!provider) {
        return Response.json({
          error: 'Web search is on, but no search provider is configured. Add Tavily, Exa or Google Search in Providers.',
        }, { status: 400 });
      }
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      try {
        const result = await searchWeb(provider.def, provider.creds, lastUser?.content || '');
        search = { provider: provider.def.label, hits: result.hits, answer: result.answer };
      } catch (error) {
        const err = error as ProviderError;
        return Response.json({
          error: `Search failed (${sanitize(err.message, allSecretValues(provider.creds))}). Turn web search off or fix the provider.`,
        }, { status: 502 });
      }
    }

    const system = buildSystem({ memories, documentNames, language, search });

    // Candidate accounts for this service, then the rest of the enabled AI chain.
    const page = await admin.entities.ProviderAccount.filter({ enabled: true }, { sort: 'priority', limit: 50 });
    const rows = page.items || page || [];
    const candidates = [
      ...rows.filter((a) => a.service === serviceId),
      ...rows.filter((a) => a.service !== serviceId && getProvider(a.service)?.chat && (a.default_model || (a.models_cache || []).length)),
    ].slice(0, 3);

    if (!candidates.length) {
      return Response.json({ error: `${def.label} is not configured yet. Add its API key in Providers.` }, { status: 400 });
    }

    if (body.stream === true) {
      return streamReply({
        admin, base44, user, candidates, serviceId, modelId, messages, system, search,
      });
    }

    let lastError = 'No usable provider account';
    let fellBackFrom = '';
    const started = Date.now();

    for (let i = 0; i < candidates.length; i += 1) {
      const account = candidates[i];
      const accountDef = getProvider(account.service);
      if (!accountDef) continue;
      const resolved = await resolveCredentials(account, accountDef);
      const ready = accountDef.fields.filter((f) => !f.optional).every((f) => resolved.creds[f.name]);
      if (!ready) { lastError = `${accountDef.label} has no credential stored`; continue; }

      // The requested service keeps the requested model; fallbacks use their default.
      const targetModel = account.service === serviceId
        ? modelId
        : (account.default_model || (account.models_cache || [])[0]);
      if (!targetModel) continue;

      try {
        const reply = await chatComplete({
          def: accountDef,
          creds: resolved.creds,
          baseUrl: account.base_url,
          model: targetModel,
          messages,
          system,
          temperature: typeof body.temperature === 'number' ? body.temperature : account.temperature,
          maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : account.max_tokens,
        });
        const latency = Date.now() - started;
        if (!reply.content) throw new ProviderError('The provider returned an empty reply', 502, 'empty');

        await admin.entities.ProviderAccount.update(account.id, {
          usage_requests: (account.usage_requests || 0) + 1,
          usage_tokens: (account.usage_tokens || 0) + (reply.tokens || 0),
          last_latency_ms: latency,
          last_used: new Date().toISOString(),
          status: 'connected',
          status_detail: 'Last call succeeded',
          checked_at: new Date().toISOString(),
        }).catch(() => {});

        await base44.entities.AuditLog.create({
          action: 'provider.chat',
          actor_email: user.email || '',
          model: `${account.service}::${targetModel}`,
          latency_ms: latency,
          chars: reply.content.length,
          detail: `provider:${account.service}${fellBackFrom ? ` fallback_from:${fellBackFrom}` : ''} search:${search ? search.provider : 'off'}`,
        }).catch(() => {});

        return Response.json({
          content: reply.content,
          model: `${account.service}::${targetModel}`,
          provider: account.service,
          provider_label: accountDef.label,
          latency_ms: latency,
          chars: reply.content.length,
          tokens: reply.tokens || 0,
          search_used: search ? search.provider : null,
          fallback_from: fellBackFrom || null,
        });
      } catch (error) {
        const err = error as ProviderError;
        lastError = sanitize(err.message, allSecretValues(resolved.creds)) || 'Provider call failed';
        if (!fellBackFrom) fellBackFrom = `${account.service}`;
        await admin.entities.ProviderAccount.update(account.id, {
          usage_errors: (account.usage_errors || 0) + 1,
          status: err.status === 401 || err.status === 403 ? 'invalid' : 'error',
          status_detail: lastError.slice(0, 300),
          checked_at: new Date().toISOString(),
        }).catch(() => {});
      }
    }

    return Response.json({ error: lastError }, { status: 502 });
  } catch (error) {
    return Response.json({ error: sanitize(error.message, []) || 'Provider request failed' }, { status: 500 });
  }
}