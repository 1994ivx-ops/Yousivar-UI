import { useEffect, useState } from 'react';
import { Check, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function DocumentPicker({ selected, onChange, onClose }) {
  const { t } = useI18n();
  const [docs, setDocs] = useState(null);

  useEffect(() => {
    base44.entities.Document.list({ sort: '-created_date', limit: 30 })
      .then((page) => setDocs(page.items || []))
      .catch(() => setDocs([]));
  }, []);

  const toggle = (doc) => {
    const exists = selected.some((s) => s.id === doc.id);
    onChange(exists ? selected.filter((s) => s.id !== doc.id) : [...selected, doc].slice(0, 4));
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full start-0 z-50 mb-2 w-80 overflow-hidden rounded-2xl border border-border bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl">
        <p className="px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('selectDoc')}
        </p>
        {docs === null && <p className="px-2 py-3 text-xs text-muted-foreground">{t('loading')}…</p>}
        {docs && docs.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">{t('noDocsHint')}</p>
        )}
        <div className="max-h-56 overflow-y-auto">
          {(docs || []).map((doc) => {
            const on = selected.some((s) => s.id === doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggle(doc)}
                className={cn('flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[12.5px] transition-colors',
                  on ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60')}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                {on && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}