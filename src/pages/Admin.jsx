import { useEffect, useState } from 'react';
import { Activity, FileText, MessageSquare, ShieldCheck, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';

export default function Admin() {
  const { t } = useI18n();
  const [isAdmin, setIsAdmin] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    base44.auth.me()
      .then((user) => {
        const admin = user?.role === 'admin';
        setIsAdmin(admin);
        if (!admin) return;
        base44.functions.invoke('adminStats', {})
          .then((res) => {
            const payload = res.data || {};
            if (payload.error) throw new Error(payload.error);
            setData(payload);
          })
          .catch((e) => setError(e?.response?.data?.error || e.message || t('failed')));
      })
      .catch(() => setIsAdmin(false));
  }, [t]);

  if (isAdmin === null) {
    return <p className="pt-10 text-center text-[13px] text-muted-foreground">{t('loading')}…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-[14px] text-foreground">{t('adminOnly')}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{t('adminSub')}</p>
      </div>
    );
  }

  const counts = data?.counts || {};

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pt-4">
      <header>
        <h2 className="font-display text-2xl">{t('adminTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('adminSub')}</p>
      </header>

      {error && <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p>}

      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          { icon: MessageSquare, label: t('totalConversations'), value: counts.conversations },
          { icon: Activity, label: t('totalMessages'), value: counts.messages },
          { icon: FileText, label: t('totalDocuments'), value: counts.documents },
          { icon: Users, label: t('users'), value: data?.users?.length },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="surface rounded-2xl p-3.5">
            <Icon className="mb-2 h-4 w-4 text-primary" />
            <p className="font-display text-xl">{value ?? '—'}</p>
            <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          </div>
        ))}
      </section>

      <section className="surface overflow-hidden rounded-2xl">
        <p className="border-b border-border/70 px-4 py-2.5 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('users')}
        </p>
        <ul className="divide-y divide-border/70">
          {(data?.users || []).map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10.5px] font-semibold uppercase text-primary">
                {(user.full_name || user.email || 'Y').slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px]">{user.full_name || '—'}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {user.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="surface overflow-hidden rounded-2xl">
        <p className="border-b border-border/70 px-4 py-2.5 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
          {t('auditTrail')}
        </p>
        <div className="max-h-80 overflow-y-auto">
          <ul className="divide-y divide-border/70">
            {(data?.audits || []).map((entry) => (
              <li key={entry.id} className="px-4 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11.5px] text-foreground/90">{entry.action}</span>
                  <span className="text-[10.5px] text-muted-foreground">{new Date(entry.created_date).toLocaleString()}</span>
                </div>
                <p className="text-[10.5px] text-muted-foreground">
                  {entry.actor_email || '—'} · {entry.model || '—'} · {entry.latency_ms ? `${entry.latency_ms} ms` : ''} {entry.detail || ''}
                </p>
              </li>
            ))}
            {(!data?.audits || data.audits.length === 0) && (
              <li className="px-4 py-6 text-center text-[12px] text-muted-foreground">—</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}