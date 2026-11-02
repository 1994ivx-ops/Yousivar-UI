import { useEffect, useState } from 'react';
import { Check, Moon, Sun, Monitor } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { applyAccent, applyMotion, applyTheme, getThemeMode } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

const ACCENTS = [
  { id: 'pearl', swatch: 'bg-foreground' },
  { id: 'platinum', swatch: 'bg-foreground/85' },
  { id: 'silver', swatch: 'bg-foreground/70' },
  { id: 'graphite', swatch: 'bg-muted-foreground' },
];

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const [mode, setMode] = useState(getThemeMode);
  const [accent, setAccent] = useState(() => localStorage.getItem('ysv.accent') || 'silver');
  const [motion, setMotion] = useState(() => localStorage.getItem('ysv.motion') || 'full');
  const [models, setModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState(() => localStorage.getItem('ysv.model') || 'automatic');
  const [memoryOn, setMemoryOn] = useState(() => localStorage.getItem('ysv.memory') !== 'off');
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
    base44.entities.AIModel.filter({ enabled: true }, { sort: 'sort_order', limit: 30 })
      .then((page) => setModels(page.items || []))
      .catch(() => setModels([]));
  }, []);

  const pickMode = (value) => {
    const next = value === 'system' ? 'system' : value;
    setMode(next);
    localStorage.setItem('ysv.theme', next);
    applyTheme(next);
  };

  const pickAccent = (value) => {
    setAccent(value);
    localStorage.setItem('ysv.accent', value);
    applyAccent(value);
  };

  const pickMotion = (value) => {
    setMotion(value);
    localStorage.setItem('ysv.motion', value);
    applyMotion(value);
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pt-4">
      <header>
        <h2 className="font-display text-2xl">{t('settingsTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('settingsSub')}</p>
      </header>

      <section className="surface rounded-2xl p-4">
        <p className="mb-3 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{t('appearance')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'dark', icon: Moon, label: t('dark') },
            { id: 'light', icon: Sun, label: t('light') },
            { id: 'system', icon: Monitor, label: t('system') },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => pickMode(id)}
              className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] transition-colors',
                mode === id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground hover:text-foreground')}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12.5px] text-muted-foreground">{t('accent')}</span>
          <div className="flex gap-1.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => pickAccent(a.id)}
                aria-label={a.id}
                className={cn('flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-all',
                  a.swatch, accent === a.id ? 'ring-2 ring-foreground/70' : 'opacity-70 hover:opacity-100')}
              >
                {accent === a.id && <Check className="h-3.5 w-3.5 text-black/70" />}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12.5px] text-muted-foreground">{t('motion')}</span>
          <div className="flex gap-1.5">
            {['full', 'reduced'].map((value) => (
              <button
                key={value}
                onClick={() => pickMotion(value)}
                className={cn('rounded-lg border px-2.5 py-1 text-[11px]',
                  motion === value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground')}
              >
                {t(value)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="surface rounded-2xl p-4">
        <p className="mb-3 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{t('language')}</p>
        <div className="flex gap-2">
          {[{ id: 'en', label: 'English' }, { id: 'ar', label: 'العربية' }].map((option) => (
            <button
              key={option.id}
              onClick={() => setLang(option.id)}
              className={cn('rounded-xl border px-3.5 py-2 text-[12.5px]',
                lang === option.id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border/70 text-muted-foreground')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="surface space-y-4 rounded-2xl p-4">
        <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{t('chat')}</p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-muted-foreground">{t('defaultModel')}</span>
          <select
            value={defaultModel}
            onChange={(e) => { setDefaultModel(e.target.value); localStorage.setItem('ysv.model', e.target.value); }}
            className="rounded-lg border border-border/70 bg-background/60 px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none"
          >
            {models.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-muted-foreground">{t('memory')}</span>
          <Switch
            checked={memoryOn}
            onCheckedChange={(value) => { setMemoryOn(value); localStorage.setItem('ysv.memory', value ? 'on' : 'off'); }}
          />
        </div>
      </section>

      <section className="surface rounded-2xl p-4">
        <p className="mb-3 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{t('profile')}</p>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-[13px] font-semibold uppercase text-primary">
            {(user?.full_name || user?.email || 'Y').slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] text-foreground">{user?.full_name || '—'}</p>
            <p className="truncate text-[11.5px] text-muted-foreground">{user?.email}</p>
          </div>
          <span className="ms-auto rounded-full bg-secondary px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {user?.role}
          </span>
        </div>
      </section>
    </div>
  );
}