import { requireAdmin, json } from './_admin_auth.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  try {
    const church = await env.DB.prepare(
      'SELECT * FROM churches WHERE id = ?'
    ).bind(admin.churchId).first();

    if (!church) return json({ error: 'Church not found' }, 404);

    return json({ church });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { logo_url, accent_color, display_name, weekly_bulletin } = body;

  const updates = [];
  const values = [];

  if (logo_url !== undefined) {
    updates.push('logo_url = ?');
    values.push(logo_url || null);
  }
  if (accent_color !== undefined) {
    updates.push('accent_color = ?');
    values.push(accent_color || null);
  }
  if (display_name !== undefined) {
    updates.push('display_name = ?');
    values.push(display_name || null);
  }
  if (weekly_bulletin !== undefined) {
    updates.push('weekly_bulletin = ?');
    values.push(weekly_bulletin || null);
  }

  if (updates.length === 0) {
    return json({ error: 'No fields to update' }, 400);
  }

  values.push(admin.churchId);

  try {
    await env.DB.prepare(
      `UPDATE churches SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return json({ success: true });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
