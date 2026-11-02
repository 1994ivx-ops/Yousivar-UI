/**
 * Provider catalogue + real HTTP adapters, shared by the credential, chat and
 * tool functions.
 *
 * Secrets model — three distinct classes, never mixed:
 *  1. Deployment secrets (Deno.env) — the encryption key and any provider key the
 *     owner prefers to inject through the platform Secrets page.
 *  2. Application secrets — provider keys saved from the Providers screen, sealed
 *     with AES-256-GCM before they touch the database and never returned.
 *  3. Public configuration — provider ids, labels, base URLs, masks.
 */

export type ProviderGroup = 'ai' | 'search' | 'integration';

export type ProviderKind =
  | 'openai' | 'anthropic' | 'gemini' | 'cloudflare'
  | 'tavily' | 'exa' | 'google_search' | 'firecrawl' | 'telegram' | 'elevenlabs';

export type ProviderField = {
  name: string;
  label: string;
  hint?: string;
  envVar?: string;
  optional?: boolean;
  primary?: boolean;
};

export type ProviderDef = {
  id: string;
  group: ProviderGroup;
  label: string;
  kind: ProviderKind;
  baseUrl?: string | null;
  requiresBaseUrl?: boolean;
  chat?: boolean;
  /** Key-scoped endpoint that proves the credential, for providers with a public model list. */
  authPath?: string;
  recommended?: string;
  fields: ProviderField[];
  features: string[];
  keyUrl?: string;
  note?: string;
};

export const PROVIDERS: ProviderDef[] = [
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
    note: 'Runs on Cloudflare infrastructure; no Cloudflare storage is provisioned by this app.',
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

const BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

export const getProvider = (id: string): ProviderDef | null => BY_ID.get(id) || null;

export const MASK = '••••';

export function maskValue(value: string): string {
  if (!value) return '';
  const tail = value.length <= 4 ? value.slice(-1) : value.slice(-4);
  return `${MASK}${tail}`;
}

/** Never let a credential reach a log, an error message or the browser. */
export function sanitize(text: unknown, secrets: string[]): string {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret && secret.length > 6) out = out.split(secret).join('[redacted]');
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 400);
}

// ---------------------------------------------------------------- encryption

const HEX = /^[0-9a-f]+$/i;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function keyBytes(): Uint8Array | null {
  const raw = (Deno.env.get('APP_ENCRYPTION_KEY') || '').trim();
  if (!raw) return null;
  let bytes: Uint8Array;
  if (HEX.test(raw) && raw.length === 64) bytes = hexToBytes(raw);
  else {
    try { bytes = b64ToBytes(raw); } catch { return null; }
  }
  return bytes.length === 32 ? bytes : null;
}

export function cryptoReady(): boolean {
  return keyBytes() !== null;
}

async function aesKey(): Promise<CryptoKey | null> {
  const bytes = keyBytes();
  if (!bytes) return null;
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export class SetupError extends Error {
  code = 'setup';
}

export async function sealFields(fields: Record<string, string>): Promise<string> {
  const key = await aesKey();
  if (!key) throw new SetupError('Server encryption key is not configured');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(fields));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return `${bytesToB64(iv)}.${bytesToB64(sealed)}`;
}

export async function openFields(cipher: string): Promise<Record<string, string>> {
  const key = await aesKey();
  if (!key || !cipher || !cipher.includes('.')) return {};
  const [ivPart, dataPart] = cipher.split('.');
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(ivPart) },
      key,
      b64ToBytes(dataPart),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Deployment secrets always win nothing — but they are always available as a source. */
export function envFields(def: ProviderDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of def.fields) {
    if (!field.envVar) continue;
    const value = (Deno.env.get(field.envVar) || '').trim();
    if (value) out[field.name] = value;
  }
  return out;
}

export type Resolved = { creds: Record<string, string>; source: 'app' | 'environment' | 'none' };

export async function resolveCredentials(account: { secret_cipher?: string } | null, def: ProviderDef): Promise<Resolved> {
  if (account?.secret_cipher) {
    const creds = await openFields(account.secret_cipher);
    if (Object.keys(creds).length) return { creds, source: 'app' };
  }
  const env = envFields(def);
  if (Object.keys(env).length) return { creds: env, source: 'environment' };
  return { creds: {}, source: 'none' };
}

export function primaryValue(def: ProviderDef, creds: Record<string, string>): string {
  const primary = def.fields.find((f) => f.primary && creds[f.name] && creds[f.name].trim());
  return primary ? creds[primary.name].trim() : '';
}

export function allSecretValues(creds: Record<string, string>): string[] {
  return Object.values(creds).filter((v) => typeof v === 'string' && v.length > 0);
}

