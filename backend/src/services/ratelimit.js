/**
 * Fixed-window rate limiting backed by PostgreSQL, so every Worker instance
 * shares the same counters. O(1) per request instead of scanning the audit log.
 */
import { tooMany } from '../errors.js';

export function windowStart(date, windowSeconds) {
  const ms = Math.floor(date.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000;
  return new Date(ms);
}

/**
 * Increments the counter and throws 429 past the limit.
 * `subject` is a user id, an IP, or both — never an email address.
 */
export async function hit(db, { bucket, subject, limit, windowSeconds }) {
  const start = windowStart(new Date(), windowSeconds);
  const row = await db.one`
    insert into rate_limits (bucket, subject, window_start, hits)
    values (${bucket}, ${String(subject).slice(0, 120)}, ${start}, 1)
    on conflict (bucket, subject, window_start)
    do update set hits = rate_limits.hits + 1
    returning hits
  `;
  if (row && row.hits > limit) {
    throw tooMany(`Rate limit reached — ${limit} requests per ${windowSeconds}s. Wait a moment and try again.`);
  }
  return row?.hits || 1;
}

/** Housekeeping used by a scheduled Worker event. */
export async function prune(db, olderThanSeconds = 86400) {
  await db.many`delete from rate_limits where window_start < now() - ${`${olderThanSeconds} seconds`}::interval`;
}