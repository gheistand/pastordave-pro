// POST /api/discipleship-group/save-agenda
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
  const shareToken = body.share_token || crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO meeting_agendas (
      id, user_id, group_profile_id, discussion_guide_id,
      meeting_date, meeting_location, leader_name,
      opening_prayer_leader, closing_prayer_leader,
      worship_song, announcements, next_week_preview,
      agenda_markdown, share_token, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    auth.userId,
    body.group_profile_id || null,
    body.discussion_guide_id || null,
    body.meeting_date || null,
    body.meeting_location || null,
    body.leader_name || null,
    body.opening_prayer_leader || null,
    body.closing_prayer_leader || null,
    body.worship_song || null,
    body.announcements || null,
    body.next_week_preview || null,
    body.agenda_markdown || '',
    shareToken,
    now
  ).run();

  return json({ id, share_token: shareToken, saved: true }, 201);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
