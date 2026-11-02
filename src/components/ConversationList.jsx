import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function ConversationList({ onNavigated }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const activeId = params.get('c');
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [archivedView, setArchivedView] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    const query = archivedView ? { archived: true } : { archived: { $ne: true } };
    if (q.trim()) query.title = { $regex: q.trim() };
    base44.entities.Conversation.filter(query, { sort: '-updated_date', limit: 60 })
      .then((page) => { if (alive) setItems(page.items || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [q, archivedView, tick]);

  useEffect(() => {
    window.addEventListener('ysv:conversations', reload);
    return () => window.removeEventListener('ysv:conversations', reload);
  }, [reload]);

  const newChat = async () => {
    const created = await base44.entities.Conversation.create({
      title: t('newChat'),
      model: localStorage.getItem('ysv.model') || 'automatic',
      archived: false,
      message_count: 0,
      last_message_at: new Date().toISOString(),
    });
    window.dispatchEvent(new Event('ysv:conversations'));
    navigate('/?c=' + created.id);
    onNavigated?.();
  };

  const saveTitle = async (id) => {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title) return;
    await base44.entities.Conversation.update(id, { title });
    reload();
  };

  const toggleArchive = async (conv) => {
    await base44.entities.Conversation.update(conv.id, { archived: !conv.archived });
    if (activeId === conv.id && !conv.archived) navigate('/');
    reload();
  };

  const remove = async (conv) => {
    if (!window.confirm(t('confirmDeleteChat'))) return;
    await base44.entities.Message.deleteMany({ conversation_id: conv.id });
    await base44.entities.Conversation.delete(conv.id);
    if (activeId === conv.id) navigate('/');
    reload();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3">
        <button
          onClick={newChat}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[13px] font-semibold text-primary-foreground transition-transform hover:scale-[1.01]"
        >
          <Plus className="h-4 w-4" />
          {t('newChat')}
        </button>

        <div className="relative mb-2">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchChats')}
            className="w-full rounded-lg border border-border/70 bg-background/60 py-1.5 pe-2 ps-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute inset-y-0 end-2 my-auto text-muted-foreground" aria-label={t('close')}>
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        <div className="flex items-center justify-between px-1 pb-1 pt-2">
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            {archivedView ? t('archivedView') : t('conversations')}
          </p>
          <button
            onClick={() => setArchivedView((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            {archivedView ? t('hideArchived') : t('showArchived')}
          </button>
        </div>

        {items.length === 0 && (
          <p className="px-1 py-3 text-[12px] text-muted-foreground">{q ? t('noResults') : t('noConversations')}</p>
        )}

        <ul className="space-y-0.5">
          {items.map((conv) => (
            <li key={conv.id}>
              {editingId === conv.id ? (
                <div className="flex items-center gap-1 rounded-lg bg-secondary px-1.5 py-1">
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(conv.id); if (e.key === 'Escape') setEditingId(null); }}
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground focus:outline-none"
                  />
                  <button onClick={() => saveTitle(conv.id)} aria-label={t('save')} className="p-1 text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className={cn(
                  'group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
                  activeId === conv.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60',
                )}>
                  <button
                    onClick={() => { navigate('/?c=' + conv.id); onNavigated?.(); }}
                    className="min-w-0 flex-1 truncate text-start text-[13px]"
                    title={conv.title}
                  >
                    {conv.title}
                  </button>
                  <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      onClick={() => { setEditingId(conv.id); setDraftTitle(conv.title); }}
                      aria-label={t('rename')}
                      className="rounded p-1 hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={() => toggleArchive(conv)} aria-label={t('archive')} className="rounded p-1 hover:text-foreground">
                      {conv.archived ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                    </button>
                    <button onClick={() => remove(conv)} aria-label={t('delete')} className="rounded p-1 hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}