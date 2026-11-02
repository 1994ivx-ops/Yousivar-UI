import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const inputClass = 'w-full rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring';

export default function ProviderForm({ def, account, saving, disabled, onSave, onCancel }) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => {
    const seed = {};
    def.fields.forEach((field) => { seed[field.name] = ''; });
    return seed;
  });
  const [meta, setMeta] = useState({
    base_url: account?.base_url || '',
    default_model: account?.default_model || '',
    priority: account?.priority ?? 100,
    enabled: account?.enabled ?? true,
    temperature: account?.temperature ?? '',
    max_tokens: account?.max_tokens ?? '',
    label: account?.label || '',
  });

  const setMetaField = (key) => (event) => {
    const value = key === 'enabled' ? event.target.checked : event.target.value;
    setMeta((prev) => ({ ...prev, [key]: value }));
  };

  const submit = (event) => {
    event.preventDefault();
    const fields = {};
    Object.entries(values).forEach(([name, value]) => { if (value.trim()) fields[name] = value.trim(); });
    onSave({
      service: def.id,
      id: account?.id,
      label: meta.label,
      fields,
      base_url: meta.base_url.trim(),
      default_model: meta.default_model.trim(),
      priority: Number(meta.priority) || 100,
      enabled: meta.enabled,
      temperature: meta.temperature === '' ? undefined : Number(meta.temperature),
      max_tokens: meta.max_tokens === '' ? undefined : Number(meta.max_tokens),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border/60 px-4 py-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {def.fields.map((field) => (
          <label key={field.name} className={cn('block', def.fields.length === 1 && 'sm:col-span-2')}>
            <span className="mb-1 flex items-baseline justify-between gap-2 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              <span>{field.label}</span>
              {!field.required && <span className="normal-case tracking-normal opacity-70">{'optional'}</span>}
            </span>
            <input
              value={values[field.name] || ''}
              onChange={(event) => setValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
              placeholder={field.hint || (account?.key_hint ? `${t('savedMasked')}: ${account.key_hint}` : '')}
              type={field.required ? 'password' : 'text'}
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
              disabled={disabled}
            />
          </label>
        ))}

        {def.requires_base_url && (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t('endpointUrl')}</span>
            <input
              value={meta.base_url}
              onChange={setMetaField('base_url')}
              placeholder={t('endpointHint')}
              dir="ltr"
              className={inputClass}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t('defaultModelField')}</span>
          <input
            value={meta.default_model}
            onChange={setMetaField('default_model')}
            placeholder={account?.models?.[0] || 'model-id'}
            dir="ltr"
            list={`models-${def.id}`}
            className={inputClass}
          />
          <datalist id={`models-${def.id}`}>
            {(account?.models || []).map((id) => <option key={id} value={id} />)}
          </datalist>
        </label>

        <label className="block">
          <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t('priorityField')}</span>
          <input
            value={meta.priority}
            onChange={setMetaField('priority')}
            type="number"
            min="1"
            max="999"
            className={inputClass}
          />
        </label>

        {def.group === 'ai' && (
          <>
            <label className="block">
              <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t('temperatureField')}</span>
              <input
                value={meta.temperature}
                onChange={setMetaField('temperature')}
                type="number"
                step="0.1"
                min="0"
                max="2"
                placeholder="0.7"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{t('maxTokensField')}</span>
              <input
                value={meta.max_tokens}
                onChange={setMetaField('max_tokens')}
                type="number"
                min="64"
                max="8192"
                placeholder="2048"
                className={inputClass}
              />
            </label>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <input
            type="checkbox"
            checked={meta.enabled}
            onChange={setMetaField('enabled')}
            className="h-3.5 w-3.5 rounded border-border bg-background accent-foreground"
          />
          {t('enabledProvider')}
        </label>

        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border/70 px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            {t('saveProvider')}
          </button>
        </div>
      </div>
    </form>
  );
}