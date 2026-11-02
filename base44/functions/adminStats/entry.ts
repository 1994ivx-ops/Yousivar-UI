/**
 * Administrative rollup. Admin role is verified server-side before any
 * service-role read — the dashboard never trusts a client-side role check.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [conversations, messages, documents, memories, usersPage, audits] = await Promise.all([
      base44.asServiceRole.entities.Conversation.count(),
      base44.asServiceRole.entities.Message.count(),
      base44.asServiceRole.entities.Document.count(),
      base44.asServiceRole.entities.Memory.count(),
      base44.asServiceRole.entities.User.list('-created_date', 50).catch(() => []),
      base44.asServiceRole.entities.AuditLog.filter({}, { sort: '-created_date', limit: 40 }),
    ]);

    return Response.json({
      counts: { conversations, messages, documents, memories },
      users: (Array.isArray(usersPage) ? usersPage : usersPage.items || []).map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        created_date: u.created_date,
      })),
      audits: audits.items || [],
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Could not load admin data' }, { status: 500 });
  }
}