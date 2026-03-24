// Shared auth helper for discipleship-group endpoints
// Requires church tier with a valid church_id
import { verifyClerkToken } from '../_auth.js';

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}

/**
 * Verifies the request is from a church-tier user.
 * Returns { userId, churchId } on success, or null on failure.
 */
export async function requireChurch(request, env) {
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

  // Allow ADMIN_USER_ID env var
  if (env.ADMIN_USER_ID && userId === env.ADMIN_USER_ID) {
    const user = await env.DB.prepare('SELECT church_id FROM users WHERE id = ?').bind(userId).first();
    if (user?.church_id) return { userId, churchId: user.church_id };
  }

  const user = await env.DB.prepare(
    'SELECT tier, church_id FROM users WHERE id = ?'
  ).bind(userId).first();

  if (user && user.tier === 'church' && user.church_id) {
    return { userId, churchId: user.church_id };
  }

  return null;
}
