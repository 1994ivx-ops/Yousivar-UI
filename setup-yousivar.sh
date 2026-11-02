#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

ROOT="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.migration-backup/$STAMP"

echo "== YOUSIVAR: تجهيز البنية المستقلة =="

for item in package.json backend/package.json backend/scripts/migrate.js database/migrations; do
  if [ ! -e "$item" ]; then
    echo "خطأ: الملف أو المجلد المطلوب غير موجود: $item"
    exit 1
  fi
done

mkdir -p "$BACKUP" .github/workflows database/migrations

cp backend/package.json "$BACKUP/backend-package.json"
[ ! -f backend/package-lock.json ] || cp backend/package-lock.json "$BACKUP/backend-package-lock.json"

echo "نسخة احتياطية: $BACKUP"

node --input-type=module <<'NODE'
import fs from 'node:fs';

const path = 'backend/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));

pkg.dependencies ??= {};
pkg.dependencies.pg ??= '^8.13.1';

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
console.log('تمت إضافة pg إلى backend/package.json');
NODE

echo "تحديث قفل اعتماديات Backend..."
(
  cd backend
  npm install --package-lock-only --ignore-scripts
)

MIGRATION="database/migrations/0002_neon_document_content.sql"

if [ ! -f "$MIGRATION" ]; then
cat > "$MIGRATION" <<'SQL'
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
SQL
  echo "تم إنشاء ترحيل Neon: $MIGRATION"
else
  echo "الترحيل موجود مسبقاً؛ لم يتم استبداله."
fi

cat > .github/workflows/backend-migrate.yml <<'YAML'
name: Neon Database Migration

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  migrate:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install backend dependencies
        run: npm ci

      - name: Apply database migrations
        env:
          DATABASE_URL: \${{ secrets.DATABASE_URL }}
          DATABASE_DIRECT_URL: \${{ secrets.DATABASE_DIRECT_URL }}
        run: node scripts/migrate.js
YAML

cat > .github/workflows/frontend-build.yml <<'YAML'
name: Frontend Build

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build
YAML

echo
echo "== تم إنشاء ملفات التأسيس =="
echo "1. backend/package.json: إضافة pg"
echo "2. backend/package-lock.json: تحديث القفل"
echo "3. database/migrations/0002_neon_document_content.sql"
echo "4. .github/workflows/backend-migrate.yml"
echo "5. .github/workflows/frontend-build.yml"
echo
echo "لم يتم نشر Worker أو Pages بعد؛ لأن إزالة Base44 وR2 من الكود لم تكتمل."
echo "لم يتم تشغيل أي ترحيل على قاعدة البيانات."
