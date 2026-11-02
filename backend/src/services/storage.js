/**
 * Object storage for uploaded documents.
 *
 * Bytes never live in PostgreSQL. In production the adapter is the R2 binding
 * (`env.BUCKET`); the Node dev server injects a disk adapter with the same
 * interface. Either way the browser never sees a storage key — downloads go
 * through an authorised route.
 */

const SAFE = /[^a-zA-Z0-9._-]/g;

export function storageKey(userId, filename) {
  const stamp = Date.now().toString(36);
  const clean = String(filename || 'document')
    .replace(SAFE, '_')
    .replace(/\.{2,}/g, '.')   // no ".." segment, ever
    .replace(/^[.\-_]+/, '')   // no leading dot file
    .slice(-80) || 'document';
  return `documents/${userId}/${stamp}-${clean}`;
}

export function r2Adapter(bucket) {
  if (!bucket) throw new Error('The BUCKET binding is not configured');
  return {
    async put(key, bytes, contentType) {
      await bucket.put(key, bytes, { httpMetadata: { contentType } });
    },
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return { body: object.body, contentType: object.httpMetadata?.contentType || 'application/octet-stream', size: object.size };
    },
    async remove(key) {
      await bucket.delete(key);
    },
  };
}

/** Picks the configured adapter, or fails loudly — no silent in-memory fallback. */
export function storageFor(env) {
  if (env.storageAdapter) return env.storageAdapter;
  if (env.BUCKET) return r2Adapter(env.BUCKET);
  throw new Error('No document storage is configured (BUCKET binding or storageAdapter)');
}

export const ALLOWED_MIME = [
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/json', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg', 'image/webp',
];

/** Checks the declared type and the magic number of the bytes we received. */
export function sniff(box, declaredType) {
  const type = String(declaredType || '').split(';')[0].trim().toLowerCase();
  const head = new Uint8Array(box.slice(0, 8));
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isWebp = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
  const looksBinary = head.some((value) => value === 0);

  // A real PDF or image can never be smuggled in as text: the signature wins over
  // the declared type.
  const signatureMismatch = (isPdf && type !== 'application/pdf')
    || ((isPng || isJpeg || isWebp) && !type.startsWith('image/'));
  if (signatureMismatch) return { ok: false, reason: 'The file content does not match its declared type' };

  if (type === 'application/pdf' && !isPdf) return { ok: false, reason: 'That file is not a PDF' };
  if (type.startsWith('image/') && !(isPng || isJpeg || isWebp)) return { ok: false, reason: 'That image is not PNG, JPEG or WebP' };
  if (type === 'text/plain' || type === 'text/markdown' || type === 'text/csv' || type === 'application/json') {
    // A binary file renamed to .txt must not pass: printable ASCII, UTF-8 lead
    // bytes and tab/newline only.
    const printable = head.every((byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d
      || (byte >= 0x20 && byte <= 0x7e) || byte >= 0xc2);
    if (looksBinary || !printable) return { ok: false, reason: 'That file is not text' };
  }
  if (!ALLOWED_MIME.includes(type)) return { ok: false, reason: `${type || 'That type'} is not an accepted document type` };
  return { ok: true, type };
}