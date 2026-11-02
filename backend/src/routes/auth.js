/**
 * Authentication: registration, login, logout, password reset, email verification.
 *
 * Replaces Base44's managed auth with first-party sessions in PostgreSQL.
 * Tokens are single-use and stored hashed; passwords use PBKDF2-SHA256 600k.
 */
import { Hono } from 'hono';
import { randomToken, sha256Hex, hashPassword, verifyPassword } from '../crypto.js';
import * as v from '../validate.js';
import { badRequest, unauthorized, tooMany } from '../errors.js';
import { mailerFor } from '../services/email.js';
import { hit } from '../services/ratelimit.js';
import { recordAction } from '../services/audit.js';
import {
  createSession, forgetCookie, identify, requireUser, sessionCookie,
} from '../middleware/session.js';

const auth = new Hono();

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  full_name: row.full_name || '',
  role: row.role,
  email_verified: Boolean(row.email_verified_at),
});

const RESET_MINUTES = 30;
const VERIFY_HOURS = 48;

auth.post('/register', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const body = await c.req.json().catch(() => ({}));

  const email = v.email(body.email);
  const password = v.password(body.password);
  const fullName = v.optionalText(body.full_name, { field: 'full_name', max: 120 });

  await hit(db, { bucket: 'register', subject: c.req.header('cf-connecting-ip') || 'unknown', limit: 10, windowSeconds: 3600 });

  const existing = await db.one`select id from users where email = ${email}`;
  if (existing) throw badRequest('That email is already registered');

  const mailer = mailerFor(config);
  const passwordHash = await hashPassword(password);
  // Without a mail provider we cannot verify, so the account starts verified and
  // the administrator is told (see /api/admin/stats → mail_configured).
  const verified = mailer.configured ? null : new Date().toISOString();

  const user = await db.one`
    insert into users (email, full_name, password_hash, email_verified_at, role)
    values (${email}, ${fullName}, ${passwordHash}, ${verified},
      case when exists (select 1 from users) then 'user' else 'admin' end)
    returning id, email, full_name, role, email_verified_at
  `;

  if (!user) throw badRequest('Could not create that account');

  if (mailer.configured) {
    const token = randomToken(32);
    await db.many`
      insert into auth_tokens (id, user_id, kind, expires_at)
      values (${await sha256Hex(token)}, ${user.id}, 'email_verify', now() + ${`${VERIFY_HOURS} hours`}::interval)
    `;
    await mailer.sendEmailVerification({
      to: email,
      link: `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`,
    });
  }

  await recordAction(db, { userId: user.id, action: 'auth.register', actorEmail: email });

  return c.json({
    user: publicUser(user),
    needs_verification: mailer.configured,
    ...(mailer.configured ? {} : { warning: 'Email delivery is not configured on this deployment, so the account was verified immediately.' }),
  }, 201);
});

auth.post('/login', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const body = await c.req.json().catch(() => ({}));
  const email = v.email(body.email);
  const password = v.password(body.password);
  const ip = c.req.header('cf-connecting-ip') || 'unknown';

  await hit(db, { bucket: 'login', subject: `${ip}|${email}`, limit: 10, windowSeconds: 60 });

  const row = await db.one`
    select id, email, full_name, role, password_hash, email_verified_at, disabled
    from users where email = ${email}
  `;
  // Same message and similar timing whether or not the account exists.
  const ok = row ? await verifyPassword(password, row.password_hash || '') : false;
  if (!row || !ok) throw unauthorized('Email or password is incorrect');
  if (row.disabled) throw unauthorized('This account is disabled');

  const { cookie } = await createSession(db, config, {
    userId: row.id,
    userAgent: c.req.header('user-agent') || '',
    ip,
  });
  c.header('Set-Cookie', cookie, { append: true });
  await recordAction(db, { userId: row.id, action: 'auth.login', actorEmail: row.email });
  return c.json({ user: publicUser(row) });
});

