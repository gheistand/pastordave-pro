import { requireAdmin, json, CHURCH_ID } from '../_admin_auth.js';

export async function onRequestPut({ request, env, params }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Unauthorized' }, 401);

  const { id } = params;
  if (!id) return json({ error: 'Missing sermon ID' }, 400);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { title, pastor, date, series, scripture, summary, key_points, discussion_questions, youtube_id } = body;

  try {
    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title.trim());
    }
    if (pastor !== undefined) {
      updates.push('pastor = ?');
      values.push(pastor.trim());
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (series !== undefined) {
      updates.push('series = ?');
      values.push(series ? series.trim() : null);
    }
    if (scripture !== undefined) {
      updates.push('scripture = ?');
      values.push(scripture ? scripture.trim() : null);
    }
    if (summary !== undefined) {
      updates.push('summary = ?');
      values.push(summary ? summary.trim() : null);
    }
    if (key_points !== undefined) {
      updates.push('key_points = ?');
      values.push(key_points ? key_points.trim() : null);
    }
    if (discussion_questions !== undefined) {
      updates.push('discussion_questions = ?');
      values.push(discussion_questions ? discussion_questions.trim() : null);
    }
    if (youtube_id !== undefined) {
      updates.push('youtube_id = ?');
      values.push(youtube_id ? youtube_id.trim() : null);
    }

    if (updates.length === 0) {
      return json({ error: 'No fields to update' }, 400);
    }

    values.push(id);
    values.push(CHURCH_ID);

    const query = `UPDATE sermons SET ${updates.join(', ')} WHERE id = ? AND church_id = ?`;
    const result = await env.DB.prepare(query).bind(...values).run();

    if (result.meta.changes === 0) {
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
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