// ---------------------------------------------------------------- transport

export class ProviderError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 0, code = 'provider_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type CallOptions = { timeout?: number; headers?: Record<string, string>; body?: unknown; method?: string };

async function call(url: string, { timeout = 20000, headers = {}, body, method = 'GET' }: CallOptions) {
  let res: Response;
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
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { ok: res.ok, status: res.status, json, text };
}

function errorMessage(result: { status: number; json: any; text: string }): string {
  const fromJson = result.json?.error?.message || result.json?.message || result.json?.error
    || result.json?.errors?.[0]?.message || result.json?.detail;
  const raw = typeof fromJson === 'string' ? fromJson : (result.text || `HTTP ${result.status}`);
  return `${result.status}: ${raw}`.slice(0, 300);
}

function authHeader(def: ProviderDef, creds: Record<string, string>): Record<string, string> {
  const key = primaryValue(def, creds);
  if (def.kind === 'anthropic') {
    return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  }
  if (def.kind === 'gemini') return {};
  if (def.kind === 'exa') return { 'x-api-key': key };
  if (def.kind === 'tavily') return {};
  return key ? { Authorization: `Bearer ${key}` } : {};
}

const BLOCKED_HOSTS = ['metadata.google.internal', 'metadata.goog', 'instance-data'];

/**
 * Guards an administrator-supplied upstream base URL. Only http(s) is accepted and
 * cloud metadata addresses are always refused, so a crafted endpoint can never turn
 * the backend into a metadata reader. Loopback and private ranges stay available
 * because a base URL can only be set by a workspace admin, and self-hosted Ollama,
 * vLLM and LiteLLM deployments live there by definition.
 */
export function assertUpstreamAllowed(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProviderError('That endpoint is not a valid URL', 400, 'config');
  }
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

function baseFor(def: ProviderDef, baseUrl?: string | null): string {
  const base = (baseUrl || def.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new ProviderError('A base URL is required for this provider', 400, 'config');
  assertUpstreamAllowed(base);
  return base;
}

// ---------------------------------------------------------------- discovery

export async function listModels(
  def: ProviderDef,
  creds: Record<string, string>,
  baseUrl?: string | null,
): Promise<string[]> {
  if (def.kind === 'openai') {
    const res = await call(`${baseFor(def, baseUrl)}/models`, { headers: authHeader(def, creds), timeout: 20000 });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const list = Array.isArray(res.json?.data) ? res.json.data : Array.isArray(res.json?.models) ? res.json.models : [];
    return list.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean).sort();
  }

  if (def.kind === 'anthropic') {
    const res = await call(`${baseFor(def, baseUrl)}/models?limit=100`, { headers: authHeader(def, creds) });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    return (res.json?.data || []).map((m: any) => m.id).filter(Boolean);
  }

  if (def.kind === 'gemini') {
    const res = await call(`${baseFor(def, baseUrl)}/models?key=${encodeURIComponent(primaryValue(def, creds))}`, {});
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    return (res.json?.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }

  if (def.kind === 'cloudflare') {
    const account = (creds.ACCOUNT_ID || '').trim();
    if (!account) throw new ProviderError('Cloudflare account ID is missing', 400, 'config');
    const res = await call(
      `${baseFor(def, baseUrl)}/accounts/${encodeURIComponent(account)}/ai/models/search?per_page=100`,
      { headers: authHeader(def, creds) },
    );
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    return (res.json?.result || [])
      .filter((m: any) => /text generation/i.test(m?.task?.name || ''))
      .map((m: any) => m.name)
      .filter(Boolean)
      .sort();
  }

  throw new ProviderError('This provider has no model catalogue', 400, 'unsupported');
}

// ---------------------------------------------------------------- chat

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatRequest = {
  def: ProviderDef;
  creds: Record<string, string>;
  baseUrl?: string | null;
  model: string;
  messages: ChatMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

export type ChatReply = { content: string; tokens: number };

/** Splits an SSE byte stream into text deltas using a provider-specific extractor. */
async function* readSseText(body: ReadableStream<Uint8Array>, extract: (json: any) => string) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
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
        let json: any;
        try { json = JSON.parse(payload); } catch { continue; }
        const text = extract(json);
        if (text) yield text;
      }
    }
  }
}

/**
 * Opens a real upstream token stream. Returns a stream of plain text deltas, or
 * throws when the provider answers with an error. Providers without an SSE
 * surface return null so the caller can send the finished reply in one frame
 * instead of pretending to stream.
 */
