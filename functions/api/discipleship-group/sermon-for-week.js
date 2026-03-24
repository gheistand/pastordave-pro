// GET /api/discipleship-group/sermon-for-week?meeting_date=YYYY-MM-DD
// Returns the most recent sermon on or before the most recent Sunday <= meeting_date
import { requireChurch, json } from './_dg_auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const meetingDate = url.searchParams.get('meeting_date');

  if (!meetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return json({ error: 'meeting_date required (YYYY-MM-DD)' }, 400);
  }

  // Find most recent Sunday on or before meeting_date
  const d = new Date(meetingDate + 'T00:00:00Z');
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday
  const daysBack = dayOfWeek; // days back to reach Sunday
  const sunday = new Date(d.getTime() - daysBack * 86400000);
  const sundayStr = sunday.toISOString().slice(0, 10);

  const sermon = await env.DB.prepare(
    `SELECT id, title, scripture, speaker, summary, date,
            key_points, discussion_questions, youtube_id, reading_theme
     FROM sermons
     WHERE church_id = ? AND date <= ?
     ORDER BY date DESC
     LIMIT 1`
  ).bind(auth.churchId, sundayStr).first();

  if (!sermon) {
    return json({ sermon: null, message: 'No sermon found for this week' });
  }

  // Parse JSON fields
  let keyPoints = [];
  let discussionQuestions = [];
  try { keyPoints = JSON.parse(sermon.key_points || '[]'); } catch {}
  try { discussionQuestions = JSON.parse(sermon.discussion_questions || '[]'); } catch {}

  return json({
    sermon: {
      ...sermon,
      key_points: keyPoints,
      discussion_questions: discussionQuestions,
    },
    sunday: sundayStr,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
