import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Languages, LogOut, Moon, Sun } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { applyTheme, getThemeMode, nextThemeMode } from '@/lib/theme';
import { cn } from '@/lib/utils';

const titleFor = (path) => {
  const map = {
    '/': 'chat', '/compare': 'compareTitle', '/documents': 'documentsTitle',
    '/memory': 'memoryTitle', '/models': 'modelsTitle', '/settings': 'settingsTitle',
    '/developer': 'devTitle', '/providers': 'providersTitle', '/admin': 'adminTitle', '/about': 'aboutTitle',
  };
  return map[path] || 'chat';
};

export default function TopBar({ onOpenSidebar }) {
  const { t, toggle, lang } = useI18n();
  const { pathname } = useLocation();
  const [mode, setMode] = useState(getThemeMode);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => setUser(null));
  }, []);

  const cycleTheme = () => {
    const next = nextThemeMode(mode);
    setMode(next);
    applyTheme(next);
    localStorage.setItem('ysv.theme', next);
  };

  const ThemeIcon = mode === 'light' ? Sun : Moon;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/50 bg-background/70 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
      <button
        onClick={onOpenSidebar}
        className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
        aria-label={t('conversations')}
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground/90">
        {t(titleFor(pathname))}
      </h1>

      <div className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label={t('language')}
        >
          <Languages className="h-3.5 w-3.5" />
          {lang === 'ar' ? 'EN' : 'عربي'}
        </button>

        <button
          onClick={cycleTheme}
          className="rounded-full border border-border/70 p-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          aria-label={t('theme')}
        >
          <ThemeIcon className="h-3.5 w-3.5" />
        </button>

        {user && (
          <div className="ms-1 flex items-center gap-2 rounded-full border border-border/70 py-1 pe-1 ps-2.5">
            <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:block">
              {user.full_name || user.email}
            </span>
            <span className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold uppercase text-primary',
            )}>
              {(user.full_name || user.email || 'Y').slice(0, 1)}
            </span>
            <button
              onClick={() => base44.auth.logout()}
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={t('signOut')}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}