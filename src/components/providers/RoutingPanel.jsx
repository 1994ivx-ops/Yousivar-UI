import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import StatusPill from '@/components/providers/StatusPill';

export default function RoutingPanel({ accounts, labels }) {
  const { t } = useI18n();
  const ordered = [...accounts].sort((a, b) => a.priority - b.priority);

  return (
    <section className="surface rounded-2xl p-4">
      <h2 className="text-[13.5px] font-medium">{t('routingTitle')}</h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{t('routingSub')}</p>

      {ordered.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-[11.5px] text-muted-foreground">
          {t('routingNone')}
        </p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {ordered.map((account, index) => (
            <li key={account.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
              <span className="font-mono text-[10.5px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <span className="text-[12px] text-foreground">{labels[account.service] || account.service}</span>
              <StatusPill status={account.status} />
              {account.default_model && (
                <span className="max-w-[220px] truncate font-mono text-[10.5px] text-muted-foreground" dir="ltr">
                  {account.default_model}
                </span>
              )}
              {index === 0 && (
                <span className="ms-auto flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  default <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                </span>
              )}
              {index > 0 && (
                <span className="ms-auto rounded-md bg-secondary px-1.5 py-0.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
                  {t('fallbackBadge')}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}