import { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { formatSize } from '@/lib/attachments';
import { cn } from '@/lib/utils';

const isImage = (doc) => /^image\//i.test(doc?.mime_type || '');

export default function AttachmentTray({ docs, uploads = [], onRemove }) {
  const { t } = useI18n();
  const [previews, setPreviews] = useState({});

  useEffect(() => {
    const images = docs.filter(isImage).filter((doc) => !previews[doc.id]);
    if (!images.length) return undefined;
    let alive = true;
    images.forEach((doc) => {
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri, expires_in: 900 })
        .then((res) => {
          if (alive && res?.signed_url) setPreviews((prev) => ({ ...prev, [doc.id]: res.signed_url }));
        })
        .catch(() => {});
    });
    return () => { alive = false; };
  }, [docs, previews]);

  if (!docs.length && !uploads.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5 px-1">
      {docs.map((doc) => (
        <span key={doc.id} className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-secondary/60 px-2 py-1 text-[11px] text-foreground/85">
          {isImage(doc) && previews[doc.id] ? (
            <img src={previews[doc.id]} alt="" className="h-6 w-6 rounded-md object-cover" />
          ) : isImage(doc) ? (
            <ImageIcon className="h-3 w-3" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          <span className="max-w-[130px] truncate">{doc.name}</span>
          <span className="text-[10px] text-muted-foreground">{formatSize(doc.size_bytes)}</span>
          <button type="button" onClick={() => onRemove(doc)} aria-label={t('removeAttachment')}>
            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
          </button>
        </span>
      ))}
      {uploads.map((item) => (
        <span key={item.id} className={cn('flex items-center gap-1.5 rounded-xl border border-border/60 px-2 py-1 text-[11px]',
          item.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-secondary/40 text-muted-foreground')}>
          {item.status === 'error' ? <X className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
          <span className="max-w-[130px] truncate">{item.name}</span>
          <span className="text-[10px]">{item.status === 'error' ? t('uploadFailed') : t('uploading')}</span>
        </span>
      ))}
    </div>
  );
}