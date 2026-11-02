import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, RotateCcw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import WelcomeHero from '@/components/WelcomeHero';
import ChatComposer from '@/components/ChatComposer';
import MessageList from '@/components/chat/MessageList';
import { isProviderModel, loadAvailableProviders, rowsFromAccounts } from '@/lib/ai';
import { streamCompletion } from '@/lib/streamChat';
import { isBusy, useChatState } from '@/lib/chatMachine';
import { buildFeatures } from '@/lib/chatExtensions';

const REASONING_MODEL = /(o[134](?:$|-)|reason|thinking|deepseek-r|qwq)/i;

export default function Workspace() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const conversationId = params.get('c');
  const docParam = params.get('doc');

  const [messages, setMessages] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [models, setModels] = useState([]);
  const [providerModels, setProviderModels] = useState([]);
  const [services, setServices] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem('ysv.model') || 'automatic');
  const [docs, setDocs] = useState([]);
  const [memoryOn, setMemoryOn] = useState(() => localStorage.getItem('ysv.memory') !== 'off');
  const [webSearch, setWebSearch] = useState(false);
  const [thinkDeeper, setThinkDeeper] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [error, setError] = useState('');

  const [status, moveTo] = useChatState();
  const abortRef = useRef(null);
  const bufferRef = useRef('');
  const frameRef = useRef(0);
  const retryRef = useRef(null);
  const restoreModelRef = useRef(null);

  useEffect(() => {
    base44.entities.AIModel.filter({ enabled: true }, { sort: 'sort_order', limit: 40 })
      .then((page) => setModels(page.items || []))
      .catch(() => setModels([]));
    loadAvailableProviders().then((accounts) => {
      setProviderModels(rowsFromAccounts(accounts));
      setServices(accounts.map((account) => account.service));
    });
  }, []);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    abortRef.current?.abort();
  }, []);

  const allModels = useMemo(() => [...models, ...providerModels], [models, providerModels]);
  // Unknown models fall back to what their transport really accepts: the platform
  // engine reads documents and images, a raw provider call only receives their names.
  const caps = useMemo(() => {
    const found = allModels.find((entry) => entry.key === model);
    if (found) return found;
    return isProviderModel(model)
      ? { supports_documents: false, supports_vision: false, supports_web_search: true }
      : { supports_documents: true, supports_vision: true, supports_web_search: true };
  }, [allModels, model]);
  const thinkTarget = useMemo(() => allModels.find((entry) => REASONING_MODEL.test(entry.key)) || null, [allModels]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); setConversation(null); return undefined; }
    let alive = true;
    Promise.all([
      base44.entities.Message.filter({ conversation_id: conversationId }, { sort: 'created_date', limit: 300 }),
      base44.entities.Conversation.get(conversationId).catch(() => null),
    ]).then(([page, conv]) => {
      if (!alive) return;
      setMessages(page.items || []);
      setConversation(conv);
      if (conv?.model) setModel(conv.model);
    }).catch(() => { if (alive) setMessages([]); });
    return () => { alive = false; };
  }, [conversationId]);

  useEffect(() => {
    if (!docParam) return;
    base44.entities.Document.get(docParam)
      .then((doc) => { if (doc) setDocs((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc])); })
      .catch(() => {});
  }, [docParam]);

  const chooseModel = useCallback((value) => {
    setModel(value);
    localStorage.setItem('ysv.model', value);
  }, []);

  const toggleThink = useCallback((next) => {
    if (next) {
      if (!thinkTarget) return;
      if (model !== thinkTarget.key) {
        restoreModelRef.current = model;
        chooseModel(thinkTarget.key);
      }
    } else if (restoreModelRef.current) {
      chooseModel(restoreModelRef.current);
      restoreModelRef.current = null;
    }
    setThinkDeeper(next);
  }, [thinkTarget, model, chooseModel]);

  const push = useCallback((chunk) => {
    bufferRef.current += chunk;
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      setLiveText(bufferRef.current);
    });
  }, []);

  const runEngine = useCallback(async (history, activeId, target) => {
    setError('');
    bufferRef.current = '';
    setLiveText('');
    moveTo('connecting');

    const controller = new AbortController();
    abortRef.current = controller;

    let memories = [];
    if (memoryOn) {
      const memPage = await base44.entities.Memory.filter({ active: true }, { limit: 20 }).catch(() => ({ items: [] }));
      memories = (memPage.items || memPage || []).map((entry) => entry.content).filter(Boolean);
    }

    moveTo('waiting');
    try {
      const final = await streamCompletion({
        model,
        language: lang,
        webSearch,
        messages: history.map((entry) => ({ role: entry.role, content: entry.content })),
        memories,
        documentUris: docs.map((doc) => doc.file_uri),
        documentNames: docs.map((doc) => doc.name),
      }, {
        onDelta: (chunk) => {
          if (controller.signal.aborted) return;
          moveTo('streaming');
          push(chunk);
        },
      });

      if (controller.signal.aborted) return;

      const content = (bufferRef.current || final?.content || '').trim();
      if (!content) throw new Error(t('emptyReply'));
      const replyModel = final?.model || model;

      if (target) {
        await base44.entities.Message.update(target.id, { content, model: replyModel, latency_ms: final?.latency_ms });
        setMessages((prev) => prev.map((entry) => (entry.id === target.id
          ? { ...entry, content, model: replyModel, latency_ms: final?.latency_ms }
          : entry)));
      } else {
        const assistant = await base44.entities.Message.create({
          conversation_id: activeId,
          role: 'assistant',
          content,
          model: replyModel,
          latency_ms: final?.latency_ms,
        });
        setMessages((prev) => [...prev, assistant]);
      }

      await base44.entities.Conversation.update(activeId, {
        message_count: history.length + 1,
        last_message_at: new Date().toISOString(),
        model,
      }).catch(() => {});
      window.dispatchEvent(new Event('ysv:conversations'));

      retryRef.current = null;
      bufferRef.current = '';
      setLiveText('');
      moveTo('completed');
    } catch (e) {
      const partial = (bufferRef.current || e?.partial || '').trim();
      if (controller.signal.aborted || e?.name === 'AbortError') {
        if (partial) {
          if (target) {
            await base44.entities.Message.update(target.id, { content: partial, model }).catch(() => {});
            setMessages((prev) => prev.map((entry) => (entry.id === target.id ? { ...entry, content: partial } : entry)));
          } else {
            const assistant = await base44.entities.Message.create({
              conversation_id: activeId, role: 'assistant', content: partial, model,
            }).catch(() => null);
            if (assistant) setMessages((prev) => [...prev, assistant]);
          }
        }
        bufferRef.current = '';
        setLiveText('');
        moveTo('cancelled');
      } else {
        setError(e?.message || t('failed'));
        retryRef.current = { history, activeId, target };
        moveTo('error');
      }
    } finally {
      abortRef.current = null;
    }
  }, [model, lang, webSearch, memoryOn, docs, moveTo, push, t]);

  const send = async (value) => {
    if (isBusy(status)) return;
    const text = value.trim();
    if (!text) return;
    setError('');
    try {
      let activeId = conversationId;
      if (!activeId) {
        const conv = await base44.entities.Conversation.create({
          title: text.slice(0, 60),
          model,
          archived: false,
          message_count: 0,
          last_message_at: new Date().toISOString(),
        });
        activeId = conv.id;
        setConversation(conv);
        setParams({ c: activeId }, { replace: true });
        window.dispatchEvent(new Event('ysv:conversations'));
      }

      const userMessage = await base44.entities.Message.create({
        conversation_id: activeId,
        role: 'user',
        content: text,
        attachments: docs.map((doc) => doc.file_uri),
      });
      const history = [...messages, userMessage];
      setMessages(history);
      await runEngine(history, activeId, null);
    } catch (e) {
      setError(e?.message || t('failed'));
      moveTo('error');
    }
  };

  const regenerate = useCallback(async (assistantMessage) => {
    if (isBusy(status)) return;
    const index = messages.findIndex((entry) => entry.id === assistantMessage.id);
    const history = messages.slice(0, index);
    if (!history.length) return;
    await runEngine(history, conversationId, assistantMessage);
  }, [status, messages, conversationId, runEngine]);

  const stop = useCallback(() => {
    // The reply already in flight is discarded, not persisted.
    abortRef.current?.abort();
    bufferRef.current = '';
    setLiveText('');
    moveTo('cancelled');
  }, [moveTo]);

  const retry = () => {
    const last = retryRef.current;
    if (!last) return;
    moveTo('retrying');
    runEngine(last.history, last.activeId, last.target);
  };

  const features = useMemo(() => buildFeatures({
    t,
    caps,
    services,
    thinkTarget,
    state: { webSearch, memoryOn, thinkDeeper },
    actions: { setWebSearch, setMemoryOn, setThinkDeeper: toggleThink },
  }), [t, caps, services, thinkTarget, webSearch, memoryOn, thinkDeeper, toggleThink]);

  const exportChat = () => {
    const title = conversation?.title || t('chat');
    const md = messages
      .map((entry) => `## ${entry.role === 'assistant' ? 'Assistant' : 'User'}\n\n${entry.content}`)
      .join('\n\n---\n\n');
    const blob = new Blob([`# ${title}\n\n${md}\n`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^\w\u0600-\u06FF -]/g, '').slice(0, 40) || 'conversation'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-4xl flex-col gap-4 pt-4">
      {messages.length === 0 && !liveText ? (
        <WelcomeHero onPick={(value) => send(value)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
              {conversation?.title || t('chat')}
            </p>
            <button
              onClick={exportChat}
              className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3 w-3" /> {t('exportChat')}
            </button>
          </div>
          <MessageList
            messages={messages}
            onRegenerate={regenerate}
            status={status}
            liveText={liveText}
          />
        </>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-secondary/40 px-3 py-2">
          <p className="min-w-0 flex-1 text-[12px] text-foreground/85">{error}</p>
          {retryRef.current && (
            <button
              onClick={retry}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border/70 px-2 py-1 text-[11px] text-foreground hover:bg-secondary"
            >
              <RotateCcw className="h-3 w-3" /> {t('retryLabel')}
            </button>
          )}
        </div>
      )}

      <div className="sticky bottom-4 mt-auto">
        <ChatComposer
          onSend={send}
          status={status}
          onStop={stop}
          models={allModels}
          model={model}
          setModel={chooseModel}
          caps={caps}
          docs={docs}
          setDocs={setDocs}
          memoryOn={memoryOn}
          setMemoryOn={(value) => { setMemoryOn(value); localStorage.setItem('ysv.memory', value ? 'on' : 'off'); }}
          webSearch={webSearch}
          setWebSearch={setWebSearch}
          thinkDeeper={thinkDeeper}
          setThinkDeeper={toggleThink}
          thinkTarget={thinkTarget}
          features={features}
        />
        <p className="mt-2 text-center text-[10.5px] text-muted-foreground">{t('tokenNote')}</p>
      </div>
    </div>
  );
}