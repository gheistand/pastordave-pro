// GET /api/discipleship-group/agendas — list saved agendas, most recent first
import { requireChurch, json } from './_dg_auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const result = await env.DB.prepare(
    `SELECT id, meeting_date, meeting_location, leader_name,
            agenda_markdown, share_token, created_at
     FROM meeting_agendas
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(auth.userId).all();

  return json({ agendas: result.results || [] });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
