// GET /api/discipleship-group/tyndale-readings?meeting_date=YYYY-MM-DD&group_id=xxx
// Returns 7 days of One Year Bible readings for the week leading up to meeting_date.
// Window: day after the previous occurrence of meeting_day through meeting_date.
import { requireChurch, json } from './_dg_auth.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayNameToNum(name) {
  const idx = DAY_NAMES.findIndex(d => d.toLowerCase() === (name || '').toLowerCase());
  return idx >= 0 ? idx : 4; // default Thursday
}

// Build array of { month, day } for the 7-day window ending on meetingDate (inclusive)
function getReadingWindow(meetingDateStr, meetingDayName) {
  const meetingDate = new Date(meetingDateStr + 'T00:00:00Z');
  const meetingDayNum = dayNameToNum(meetingDayName);
  const dayOfWeek = meetingDate.getUTCDay();

  // How many days back to the most recent meeting_day (strictly before meeting_date if same day)
  let daysBack = (dayOfWeek - meetingDayNum + 7) % 7;
  if (daysBack === 0) daysBack = 7; // go to previous week's meeting day

  // Previous meeting day occurrence
  const prevMeetingDay = new Date(meetingDate.getTime() - daysBack * 86400000);

  // Window: day after prevMeetingDay through meetingDate
  const days = [];
  for (let i = 1; i <= daysBack; i++) {
    const d = new Date(prevMeetingDay.getTime() + i * 86400000);
    days.push({ month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  }
  return days;
}

export async function onRequestGet({ request, env }) {
  const auth = await requireChurch(request, env);
  if (!auth) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const meetingDate = url.searchParams.get('meeting_date');
  const groupId = url.searchParams.get('group_id');

  if (!meetingDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return json({ error: 'meeting_date required (YYYY-MM-DD)' }, 400);
  }

  // Look up group profile for meeting_day
  let meetingDay = 'Thursday'; // default
  if (groupId) {
    const profile = await env.DB.prepare(
      'SELECT meeting_day FROM group_profiles WHERE id = ? AND church_id = ?'
    ).bind(groupId, auth.churchId).first();
    if (profile?.meeting_day) meetingDay = profile.meeting_day;
  } else {
    // Fall back to user's profile
    const profile = await env.DB.prepare(
      'SELECT meeting_day FROM group_profiles WHERE user_id = ? AND church_id = ? LIMIT 1'
    ).bind(auth.userId, auth.churchId).first();
    if (profile?.meeting_day) meetingDay = profile.meeting_day;
  }

  const windowDays = getReadingWindow(meetingDate, meetingDay);

  if (windowDays.length === 0) {
    return json({ readings: [], window_start: null, window_end: null });
  }

  // Query bible_reading_plan for each day in the window
  // Build placeholders: WHERE (month=? AND day=?) OR (month=? AND day=?) ...
  const placeholders = windowDays.map(() => '(month = ? AND day = ?)').join(' OR ');
  const params = windowDays.flatMap(d => [d.month, d.day]);

  const result = await env.DB.prepare(
    `SELECT id, month, day, old_testament, new_testament, psalm, proverbs
     FROM bible_reading_plan
     WHERE ${placeholders}
     ORDER BY month, day`
  ).bind(...params).all();

  const rows = result.results || [];

  // Format window bounds as YYYY-MM-DD strings
  const first = windowDays[0];
  const last = windowDays[windowDays.length - 1];
  const pad = n => String(n).padStart(2, '0');
  const windowStart = `2024-${pad(first.month)}-${pad(first.day)}`; // year is nominal (plan repeats)
  const windowEnd = `2024-${pad(last.month)}-${pad(last.day)}`;

  return json({
    readings: rows,
    window_start: windowStart,
    window_end: windowEnd,
    meeting_day: meetingDay,
    days_in_window: windowDays.length,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
