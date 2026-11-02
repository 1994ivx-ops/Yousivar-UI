# YOUSIVAR — UI

A cinematic, bilingual (Arabic / English) AI workspace: persistent conversations, multi-model
routing, side-by-side model comparison, private document attachments, user-controlled memory,
hashed API keys and an administrative audit trail.

Brand assets: `yousivar.png` (identity) and `grpwce.mp4` (hero film), referenced from the
welcome surface with autoplay / muted / playsinline / loop, a dark reading scrim, and a static
poster fallback when the video cannot load.

---

## 1. What actually runs

| Layer | Implementation |
|---|---|
| Frontend | React 18 + Vite, Tailwind, React Router, react-markdown |
| Auth | Platform authentication (email/password, Google, OTP, reset) — routes `/login`, `/register`, `/forgot-password`, `/reset-password` |
| Database | Platform entity store (7 entities, row-level security per record owner) |
| Server logic | Backend functions `chatCompletion`, `createApiKey`, `adminStats` |
| Model layer | `base44/shared/models.ts` — the single registry of routing keys + real capability flags |
| Private files | `UploadPrivateFile`, signed on demand inside the server function |
| Mobile | iOS / Android published from this same codebase by the platform |

### Data model (`base44/entities`)

`Conversation`, `Message`, `AIModel`, `Memory`, `Document`, `ApiKey`, `AuditLog`.

Every user-owned entity is locked to its creator (`created_by_id`); `AIModel` is publicly
readable but admin-writable; `AuditLog` is readable only by the `admin` role.

### Server functions

- **chatCompletion** — validates model key, message count/length, memory count and document
  URIs (storage URIs only, never caller URLs), signs at most 4 app-owned files, injects
  user-approved memory and document names, calls the platform LLM integration, writes an audit
  record. 401 / 400 / 500 boundaries, no secrets on the client.
- **createApiKey** — generates `ysv_<48 hex>`, stores only the SHA-256 hash plus an 11-char
  prefix, returns the full key exactly once, caps active keys at 10.
- **adminStats** — verifies `role === 'admin'` server-side before any service-role read.

---

## 2. Model registry

| Key | Files | Web grounding |
|---|---|---|
| `automatic` | yes | yes |
| `gemini_3_8_flash` | yes | yes |
| `gpt_6_luna` | yes | no |
| `gpt_6_sol` | yes | no |
| `claude-sonnet-5` | yes | no |
| `claude_opus_5_5` | yes | no |
| `base1_5_1` | yes | no |
| `glm_5_2` | **no** | no |

Capability flags are enforced, not decorative: asking for web search or documents on a model
without support returns a 400 instead of silently degrading. Admins can hide registry entries
from every picker; the registry itself is code, so a forged key cannot add a provider.

---

## 3. Local development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # production bundle
```

Environment and secrets live in the platform project settings — never in the repository. There
are no provider API keys to add today: inference runs through the platform integration, so no
third-party secret is required for chat.

---

## 4. Deployment

Publish from the editor (Publish button) to get the hosted URL, custom domain, SEO settings and
the native iOS/Android builds. Database migrations are implicit: entity schemas in
`base44/entities/*.jsonc` are the migration.

### Self-hosted target — implemented in this repository

The independent stack now exists alongside the running app: an API (`backend/`, Hono on
Cloudflare Workers or Node), a PostgreSQL schema for Neon (`database/`), sessions and
RBAC, provider routing, R2 document storage, CI/CD workflows (`ci/workflows/`), a
Capacitor config, and the full migration documentation in `docs/migration/`.

| Layer | Platform build (running today) | Independent build (in this repo) |
|---|---|---|
| Compute | backend functions | `backend/src` — Hono app, Workers + Node |
| Database | entity store | Neon PostgreSQL, `database/migrations/0001_init.sql` |
| Files | `UploadPrivateFile` | Cloudflare R2, authorised download route |
| Auth | platform auth | first-party sessions, PBKDF2-SHA256, `backend/src/routes/auth.js` |
| Model layer | platform LLM integration | `backend/src/services/providers.js` (same catalogue, real HTTP) |
| Streaming | buffered (not supported) | real SSE, `POST /api/chat` with `stream: true` |
| Mobile | platform publishing | `capacitor.config.ts` + Android workflow |

Start at `docs/migration/04-runbook.md`. The frontend is not pointed at the new API yet:
that cut-over is step 6 of the runbook, and it happens only after the API is deployed
and verified.

---

## 5. Security posture

- Authorization on every record via RLS (owner-anchored, admin-elevated where intended).
- Admin rollup is a server function, not a client-side role check.
- Document URIs are validated to app-owned storage and signed server-side for 15 minutes —
  arbitrary URLs cannot be submitted (SSRF guard).
- API keys are stored hashed; the plaintext exists only in the creation response.
- Model output renders through react-markdown without raw HTML, so untrusted markdown cannot
  inject script.
- Rate/abuse limits at the platform edge; per-call input bounds in the function (≤40 messages,
  ≤30 000 characters, ≤20 memories, ≤4 documents).

---

## 6. Known limitations (read before judging completeness)

1. **Responses are not token-streamed.** The model call returns one completion; the UI shows a
   thinking state and renders the answer once. True SSE streaming needs the self-hosted gateway.
2. **No vector retrieval.** Attached documents are sent with the prompt (signed URL) and cited by
   name. There is no chunking, embedding or Vectorize index.
3. **No public OpenAI-compatible endpoint.** `/v1/chat/completions` semantics, SSE framing and
   error shapes are a self-hosted deliverable; keys here are issued and hashed for your own
   integrations.
4. **No Capacitor project.** Native apps are built by the platform, not by a local Gradle/Xcode
   pipeline in this repository.
5. **No automated test suite in this repository.** The chat function is exercised against the live
   model integration during verification; there are no unit/e2e runners wired up.
6. Cloudflare bindings, R2 buckets and the Neon database are configured in `backend/wrangler.jsonc`
   and `.env.example`; creating the accounts and storing the secrets is an owner action
   (`docs/migration/04-runbook.md`), so the independent deployment is **not** live yet.
7. The backend test suite (50 assertions, `cd backend && npm test`) covers cryptography,
   authorisation, routing rules, SSRF and upload validation. There is still no browser-level
   end-to-end runner for the frontend.

---

## 7. License

MIT — see `LICENSE`.