auth.post('/logout', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const cookies = await import('../cookies.js');
  const token = cookies.parseCookies(c.req.header('cookie'))[cookies.SESSION_COOKIE];
  if (token) await db.many`delete from sessions where id = ${await sha256Hex(token)}`;
  c.header('Set-Cookie', forgetCookie(config), { append: true });
  return c.json({ ok: true });
});

auth.get('/me', async (c) => {
  const user = await identify(c.get('db'), c);
  if (!user) throw unauthorized();
  return c.json({ user: publicUser({ ...user, email_verified_at: user.verified ? new Date() : null }) });
});

auth.post('/password/request-reset', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const body = await c.req.json().catch(() => ({}));
  const email = v.email(body.email);
  await hit(db, { bucket: 'reset', subject: c.req.header('cf-connecting-ip') || 'unknown', limit: 5, windowSeconds: 900 });

  // Always the same answer: the API never reveals whether an account exists.
  const generic = { ok: true, message: 'If that address has an account, a reset link is on its way.' };

  const user = await db.one`select id, email from users where email = ${email} and disabled = false`;
  if (!user) return c.json(generic);

  const token = randomToken(32);
  await db.many`
    insert into auth_tokens (id, user_id, kind, expires_at)
    values (${await sha256Hex(token)}, ${user.id}, 'password_reset', now() + ${`${RESET_MINUTES} minutes`}::interval)
  `;

  const mailer = mailerFor(config);
  const result = await mailer.sendPasswordReset({
    to: user.email,
    link: `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
  });
  if (!result.sent) {
    await recordAction(db, {
      userId: user.id,
      action: 'auth.reset_email_failed',
      actorEmail: user.email,
      detail: `reason:${result.reason}`,
    });
  }
  return c.json(generic);
});

auth.post('/password/reset', async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const token = v.text(body.token, { field: 'token', min: 20, max: 200 });
  const password = v.password(body.password);

  const row = await db.one`
    update auth_tokens set used_at = now()
    where id = ${await sha256Hex(token)} and kind = 'password_reset'
      and used_at is null and expires_at > now()
    returning user_id
  `;
  if (!row) throw badRequest('That reset link is invalid or has expired');

  const hash = await hashPassword(password);
  await db.many`update users set password_hash = ${hash} where id = ${row.user_id}`;
  // A password change invalidates every existing session.
  await db.many`delete from sessions where user_id = ${row.user_id}`;
  await recordAction(db, { userId: row.user_id, action: 'auth.password_reset' });
  return c.json({ ok: true });
});

auth.post('/email/verify', async (c) => {
  const db = c.get('db');
  const body = await c.req.json().catch(() => ({}));
  const token = v.text(body.token, { field: 'token', min: 20, max: 200 });

  const row = await db.one`
    update auth_tokens set used_at = now()
    where id = ${await sha256Hex(token)} and kind = 'email_verify'
      and used_at is null and expires_at > now()
    returning user_id
  `;
  if (!row) throw badRequest('That verification link is invalid or has expired');

  await db.many`update users set email_verified_at = now() where id = ${row.user_id}`;
  const user = await db.one`select id, email, full_name, role, email_verified_at from users where id = ${row.user_id}`;
  return c.json({ user: publicUser(user) });
});

auth.post('/email/resend', async (c) => {
  const db = c.get('db');
  const config = c.get('config');
  const user = await requireUser(c);
  const mailer = mailerFor(config);
  if (!mailer.configured) throw badRequest('Email delivery is not configured on this deployment');

  await hit(db, { bucket: 'verify', subject: user.id, limit: 3, windowSeconds: 3600 });
  const token = randomToken(32);
  await db.many`
    insert into auth_tokens (id, user_id, kind, expires_at)
    values (${await sha256Hex(token)}, ${user.id}, 'email_verify', now() + ${`${VERIFY_HOURS} hours`}::interval)
  `;
  await mailer.sendEmailVerification({
    to: user.email,
    link: `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`,
  });
  return c.json({ ok: true });
});

export default auth;