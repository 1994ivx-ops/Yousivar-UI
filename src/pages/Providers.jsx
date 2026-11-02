import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import ProviderCard from '@/components/providers/ProviderCard';
import RoutingPanel from '@/components/providers/RoutingPanel';
import ToolActions from '@/components/providers/ToolActions';

const GROUPS = [
  { id: 'ai', labelKey: 'groupAi' },
  { id: 'search', labelKey: 'groupSearch' },
  { id: 'integration', labelKey: 'groupIntegration' },
];

export default function Providers() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [encryptionReady, setEncryptionReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const call = useCallback(async (payload) => {
    const res = await base44.functions.invoke('providers', payload);
    const data = res.data || {};
    if (data.error) throw new Error(data.error);
    return data;
  }, []);

  const describeError = useCallback((e) => e?.response?.data?.error || e.message || t('failed'), [t]);

  const load = useCallback(async () => {
    try {
      const data = await call({ action: 'list' });
      setAccounts(data.accounts || []);
      setCatalogue(data.catalogue || []);
      setEncryptionReady(data.encryption_ready !== false);
    } catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [call, describeError]);

  useEffect(() => { load(); }, [load]);

  const upsert = (account) => {
    if (!account) return;
    setAccounts((prev) => {
      const exists = prev.some((row) => row.id === account.id);
      const next = exists ? prev.map((row) => (row.id === account.id ? account : row)) : [account, ...prev];
      return next.sort((a, b) => a.priority - b.priority);
    });
  };

  const save = async (payload) => {
    setBusyKey(payload.id || payload.service);
    setError('');
    setNotice('');
    try {
      const data = await call({ action: 'save', ...payload });
      upsert(data.account);
      setEditing(null);
      setNotice(`${t('providerSaved')}${data.test?.ok ? ` · ${t('testOk')}` : ''}`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusyKey('');
    }
  };

  const act = async (kind, account) => {
    setError('');
    setNotice('');
    if (kind === 'remove') {
      if (!window.confirm(t('confirmRemoveProvider'))) return;
      setBusyKey(account.id);
      try {
        await call({ action: 'remove', id: account.id });
        setAccounts((prev) => prev.filter((row) => row.id !== account.id));
        setNotice(t('providerRemoved'));
      } catch (e) {
        setError(describeError(e));
      } finally {
        setBusyKey('');
      }
      return;
    }

    setBusyKey(account.id);
    try {
      const data = await call({ action: kind, id: account.id });
      upsert(data.account);
      const detail = data.test?.detail || '';
      setNotice(`${data.test?.ok ? t('testOk') : t('testFail')}${detail ? ` · ${detail}` : ''}`);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusyKey('');
    }
  };

  const labels = useMemo(
    () => Object.fromEntries(catalogue.map((def) => [def.id, def.label])),
    [catalogue],
  );
  const routing = useMemo(
    () => accounts.filter((account) => catalogue.find((def) => def.id === account.service && def.ai)),
    [accounts, catalogue],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-6 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{t('providersTitle')}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('providersSub')}</p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          className="flex items-center gap-1.5 rounded-xl border border-border/70 px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Loader2 className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : 'hidden'}`} />
          {t('testConnection')}
        </button>
      </header>

      {!encryptionReady && (
        <div className="surface flex gap-3 rounded-2xl border-border/80 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />
          <div className="text-[12px] leading-relaxed">
            <p className="text-foreground">{t('encryptionMissing')}</p>
            <p className="mt-1 text-muted-foreground">{t('encryptionMissingFix')}</p>
          </div>
        </div>
      )}

      {forbidden && (
        <div className="surface flex items-center gap-2 rounded-2xl p-4 text-[12.5px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> {t('adminRequired')}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-border/80 bg-secondary/40 px-3 py-2.5 text-[12px] text-foreground/85">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-border/70 px-3 py-2.5 text-[12px] text-muted-foreground">{notice}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="surface animate-pulse rounded-2xl p-4">
              <div className="h-3 w-32 rounded bg-secondary" />
              <div className="mt-3 h-2.5 w-56 rounded bg-secondary/70" />
            </div>
          ))}
        </div>
      ) : (
        !forbidden && GROUPS.map((group) => {
          const defs = catalogue.filter((def) => def.group === group.id);
          if (!defs.length) return null;
          return (
            <section key={group.id} className="space-y-2">
              <p className="px-1 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{t(group.labelKey)}</p>
              <div className="grid gap-2">
                {defs.map((def) => (
                  <ProviderCard
                    key={def.id}
                    def={def}
                    accounts={accounts.filter((account) => account.service === def.id)}
                    encryptionReady={encryptionReady}
                    editing={editing}
                    busyKey={busyKey}
                    onEdit={(service, account) => setEditing({ service, account })}
                    onCancel={() => setEditing(null)}
                    onSave={save}
                    onAction={act}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {!loading && !forbidden && <RoutingPanel accounts={routing} labels={labels} />}
      {!loading && !forbidden && <ToolActions accounts={accounts.filter((account) => account.key_hint || account.status === 'connected')} />}

      <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground">
        {t('envVarNote')} <span className="font-mono" dir="ltr">OPENROUTER_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY, MISTRAL_API_KEY, TAVILY_API_KEY, EXA_API_KEY, GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_ENGINE_ID, FIRECRAWL_API_KEY, TELEGRAM_BOT_TOKEN, ELEVENLABS_API_KEY</span>
      </p>
    </div>
  );
}