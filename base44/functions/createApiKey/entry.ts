/**
 * Issues a workspace API key. The full key is returned exactly once; only its
 * SHA-256 hash and a short prefix are stored.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

function randomKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return 'ysv_' + body;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim().slice(0, 60);
    if (!name) return Response.json({ error: 'A key name is required' }, { status: 400 });

    const existing = await base44.entities.ApiKey.filter({ revoked: false }, { limit: 20 });
    const activeKeys = existing.items || existing;
    if (activeKeys.length >= 10) {
      return Response.json({ error: 'Key limit reached — revoke an unused key first' }, { status: 400 });
    }

    const key = randomKey();
    const record = await base44.entities.ApiKey.create({
      name,
      prefix: key.slice(0, 11),
      hash: await sha256(key),
      revoked: false,
    });

    await base44.entities.AuditLog.create({
      action: 'apikey.create',
      actor_email: user.email || '',
      detail: name,
    }).catch(() => {});

    return Response.json({
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      key,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not create key' }, { status: 500 });
  }
}