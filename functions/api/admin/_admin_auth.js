// Shared admin auth helper for /api/admin/* endpoints
import { verifyClerkToken } from '../_auth.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Verifies the request is from an admin (church tier or ADMIN_USER_ID env var).
 * Returns { userId, churchId } on success, or null on failure.
 * If null, callers should return a 401/403 response.
 */
export async function requireAdmin(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  let userId;
  try {
    const payload = await verifyClerkToken(token);
    userId = payload.sub;
  } catch {
    return null;
  }

  // Allow ADMIN_USER_ID env var — look up their church_id from DB
  if (env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID) {
    const user = await env.DB.prepare('SELECT church_id FROM users WHERE id = ?').bind(userId).first();
    return { userId, churchId: user?.church_id || 'new-horizon-champaign' };
  }

  // Otherwise require church tier with a church_id set
  const user = await env.DB.prepare('SELECT tier, church_id FROM users WHERE id = ?').bind(userId).first();
  if (user && user.tier === 'church' && user.church_id) {
    return { userId, churchId: user.church_id };
  }

  return null;
}
