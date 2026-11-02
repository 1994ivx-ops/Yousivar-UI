import { useCallback, useRef, useState } from 'react';
import {
  ArrowUp, Brain, Camera, FilePlus2, Globe, ImagePlus, Loader2, Plus, Puzzle, Sparkles, Square,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { isBusy } from '@/lib/chatMachine';
import {
  DOCUMENT_ACCEPT, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, isImageFile, uploadAttachment,
} from '@/lib/attachments';
import { cn } from '@/lib/utils';
import ModelSelector from '@/components/ModelSelector';
import ComposerMenu from '@/components/chat/ComposerMenu';
import ExtensionsPanel from '@/components/chat/ExtensionsPanel';
import AttachmentTray from '@/components/chat/AttachmentTray';

const EMPTY_CAPS = { supports_vision: false, supports_documents: false };

export default function ChatComposer({
  onSend, status, onStop, models, model, setModel, caps = EMPTY_CAPS,
  docs, setDocs, webSearch, setWebSearch, memoryOn, setMemoryOn,
  thinkDeeper, setThinkDeeper, thinkTarget, features = [],
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploads, setUploads] = useState([]);
  const cameraRef = useRef(null);
  const imagesRef = useRef(null);
  const filesRef = useRef(null);
  const busy = isBusy(status);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setNotice('');
    setUploads((prev) => prev.filter((item) => item.status === 'uploading'));
    for (const file of files) {
      if (isImageFile(file) && !caps.supports_vision) { setNotice(t('visionUnsupported')); continue; }
      if (!isImageFile(file) && !caps.supports_documents) { setNotice(t('docsUnsupported')); continue; }
      if (file.size > MAX_ATTACHMENT_BYTES) { setNotice(t('fileTooLarge')); continue; }

      const tempId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setUploads((prev) => [...prev, { id: tempId, name: file.name, status: 'uploading' }]);
      try {
        const doc = await uploadAttachment(file);
        setDocs((prev) => (prev.some((d) => d.id === doc.id) ? prev : [...prev, doc].slice(0, MAX_ATTACHMENTS)));
        setUploads((prev) => prev.filter((item) => item.id !== tempId));
      } catch {
        setUploads((prev) => prev.map((item) => (item.id === tempId ? { ...item, status: 'error' } : item)));
      }
    }
  }, [caps, setDocs, t]);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    onSend(value);
  };

  const menuItems = [
    {
      id: 'camera', icon: Camera, label: t('camera'), hint: t('cameraHint'),
      available: !!caps.supports_vision, note: t('visionUnsupported'),
      action: () => cameraRef.current?.click(),
    },
    {
      id: 'images', icon: ImagePlus, label: t('images'), hint: t('imagesHint'),
      available: !!caps.supports_vision, note: t('visionUnsupported'),
      action: () => imagesRef.current?.click(),
    },
    {
      id: 'files', icon: FilePlus2, label: t('files'), hint: t('filesHint'),
      available: !!caps.supports_documents, note: t('docsUnsupported'),
      action: () => filesRef.current?.click(),
    },
    {
      id: 'extensions', icon: Puzzle, label: t('extensions'), hint: t('extensionsHint'),
      available: true, action: () => setPanelOpen(true),
    },
    {
      id: 'think', icon: Sparkles, label: t('thinkDeeper'), hint: t('thinkDeeperHint'),
      available: !!thinkTarget, active: thinkDeeper, note: t('thinkNeeds'),
      action: () => setThinkDeeper?.(!thinkDeeper),
    },
  ];

  const pick = (item) => {
    setMenuOpen(false);
    if (!item.available) { setNotice(item.note || t('needsSetup')); return; }
    item.action?.();
  };

  return (
    <div className="surface rounded-[22px] p-3 shadow-2xl shadow-black/20">
      <AttachmentTray
        docs={docs}
        uploads={uploads}
        onRemove={(doc) => setDocs(docs.filter((item) => item.id !== doc.id))}
      />

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
        }}
        rows={2}
        placeholder={t('composerPlaceholder')}
        className="max-h-48 w-full resize-none bg-transparent px-2 py-1.5 text-[14.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
      />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }}
      />
      <input
        ref={imagesRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }}
      />
      <input
        ref={filesRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => { handleFiles(event.target.files); event.target.value = ''; }}
      />

      {notice && <p className="mt-1 px-2 text-[11px] text-muted-foreground">{notice}</p>}

      <div className="mt-1 flex items-center gap-2 px-1">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => { setMenuOpen((open) => !open); setPanelOpen(false); }}
              aria-expanded={menuOpen}
              aria-label={t('addMenu')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 transition-colors',
                menuOpen ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
            >
              <Plus className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-45')} />
            </button>

            <ComposerMenu open={menuOpen} items={menuItems} onClose={() => setMenuOpen(false)} onSelect={pick} />

            <ExtensionsPanel
              open={panelOpen}
              features={features}
              onClose={() => setPanelOpen(false)}
            />
          </div>

          <button
            type="button"
            onClick={() => setWebSearch(!webSearch)}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] transition-colors',
              webSearch ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
          >
            <Globe className="h-3.5 w-3.5" /> {t('webSearch')}
          </button>

          <button
            type="button"
            onClick={() => setMemoryOn(!memoryOn)}
            className={cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] transition-colors',
              memoryOn ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}
          >
            <Brain className="h-3.5 w-3.5" /> {t('memory')}
          </button>

          {thinkDeeper && (
            <span className="flex shrink-0 items-center gap-1 rounded-lg bg-secondary/70 px-2 py-1.5 text-[11px] text-foreground/80">
              <Sparkles className="h-3 w-3" /> {t('thinkDeeper')}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ModelSelector models={models} value={model} onChange={setModel} disabled={busy} />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground"
              aria-label={t('stop')}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              aria-label={t('send')}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {busy && (
        <p className="mt-1 flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {status === 'streaming' ? t('streamingNote') : t('waitingLabel')}
        </p>
      )}
    </div>
  );
}