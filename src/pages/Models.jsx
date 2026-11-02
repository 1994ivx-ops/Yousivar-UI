import { useEffect, useState } from 'react';
import { Globe, Image as ImageIcon, Layers } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export default function Models() {
  const { t } = useI18n();
  const [models, setModels] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => setIsAdmin(u?.role === 'admin')).catch(() => setIsAdmin(false));
    base44.entities.AIModel.list({ sort: 'sort_order', limit: 40 })
      .then((page) => setModels(page.items || []))
      .catch(() => setModels([]));
  }, []);

  const toggle = async (model) => {
    const enabled = !model.enabled;
    setModels((prev) => prev.map((m) => (m.id === model.id ? { ...m, enabled } : m)));
    await base44.entities.AIModel.update(model.id, { enabled });
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pt-4">
      <header>
        <h2 className="font-display text-2xl">{t('modelsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('modelsSub')}</p>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {models.map((model) => (
          <article key={model.id} className="surface flex flex-col gap-2 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  {model.label}
                </p>
                <p className="text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">{model.provider}</p>
              </div>
              {isAdmin ? (
                <Switch checked={!!model.enabled} onCheckedChange={() => toggle(model)} />
              ) : (
                <span className={cn('text-[10px] uppercase tracking-wider', model.enabled ? 'text-primary' : 'text-muted-foreground')}>
                  {model.enabled ? t('enabled') : t('disabled')}
                </span>
              )}
            </div>

            <p className="text-[11.5px] leading-relaxed text-muted-foreground">{model.description}</p>

            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              <Cap on={model.supports_documents} icon={Layers} label={t('docs')} />
              <Cap on={model.supports_vision} icon={ImageIcon} label={t('vision')} />
              <Cap on={model.supports_web_search} icon={Globe} label={t('webSearch')} />
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {Math.round((model.context_window || 0) / 1000)}K ctx
              </span>
            </div>
          </article>
        ))}
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        {isAdmin ? 'Enabled models appear in every picker in this workspace.' : t('adminOnly')}
      </p>
    </div>
  );
}

function Cap({ on, icon: Icon, label }) {
  return (
    <span className={cn('flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]',
      on ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground/50 line-through')}>
      <Icon className="h-2.5 w-2.5" /> {label}
    </span>
  );
}