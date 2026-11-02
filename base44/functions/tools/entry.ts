/**
 * External service actions: web search, crawling, voice generation and Telegram
 * notifications. Admin-only; every call hits the provider's real endpoint.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  getProvider, resolveCredentials, searchWeb, crawlUrl, telegramSend,
  elevenLabsSpeech, sanitize, allSecretValues, withinRate, ProviderError,
} from '../../shared/providers.ts';

async function accountFor(admin, service) {
  const page = await admin.entities.ProviderAccount.filter({ enabled: true }, { sort: 'priority', limit: 50 });
  const match = (page.items || page || []).find((a) => a.service === service);
  if (!match) return null;
  const def = getProvider(service);
  if (!def) return null;
  const resolved = await resolveCredentials(match, def);
  return { def, account: match, creds: resolved.creds };
}

function missingFields(def, creds) {
  return def.fields.filter((f) => !f.optional && !creds[f.name]).map((f) => f.label);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const admin = base44.asServiceRole;
    if (!(await withinRate(admin, user.id, 'tool.call', 30, 60))) {
      return Response.json({ error: 'Too many tool calls — wait a minute' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const service = String(body.service || '');

    if (action === 'search') {
      const target = service ? await accountFor(admin, service) : null;
      if (!target) return Response.json({ error: 'No search provider configured' }, { status: 400 });
      const missing = missingFields(target.def, target.creds);
      if (missing.length) return Response.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 });
      const query = String(body.query || '').trim().slice(0, 400);
      if (!query) return Response.json({ error: 'A query is required' }, { status: 400 });
      const result = await searchWeb(target.def, target.creds, query);
      await admin.entities.ProviderAccount.update(target.account.id, {
        usage_requests: (target.account.usage_requests || 0) + 1,
        last_used: new Date().toISOString(),
      }).catch(() => {});
      return Response.json({ provider: target.def.label, ...result });
    }

    if (action === 'crawl') {
      const target = await accountFor(admin, 'firecrawl');
      if (!target) return Response.json({ error: 'Firecrawl is not configured' }, { status: 400 });
      const url = String(body.url || '').trim();
      const markdown = await crawlUrl(target.def, target.creds, url);
      return Response.json({ url, markdown });
    }

    if (action === 'speak') {
      const target = await accountFor(admin, 'elevenlabs');
      if (!target) return Response.json({ error: 'ElevenLabs is not configured' }, { status: 400 });
      const text = String(body.text || '').trim().slice(0, 600);
      if (!text) return Response.json({ error: 'Text is required' }, { status: 400 });
      const audio = await elevenLabsSpeech(target.creds, text, body.voice_id ? String(body.voice_id) : undefined);
      return Response.json({ audio, chars: text.length });
    }

    if (action === 'notify') {
      const target = await accountFor(admin, 'telegram');
      if (!target) return Response.json({ error: 'Telegram is not configured' }, { status: 400 });
      const text = String(body.text || '').trim().slice(0, 1000);
      if (!text) return Response.json({ error: 'Text is required' }, { status: 400 });
      const id = await telegramSend(target.creds, text, body.chat_id ? String(body.chat_id) : undefined);
      return Response.json({ ok: true, message_id: id });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    const err = error as ProviderError;
    return Response.json({ error: sanitize(err.message, []) || 'Tool call failed' }, { status: err.status && err.status >= 400 ? err.status : 502 });
  }
}