export async function openChatStream(req: ChatRequest): Promise<ReadableStream<Uint8Array> | null> {
  const { def, creds, baseUrl, model, messages, system, temperature, maxTokens } = req;
  if (!model) throw new ProviderError('No model selected for this provider', 400, 'config');
  const limit = Math.min(Math.max(maxTokens || 2048, 64), 8192);
  const temp = typeof temperature === 'number' ? Math.min(Math.max(temperature, 0), 2) : undefined;
  const base = baseFor(def, baseUrl);

  let url = '';
  let body: Record<string, unknown> = {};
  let headers: Record<string, string> = { Accept: 'text/event-stream', ...authHeader(def, creds) };
  let extract: (json: any) => string = () => '';

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
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { maxOutputTokens: limit, ...(temp !== undefined ? { temperature: temp } : {}) },
    };
    extract = (json) => (json?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('');
  } else {
    return null;
  }

  let res: Response;
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

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const delta of readSseText(res.body as ReadableStream<Uint8Array>, extract)) {
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

export async function chatComplete(req: ChatRequest): Promise<ChatReply> {
  const { def, creds, baseUrl, model, messages, system, temperature, maxTokens } = req;
  if (!model) throw new ProviderError('No model selected for this provider', 400, 'config');
  const limit = Math.min(Math.max(maxTokens || 2048, 64), 8192);
  const temp = typeof temperature === 'number' ? Math.min(Math.max(temperature, 0), 2) : undefined;

  if (def.kind === 'anthropic') {
    const res = await call(`${baseFor(def, baseUrl)}/messages`, {
      method: 'POST', headers: authHeader(def, creds), timeout: 90000,
      body: { model, max_tokens: limit, ...(system ? { system } : {}), ...(temp !== undefined ? { temperature: temp } : {}), messages },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const content = (res.json?.content || []).map((part: any) => part?.text || '').join('').trim();
    return { content, tokens: res.json?.usage?.input_tokens + res.json?.usage?.output_tokens || 0 };
  }

  if (def.kind === 'gemini') {
    const res = await call(`${baseFor(def, baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(primaryValue(def, creds))}`, {
      method: 'POST', timeout: 90000,
      body: {
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: limit, ...(temp !== undefined ? { temperature: temp } : {}) },
      },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const content = (res.json?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
    return { content, tokens: res.json?.usageMetadata?.totalTokenCount || 0 };
  }

  if (def.kind === 'cloudflare') {
    const account = (creds.ACCOUNT_ID || '').trim();
    if (!account) throw new ProviderError('Cloudflare account ID is missing', 400, 'config');
    const res = await call(`${baseFor(def, baseUrl)}/accounts/${encodeURIComponent(account)}/ai/run/${model}`, {
      method: 'POST', headers: authHeader(def, creds), timeout: 90000,
      body: { messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages], max_tokens: limit },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const result = res.json?.result;
    const content = typeof result === 'string' ? result
      : result?.response || result?.choices?.[0]?.message?.content || '';
    return { content: String(content).trim(), tokens: 0 };
  }

  // openai-compatible
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
  const flat = Array.isArray(content) ? content.map((p: any) => p?.text || '').join('') : content;
  return { content: String(flat).trim(), tokens: res.json?.usage?.total_tokens || 0 };
}

// ---------------------------------------------------------------- tools

export type SearchHit = { title: string; url: string; snippet: string };

export async function searchWeb(def: ProviderDef, creds: Record<string, string>, query: string): Promise<{ hits: SearchHit[]; answer: string }> {
  const q = query.slice(0, 400);

  if (def.kind === 'tavily') {
    const res = await call('https://api.tavily.com/search', {
      method: 'POST', timeout: 25000,
      body: { api_key: primaryValue(def, creds), query: q, search_depth: 'basic', max_results: 5, include_answer: true },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const hits = (res.json?.results || []).map((r: any) => ({ title: r.title || r.url, url: r.url, snippet: r.content || '' }));
    return { hits, answer: res.json?.answer || '' };
  }

  if (def.kind === 'exa') {
    const res = await call('https://api.exa.ai/search', {
      method: 'POST', headers: authHeader(def, creds), timeout: 25000,
      body: { query: q, numResults: 5, contents: { text: { maxCharacters: 700 } } },
    });
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const hits = (res.json?.results || []).map((r: any) => ({
      title: r.title || r.url,
      url: r.url,
      snippet: (r.text || r.summary || '').slice(0, 700),
    }));
    return { hits, answer: '' };
  }

  if (def.kind === 'google_search') {
    const key = creds.API_KEY || '';
    const cx = creds.ENGINE_ID || '';
    if (!key || !cx) throw new ProviderError('Google Search needs both an API key and a search engine ID', 400, 'config');
    const res = await call(
      `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&num=5&q=${encodeURIComponent(q)}`,
      { timeout: 20000 },
    );
    if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
    const hits = (res.json?.items || []).map((r: any) => ({ title: r.title, url: r.link, snippet: r.snippet || '' }));
    return { hits, answer: '' };
  }

  throw new ProviderError('This provider does not offer web search', 400, 'unsupported');
}

export async function crawlUrl(def: ProviderDef, creds: Record<string, string>, url: string): Promise<string> {
  if (def.kind !== 'firecrawl') throw new ProviderError('Firecrawl is required for crawling', 400, 'unsupported');
  if (!/^https?:\/\//i.test(url)) throw new ProviderError('Only http(s) URLs can be crawled', 400, 'invalid');
  const res = await call('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST', headers: authHeader(def, creds), timeout: 45000,
    body: { url, formats: ['markdown'], onlyMainContent: true },
  });
  if (!res.ok) throw new ProviderError(errorMessage(res), res.status);
  const markdown = res.json?.data?.markdown || '';
  return String(markdown).slice(0, 12000);
}

export async function telegramSend(creds: Record<string, string>, text: string, chatId?: string): Promise<string> {
  const token = (creds.BOT_TOKEN || '').trim();
  const target = (chatId || creds.CHAT_ID || '').trim();
  if (!token) throw new ProviderError('Telegram bot token is missing', 400, 'config');
  if (!target) throw new ProviderError('A Telegram chat ID is required', 400, 'config');
  const res = await call(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', timeout: 15000,
    body: { chat_id: target, text: text.slice(0, 3800), disable_web_page_preview: true },
  });
  if (!res.ok || res.json?.ok === false) throw new ProviderError(errorMessage(res), res.status);
  return String(res.json?.result?.message_id || 'sent');
}

const ELEVEN_VOICE = '21m00Tcm4TlvDq8ikWAM';

export async function elevenLabsSpeech(creds: Record<string, string>, text: string, voiceId?: string): Promise<string> {
  const key = (creds.API_KEY || '').trim();
  if (!key) throw new ProviderError('ElevenLabs API key is missing', 400, 'config');
  const voice = voiceId || creds.VOICE_ID || ELEVEN_VOICE;
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: text.slice(0, 600), model_id: 'eleven_multilingual_v2' }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new ProviderError('Could not reach ElevenLabs', 0, 'network');
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new ProviderError(`${res.status}: ${detail.slice(0, 200)}`, res.status);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${bytesToB64(buffer)}`;
}

/** A cheap authenticated request that proves the credential really works. */
export async function testCredential(def: ProviderDef, creds: Record<string, string>, baseUrl?: string | null): Promise<{ ok: boolean; detail: string; models?: string[] }> {
  try {
    if (def.group === 'ai') {
      // A model catalogue can be public (OpenRouter's is). When the provider exposes a
      // key-scoped endpoint, authenticate against that first so a bad key never reads as connected.
      if (def.authPath) {
        const probe = await call(`${baseFor(def, baseUrl)}${def.authPath}`, { headers: authHeader(def, creds) });
        if (!probe.ok) return { ok: false, detail: errorMessage(probe) };
      }
      const models = await listModels(def, creds, baseUrl);
      return { ok: true, detail: `${models.length} models available`, models };
    }
    if (def.kind === 'telegram') {
      const token = (creds.BOT_TOKEN || '').trim();
      if (!token) return { ok: false, detail: 'Bot token is missing' };
      const res = await call(`https://api.telegram.org/bot${token}/getMe`, { timeout: 12000 });
      if (!res.ok || res.json?.ok === false) return { ok: false, detail: errorMessage(res) };
      return { ok: true, detail: `Bot @${res.json?.result?.username || 'connected'}` };
    }
    if (def.kind === 'elevenlabs') {
      const key = (creds.API_KEY || '').trim();
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
    const err = error as ProviderError;
    const status = err.status || 0;
    return { ok: false, detail: sanitize(err.message, allSecretValues(creds)) };
  }
}

// ---------------------------------------------------------------- abuse control

/**
 * Real rate limit backed by the audit trail: counts this user's completed calls
 * of the same action inside the window.
 */
export async function withinRate(admin: any, userId: string, action: string, limit = 30, windowSeconds = 60): Promise<boolean> {
  const page = await admin.entities.AuditLog.filter(
    { action, created_by_id: userId },
    { sort: '-created_date', limit },
  ).catch(() => ({ items: [] }));
  const items = page.items || page || [];
  const cutoff = Date.now() - windowSeconds * 1000;
  const recent = items.filter((row: any) => new Date(row.created_date).getTime() > cutoff);
  return recent.length < limit;
}