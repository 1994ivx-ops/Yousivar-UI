/**
 * Credential + provider management. Every mutating action requires the admin
 * role, verified server-side; secrets are sealed before storage and reduced to
 * a masked hint on the way back out.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  PROVIDERS, getProvider, cryptoReady, sealFields, openFields, envFields,
  resolveCredentials, maskValue, sanitize, allSecretValues,
  listModels, testCredential, withinRate, ProviderError, assertUpstreamAllowed,
} from '../../shared/providers.ts';

const AI_GROUPS = ['ai'];

function publicAccount(account, def) {
  return {
    id: account.id,
    service: account.service,
    label: account.label || def.label,
    enabled: account.enabled !== false,
    priority: Number(account.priority ?? 100),
    base_url: account.base_url || '',
    key_hint: account.key_hint || '',
    status: account.status || 'not_configured',
    status_detail: account.status_detail || '',
    checked_at: account.checked_at || '',
    default_model: account.default_model || '',
    models: Array.isArray(account.models_cache) ? account.models_cache : [],
    models_synced_at: account.models_synced_at || '',
    features: Array.isArray(account.features) ? account.features : def.features,
    temperature: typeof account.temperature === 'number' ? account.temperature : undefined,
    max_tokens: typeof account.max_tokens === 'number' ? account.max_tokens : undefined,
    usage_requests: account.usage_requests || 0,
    usage_errors: account.usage_errors || 0,
    usage_tokens: account.usage_tokens || 0,
    last_latency_ms: account.last_latency_ms || null,
    last_used: account.last_used || '',
    updated_date: account.updated_date,
  };
}

function statusFrom(detail, ok) {
  if (ok) return 'connected';
  if (/^(401|403)\b/.test(detail) || /invalid|unauthor|forbidden|api key/i.test(detail)) return 'invalid';
  return 'error';
}

async function runTest(base44, account, def) {
  const resolved = await resolveCredentials(account, def);
  const hasFields = def.fields.filter((f) => !f.optional).every((f) => resolved.creds[f.name]);
  if (!hasFields) {
    const detail = resolved.source === 'none' ? 'No credential stored yet' : 'Required fields are incomplete';
    return { ok: false, status: 'not_configured', detail, models: [] };
  }
  const result = await testCredential(def, resolved.creds, account.base_url);
  return {
    ok: result.ok,
    status: statusFrom(result.detail, result.ok),
    detail: sanitize(result.detail, allSecretValues(resolved.creds)),
    models: result.models || [],
  };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');
    const admin = base44.asServiceRole;

    // Regular members may only see which provider models exist — never credentials.
    if (action === 'available') {
      const page = await admin.entities.ProviderAccount.filter({ enabled: true }, { sort: 'priority', limit: 50 });
      const rows = page.items || page || [];
      const accounts = [];
      for (const account of rows) {
        const def = getProvider(account.service);
        if (!def || !def.chat) continue;
        const resolved = await resolveCredentials(account, def);
        const ready = Object.keys(resolved.creds).length > 0
          && def.fields.filter((f) => !f.optional).every((f) => resolved.creds[f.name]);
        if (!ready) continue;
        accounts.push({
          service: def.id,
          label: account.label || def.label,
          priority: Number(account.priority ?? 100),
          default_model: account.default_model || '',
          models: Array.isArray(account.models_cache) ? account.models_cache : [],
          status: account.status || 'not_configured',
        });
      }
      const searchReady = await admin.entities.ProviderAccount.filter({ enabled: true }, { sort: 'priority', limit: 50 })
        .then((p) => (p.items || p || []).some((a) => {
          const def = getProvider(a.service);
          return def && def.group === 'search' && (a.secret_cipher || Object.keys(envFields(def)).length > 0);
        }))
        .catch(() => false);
      return Response.json({ accounts, search_ready: searchReady });
    }

    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    if (action === 'list') {
      const page = await admin.entities.ProviderAccount.list('-created_date', 100);
      const rows = page.items || page || [];
      const accounts = rows
        .map((account) => {
          const def = getProvider(account.service);
          return def ? publicAccount(account, def) : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.priority - b.priority);

      const catalogue = PROVIDERS.map((def) => ({
        id: def.id,
        group: def.group,
        label: def.label,
        chat: def.chat === true,
        fields: def.fields.map((f) => ({
          name: f.name, label: f.label, hint: f.hint || '', optional: f.optional === true,
          envVar: f.envVar || '', required: !f.optional,
        })),
        features: def.features,
        requires_base_url: def.requiresBaseUrl === true,
        base_url: def.baseUrl || '',
        key_url: def.keyUrl || '',
        note: def.note || '',
        env_ready: Object.keys(envFields(def)).length > 0,
        ai: AI_GROUPS.includes(def.group),
      }));

      return Response.json({
        accounts,
        catalogue,
        encryption_ready: cryptoReady(),
      });
    }

    if (action === 'save') {
      const def = getProvider(String(body.service || ''));
      if (!def) return Response.json({ error: 'Unknown provider' }, { status: 400 });

      if (!cryptoReady()) {
        return Response.json({
          error: 'APP_ENCRYPTION_KEY is missing — credentials cannot be sealed, so nothing was stored. Add it in Secrets.',
        }, { status: 503 });
      }

      if (!(await withinRate(admin, user.id, 'provider.save', 30, 60))) {
        return Response.json({ error: 'Too many changes — wait a minute and retry' }, { status: 429 });
      }

      const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
      const cleaned = {};
      for (const [name, value] of Object.entries(fields)) {
        if (typeof value === 'string' && value.trim() && value.trim().length <= 400) cleaned[name] = value.trim();
      }

      const baseUrl = typeof body.base_url === 'string' ? body.base_url.trim().slice(0, 300) : '';
      if (def.requiresBaseUrl && !baseUrl && !body.id) {
        return Response.json({ error: 'This provider needs an endpoint URL' }, { status: 400 });
      }
      if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
        return Response.json({ error: 'The endpoint URL must start with http:// or https://' }, { status: 400 });
      }
      if (baseUrl) {
        try {
          assertUpstreamAllowed(baseUrl);
        } catch (error) {
          return Response.json({ error: (error as ProviderError).message || 'That endpoint is not allowed' }, { status: 400 });
        }
      }

      const existing = body.id
        ? await admin.entities.ProviderAccount.get(String(body.id)).catch(() => null)
        : null;

      const patch = {
        service: def.id,
        label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : (existing?.label || def.label),
        enabled: body.enabled === undefined ? (existing?.enabled ?? true) : body.enabled === true,
        priority: Number.isFinite(Number(body.priority)) ? Math.min(Math.max(Number(body.priority), 1), 999) : (existing?.priority ?? 100),
        base_url: baseUrl || (existing?.base_url || ''),
        default_model: typeof body.default_model === 'string' ? body.default_model.trim().slice(0, 160) : (existing?.default_model || ''),
        features: Array.isArray(body.features) ? body.features.filter((f) => typeof f === 'string').slice(0, 8) : (existing?.features || def.features),
        status: 'not_configured',
        status_detail: '',
      };

      if (Number.isFinite(Number(body.temperature))) patch.temperature = Math.min(Math.max(Number(body.temperature), 0), 2);
      if (Number.isFinite(Number(body.max_tokens))) patch.max_tokens = Math.min(Math.max(Math.round(Number(body.max_tokens)), 64), 8192);

      if (Object.keys(cleaned).length) {
        const primary = def.fields.find((f) => f.primary) || def.fields[0];
        patch.secret_cipher = await sealFields(cleaned);
        patch.key_hint = maskValue(cleaned[primary.name] || '');
      }

      const record = existing
        ? await admin.entities.ProviderAccount.update(existing.id, patch)
        : await admin.entities.ProviderAccount.create(patch);

      // A connection is only reported once a real authenticated request succeeds.
      let tested = { ok: false, status: 'not_configured', detail: 'Not tested yet', models: [] };
      try {
        tested = await runTest(base44, record, def);
      } catch (error) {
        tested = { ok: false, status: 'error', detail: sanitize(error.message, []), models: [] };
      }

      const update = {
        status: tested.status,
        status_detail: tested.detail,
        checked_at: new Date().toISOString(),
      };
      if (tested.models.length) {
        const preferred = def.recommended && tested.models.includes(def.recommended) ? def.recommended : tested.models[0];
        update.models_cache = tested.models;
        update.models_synced_at = new Date().toISOString();
        if (!patch.default_model) update.default_model = preferred;
      }
      const saved = await admin.entities.ProviderAccount.update(record.id, update);

      await admin.entities.AuditLog.create({
        action: 'provider.saved',
        actor_email: user.email || '',
        detail: `${def.id} ${tested.status}`,
      }).catch(() => {});

      return Response.json({ account: publicAccount(saved, def), test: tested });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      const record = await admin.entities.ProviderAccount.get(id).catch(() => null);
      if (!record) return Response.json({ error: 'Not found' }, { status: 404 });
      await admin.entities.ProviderAccount.delete(id);
      await admin.entities.AuditLog.create({
        action: 'provider.removed',
        actor_email: user.email || '',
        detail: record.service,
      }).catch(() => {});
      return Response.json({ ok: true });
    }

    if (action === 'test' || action === 'discover') {
      const record = await admin.entities.ProviderAccount.get(String(body.id || '')).catch(() => null);
      if (!record) return Response.json({ error: 'Not found' }, { status: 404 });
      const def = getProvider(record.service);
      if (!def) return Response.json({ error: 'Unknown provider' }, { status: 400 });

      if (!(await withinRate(admin, user.id, 'provider.test', 20, 60))) {
        return Response.json({ error: 'Too many connection tests — wait a minute' }, { status: 429 });
      }

      const resolved = await resolveCredentials(record, def);
      const missing = def.fields.filter((f) => !f.optional && !resolved.creds[f.name]);
      if (missing.length) {
        const updated = await admin.entities.ProviderAccount.update(record.id, {
          status: resolved.source === 'none' ? 'not_configured' : 'error',
          status_detail: resolved.source === 'none' ? 'No credential stored yet' : `Missing: ${missing.map((f) => f.label).join(', ')}`,
          checked_at: new Date().toISOString(),
        });
        return Response.json({ account: publicAccount(updated, def), test: { ok: false, detail: updated.status_detail, models: [] } });
      }

      let models = [];
      let detail = '';
      let ok = true;
      let status = 'connected';
      try {
        if (action === 'discover' && def.group === 'ai') {
          models = await listModels(def, resolved.creds, record.base_url);
          detail = `${models.length} models discovered`;
        } else {
          const result = await testCredential(def, resolved.creds, record.base_url);
          ok = result.ok;
          detail = result.detail;
          models = result.models || [];
          status = statusFrom(result.detail, result.ok);
        }
      } catch (error) {
        const err = error as ProviderError;
        ok = false;
        status = err.status === 401 || err.status === 403 ? 'invalid' : 'error';
        detail = sanitize(err.message, allSecretValues(resolved.creds));
      }

      const patch = {
        status,
        status_detail: sanitize(detail, allSecretValues(resolved.creds)),
        checked_at: new Date().toISOString(),
      };
      if (models.length) {
        const preferred = def.recommended && models.includes(def.recommended) ? def.recommended : models[0];
        patch.models_cache = models;
        patch.models_synced_at = new Date().toISOString();
        if (!record.default_model) patch.default_model = preferred;
      }
      const updated = await admin.entities.ProviderAccount.update(record.id, patch);
      return Response.json({ account: publicAccount(updated, def), test: { ok, detail: patch.status_detail, models } });
    }

    if (action === 'usage') {
      const page = await admin.entities.ProviderAccount.list('-created_date', 100);
      const rows = page.items || page || [];
      const totals = rows.reduce((acc, row) => ({
        requests: acc.requests + (row.usage_requests || 0),
        errors: acc.errors + (row.usage_errors || 0),
        tokens: acc.tokens + (row.usage_tokens || 0),
      }), { requests: 0, errors: 0, tokens: 0 });
      const audits = await admin.entities.AuditLog.filter(
        { action: 'provider.chat' },
        { sort: '-created_date', limit: 60 },
      ).catch(() => ({ items: [] }));
      return Response.json({ totals, recent: audits.items || [] });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: sanitize(error.message, []) || 'Provider request failed' }, { status: 500 });
  }
}