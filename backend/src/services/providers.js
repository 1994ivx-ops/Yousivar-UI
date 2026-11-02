/**
 * Provider catalogue + real HTTP adapters.
 *
 * Ported from base44/shared/providers.ts with behaviour preserved exactly:
 * same 17 provider ids, labels, base URLs, field names, features and auth
 * headers; same AES-GCM sealed-credential format; same SSRF guard.
 * Only the runtime changed: `Deno.env` → the Worker/Node `env` object.
 *
 * Three secret classes, never mixed:
 *   1. deployment secrets (env) — encryption key and any provider key injected
 *      through the deployment environment
 *   2. application secrets — keys saved from the Providers screen, sealed with
 *      AES-256-GCM, never returned by any route
 *   3. public configuration — ids, labels, base URLs, masks
 */
import { maskValue, openFields, sealFields, cryptoReady } from '../crypto.js';

export const PROVIDERS = [
  {
    id: 'openrouter', group: 'ai', label: 'OpenRouter', kind: 'openai', chat: true,
    baseUrl: 'https://openrouter.ai/api/v1', authPath: '/key', recommended: 'openrouter/auto',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'sk-or-v1-…', envVar: 'OPENROUTER_API_KEY', primary: true }],
    features: ['chat', 'compare'], keyUrl: 'https://openrouter.ai/keys',
    note: 'One key, hundreds of models from every major lab.',
  },
  {
    id: 'anthropic', group: 'ai', label: 'Anthropic Claude', kind: 'anthropic', chat: true,
    baseUrl: 'https://api.anthropic.com/v1',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'sk-ant-…', envVar: 'ANTHROPIC_API_KEY', primary: true }],
    features: ['chat', 'compare'], keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini', group: 'ai', label: 'Google Gemini', kind: 'gemini', chat: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'AIza…', envVar: 'GEMINI_API_KEY', primary: true }],
    features: ['chat', 'compare', 'vision'], keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq', group: 'ai', label: 'Groq', kind: 'openai', chat: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'gsk_…', envVar: 'GROQ_API_KEY', primary: true }],
    features: ['chat', 'compare'], keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'deepseek', group: 'ai', label: 'DeepSeek', kind: 'openai', chat: true,
    baseUrl: 'https://api.deepseek.com/v1',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'sk-…', envVar: 'DEEPSEEK_API_KEY', primary: true }],
    features: ['chat', 'compare'], keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'xai', group: 'ai', label: 'xAI Grok', kind: 'openai', chat: true,
    baseUrl: 'https://api.x.ai/v1',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'xai-…', envVar: 'XAI_API_KEY', primary: true }],
    features: ['chat', 'compare'], keyUrl: 'https://console.x.ai',
  },
  {
    id: 'mistral', group: 'ai', label: 'Mistral', kind: 'openai', chat: true,
    baseUrl: 'https://api.mistral.ai/v1',
    fields: [{ name: 'API_KEY', label: 'API key', hint: '…', envVar: 'MISTRAL_API_KEY', primary: true }],
    features: ['chat', 'compare'], keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'cloudflare', group: 'ai', label: 'Cloudflare Workers AI', kind: 'cloudflare', chat: true,
    baseUrl: 'https://api.cloudflare.com/client/v4',
    fields: [
      { name: 'API_TOKEN', label: 'API token', envVar: 'CLOUDFLARE_API_TOKEN', primary: true },
      { name: 'ACCOUNT_ID', label: 'Account ID', envVar: 'CLOUDFLARE_ACCOUNT_ID' },
    ],
    features: ['chat'], keyUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    note: 'Inference only — this app never stores application data in a Cloudflare database.',
  },
  {
    id: 'litellm', group: 'ai', label: 'LiteLLM gateway', kind: 'openai', chat: true,
    baseUrl: null, requiresBaseUrl: true,
    fields: [{ name: 'API_KEY', label: 'Virtual key', hint: 'sk-… from /key/generate', envVar: 'LITELLM_VIRTUAL_KEY', primary: true, optional: true }],
    features: ['chat', 'compare'],
    note: 'Point the endpoint at your LiteLLM proxy (https://host/v1). Use a LiteLLM virtual key, never the master key.',
  },
  {
    id: 'openai_compatible', group: 'ai', label: 'OpenAI-compatible endpoint', kind: 'openai', chat: true,
    baseUrl: null, requiresBaseUrl: true,
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'optional for local servers', optional: true, primary: true }],
    features: ['chat', 'compare'],
    note: 'Any /v1 endpoint that speaks the OpenAI schema — vLLM, llama.cpp, LM Studio, LiteLLM…',
  },
  {
    id: 'ollama', group: 'ai', label: 'Ollama', kind: 'openai', chat: true,
    baseUrl: null, requiresBaseUrl: true,
    fields: [{ name: 'API_KEY', label: 'Bearer token', optional: true, primary: true }],
    features: ['chat'],
    note: 'Requires a publicly reachable Ollama URL — the server calls it from the cloud, not from your laptop.',
  },
  {
    id: 'vllm', group: 'ai', label: 'vLLM', kind: 'openai', chat: true,
    baseUrl: null, requiresBaseUrl: true,
    fields: [{ name: 'API_KEY', label: 'API key', optional: true, primary: true }],
    features: ['chat'],
  },
  {
    id: 'llamacpp', group: 'ai', label: 'llama.cpp server', kind: 'openai', chat: true,
    baseUrl: null, requiresBaseUrl: true,
    fields: [{ name: 'API_KEY', label: 'API key', optional: true, primary: true }],
    features: ['chat'],
  },
  {
    id: 'tavily', group: 'search', label: 'Tavily', kind: 'tavily',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'tvly-…', envVar: 'TAVILY_API_KEY', primary: true }],
    features: ['search'], keyUrl: 'https://app.tavily.com/home',
    note: 'Search results and a short synthesised answer, injected into the prompt.',
  },
  {
    id: 'exa', group: 'search', label: 'Exa', kind: 'exa',
    fields: [{ name: 'API_KEY', label: 'API key', envVar: 'EXA_API_KEY', primary: true }],
    features: ['search'], keyUrl: 'https://dashboard.exa.ai/api-keys',
    note: 'Semantic discovery — finds pages by meaning rather than keywords.',
  },
  {
    id: 'google_search', group: 'search', label: 'Google Programmable Search', kind: 'google_search',
    fields: [
      { name: 'API_KEY', label: 'API key', envVar: 'GOOGLE_SEARCH_API_KEY', primary: true },
      { name: 'ENGINE_ID', label: 'Search Engine ID (cx)', envVar: 'GOOGLE_SEARCH_ENGINE_ID' },
    ],
    features: ['search'], keyUrl: 'https://programmablesearchengine.google.com/controlpanel/all',
  },
  {
    id: 'firecrawl', group: 'search', label: 'Firecrawl', kind: 'firecrawl',
    fields: [{ name: 'API_KEY', label: 'API key', hint: 'fc-…', envVar: 'FIRECRAWL_API_KEY', primary: true }],
    features: ['crawl'], keyUrl: 'https://www.firecrawl.dev/app/api-keys',
    note: 'Crawls a URL and returns clean markdown for the model.',
  },
  {
    id: 'telegram', group: 'integration', label: 'Telegram Bot', kind: 'telegram',
    fields: [
      { name: 'BOT_TOKEN', label: 'Bot token', hint: '123456:ABC…', envVar: 'TELEGRAM_BOT_TOKEN', primary: true },
      { name: 'CHAT_ID', label: 'Default chat ID', optional: true },
    ],
    features: ['notify'], keyUrl: 'https://t.me/BotFather',
  },
  {
    id: 'elevenlabs', group: 'integration', label: 'ElevenLabs', kind: 'elevenlabs',
    fields: [
      { name: 'API_KEY', label: 'API key', envVar: 'ELEVENLABS_API_KEY', primary: true },
      { name: 'VOICE_ID', label: 'Voice ID', optional: true },
    ],
    features: ['tts'], keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
];

