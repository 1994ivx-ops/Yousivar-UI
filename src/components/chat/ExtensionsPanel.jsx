import { useEffect, useMemo, useState } from 'react';
import { Brain, Code2, Database, FileText, Globe, Image as ImageIcon, Search, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { FEATURE_CATEGORIES } from '@/lib/chatExtensions';
import { cn } from '@/lib/utils';

const ICONS = { globe: Globe, sparkles: Sparkles, file: FileText, database: Database, brain: Brain, code: Code2, image: ImageIcon };

export default function ExtensionsPanel({ open, onClose, features }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase();
    return features.filter((item) => (category === 'all' || item.category === category)
      && (!words || item.label.toLowerCase().includes(words) || item.hint.toLowerCase().includes(words)));
  }, [features, query, category]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={t('extensionsTitle')}
        className="ysv-menu absolute bottom-full start-0 z-50 mb-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/80 bg-popover/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="border-b border-border/60 px-3 pb-2 pt-3">
          <p className="text-[12px] font-medium text-foreground">{t('extensionsTitle')}</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">{t('extensionsSub')}</p>
          <label className="mt-2 flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('toolsSearch')}
              className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
          </label>
          <div className="no-scrollbar mt-2 flex gap-1 overflow-x-auto">
            {FEATURE_CATEGORIES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={cn('shrink-0 rounded-lg px-2 py-1 text-[10.5px] transition-colors',
                  category === id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {t(`cat${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {visible.length === 0 && (
            <p className="px-2 py-4 text-center text-[11.5px] text-muted-foreground">{t('toolsEmpty')}</p>
          )}
          {visible.map((item) => {
            const Icon = ICONS[item.icon] || Sparkles;
            return (
              <div key={item.id} className={cn('flex items-start gap-2.5 rounded-xl px-2.5 py-2', !item.available && 'opacity-60')}>
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-secondary/60">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-foreground">{item.label}</p>
                  <p className="truncate text-[10.5px] text-muted-foreground">{item.note || item.hint}</p>
                </div>
                {item.onChange ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.enabled}
                    aria-label={item.label}
                    disabled={!item.available}
                    onClick={() => item.onChange(!item.enabled)}
                    className={cn('mt-1 h-4 w-7 shrink-0 rounded-full border transition-colors',
                      item.enabled ? 'border-primary/60 bg-primary/80' : 'border-border bg-secondary',
                      !item.available && 'cursor-not-allowed')}
                  >
                    <span className={cn('block h-3 w-3 translate-y-[1px] rounded-full bg-background transition-transform',
                      item.enabled ? 'translate-x-3.5' : 'translate-x-[1px]')} />
                  </button>
                ) : (
                  <span className={cn('mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider',
                    item.available ? 'bg-secondary text-muted-foreground' : 'bg-secondary/60 text-muted-foreground/80')}>
                    {item.available ? t('readyLabel') : t('needsSetup')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}