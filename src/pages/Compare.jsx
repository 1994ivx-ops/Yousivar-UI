import { useEffect, useState } from 'react';
import { Copy, Check, Loader2, Play } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import ChatMessage from '@/components/ChatMessage';
import { loadProviderModels, runCompletion } from '@/lib/ai';

export default function Compare() {
  const { t, lang } = useI18n();
  const [models, setModels] = useState([]);
  const [selected, setSelected] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.AIModel.filter({ enabled: true }, { sort: 'sort_order', limit: 30 })
        .then((page) => page.items || [])
        .catch(() => []),
      loadProviderModels(),
    ]).then(([registry, providerModels]) => {
      const list = [...registry, ...providerModels];
      setModels(list);
      setSelected(list.slice(0, 2).map((m) => m.key));
    });
  }, []);

  const toggle = (key) => {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 4) return prev;
      return [...prev, key];
    });
  };

  const run = async () => {
    const text = prompt.trim();
    if (!text || !selected.length || running) return;
    setRunning(true);
    const initial = {};
    selected.forEach((key) => { initial[key] = { status: 'pending' }; });
    setResults(initial);

    await Promise.allSettled(selected.map(async (key) => {
      const started = Date.now();
      setResults((prev) => ({ ...prev, [key]: { status: 'running' } }));
      try {
        const data = await runCompletion({
          model: key,
          language: lang,
          messages: [{ role: 'user', content: text }],
        });
        setResults((prev) => ({
          ...prev,
          [key]: { status: 'done', content: data.content, latency: data.latency_ms ?? Date.now() - started, chars: data.chars },
        }));
      } catch (e) {
        setResults((prev) => ({
          ...prev,
          [key]: { status: 'error', error: e?.response?.data?.error || e.message || t('failed') },
        }));
      }
    }));
    setRunning(false);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pt-4">
      <header>
        <h2 className="font-display text-2xl">{t('compareTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('compareSub')}</p>
      </header>

      <section className="surface rounded-2xl p-4">
        <p className="mb-2 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{t('selectModels')}</p>
        <div className="flex flex-wrap gap-1.5">
          {models.map((m) => {
            const on = selected.includes(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggle(m.key)}
                className={cn('rounded-full border px-3 py-1.5 text-[11.5px] transition-colors',
                  on ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground')}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={t('composerPlaceholder')}
          className="mt-3 w-full resize-none rounded-xl border border-border/70 bg-background/50 p-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{selected.length} / 4</span>
          <button
            onClick={run}
            disabled={!prompt.trim() || !selected.length || running}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {t('runComparison')}
          </button>
        </div>
      </section>

      {selected.length > 0 && Object.keys(results).length > 0 && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {selected.map((key) => {
            const model = models.find((m) => m.key === key);
            const result = results[key] || { status: 'idle' };
            return (
              <div key={key} className="surface flex flex-col rounded-2xl p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium">{model?.label || key}</span>
                  <ResultBadge result={result} t={t} />
                </div>
                {result.status === 'done' && (
                  <div className="max-h-[420px] flex-1 overflow-y-auto">
                    <ChatMessage message={{ role: 'assistant', content: result.content, latency_ms: result.latency }} />
                  </div>
                )}
                {result.status === 'error' && <p className="text-[12px] text-destructive">{result.error}</p>}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function ResultBadge({ result, t }) {
  const [copied, setCopied] = useState(false);
  if (result.status === 'pending' || result.status === 'idle') {
    return <span className="text-[10.5px] text-muted-foreground">—</span>;
  }
  if (result.status === 'running') {
    return <span className="flex items-center gap-1 text-[10.5px] text-primary"><Loader2 className="h-3 w-3 animate-spin" />{t('thinking')}</span>;
  }
  if (result.status === 'error') {
    return <span className="text-[10.5px] text-destructive">{t('failed')}</span>;
  }
  return (
    <span className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
      {result.latency} ms
      <button
        onClick={() => { navigator.clipboard.writeText(result.content || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="hover:text-foreground"
        aria-label={t('copy')}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}