const BY_ID = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export const getProvider = (id) => BY_ID.get(String(id || '')) || null;

/** Public projection of the catalogue — no secrets, no base-URL guessing. */
export const publicCatalogue = () => PROVIDERS.map(({
  id, group, label, features, fields, keyUrl, note,
}) => ({
  id,
  group,
  label,
  features,
  keyUrl: keyUrl || null,
  note: note || null,
  fields: fields.map(({ name, label: fieldLabel, hint, optional }) => ({
    name, label: fieldLabel, hint: hint || '', optional: Boolean(optional),
  })),
}));

export class ProviderError extends Error {
  constructor(message, status = 0, code = 'provider_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Never let a credential reach a log, an error message or the browser. */
export function sanitize(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret && secret.length > 6) out = out.split(secret).join('[redacted]');
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 400);
}

// ------------------------------------------------------------ credentials

export async function sealCredentials(encryptionKey, fields) {
  if (!cryptoReady(encryptionKey)) throw new ProviderError('APP_ENCRYPTION_KEY is not configured', 500, 'setup');
  return sealFields(encryptionKey, fields);
}

export async function openCredentials(encryptionKey, cipher) {
  return openFields(encryptionKey, cipher);
}

export function hintFor(def, creds) {
  const primary = def.fields.find((field) => field.primary && creds[field.name]);
  return primary ? maskValue(creds[primary.name]) : '';
}

