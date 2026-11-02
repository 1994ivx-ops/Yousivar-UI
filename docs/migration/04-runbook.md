# Runbook — from this repository to a deployed, independent YOUSIVAR–Ω

Ordered. Each step names what already exists and what only the owner can do.
Nothing here deletes Base44 data or revokes an integration.

## 0. Verify locally (no credentials needed)

```bash
npm ci && npm run build                 # frontend
cd backend && node --check src/index.js && npm test   # 50 assertions, no install needed
```

## 1. Create the database — owner action (Neon)

1. Create a Neon project and database (region closest to the Worker).
2. Copy the **pooled** connection string → `DATABASE_URL`.
3. Copy the **direct** connection string → `DATABASE_DIRECT_URL`.
4. Apply the schema from a machine that holds the credentials:

```bash
cd backend
DATABASE_DIRECT_URL='postgresql://…' DATABASE_URL='postgresql://…' \
  node scripts/migrate.js --status   # what is pending
DATABASE_DIRECT_URL='…' DATABASE_URL='…' node scripts/migrate.js
psql "$DATABASE_DIRECT_URL" -f ../database/seeds/0001_ai_models.sql
```

`schema_migrations` records a checksum per file; editing an applied migration is
refused on purpose. Rollback: create a Neon branch before applying, and restore it.

## 2. Generate the crypto material — owner action

```bash
openssl rand -hex 32   # APP_ENCRYPTION_KEY  (reuse the existing value to keep sealed provider credentials valid)
openssl rand -hex 32   # SESSION_SECRET
```

## 3. Store the API secrets in Cloudflare — owner action

```bash
cd backend
npx wrangler secret put DATABASE_URL --env production
npx wrangler secret put APP_ENCRYPTION_KEY --env production
npx wrangler secret put SESSION_SECRET --env production
npx wrangler secret put RESEND_API_KEY --env production     # optional
npx wrangler secret put ANTHROPIC_API_KEY --env production  # optional, per provider
```

## 4. Bucket, email, and the first admin

- R2: create `yousivar-documents` and `yousivar-documents-preview`; the binding is
  already declared in `backend/wrangler.jsonc`.
- Resend: verify the sending domain, set `MAIL_FROM`.
- First admin: the first account to register on a fresh database is granted `admin`.

## 5. Cloudflare + GitHub — owner action

```bash
mkdir -p .github/workflows && cp ci/workflows/*.yml .github/workflows/
```

Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`DATABASE_URL`, `DATABASE_DIRECT_URL`.
Repository/environment variables: `API_BASE_URL`, `CLOUDFLARE_PAGES_PROJECT`.
Android signing (only for release): `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## 6. Frontend cutover — the only remaining code step

The frontend still calls Base44 (`src/api/base44Client.js`). Swap it for an API
client that keeps the same call shapes:

| Today | Becomes |
|---|---|
| `entities.Conversation.filter({…}, {sort, limit})` | `GET /api/conversations?…` |
| `entities.Message.create({…})` | `POST /api/conversations/:id/messages` |
| `entities.Document` + `UploadPrivateFile` | `POST /api/documents` (multipart) |
| `entities.Memory` | `GET/POST/PATCH/DELETE /api/memories` |
| `entities.AIModel.filter({enabled:true})` | `GET /api/models` |
| `functions.invoke('providerChat', body)` | `POST /api/chat` (same body, `stream: true` for SSE) |
| `functions.invoke('providers', {action})` | `GET /api/providers` · `GET /api/providers/available` |
| `functions.invoke('createApiKey')` | `POST /api/keys` |
| `auth.*` | `POST /api/auth/*` |
| `integrations.Core.CreateFileSignedUrl` | `GET /api/documents/:id/download` |

Do this **after** step 1–5 are verified, then delete `src/api/base44Client.js`,
`src/lib/app-params.js`, `base44/`, `@base44/sdk` and `@base44/vite-plugin`. Until
then the current app keeps working — no half-migrated state is shipped.

## 7. Data export (only if you want the existing rows)

The live workspace holds 1 conversation, demo messages and 8 model rows; the model
rows are already in `database/seeds/0001_ai_models.sql`. For a fuller export, run a
service-role read per entity and write JSON, then map into the tables using
`01-audit.md` §4. Field mapping: `created_by_id → user_id`,
`created_date/updated_date → created_at/updated_at`, everything else is 1:1.

## 8. Android

```bash
npm run build
npx cap add android          # first time only
npx cap sync android
cd android && ./gradlew assembleDebug
```

Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
Release: push a `v*` tag once the four signing secrets exist.
`CAPACITOR_SERVER_URL` points a device build at a real deployment.

## 9. Rollback

- API: `npx wrangler rollback --env production`.
- Database: restore the Neon branch created before the migration.
- Frontend: redeploy the previous Pages deployment.
- Base44 stays untouched and reachable until you explicitly retire it.