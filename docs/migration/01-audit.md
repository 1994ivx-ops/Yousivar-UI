# Phase 1 — Audit and feature inventory

Measured against the working tree on 2026-11-01, before any file was changed.
Everything below was read from the repository, not assumed.

## 1. What exists today

| Area | Count | Detail |
|---|---|---|
| Source lines | 12 209 | `src/` + `base44/` (`*.jsx`, `*.js`, `*.ts`, `*.jsonc`) |
| Routes | 15 | 10 app routes, 4 auth routes, 1 catch-all |
| Entities | 9 | `AIModel`, `ApiKey`, `AuditLog`, `Conversation`, `Document`, `Memory`, `Message`, `ProviderAccount`, `User` |
| Backend functions | 6 | `adminStats`, `chatCompletion`, `createApiKey`, `providerChat`, `providers`, `tools` |
| Shared server modules | 2 | `base44/shared/providers.ts` (provider catalogue + HTTP adapters), `base44/shared/models.ts` |
| Files importing the Base44 SDK | 30 | of 62 source files under `src/` |
| SDK call sites | 64 | `entities.*` 33, `functions.invoke` 7, `auth.*` 20, `integrations.Core` 3, `app.getPublicSettings` 1 |

## 2. Routes

| Route | Page | Server calls it makes |
|---|---|---|
| `/` | `Workspace` | `Conversation`, `Message`, `Memory`, `Document`, `AIModel`, `functions.invoke('chatCompletion' \| 'providerChat')` |
| `/compare` | `Compare` | `AIModel`, `functions.invoke('providerChat')` × N models |
| `/documents` | `Documents` | `Document`, `integrations.Core.UploadPrivateFile`, `CreateFileSignedUrl` |
| `/memory` | `MemoryPage` | `Memory` |
| `/models` | `Models` | `AIModel` |
| `/settings` | `Settings` | `AIModel`, `auth.me` |
| `/developer` | `Developer` | `ApiKey`, `functions.invoke('createApiKey')` |
| `/providers` | `Providers` | `functions.invoke('providers')`, `ProviderAccount` via the function |
| `/admin` | `Admin` | `functions.invoke('adminStats')`, `auth` user list, `AuditLog` |
| `/about` | `About` | none |
| `/login` `/register` `/forgot-password` `/reset-password` | auth pages | `auth.loginViaEmailPassword`, `register`, `verifyOtp`, `resendOtp`, `resetPasswordRequest`, `resetPassword`, `loginWithProvider` |

## 3. Data measured in the live workspace

Read with the service role, read-only:

| Entity | Records |
|---|---|
| `AIModel` | 8 (exported to `database/seeds/0001_ai_models.sql`) |
| `Conversation` | 1 |
| `Message` | demo rows (`is_sample = true`) |
| `User` | 1 |
| `Document`, `Memory`, `ProviderAccount` | 0 |

**Consequence:** there is no production corpus to migrate. The migration tooling and
field mapping are still delivered, but a data cut-over would move at most one demo
conversation. Nothing was deleted.

## 4. Feature → replacement map

| Feature | Base44 implementation | Independent replacement | Verification |
|---|---|---|---|
| Sign in / register | `auth.loginViaEmailPassword`, OTP | `POST /api/auth/*`, sessions in Postgres, PBKDF2 | unit tests (hash/verify/session cookie) + manual |
| Password reset | `auth.resetPassword*` | hashed single-use token + Resend link | unit tests + manual |
| Conversations | `entities.Conversation` + RLS | `conversations` table, `user_id` scoping | `authz.test.mjs` |
| Messages | `entities.Message` | `messages` + atomic counter CTE | `authz.test.mjs`, route review |
| Memories | `entities.Memory` | `memories` | `authz.test.mjs` |
| Documents | `Document` + private upload + signed URL | R2 object + authorised download route | `storage` tests (sniffing, keys) |
| Model registry | `entities.AIModel` | `ai_models` + seed | seed file |
| Provider credentials | `ProviderAccount.secret_cipher` (AES-GCM) | same format, same `APP_ENCRYPTION_KEY` | `crypto.test.mjs` |
| Provider chat | `functions/providerChat` | `POST /api/chat` (port, same limits/prompt/fallback) | `chat.test.mjs` (19 assertions) |
| Gateway chat | `functions/chatCompletion` (platform LLM) | routed through a configured provider; unmapped keys fail loudly | `chat.test.mjs` |
| Developer keys | `ApiKey` + `createApiKey` | `api_keys`, SHA-256, `Bearer ysv_…` | unit tests |
| Admin | `adminStats`, `AuditLog` | `/api/admin/*` | route review |
| Search / TTS / notify | `functions/tools` + providers | same adapters, `services/providers.js` | `providers.test.mjs` |

## 5. Runtime dependency surface

- `src/api/base44Client.js` → `@base44/sdk` client built from `app-params.js`
- `src/lib/app-params.js` → `VITE_BASE44_APP_ID`, `VITE_BASE44_FUNCTIONS_VERSION`, `VITE_BASE44_APP_BASE_URL`
- `vite.config.js` → `@base44/vite-plugin` (legacy imports, HMR notifier, analytics)
- `base44/config.jsonc` → platform build/serve settings
- Server-side: `Deno.env` + `createClientFromRequest` inside the six functions
- One real secret: `APP_ENCRYPTION_KEY`

## 6. Known defects found during the audit

1. `npm run typecheck` reports **135 errors** today, concentrated in the boilerplate
   auth pages, `OAuthConsent`, and the shadcn primitives (JS inference on props).
   They are pre-existing, not introduced by this work, and do not block `vite build`.
2. `npm run lint` only covers `src/components/**` and `src/pages/**`; `src/lib`,
   `src/api` and `base44/` are not linted.
3. The Base44 function transport buffers responses, so the app's SSE endpoint could
   never reach the browser as a stream. In the independent backend this is resolved
   by construction (a Worker/Node response can stay open) — not by a workaround.

## 7. Not migrated in this phase (and why)

The frontend still talks to Base44. Removing that before the API is deployed and
verified would break the only running deployment and destroy the only copy of the
current data — which the migration brief itself forbids. Phase 3 (frontend
transport swap) is prepared but not executed; see `04-runbook.md` §6.