export function envFields(def, env = {}) {
  const out = {};
  for (const field of def.fields) {
    if (!field.envVar) continue;
    const value = String(env[field.envVar] || '').trim();
    if (value) out[field.name] = value;
  }
  return out;
}

export async function resolveCredentials(account, def, encryptionKey, env = {}) {
  if (account?.secret_cipher) {
    const creds = await openCredentials(encryptionKey, account.secret_cipher);
    if (Object.keys(creds).length) return { creds, source: 'app' };
  }
  const fromEnv = envFields(def, env);
  if (Object.keys(fromEnv).length) return { creds: fromEnv, source: 'environment' };
  return { creds: {}, source: 'none' };
}

export function isReady(def, creds) {
  return def.fields.filter((field) => !field.optional).every((field) => Boolean(creds[field.name]));
}

export function primaryValue(def, creds) {
  const primary = def.fields.find((field) => field.primary && creds[field.name] && creds[field.name].trim());
  return primary ? creds[primary.name].trim() : '';
}

export const allSecretValues = (creds) => Object.values(creds || {}).filter((value) => typeof value === 'string' && value.length > 0);

// -------------------------------------------------------------- transport

async function call(url, { timeout = 20000, headers = {}, body, method = 'GET' } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    throw new ProviderError(/abort|timeout/i.test(message) ? 'The provider timed out' : `Could not reach the provider (${message})`, 0, 'network');
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { ok: res.ok, status: res.status, json, text };
}

function errorMessage(result) {
  const fromJson = result.json?.error?.message || result.json?.message || result.json?.error
    || result.json?.errors?.[0]?.message || result.json?.detail;
  const raw = typeof fromJson === 'string' ? fromJson : (result.text || `HTTP ${result.status}`);
  return `${result.status}: ${raw}`.slice(0, 300);
}

