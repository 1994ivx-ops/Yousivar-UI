import { NavLink } from 'react-router-dom';
import {
  MessageSquare, GitCompare, FileText, Brain, Layers, Settings, KeyRound,
  ShieldCheck, Info, X, Plug,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import ConversationList from '@/components/ConversationList';

const LOGO = 'https://i.postimg.cc/rwqsdLBd/yousivar.png';

export default function Sidebar({ open, onClose }) {
  const { t } = useI18n();

  const links = [
    { to: '/', label: t('chat'), icon: MessageSquare, end: true },
    { to: '/compare', label: t('compare'), icon: GitCompare },
    { to: '/documents', label: t('documents'), icon: FileText },
    { to: '/memory', label: t('memory'), icon: Brain },
    { to: '/models', label: t('models'), icon: Layers },
    { to: '/settings', label: t('settings'), icon: Settings },
    { to: '/providers', label: t('providers'), icon: Plug },
    { to: '/developer', label: t('developer'), icon: KeyRound },
    { to: '/admin', label: t('admin'), icon: ShieldCheck },
    { to: '/about', label: t('about'), icon: Info },
  ];

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 flex w-[288px] flex-col border-e border-border/70 bg-sidebar/95 backdrop-blur-xl transition-transform duration-300 ease-out lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-5 pb-4 pt-6">
          <img
            src={LOGO}
            alt="YOUSIVAR"
            className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/15"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-semibold tracking-[0.12em]">
              {t('appName')}
            </p>
            <p className="truncate text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {t('appTag')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground lg:hidden"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ConversationList onNavigated={onClose} />

        <nav className="mt-2 space-y-0.5 border-t border-border/60 px-3 py-3">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition-colors',
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )
              }
            >
              <Icon className="h-[17px] w-[17px] shrink-0 opacity-80" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}