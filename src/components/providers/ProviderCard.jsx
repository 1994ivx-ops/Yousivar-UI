import { ExternalLink, Loader2, Pencil, Plus, RefreshCw, Trash2, Zap } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import ProviderForm from '@/components/providers/ProviderForm';
import StatusPill from '@/components/providers/StatusPill';

export default function ProviderCard({
  def, accounts, encryptionReady, editing, busyKey, onEdit, onCancel, onSave, onAction,
}) {
  const { t } = useI18n();
  const isEditing = editing && editing.service === def.id;
  const editingAccount = isEditing ? (editing.account || null) : null;

  return (
    <article className="surface overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13.5px] font-medium text-foreground">{def.label}</h3>
          {def.note && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{def.note}</p>}
        </div>
        {def.env_ready && accounts.length === 0 && <StatusPill status="connected" source="environment" />}
        {def.key_url && (
          <a
            href={def.key_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> keys
          </a>
        )}
      </header>

      <div className="divide-y divide-border/50 border-t border-border/50">
        {accounts.length === 0 && !isEditing && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[11.5px] text-muted-foreground">
            <span className="flex-1">{t('noKeyYet')}</span>
            {def.fields[0]?.envVar && (
              <span className="font-mono text-[10px] text-muted-foreground/80">{def.fields.map((f) => f.envVar).filter(Boolean).join(' · ')}</span>
            )}
            <button
              onClick={() => onEdit(def.id, null)}
              disabled={!encryptionReady && !def.env_ready}
              className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
            >
              <Plus className="h-3 w-3" /> {t('configure')}
            </button>
          </div>
        )}

        {accounts.map((account) => {
          const busy = busyKey === account.id;
          return (
            <div key={account.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={account.status} detail={account.status_detail} />
                <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {account.key_hint || t('noKeyYet')}
                </span>
                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">P{account.priority}</span>
                {account.default_model && (
                  <span className="max-w-[180px] truncate font-mono text-[10.5px] text-muted-foreground" dir="ltr">{account.default_model}</span>
                )}
                {!account.enabled && (
                  <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('disabled')}
                  </span>
                )}

                <div className="ms-auto flex items-center gap-1">
                  <button
                    onClick={() => onAction('test', account)}
                    disabled={busy}
                    title={t('testConnection')}
                    className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  </button>
                  {def.group === 'ai' && (
                    <button
                      onClick={() => onAction('discover', account)}
                      disabled={busy}
                      title={t('refreshModels')}
                      className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onEdit(def.id, account)}
                    title={t('configure')}
                    className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onAction('remove', account)}
                    title={t('removeProvider')}
                    className="rounded-lg border border-border/70 p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                {account.status_detail || t('never')}
                {account.checked_at ? ` · ${t('lastChecked')} ${new Date(account.checked_at).toLocaleString()}` : ''}
              </p>

              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted-foreground/90">
                <span>{t('requestsLabel')} {account.usage_requests}</span>
                <span>{t('errorsLabel')} {account.usage_errors}</span>
                <span>{t('tokensLabel')} {account.usage_tokens}</span>
                {account.last_latency_ms ? <span>{t('latencyLabel')} {account.last_latency_ms} ms</span> : null}
              </div>

              {account.models?.length > 0 && (
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70" dir="ltr">
                  {account.models.length} {t('modelsFound')} · {account.models.slice(0, 3).join(', ')}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {accounts.length > 0 && !isEditing && (
        <div className="border-t border-border/50 px-4 py-2">
          <button
            onClick={() => onEdit(def.id, null)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> {t('configure')}
          </button>
        </div>
      )}

      {isEditing && (
        <ProviderForm
          key={editingAccount?.id || `${def.id}-new`}
          def={def}
          account={editingAccount}
          saving={busyKey === (editingAccount?.id || def.id)}
          disabled={!encryptionReady}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </article>
  );
}