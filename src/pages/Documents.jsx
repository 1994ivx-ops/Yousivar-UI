import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2, MessageSquare, Trash2, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';

const formatSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Documents() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    base44.entities.Document.list({ sort: '-created_date', limit: 60 })
      .then((page) => setDocs(page.items || []))
      .catch(() => setDocs([]));
  }, []);

  const upload = async (files) => {
    if (!files || !files.length) return;
    setError('');
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: file exceeds 20 MB`);
        const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
        const record = await base44.entities.Document.create({
          name: file.name,
          file_uri,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          status: 'ready',
        });
        setDocs((prev) => [record, ...prev]);
      }
    } catch (e) {
      setError(e.message || t('failed'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(t('deleteDoc'))) return;
    await base44.entities.Document.delete(doc.id);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 pt-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{t('documentsTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('documentsSub')}</p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? t('uploading') : t('upload')}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
          accept=".pdf,.txt,.md,.csv,.json,.docx,.html,.js,.ts,.py,.sql,.yml,.yaml"
        />
      </header>

      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p>
      )}

      <section className="surface overflow-hidden rounded-2xl">
        {docs.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">{t('noDocuments')}</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {docs.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-foreground">{doc.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatSize(doc.size_bytes)} · {doc.status} · {new Date(doc.created_date).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/?doc=' + doc.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <MessageSquare className="h-3 w-3" /> {t('attachToChat')}
                </button>
                <button onClick={() => remove(doc)} aria-label={t('delete')} className="rounded-lg p-2 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-[11px] text-muted-foreground">
        {t('documentsSub')} — files are stored privately and only signed for the model request you send.
      </p>
    </div>
  );
}