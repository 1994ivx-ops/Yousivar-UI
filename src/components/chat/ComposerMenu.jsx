import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function ComposerMenu({ open, items, onClose, onSelect }) {
  const { t } = useI18n();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const nodes = Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]') || []);
      if (!nodes.length) return;
      const current = nodes.findIndex((node) => node === document.activeElement);
      const next = event.key === 'ArrowDown'
        ? (current + 1) % nodes.length
        : (current - 1 + nodes.length) % nodes.length;
      nodes[next]?.focus();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="menu"
        aria-label={t('addMenu')}
        className="ysv-menu absolute bottom-full start-0 z-50 mb-2 w-[268px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => onSelect(item)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-secondary focus:bg-secondary focus:outline-none',
                !item.available && 'opacity-45',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-secondary/60">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-foreground">{item.label}</span>
                <span className="block truncate text-[10.5px] text-muted-foreground">{item.hint}</span>
              </span>
              {item.active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          );
        })}
      </div>
    </>
  );
}