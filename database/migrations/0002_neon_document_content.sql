-- Store document bytes in Neon PostgreSQL.
-- Existing document metadata and storage_key are preserved.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS content BYTEA;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS sha256 TEXT;

COMMENT ON COLUMN documents.content IS
  'Document binary content stored in PostgreSQL BYTEA';

COMMENT ON COLUMN documents.sha256 IS
  'Optional SHA-256 checksum of document content';
