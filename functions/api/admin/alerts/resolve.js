import { requireAdmin, json } from '../_admin_auth.js';

export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { id } = body;
  if (!id) return json({ error: 'id is required' }, 400);

  try {
    await env.DB.prepare(
      'UPDATE pastoral_alerts SET resolved = 1 WHERE id = ?'
    ).bind(id).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
