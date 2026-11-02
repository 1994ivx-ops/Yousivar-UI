const SEARCH_SERVICES = ['tavily', 'exa', 'google_search', 'firecrawl'];

/**
 * The capability list is derived from what this workspace can actually do right
 * now: connected providers, the selected model's real flags, and the toggles the
 * engine honours. Nothing here is decorative.
 */
export function buildFeatures({ t, caps, services, thinkTarget, state, actions }) {
  const searchReady = SEARCH_SERVICES.some((id) => services.includes(id));
  const mediaReady = services.includes('elevenlabs');

  return [
    {
      id: 'web', category: 'retrieval', icon: 'globe',
      label: t('webSearchTool'), hint: t('webSearchToolHint'),
      available: searchReady, enabled: state.webSearch,
      onChange: actions.setWebSearch, note: searchReady ? null : t('webSearchNeeds'),
    },
    {
      id: 'think', category: 'retrieval', icon: 'sparkles',
      label: t('thinkTool'), hint: t('thinkToolHint'),
      available: !!thinkTarget, enabled: state.thinkDeeper,
      onChange: actions.setThinkDeeper,
      note: thinkTarget ? `${t('thinkUsing')} ${thinkTarget.label}` : t('thinkNeeds'),
    },
    {
      id: 'documents', category: 'documents', icon: 'file',
      label: t('documentsTool'), hint: t('documentsToolHint'),
      available: !!caps.supports_documents, enabled: !!caps.supports_documents,
      onChange: null, note: caps.supports_documents ? null : t('documentsNeeds'),
    },
    {
      id: 'data', category: 'data', icon: 'database',
      label: t('dataTool'), hint: t('dataToolHint'),
      available: !!caps.supports_documents, enabled: false,
      onChange: null, note: caps.supports_documents ? null : t('documentsNeeds'),
    },
    {
      id: 'memory', category: 'memory', icon: 'brain',
      label: t('memoryTool'), hint: t('memoryToolHint'),
      available: true, enabled: state.memoryOn,
      onChange: actions.setMemoryOn, note: null,
    },
    {
      id: 'dev', category: 'dev', icon: 'code',
      label: t('devTool'), hint: t('devToolHint'),
      available: true, enabled: true, onChange: null, note: null,
    },
    {
      id: 'media', category: 'media', icon: 'image',
      label: t('mediaTool'), hint: t('mediaToolHint'),
      available: mediaReady, enabled: false,
      onChange: null, note: mediaReady ? null : t('mediaNeeds'),
    },
  ];
}

export const FEATURE_CATEGORIES = ['all', 'retrieval', 'documents', 'data', 'dev', 'memory', 'media'];