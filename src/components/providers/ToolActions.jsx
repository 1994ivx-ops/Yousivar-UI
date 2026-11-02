import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';

const ACTIONS = {
  search: { action: 'search', labelKey: 'searchLabel', placeholderKey: 'searchPlaceholder' },
  crawl: { action: 'crawl', labelKey: 'crawlLabel', placeholderKey: 'endpointHint' },
  speak: { action: 'speak', labelKey: 'voiceSample', placeholderKey: 'voicePlaceholder' },
  notify: { action: 'notify', labelKey: 'notifyTest', placeholderKey: 'notifyPlaceholder' },
};

const actionFor = (service) => {
  if (['tavily', 'exa', 'google_search'].includes(service)) return 'search';
  if (service === 'firecrawl') return 'crawl';
  if (service === 'elevenlabs') return 'speak';
  if (service === 'telegram') return 'notify';
  return null;
};

export default function ToolActions({ accounts }) {
  const { t } = useI18n();
  const usable = accounts.filter((account) => actionFor(account.service));
  const [service, setService] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState('');

  if (!usable.length) return null;
  const current = service || usable[0].service;
  const spec = ACTIONS[actionFor(current)] || ACTIONS.search;

  const run = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    setOutput(null);
    try {
      const payload = { action: spec.action, service: current };
      if (spec.action === 'crawl') payload.url = text;
      else if (spec.action === 'search') payload.query = text;
      else payload.text = text;
      const res = await base44.functions.invoke('tools', payload);
      const data = res.data || {};
      if (data.error) throw new Error(data.error);
      setOutput(data);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || t('failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="surface rounded-2xl p-4">
      <h2 className="text-[13.5px] font-medium">{t('quickActions')}</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {usable.map((account) => (
          <button
            key={account.id}
            onClick={() => { setService(account.service); setOutput(null); setError(''); }}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              current === account.service
                ? 'border-foreground/30 bg-foreground/10 text-foreground'
                : 'border-border/70 text-muted-foreground hover:text-foreground'
            }`}
          >
            {account.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') run(); }}
          placeholder={spec.placeholderKey === 'endpointHint' ? 'https://example.com/article' : t(spec.placeholderKey)}
          dir={spec.action === 'crawl' ? 'ltr' : undefined}
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={run}
          disabled={!input.trim() || busy}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {t(spec.labelKey)}
        </button>
      </div>

      {error && <p className="mt-2 rounded-xl border border-border/70 px-3 py-2 text-[11.5px] text-foreground/80">{error}</p>}

      {output?.audio && (
        <audio controls src={output.audio} className="mt-3 w-full" />
      )}
      {output?.hits && (
        <ul className="mt-3 space-y-1.5">
          {output.hits.map((hit) => (
            <li key={hit.url} className="rounded-xl border border-border/60 px-3 py-2">
              <p className="truncate text-[12px] text-foreground">{hit.title}</p>
              <p className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">{hit.url}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{hit.snippet}</p>
            </li>
          ))}
        </ul>
      )}
      {output?.markdown && (
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-border/60 p-3 text-[11px] text-muted-foreground" dir="ltr">
          {output.markdown.slice(0, 2000)}
        </pre>
      )}
      {output?.ok && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">Telegram message {output.message_id} sent.</p>
      )}
    </section>
  );
}