function authHeader(def, creds) {
  const key = primaryValue(def, creds);
  if (def.kind === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (def.kind === 'gemini') return {};
  if (def.kind === 'exa') return { 'x-api-key': key };
  if (def.kind === 'tavily') return {};
  return key ? { Authorization: `Bearer ${key}` } : {};
}

const BLOCKED_HOSTS = ['metadata.google.internal', 'metadata.goog', 'instance-data'];

/**
 * Guards an administrator-supplied upstream base URL: http(s) only, cloud
 * metadata addresses always refused. Loopback and private ranges stay allowed
 * because self-hosted Ollama, vLLM and LiteLLM live there and only an admin can
 * set a base URL.
 */
export function assertUpstreamAllowed(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new ProviderError('That endpoint is not a valid URL', 400, 'config'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProviderError('Only http and https endpoints are supported', 400, 'config');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.includes(host) || (host.startsWith('metadata.') && host.endsWith('.internal'))) {
    throw new ProviderError('Cloud metadata addresses are blocked', 400, 'config');
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const first = Number(v4[1]);
    const second = Number(v4[2]);
    if (first === 169 && second === 254) throw new ProviderError('Link-local and metadata addresses are blocked', 400, 'config');
    if (first === 0) throw new ProviderError('That address is not routable', 400, 'config');
  }
  if (host === 'fd00:ec2::254') throw new ProviderError('Cloud metadata addresses are blocked', 400, 'config');
  return url.toString();
}

function baseFor(def, baseUrl) {
  const base = String(baseUrl || def.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new ProviderError('A base URL is required for this provider', 400, 'config');
  assertUpstreamAllowed(base);
  return base;
}

// -------------------------------------------------------------- discovery

export async function listModels(def, creds, baseUrl) {
  if (def.kind === 'openai') {
    const res = await call(`${baseFor(def, baseUrl)}/models`, { headers: authHeader(def, creds) });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const list = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json?.models) ? res.json.models : [];
    return list.map((model) => (typeof model === 'string' ? model : model.id || model.name)).filter(Boolean).sort();
  }
  if (def.kind === 'anthropic') {
    const res = await call(`${baseFor(def, baseUrl)}/models?limit=100`, { headers: authHeader(def, creds) });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    return (res.json?.data || []).map((model) => model.id).filter(Boolean);
  }
  if (def.kind === 'gemini') {
    const res = await call(`${baseFor(def, baseUrl)}/models?key=${encodeURIComponent(primaryValue(def, creds))}`, {});
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    return (res.json?.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map((model) => String(model.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }
  if (def.kind === 'cloudflare') {
    const account = String(creds.ACCOUNT_ID || '').trim();
    if (!account) throw new ProviderError('Cloudflare account ID is missing', 400, 'config');
    const res = await call(`${baseFor(def, baseUrl)}/accounts/${encodeURIComponent(account)}/ai/models/search?per_page=100`, { headers: authHeader(def, creds) });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    return (res.json?.result || [])
      .filter((model) => /text generation/i.test(model?.task?.name || ''))
      .map((model) => model.name)
      .filter(Boolean)
      .sort();
  }
  throw new ProviderError('This provider has no model catalogue', 400, 'unsupported');
}

// ------------------------------------------------------------------- chat

async function* readSseText(body, extract) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try { json = JSON.parse(payload); } catch { continue; }
        const delta = extract(json);
        if (delta) yield delta;
      }
    }
  }
}

