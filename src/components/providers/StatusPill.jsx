import { AlertTriangle, Check, CircleDashed, Cloud, XCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const TONES = {
  connected: { icon: Check, label: 'statusConnected', tone: 'border-white/25 bg-white/10 text-foreground' },
  invalid: { icon: XCircle, label: 'statusInvalid', tone: 'border-white/15 bg-white/[0.03] text-foreground/70' },
  error: { icon: AlertTriangle, label: 'statusError', tone: 'border-white/15 bg-white/[0.03] text-foreground/70' },
  not_configured: { icon: CircleDashed, label: 'statusMissing', tone: 'border-border/70 bg-transparent text-muted-foreground' },
};

export default function StatusPill({ status, detail, source, className }) {
  const { t } = useI18n();
  const meta = TONES[status] || TONES.not_configured;
  const Icon = source === 'environment' ? Cloud : meta.icon;

  return (
    <span
      title={detail || undefined}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium tracking-wide', meta.tone, className)}
    >
      <Icon className="h-3 w-3" />
      {source === 'environment' ? t('statusEnv') : t(meta.label)}
    </span>
  );
}