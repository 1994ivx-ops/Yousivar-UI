/**
 * Chat routing rules, ported unchanged from base44/functions/providerChat.
 *
 * Kept free of database and transport imports so the rules (limits, prompt
 * assembly, candidate order, registry-key mapping) can be unit tested directly.
 */
import { getProvider } from './providers.js';

export const LIMITS = {
  maxMessages: 40,
  maxChars: 30000,
  maxMemory: 20,
  maxMessageChars: 8000,
  chatPerMinute: 40,
};

export function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-LIMITS.maxMessages)
    .map((message) => ({
      role: message && message.role === 'assistant' ? 'assistant' : 'user',
      content: String((message && message.content) || '').slice(0, LIMITS.maxMessageChars),
    }))
    .filter((message) => message.content.trim().length > 0);
}

export function withinCharBudget(messages) {
  return messages.reduce((total, message) => total + message.content.length, 0) <= LIMITS.maxChars;
}

export function buildSystem({ memories = [], documentNames = [], language = 'en', search = null }) {
  const lines = [
    'You are YOUSIVAR, a precise, calm AI assistant inside a private multi-model workspace.',
    language === 'ar'
      ? 'Answer in Modern Standard Arabic unless the user writes in another language.'
      : 'Answer in the language the user writes in.',
    'Use markdown: short paragraphs, lists, and fenced code blocks tagged with a language.',
    'Never invent citations. If something is uncertain, say so plainly.',
  ];
  if (memories.length) {
    lines.push(`User-approved memory:\n${memories.map((entry) => `- ${entry}`).join('\n')}`);
  }
  if (documentNames.length) {
    lines.push(`The user attached: ${documentNames.join(', ')}. Ground claims in their content.`);
  }
  if (search) {
    const rows = search.hits.map((hit, index) => `[${index + 1}] ${hit.title} — ${hit.url}\n${hit.snippet}`).join('\n\n');
    lines.push(
      `Live web results from ${search.provider} for this message. Cite them by number when you use them:\n${rows}`
        + (search.answer ? `\n\nProvider summary: ${search.answer}` : ''),
    );
  }
  return lines.join('\n\n');
}

export const cleanMemories = (raw) => (Array.isArray(raw)
  ? raw.slice(0, LIMITS.maxMemory).map((entry) => String(entry || '').trim().slice(0, 300)).filter(Boolean)
  : []);

export const cleanDocumentNames = (raw) => (Array.isArray(raw)
  ? raw.slice(0, 4).map((name) => String(name || '').slice(0, 120))
  : []);

/**
 * Candidate accounts for a request: the requested service first, then the rest
 * of the enabled chat chain so a dead provider falls back instead of failing.
 */
export function pickCandidates(rows, serviceId) {
  const usable = (rows || []).filter((account) => account.enabled !== false);
  const sameService = usable.filter((account) => account.service === serviceId);
  const rest = usable.filter((account) => account.service !== serviceId
    && getProvider(account.service)?.chat
    && (account.default_model || (account.models_cache || []).length));
  return [...sameService, ...rest].slice(0, 3);
}

/** The requested service keeps the requested model; a fallback uses its own default. */
export function modelForCandidate(account, serviceId, modelId) {
  if (account.service === serviceId) return modelId;
  return account.default_model || (account.models_cache || [])[0] || '';
}

/** First enabled search account whose required fields are filled. */
export function pickSearchAccount(rows, isReady) {
  for (const account of rows || []) {
    if (account.enabled === false) continue;
    const def = getProvider(account.service);
    if (!def || def.group !== 'search') continue;
    if (isReady(def, account)) return { def, account };
  }
  return null;
}

/**
 * Registry keys (ai_models.key) come from the Base44 gateway catalogue and have
 * no "::" service. Map them onto real providers by their declared provider name;
 * an unmapped key returns null so the API can say so instead of silently
 * swapping in a different model.
 */
const PROVIDER_TO_SERVICES = {
  openai: ['openai_compatible', 'openrouter', 'litellm', 'groq', 'deepseek', 'xai', 'mistral'],
  anthropic: ['anthropic', 'openrouter', 'litellm'],
  google: ['gemini', 'openrouter', 'litellm'],
  zhipu: ['openrouter', 'litellm'],
  mistral: ['mistral', 'openrouter', 'litellm'],
  groq: ['groq', 'openrouter', 'litellm'],
};

export function servicesForRegistryModel(modelRow) {
  if (!modelRow) return [];
  const provider = String(modelRow.provider || '').toLowerCase();
  const direct = PROVIDER_TO_SERVICES[provider];
  if (direct) return direct;
  const key = String(modelRow.key || '').toLowerCase();
  if (key.startsWith('claude')) return ['anthropic', 'openrouter', 'litellm'];
  if (key.startsWith('gemini')) return ['gemini', 'openrouter', 'litellm'];
  if (key.startsWith('gpt') || key.startsWith('o1') || key.startsWith('o3')) return ['openai_compatible', 'openrouter', 'litellm'];
  if (key.startsWith('glm')) return ['openrouter', 'litellm'];
  return [];
}

/**
 * Resolves the model a client asked for into `{ serviceId, modelId, candidates }`.
 * Returns `{ error }` when nothing can serve it — never a silent substitution.
 */
export function resolveRoute({ modelKey, modelRow, rows }) {
  const raw = String(modelKey || '').trim();
  if (!raw) return { error: 'A model is required' };

  if (raw.includes('::')) {
    const [serviceId, modelId] = raw.split('::');
    const def = getProvider(serviceId);
    if (!def || !def.chat) return { error: `Unknown provider: ${serviceId}` };
    if (!modelId) return { error: 'A model id is required after "::"' };
    return { serviceId, modelId, candidates: pickCandidates(rows, serviceId) };
  }

  const chatAccounts = (rows || []).filter((account) => account.enabled !== false
    && getProvider(account.service)?.chat
    && (account.default_model || (account.models_cache || []).length));

  if (raw === 'automatic') {
    if (!chatAccounts.length) return { error: 'No chat provider is configured yet. Add one in Providers.' };
    const first = chatAccounts[0];
    const def = getProvider(first.service);
    return {
      serviceId: first.service,
      modelId: first.default_model || (first.models_cache || [])[0],
      candidates: pickCandidates(rows, first.service),
      label: def?.label,
    };
  }

  // An explicit "<service>/<model>" spelling is accepted too.
  const directService = getProvider(raw.split('/')[0]);
  if (directService?.chat && raw.includes('/')) {
    const [, ...rest] = raw.split('/');
    return { serviceId: directService.id, modelId: rest.join('/'), candidates: pickCandidates(rows, directService.id) };
  }

  for (const serviceId of servicesForRegistryModel(modelRow)) {
    const match = chatAccounts.find((account) => account.service === serviceId);
    if (!match) continue;
    const def = getProvider(serviceId);
    return {
      serviceId,
      modelId: match.default_model || raw,
      candidates: pickCandidates(rows, serviceId),
      label: def?.label,
      mappedFrom: raw,
    };
  }

  return { error: `No configured provider can serve "${raw}". Add its API key in Providers.` };
}