export async function openChatStream({ def, creds, baseUrl, model, messages, system, temperature, maxTokens }) {
  if (!model) throw new ProviderError('No model selected for this provider', 400, 'config');
  const limit = Math.min(Math.max(maxTokens || 2048, 64), 8192);
  const temp = typeof temperature === 'number' ? Math.min(Math.max(temperature, 0), 2) : undefined;
  const base = baseFor(def, baseUrl);

  let url = '';
  let body = {};
  let headers = { Accept: 'text/event-stream', ...authHeader(def, creds) };
  let extract = () => '';

  if (def.kind === 'openai') {
    url = `${base}/chat/completions`;
    body = {
      model,
      stream: true,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      max_tokens: limit,
      ...(temp !== undefined ? { temperature: temp } : {}),
    };
    extract = (json) => json?.choices?.[0]?.delta?.content || '';
  } else if (def.kind === 'anthropic') {
    url = `${base}/messages`;
    body = {
      model,
      stream: true,
      max_tokens: limit,
      ...(system ? { system } : {}),
      ...(temp !== undefined ? { temperature: temp } : {}),
      messages,
    };
    extract = (json) => (json?.type === 'content_block_delta' ? json?.delta?.text || '' : '');
  } else if (def.kind === 'gemini') {
    url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(primaryValue(def, creds))}`;
    headers = { Accept: 'text/event-stream' };
    body = {
      contents: messages.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { maxOutputTokens: limit, ...(temp !== undefined ? { temperature: temp } : {}) },
    };
    extract = (json) => (json?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('');
  } else {
    // No SSE surface: the caller sends the finished reply in one frame.
    return null;
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    throw new ProviderError(/abort|timeout/i.test(message) ? 'The provider timed out' : `Could not reach the provider (${message})`, 0, 'network');
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new ProviderError(`${res.status}: ${(text || 'stream request failed').slice(0, 300)}`, res.status);
  }

  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const delta of readSseText(res.body, extract)) {
          if (controller.desiredSize !== null && controller.desiredSize <= 0) continue;
          controller.enqueue(encoder.encode(delta));
        }
      } catch {
        // A truncated upstream stream ends here; the caller decides what to show.
      } finally {
        controller.close();
      }
    },
    cancel() {
      res.body?.cancel?.().catch(() => {});
    },
  });
}

export async function chatComplete({ def, creds, baseUrl, model, messages, system, temperature, maxTokens }) {
  if (!model) throw new ProviderError('No model selected for this provider', 400, 'config');
  const limit = Math.min(Math.max(maxTokens || 2048, 64), 8192);
  const temp = typeof temperature === 'number' ? Math.min(Math.max(temperature, 0), 2) : undefined;

  if (def.kind === 'anthropic') {
    const res = await call(`${baseFor(def, baseUrl)}/messages`, {
      method: 'POST', headers: authHeader(def, creds), timeout: 90000,
      body: { model, max_tokens: limit, ...(system ? { system } : {}), ...(temp !== undefined ? { temperature: temp } : {}), messages },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const content = (res.json?.content || []).map((part) => part?.text || '').join('').trim();
    return { content, tokens: (res.json?.usage?.input_tokens || 0) + (res.json?.usage?.output_tokens || 0) };
  }

  if (def.kind === 'gemini') {
    const res = await call(`${baseFor(def, baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(primaryValue(def, creds))}`, {
      method: 'POST', timeout: 90000,
      body: {
        contents: messages.map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: limit, ...(temp !== undefined ? { temperature: temp } : {}) },
      },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const content = (res.json?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || '').join('').trim();
    return { content, tokens: res.json?.usageMetadata?.totalTokenCount || 0 };
  }

  if (def.kind === 'cloudflare') {
    const account = String(creds.ACCOUNT_ID || '').trim();
    if (!account) throw new ProviderError('Cloudflare account ID is missing', 400, 'config');
    const res = await call(`${baseFor(def, baseUrl)}/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
      method: 'POST', headers: authHeader(def, creds), timeout: 90000,
      body: { messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: limit },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const result = res.json?.result;
    const content = typeof result === 'string' ? result : result?.response || result?.choices?.[0]?.message?.content || '';
    return { content: String(content).trim(), tokens: 0 };
  }

  const res = await call(`${baseFor(def, baseUrl)}/chat/completions`, {
    method: 'POST', headers: authHeader(def, creds), timeout: 90000,
    body: {
      model,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      max_tokens: limit,
      ...(temp !== undefined ? { temperature: temp } : {}),
    },
  });
  if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
  const content = res.json?.choices?.[0]?.message?.content || '';
  const flat = Array.isArray(content) ? content.map((part) => part?.text || '').join('') : content;
  return { content: String(flat).trim(), tokens: res.json?.usage?.total_tokens || 0 };
}

// ------------------------------------------------------------------ tools

