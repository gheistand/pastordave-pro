// GET  /api/discipleship-group/profile — fetch group profile
// POST /api/discipleship-group/profile — upsert group profile
import { requireChurch, json } from './_dg_auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const profile = await env.DB.prepare(
    'SELECT * FROM group_profiles WHERE user_id = ? AND church_id = ? LIMIT 1'
  ).bind(auth.userId, auth.churchId).first();

  return json({ profile: profile || null });
}

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

  // Check if profile exists
  const existing = await env.DB.prepare(
    'SELECT id FROM group_profiles WHERE user_id = ? AND church_id = ? LIMIT 1'
  ).bind(auth.userId, auth.churchId).first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE group_profiles SET
        group_name = ?,
        group_description = ?,
        group_type = ?,
        leader_name = ?,
        meeting_day = ?,
        meeting_time = ?,
        meeting_location = ?,
        default_meeting_length = ?,
        bible_translation = ?,
        follow_tyndale = ?,
        use_hhh_framework = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      body.group_name || '',
      body.group_description || '',
      body.group_type || '',
      body.leader_name || '',
      body.meeting_day || '',
      body.meeting_time || '',
      body.meeting_location || '',
      body.default_meeting_length || 75,
      body.bible_translation || 'NLT',
      body.follow_tyndale !== undefined ? (body.follow_tyndale ? 1 : 0) : 1,
      body.use_hhh_framework !== undefined ? (body.use_hhh_framework ? 1 : 0) : 1,
      now,
      existing.id
    ).run();

    const updated = await env.DB.prepare(
      'SELECT * FROM group_profiles WHERE id = ?'
    ).bind(existing.id).first();

    return json({ profile: updated });
  } else {
    const id = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO group_profiles (
        id, user_id, church_id,
        group_name, group_description, group_type,
        leader_name, meeting_day, meeting_time, meeting_location,
        default_meeting_length, bible_translation,
        follow_tyndale, use_hhh_framework,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      auth.userId,
      auth.churchId,
      body.group_name || '',
      body.group_description || '',
      body.group_type || '',
      body.leader_name || '',
      body.meeting_day || '',
      body.meeting_time || '',
      body.meeting_location || '',
      body.default_meeting_length || 75,
      body.bible_translation || 'NLT',
      body.follow_tyndale !== undefined ? (body.follow_tyndale ? 1 : 0) : 1,
      body.use_hhh_framework !== undefined ? (body.use_hhh_framework ? 1 : 0) : 1,
      now,
      now
    ).run();

    const created = await env.DB.prepare(
      'SELECT * FROM group_profiles WHERE id = ?'
    ).bind(id).first();

    return json({ profile: created }, 201);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
