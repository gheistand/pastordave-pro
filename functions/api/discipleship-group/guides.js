// GET /api/discipleship-group/guides — list saved discussion guides, most recent first
import { requireChurch, json } from './_dg_auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const result = await env.DB.prepare(
    `SELECT id, meeting_date, week_theme, sermon_title, sermon_scripture,
            meeting_length, guide_markdown, created_at
     FROM discussion_guides
     WHERE user_id = ? AND church_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(auth.userId, auth.churchId).all();

  return json({ guides: result.results || [] });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
