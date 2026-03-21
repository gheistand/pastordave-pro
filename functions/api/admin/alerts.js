import { requireAdmin, json } from './_admin_auth.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM pastoral_alerts WHERE church_id = ? ORDER BY created_at DESC'
    ).bind(admin.churchId).all();

    return json({ alerts: results });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
