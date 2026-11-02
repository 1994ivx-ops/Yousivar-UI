import { base44 } from '@/api/base44Client';

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;
export const DOCUMENT_ACCEPT = '.pdf,.txt,.md,.csv,.json,.docx,.html,.js,.ts,.py,.sql,.yml,.yaml';

export const isImageFile = (file) => /^image\//i.test(file?.type || '');

export const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/** Uploads privately and registers the file in the document library the chat already reads. */
export async function uploadAttachment(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  return base44.entities.Document.create({
    name: String(file.name || 'file').slice(0, 120),
    file_uri,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size || 0,
    status: 'ready',
  });
}