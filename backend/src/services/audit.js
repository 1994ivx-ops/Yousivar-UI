/**
 * Audit trail + usage accounting. Writes are fire-and-forget: a failed audit
 * insert never fails the user's request, and never logs a secret.
 */
import { sanitize } from './providers.js';

export async function recordAction(db, entry) {
  const {
    userId = null, action, actorEmail = '', model = null, latencyMs = null, chars = null, detail = '',
  } = entry;
  if (!action) return;
  try {
    await db.many`
      insert into audit_logs (user_id, action, actor_email, model, latency_ms, chars, detail)
      values (${userId}, ${action}, ${actorEmail.slice(0, 254)}, ${model}, ${latencyMs}, ${chars}, ${sanitize(detail, []).slice(0, 400)})
    `;
  } catch {
    // Auditing must never break a request.
  }
}

/** Per-account provider counters, matching the columns the Providers screen reads. */
export async function recordProviderSuccess(db, accountId, { latencyMs, tokens = 0 }) {
  try {
    await db.many`
      update provider_accounts set
        usage_requests = usage_requests + 1,
        usage_tokens = usage_tokens + ${tokens},
        last_latency_ms = ${latencyMs},
        last_used = now(),
        status = 'connected',
        status_detail = 'Last call succeeded',
        checked_at = now()
      where id = ${accountId}
    `;
  } catch { /* counters are best effort */ }
}

export async function recordProviderFailure(db, accountId, detail, status) {
  try {
    await db.many`
      update provider_accounts set
        usage_errors = usage_errors + 1,
        status = ${status === 401 || status === 403 ? 'invalid' : 'error'},
        status_detail = ${String(detail).slice(0, 300)},
        checked_at = now()
      where id = ${accountId}
    `;
  } catch { /* best effort */ }
}