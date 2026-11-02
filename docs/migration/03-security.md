# Security model

What is enforced, where, and what is knowingly not yet covered.

## Authentication

| Concern | Implementation |
|---|---|
| Password storage | PBKDF2-HMAC-SHA256, 600 000 iterations, 16-byte random salt, `pbkdf2-sha256$iter$salt$hash` |
| Comparison | byte-wise constant time (`timingSafeEqual`) |
| Session cookie | `ysv_session`, `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Max-Age` = `SESSION_TTL_DAYS` |
| Session at rest | database stores only `sha256(token)` — a database leak yields no usable cookie |
| Logout | deletes the session row and expires the cookie |
| Password reset | 256-bit token, stored hashed, single use, 30 minutes; resets invalidate **every** session |
| Email verification | same token mechanism, 48 hours |
| Login brute force | 10 attempts per 60s per `ip+email`, 5 resets per 15 min per IP |
| Enumeration | login answers identically for unknown accounts; reset requests always return the same message |
| Developer keys | `ysv_…`, 192-bit random, only the SHA-256 is stored, shown once, revocable, max 10 active |

## Authorisation

- `user_id` is carried by every statement on an owned table — a guessed UUID returns
  404, never another user's row.
- Admin-only: provider accounts (and their sealed credentials), the model registry,
  users, the audit trail.
- A user cannot demote or disable their own admin account (prevents lockout).
- `authz.js` also guards the place where table names reach SQL: an allow-list plus a
  strict identifier pattern. Tested against `drop table`, comments and quoted junk.

## Secrets

- Provider credentials: AES-256-GCM sealed with `APP_ENCRYPTION_KEY`, format
  identical to the previous deployment, so existing sealed rows are reusable.
- No route ever returns `secret_cipher`; the UI gets `key_hint` (`••••1234`) only.
- Provider errors and audit details pass through `sanitize()`, which redacts every
  credential value before it can reach a log or a response.
- Nothing secret is exposed through `VITE_*`. `.env.example` documents every variable
  and marks it public or secret.
- `console.error` on a 5xx logs a 300-character message and the path — never a token,
  a password, a session id or a connection string.

## Transport and headers

`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`,
`Permissions-Policy`, `Cross-Origin-Resource-Policy`, and
`Strict-Transport-Security` when cookies are secure. CORS allows only
`APP_URL` + `ALLOWED_ORIGINS`, with credentials. TLS verification is never disabled
(`pg` is constructed with `rejectUnauthorized: true`).

## Uploads

Declared MIME type **and** magic bytes must agree; PDF/image signatures cannot be
smuggled in as text; size ceiling `MAX_UPLOAD_BYTES` (15 MB default); storage keys are
namespaced per user, strip traversal segments and are never returned to the client.

## SSRF

Administrator-supplied base URLs pass `assertUpstreamAllowed()`: http(s) only, cloud
metadata hosts and `169.254.0.0/16` refused. Loopback and private ranges stay
reachable on purpose — self-hosted Ollama/vLLM/LiteLLM endpoints live there and only
an admin can set a base URL.

## Rate limiting

Fixed-window counters in Postgres (`rate_limits`), shared across Worker instances:
chat 40/min per user, login 10/min per ip+email, register 10/hour per IP, reset
5/15 min per IP, verification resend 3/hour per user.

## Known gaps — stated, not hidden

1. **No database-level RLS.** Access is enforced in SQL predicates and code. A future
   `SET LOCAL app.user_id` + policies would add defence in depth.
2. **PBKDF2, not Argon2id** — mandated by the Workers runtime; see
   `02-architecture.md` §2.
3. **Email is required for a real reset flow.** With `RESEND_API_KEY` unset, the API
   refuses to send, registers the account as verified, and reports
   `mail_configured: false` in `/api/admin/stats`. It never pretends a mail was sent.
4. **Audit inserts are best-effort** (`catch {}`) so a full audit table cannot take
   the product down; a monitoring rule on `audit_logs` volume is still advisable.
5. **`npm run typecheck` is advisory in CI** until the 135 pre-existing frontend type
   errors are cleared. It is reported, never skipped silently.