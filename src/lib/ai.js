import { base44 } from '@/api/base44Client';

/** Provider models use "<service>::<model>" so one selector can span vendors. */
export const isProviderModel = (model) => typeof model === 'string' && model.includes('::');

export async function runCompletion({
  model, messages, language, memories, documentUris, documentNames, webSearch, temperature, maxTokens,
}) {
  const provider = isProviderModel(model);
  const res = await base44.functions.invoke(provider ? 'providerChat' : 'chatCompletion', provider
    ? { model, messages, language, memories, documentNames, webSearch, temperature, maxTokens }
    : { model, messages, language, memories, documentUris, documentNames, webSearch });
  const data = res.data || {};
  if (data.error) throw new Error(data.error);
  return data;
}

export async function loadAvailableProviders() {
  try {
    const res = await base44.functions.invoke('providers', { action: 'available' });
    return res.data?.accounts || [];
  } catch {
    return [];
  }
}

/** Models exposed by the admin-configured providers, shaped like registry rows. */
export function rowsFromAccounts(accounts) {
  const rows = [];
  (accounts || []).forEach((account) => {
    const ids = account.models?.length ? account.models : account.default_model ? [account.default_model] : [];
    ids.slice(0, 60).forEach((id) => {
      rows.push({
        key: `${account.service}::${id}`,
        label: id,
        provider: account.label,
        description: `${account.label} · ${account.service}`,
        supports_web_search: true,
        supports_documents: false,
        supports_vision: false,
      });
    });
  });
  return rows;
}

export async function loadProviderModels() {
  return rowsFromAccounts(await loadAvailableProviders());
}