export async function searchWeb(def, creds, query) {
  const q = String(query || '').slice(0, 400);

  if (def.kind === 'tavily') {
    const res = await call('https://api.tavily.com/search', {
      method: 'POST', timeout: 25000,
      body: { api_key: primaryValue(def, creds), query: q, search_depth: 'basic', max_results: 5, include_answer: true },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const hits = (res.json?.results || []).map((row) => ({ title: row.title || row.url, url: row.url, snippet: row.content || '' }));
    return { hits, answer: res.json?.answer || '' };
  }

  if (def.kind === 'exa') {
    const res = await call('https://api.exa.ai/search', {
      method: 'POST', headers: authHeader(def, creds), timeout: 25000,
      body: { query: q, numResults: 5, contents: { text: { maxCharacters: 700 } } },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const hits = (res.json?.results || []).map((row) => ({
      title: row.title || row.url,
      url: row.url,
      snippet: String(row.text || row.summary || '').slice(0, 700),
    }));
    return { hits, answer: '' };
  }

  if (def.kind === 'google_search') {
    const key = creds.API_KEY || '';
    const cx = creds.ENGINE_ID || '';
    if (!key || !cx) throw new ProviderError('Google Search needs both an API key and a search engine ID', 400, 'config');
    const res = await call(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&num=5&q=${encodeURIComponent(q)}`, { timeout: 20000 });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const hits = (res.json?.items || []).map((row) => ({ title: row.title, url: row.link, snippet: row.snippet || '' }));
    return { hits, answer: '' };
  }

  throw new ProviderError('This provider does not offer web search', 400, 'unsupported');
}

export async function crawlUrl(def, creds, url) {
  if (def.kind !== 'firecrawl') throw new ProviderError('Firecrawl is required for crawling', 400, 'unsupported');
  if (!/^https?:\/\//i.test(String(url))) throw new ProviderError('Only http(s) URLs can be crawled', 400, 'invalid');
  const res = await call('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST', headers: authHeader(def, creds), timeout: 45000,
    body: { url, formats: ['markdown'], onlyMainContent: true },
  });
  if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
  return String(res.json?.data?.markdown || '').slice(0, 12000);
}

export async function testCredential(def, creds, baseUrl) {
  try {
    if (def.group === 'ai') {
      if (def.authPath) {
        const probe = await call(`${baseFor(def, baseUrl)}${def.authPath}`, { headers: authHeader(def, creds) });
        if (!probe.ok) return { ok: false, detail: errorMessage(probe) };
      }
      const models = await listModels(def, creds, baseUrl);
      return { ok: true, detail: `${models.length} models available`, models };
    }
    if (def.kind === 'telegram') {
      const token = String(creds.BOT_TOKEN || '').trim();
      if (!token) return { ok: false, detail: 'Bot token is missing' };
      const res = await call(`https://api.telegram.org/bot${token}/getMe`, { timeout: 12000 });
      if (!res.ok || res.json?.ok === false) return { ok: false, detail: errorMessage(res) };
      return { ok: true, detail: `Bot @${res.json?.result?.username || 'connected'}` };
    }
    if (def.kind === 'elevenlabs') {
      const key = String(creds.API_KEY || '').trim();
      if (!key) return { ok: false, detail: 'API key is missing' };
      const res = await call('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key }, timeout: 15000 });
      if (!res.ok) return { ok: false, detail: errorMessage(res) };
      return { ok: true, detail: 'Voice synthesis reachable' };
    }
    if (def.kind === 'firecrawl') {
      const markdown = await crawlUrl(def, creds, 'https://example.com');
      return { ok: markdown.length > 0, detail: markdown.length ? 'Scrape succeeded' : 'Empty response' };
    }
    const { hits } = await searchWeb(def, creds, 'YOUSIVAR connectivity test');
    return { ok: true, detail: `${hits.length} results returned` };
  } catch (error) {
    return { ok: false, detail: sanitize(error.message, allSecretValues(creds)) };
  }
}