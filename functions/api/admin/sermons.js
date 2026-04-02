import { requireAdmin, json } from './_admin_auth.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM sermons WHERE church_id = ? ORDER BY date DESC'
    ).bind(admin.churchId).all();

    return json({ sermons: results });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { title, pastor, date, series, scripture, summary, key_points, discussion_questions, youtube_id } = body;

  if (!title || !pastor || !date) {
    return json({ error: 'title, pastor, and date are required' }, 400);
  }

  try {
    const id = crypto.randomUUID();
    const createdAt = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO sermons (id, church_id, title, speaker, date, series, scripture, summary, key_points, discussion_questions, youtube_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      admin.churchId,
      title.trim(),
      pastor.trim(),
      date,
      series || null,
      scripture || null,
      summary || null,
      key_points || null,
      discussion_questions || null,
      youtube_id || null,
      createdAt
    ).run();

    return json({ success: true, id });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
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
    const result = await env.DB.prepare(
      'DELETE FROM sermons WHERE id = ? AND church_id = ?'
    ).bind(id, admin.churchId).run();

    if (result.meta.rows === 0) {
      return json({ error: 'Sermon not found' }, 404);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: 'DB error', detail: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
