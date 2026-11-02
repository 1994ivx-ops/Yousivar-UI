import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, Plus, ShieldAlert } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';

export default function Developer() {
  const { t } = useI18n();
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    base44.entities.ApiKey.list({ sort: '-created_date', limit: 50 })
      .then((page) => setKeys(page.items || []))
      .catch(() => setKeys([]));
  };

  useEffect(load, []);

  const create = async () => {
    const label = name.trim();
    if (!label || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await base44.functions.invoke('createApiKey', { name: label });
      const data = res.data || {};
      if (data.error) throw new Error(data.error);
      setFreshKey(data);
      setName('');
      load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || t('failed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key) => {
    await base44.entities.ApiKey.update(key.id, { revoked: true });
    setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, revoked: true } : k)));
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pt-4">
      <header>
        <h2 className="font-display text-2xl">{t('devTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('devSub')}</p>
      </header>

      <section className="surface rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('keyName')}
            className="min-w-[180px] flex-1 rounded-xl border border-border/70 bg-background/50 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={create}
            disabled={!name.trim() || busy}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t('createKey')}
          </button>
        </div>

        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}

        {freshKey && (
          <div className="mt-3 rounded-xl border border-primary/40 bg-primary/10 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-primary">
              <ShieldAlert className="h-3.5 w-3.5" /> {t('revealOnce')}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-background/60 px-2 py-1.5 font-mono text-[12px]">
                {freshKey.key}
              </code>
              <button
                onClick={() => { navigator.clipboard.writeText(freshKey.key); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="rounded-lg border border-border/70 p-2 text-muted-foreground hover:text-foreground"
                aria-label={t('copy')}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="surface overflow-hidden rounded-2xl">
        {keys.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">—</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{key.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {key.prefix}•••• · {t('lastUsed')}: {key.last_used ? new Date(key.last_used).toLocaleDateString() : t('never')}
                  </p>
                </div>
                {key.revoked ? (
                  <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-destructive">
                    {t('revoked')}
                  </span>
                ) : (
                  <button
                    onClick={() => revoke(key)}
                    className="rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    {t('revoke')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="surface rounded-2xl px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        {t('endpointNote')}
      </p>
    </div>
  );
}