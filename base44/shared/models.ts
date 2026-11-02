// Single source of truth for the models this workspace may route to.
// Keys are passed verbatim to the platform's LLM integration; capability flags
// mirror what the integration actually supports today.

export const MODEL_REGISTRY = {
  automatic: {
    label: 'Auto routing',
    provider: 'Base44 AI Gateway',
    description: 'Routes each request to a suitable model. Supports files and web search.',
    context_window: 128000,
    supports_vision: true,
    supports_web_search: true,
    supports_documents: true,
  },
  gemini_3_8_flash: {
    label: 'Gemini 3.8 Flash',
    provider: 'Google',
    description: 'Fast, long-context model with live web grounding.',
    context_window: 1000000,
    supports_vision: true,
    supports_web_search: true,
    supports_documents: true,
  },
  gpt_6_luna: {
    label: 'GPT-6 Luna',
    provider: 'OpenAI',
    description: 'Balanced reasoning and writing.',
    context_window: 400000,
    supports_vision: true,
    supports_web_search: false,
    supports_documents: true,
  },
  gpt_6_sol: {
    label: 'GPT-6 Sol',
    provider: 'OpenAI',
    description: 'Deliberate reasoning for hard, multi-step problems.',
    context_window: 400000,
    supports_vision: true,
    supports_web_search: false,
    supports_documents: true,
  },
  'claude-sonnet-5': {
    label: 'Claude Sonnet 5',
    provider: 'Anthropic',
    description: 'Careful long-form writing and code.',
    context_window: 200000,
    supports_vision: true,
    supports_web_search: false,
    supports_documents: true,
  },
  claude_opus_5_5: {
    label: 'Claude Opus 5.5',
    provider: 'Anthropic',
    description: 'Highest-quality reasoning in the Anthropic family.',
    context_window: 200000,
    supports_vision: true,
    supports_web_search: false,
    supports_documents: true,
  },
  base1_5_1: {
    label: 'Base 1.5.1',
    provider: 'Base44',
    description: 'In-house model, fast general purpose answers.',
    context_window: 128000,
    supports_vision: true,
    supports_web_search: false,
    supports_documents: true,
  },
  glm_5_2: {
    label: 'GLM 5.2',
    provider: 'Zhipu',
    description: 'Lightweight text-only model.',
    context_window: 128000,
    supports_vision: false,
    supports_web_search: false,
    supports_documents: false,
  },
};

export const DEFAULT_MODEL = 'automatic';
export const MAX_MESSAGES = 40;
export const MAX_MESSAGE_CHARS = 8000;
export const MAX_TOTAL_CHARS = 30000;
export const MAX_MEMORY_ITEMS = 20;
export const MAX_DOCUMENTS = 4;

export function modelCaps(key) {
  return MODEL_REGISTRY[key] || MODEL_REGISTRY[DEFAULT_MODEL];
}

export function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: String((m && m.content) || '').slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((m) => m.content.trim().length > 0);
}

export function totalChars(messages) {
  return messages.reduce((n, m) => n + m.content.length, 0);
}

// Only app-owned storage URIs are accepted — never arbitrary caller URLs (SSRF).
export function safeDocumentUris(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((u) => typeof u === 'string' && u.length > 0 && u.length <= 512)
    .filter((u) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && !u.includes('..'))
    .slice(0, MAX_DOCUMENTS);
}

export function buildPrompt({ messages, memories, documentNames, language }) {
  const system = [
    'You are YOUSIVAR, a precise, calm AI assistant inside a private multi-model workspace.',
    language === 'ar'
      ? 'Answer in Modern Standard Arabic unless the user writes in another language.'
      : 'Answer in the language the user writes in.',
    'Use markdown: short paragraphs, lists, and fenced code blocks tagged with a language.',
    'Never invent citations. If something is uncertain, say so plainly.',
  ];

  if (memories && memories.length) {
    system.push(
      'User-approved memory (facts the user explicitly chose to keep):\n' +
        memories.map((m) => '- ' + m).join('\n'),
    );
  }

  if (documentNames && documentNames.length) {
    system.push(
      'The user attached these documents: ' + documentNames.join(', ') +
        '. Ground document claims in their content and name the document you used.',
    );
  }

  const transcript = messages
    .map((m) => (m.role === 'assistant' ? 'ASSISTANT: ' : 'USER: ') + m.content)
    .join('\n\n');

  return `[SYSTEM]\n${system.join('\n')}\n\n[CONVERSATION]\n${transcript}\n\nRespond as ASSISTANT to the final USER message.`;
}