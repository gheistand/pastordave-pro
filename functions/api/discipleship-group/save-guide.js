// POST /api/discipleship-group/save-guide
import { requireChurch, json } from './_dg_auth.js';

export async function onRequestPost({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO discussion_guides (
      id, user_id, group_profile_id, church_id,
      meeting_date, week_theme, sermon_id, sermon_title,
      sermon_scripture, sermon_summary,
      reading_window_start, reading_window_end,
      readings_json, meeting_length,
      guide_json, guide_markdown, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    auth.userId,
    body.group_profile_id || null,
    auth.churchId,
    body.meeting_date || null,
    body.week_theme || null,
    body.sermon_id || null,
    body.sermon_title || null,
    body.sermon_scripture || null,
    body.sermon_summary || null,
    body.reading_window_start || null,
    body.reading_window_end || null,
    typeof body.readings_json === 'string' ? body.readings_json : JSON.stringify(body.readings_json || []),
    body.meeting_length || 75,
    typeof body.guide_json === 'string' ? body.guide_json : JSON.stringify(body.guide_json || {}),
    body.guide_markdown || '',
    now
  ).run();

  return json({ id, saved: true }, 201);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
