import { useEffect, useState } from 'react';
import { Brain, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const TYPES = ['preference', 'fact', 'project', 'instruction'];

export default function MemoryPage() {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [content, setContent] = useState('');
  const [type, setType] = useState('fact');
  const [enabled, setEnabled] = useState(() => localStorage.getItem('ysv.memory') !== 'off');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    base44.entities.Memory.list({ sort: '-created_date', limit: 100 })
      .then((page) => setItems(page.items || []))
      .catch(() => setItems([]));
  }, []);

  const add = async () => {
    const text = content.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const record = await base44.entities.Memory.create({ content: text, type, active: true });
      setItems((prev) => [record, ...prev]);
      setContent('');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item) => {
    await base44.entities.Memory.update(item.id, { active: !item.active });
    setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, active: !m.active } : m)));
  };

  const remove = async (item) => {
    if (!window.confirm(t('deleteMemory'))) return;
    await base44.entities.Memory.delete(item.id);
    setItems((prev) => prev.filter((m) => m.id !== item.id));
  };

  const toggleMaster = () => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem('ysv.memory', next ? 'on' : 'off');
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{t('memoryTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('memorySub')}</p>
        </div>
        <button
          onClick={toggleMaster}
          className={cn('flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11.5px] transition-colors',
            enabled ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border/70 text-muted-foreground')}
        >
          <Brain className="h-3.5 w-3.5" />
          {enabled ? t('memoryOn') : t('memoryOff')}
        </button>
      </header>

      <section className="surface rounded-2xl p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={2}
          placeholder={t('memoryContent')}
          className="w-full resize-none rounded-xl border border-border/70 bg-background/50 p-3 text-[13.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((option) => (
              <button
                key={option}
                onClick={() => setType(option)}
                className={cn('rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors',
                  type === option ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground')}
              >
                {t(option)}
              </button>
            ))}
          </div>
          <button
            onClick={add}
            disabled={!content.trim() || busy}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> {t('addMemory')}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        {items.length === 0 && (
          <p className="surface rounded-2xl px-5 py-10 text-center text-[13px] text-muted-foreground">{t('memoryEmpty')}</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="surface flex items-start gap-3 rounded-2xl p-3.5">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t(item.type) || item.type}
                </span>
                <span className={cn('text-[10px]', item.active ? 'text-primary' : 'text-muted-foreground')}>
                  {item.active ? t('active') : t('inactive')}
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-foreground/90">{item.content}</p>
            </div>
            <button
              onClick={() => toggle(item)}
              className="rounded-lg border border-border/70 px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              {item.active ? t('inactive') : t('active')}
            </button>
            <button onClick={() => remove(item)} aria-label={t('delete')} className="rounded-lg p-1.5 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}