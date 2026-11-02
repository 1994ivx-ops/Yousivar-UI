import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ModelSelector({ models, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.key === value) || models[0];
  if (!current) return null;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="max-w-[130px] truncate">{current.label}</span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full end-0 z-50 mb-2 w-72 overflow-hidden rounded-2xl border border-border bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl">
            <p className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {models.length} models
            </p>
            <div className="max-h-64 overflow-y-auto">
              {models.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { onChange(m.key); setOpen(false); }}
                  className={cn(
                    'flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-2 text-start transition-colors',
                    m.key === current.key ? 'bg-secondary' : 'hover:bg-secondary/60',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium text-foreground">{m.label}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.provider}</span>
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{m.description}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}