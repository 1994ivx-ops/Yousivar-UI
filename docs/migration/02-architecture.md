# Phase 2 — Target architecture and the decisions behind it

## 1. Shape

```
Browser / Capacitor WebView
        │  HTTPS, httpOnly session cookie
        ▼
Cloudflare Worker  (backend/src/index.js, Hono)
        │  HTTPS (neon-http driver, no socket pool)
        ├──────────► Neon PostgreSQL      ← the only application database
        ├──────────► Cloudflare R2        ← document bytes only
        ├──────────► Resend               ← reset / verification mail
        └──────────► AI providers         ← openrouter, anthropic, gemini, groq, …

Cloudflare Pages  ← the built Vite frontend (dist/)
```

Cloudflare hosts compute and static assets. **No Cloudflare database product is
used**: durable data lives in Neon PostgreSQL, reachable only from the Worker.

## 2. Decisions

### Hono on Cloudflare Workers
Workers cannot run the existing Deno functions unchanged, and a Node-only framework
would need a second deployment target. Hono gives one router that runs on Workers
(`app.fetch`) and on Node (`@hono/node-server`), with no adapter layer in the code.
Rejected: Express (Node-only), Next (would rewrite the frontend), raw `fetch`
handlers (loses CORS/middleware ergonomics).

### JavaScript ESM with JSDoc, not TypeScript, in the backend
Two reasons: the Worker runtime needs no build step, and every module can be
syntax-checked and unit-tested **without installing anything** — which is what made
50 real assertions runnable in this environment instead of promised. The frontend
keeps its own JS/JSX toolchain. Adding `tsc` to `backend/` later is a one-file change.

### Neon over `@neondatabase/serverless` (HTTP)
The HTTP driver works in Workers (no TCP), so one code path serves local Node and
production. Queries are tagged templates — parameters are never concatenated, which
removes the SQL-injection class structurally. `pg` is used only by the migration
runner, because DDL belongs on a direct (non-pooled) connection.

### Ownership in code, not database RLS
Base44 expressed access rules as per-entity `rls` blocks. They are reproduced in
`backend/src/middleware/authz.js` and, more importantly, in the SQL itself: every
statement for an owned table carries `user_id = $caller`. Postgres RLS was
considered and left out because the neon-http driver sets no per-request role; a
half-configured RLS policy is worse than none. Documented as a follow-up.

### PBKDF2-HMAC-SHA256 (600 000 iterations) instead of Argon2id
Workers has no Argon2 implementation, and importing a WASM build only to hash a
password is a poor trade. 600k PBKDF2-SHA256 is the OWASP-recommended profile for
this situation. The stored format records the algorithm and iteration count, so a
future move to Argon2id is a rehash-on-login change, not a schema change.

### R2 for bytes, Postgres for metadata
Document rows hold `storage_key`, `mime_type`, `size_bytes`. Bytes are streamed
through an authorised route — no public bucket URL, no presigned link to leak. The
storage adapter is an interface, so the Node dev server writes to disk with the same
code path.

### Same-origin CSRF defence
`SameSite=Lax` + a mandatory `Origin`/`Referer` check on every non-GET request. No
CSRF token store, because the API is cookie-authenticated and single-origin; the
allowed origins come from `ALLOWED_ORIGINS` (which is how the Capacitor
`https://localhost` WebView is admitted).

## 3. Streaming — resolved by construction

The previous architecture could not stream: the function transport buffered. In the
independent backend `POST /api/chat` with `stream: true` returns
`text/event-stream` and keeps the response open while it reads the provider's own
SSE. The frame shape is unchanged (`{delta}`, then `{done, content, model, …}` or
`{error, partial}`), so the existing `src/lib/streamChat.js` consumer contract still
holds once the frontend is pointed at the new API.

## 4. Why the workflows live in `ci/workflows/`

The platform's GitHub integration is not permitted to write `.github/workflows/*`
(write was refused with an explicit permission error). The five workflow files are
therefore committed under `ci/workflows/` and must be copied once:

```bash
mkdir -p .github/workflows && cp ci/workflows/*.yml .github/workflows/
```

Everything else in the repository is already at its final path.

## 5. Layout

```
backend/            independent API (Hono, Workers + Node)
  src/routes/       auth · data · library · ai · developer · admin
  src/services/     providers · chat rules · storage · email · audit · ratelimit
  src/middleware/   session, identity, CSRF
  scripts/migrate.js
  test/             50 assertions, run with `node --test`
database/
  migrations/       0001_init.sql — 11 tables, FKs, indexes, updated_at triggers
  seeds/            the 8 real model registry rows
ci/workflows/       CI · Cloudflare deploy · DB migrate · Android debug · Android release
docs/migration/     audit · architecture · security · runbook
capacitor.config.ts
.env.example
``