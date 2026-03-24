// POST /api/discipleship-group/build-agenda
// Assembles a formatted, time-stamped agenda markdown from a discussion guide
import { requireChurch, json } from './_dg_auth.js';

// Time allocations per meeting length (in minutes)
const SCHEDULES = {
  60: [
    { label: 'Welcome & Gathering',           duration: 5 },
    { label: 'Opening Prayer',                 duration: 5 },
    { label: "This Week's Readings Review",    duration: 5 },
    { label: 'HEAD Discussion',                duration: 10 },
    { label: 'HEART Discussion',               duration: 10 },
    { label: 'HANDS Discussion',               duration: 10 },
    { label: 'Prayer Requests & Sharing',      duration: 10 },
    { label: 'Closing Prayer',                 duration: 5 },
  ],
  75: [
    { label: 'Welcome & Gathering',           duration: 5 },
    { label: 'Opening Prayer',                 duration: 5 },
    { label: "This Week's Readings Review",    duration: 10 },
    { label: 'HEAD Discussion',                duration: 15 },
    { label: 'HEART Discussion',               duration: 15 },
    { label: 'HANDS Discussion',               duration: 10 },
    { label: 'Prayer Requests & Sharing',      duration: 10 },
    { label: 'Closing Prayer',                 duration: 5 },
  ],
  90: [
    { label: 'Welcome & Gathering',           duration: 5 },
    { label: 'Opening Prayer',                 duration: 5 },
    { label: "This Week's Readings Review",    duration: 10 },
    { label: 'HEAD Discussion',                duration: 20 },
    { label: 'HEART Discussion',               duration: 20 },
    { label: 'HANDS Discussion',               duration: 15 },
    { label: 'Prayer Requests & Sharing',      duration: 10 },
    { label: 'Closing Prayer',                 duration: 5 },
  ],
};

function parseTime(timeStr) {
  // Parse "HH:MM" or "H:MM" in 24h format
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m; // total minutes since midnight
}

function formatTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function buildAgendaMarkdown({ guideJson, guideMarkdown, agendaInputs, meetingLength, meetingTime, meetingDate, meetingLocation, leaderName }) {
  const length = [60, 75, 90].includes(meetingLength) ? meetingLength : 75;
  const schedule = SCHEDULES[length];

  const startMinutes = parseTime(meetingTime);
  let currentMinutes = startMinutes;

  const lines = [];

  // Header
  lines.push(`# Meeting Agenda`);
  if (guideJson?.sections?.[0]) {
    // Try to get sermon title from guide context
  }
  lines.push('');
  if (meetingDate) lines.push(`**Date:** ${meetingDate}`);
  if (meetingLocation) lines.push(`**Location:** ${meetingLocation}`);
  if (leaderName) lines.push(`**Leader:** ${leaderName}`);
  lines.push(`**Meeting Length:** ${length} minutes`);
  lines.push('');

  if (agendaInputs?.worship_song) {
    lines.push(`**Worship Song:** ${agendaInputs.worship_song}`);
  }
  if (agendaInputs?.announcements) {
    lines.push(`**Announcements:** ${agendaInputs.announcements}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Time-stamped schedule
  lines.push('## Schedule');
  lines.push('');

  for (const item of schedule) {
    const timeLabel = currentMinutes !== null ? `**${formatTime(currentMinutes)}**` : '';
    const durationLabel = `*(${item.duration} min)*`;

    // Augment certain sections with content from the guide
    if (item.label === 'Opening Prayer' && (agendaInputs?.opening_prayer_leader || guideJson?.opening_prayer_prompt)) {
      lines.push(`${timeLabel} ${item.label} ${durationLabel}`);
      if (agendaInputs?.opening_prayer_leader) lines.push(`  - *Led by: ${agendaInputs.opening_prayer_leader}*`);
      if (guideJson?.opening_prayer_prompt) lines.push(`  - ${guideJson.opening_prayer_prompt}`);
    } else if (item.label === "This Week's Readings Review" && Array.isArray(agendaInputs?.readings) && agendaInputs.readings.length > 0) {
      lines.push(`${timeLabel} ${item.label} ${durationLabel}`);
      agendaInputs.readings.forEach(r => {
        const parts = [r.old_testament, r.new_testament, r.psalm, r.proverbs].filter(Boolean);
        lines.push(`  - ${parts.join(' · ')}`);
      });
    } else if (item.label.startsWith('HEAD') && guideJson) {
      const section = (guideJson.sections || []).find(s => s.type === 'HEAD');
      lines.push(`${timeLabel} 🧠 ${item.label} ${durationLabel}`);
      if (section?.guiding_question) lines.push(`  - *${section.guiding_question}*`);
      (section?.questions || []).forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    } else if (item.label.startsWith('HEART') && guideJson) {
      const section = (guideJson.sections || []).find(s => s.type === 'HEART');
      lines.push(`${timeLabel} ❤️ ${item.label} ${durationLabel}`);
      if (section?.guiding_question) lines.push(`  - *${section.guiding_question}*`);
      (section?.questions || []).forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    } else if (item.label.startsWith('HANDS') && guideJson) {
      const section = (guideJson.sections || []).find(s => s.type === 'HANDS');
      lines.push(`${timeLabel} 🙌 ${item.label} ${durationLabel}`);
      if (section?.guiding_question) lines.push(`  - *${section.guiding_question}*`);
      (section?.questions || []).forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
    } else if (item.label === 'Closing Prayer') {
      lines.push(`${timeLabel} ${item.label} ${durationLabel}`);
      if (agendaInputs?.closing_prayer_leader) lines.push(`  - *Led by: ${agendaInputs.closing_prayer_leader}*`);
      if (guideJson?.closing_prayer_prompt) lines.push(`  - ${guideJson.closing_prayer_prompt}`);
    } else {
      lines.push(`${timeLabel} ${item.label} ${durationLabel}`);
    }

    if (currentMinutes !== null) currentMinutes += item.duration;
    lines.push('');
  }

  if (agendaInputs?.next_week_preview) {
    lines.push('---');
    lines.push('');
    lines.push('## Next Week');
    lines.push(agendaInputs.next_week_preview);
    lines.push('');
  }

  if (currentMinutes !== null && startMinutes !== null) {
    lines.push(`---`);
    lines.push(`*End time: ${formatTime(currentMinutes)}*`);
  }

  return lines.join('\n');
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

  // Resolve guide content: from guide_id (fetch from DB) or inline guide_json/guide_markdown
  let guideJson = body.guide_json || null;
  let guideMarkdown = body.guide_markdown || null;
  let guideId = body.guide_id || null;
  let groupProfileId = body.group_profile_id || null;
  let meetingLength = body.meeting_length || 75;
  let meetingTime = body.meeting_time || null;
  let meetingDate = body.meeting_date || null;
  let meetingLocation = body.meeting_location || null;
  let leaderName = body.leader_name || null;

  if (guideId && !guideJson) {
    const guide = await env.DB.prepare(
      'SELECT guide_json, guide_markdown, meeting_length, group_profile_id FROM discussion_guides WHERE id = ? AND user_id = ? AND church_id = ?'
    ).bind(guideId, auth.userId, auth.churchId).first();

    if (!guide) return json({ error: 'Guide not found' }, 404);
    try { guideJson = JSON.parse(guide.guide_json); } catch {}
    guideMarkdown = guide.guide_markdown;
    if (!meetingLength) meetingLength = guide.meeting_length || 75;
    if (!groupProfileId) groupProfileId = guide.group_profile_id;
  }

  // Fill in group profile details if not provided
  if (!meetingTime || !meetingLocation || !leaderName) {
    const profileQuery = groupProfileId
      ? 'SELECT meeting_time, meeting_location, leader_name, default_meeting_length FROM group_profiles WHERE id = ? AND church_id = ?'
      : 'SELECT meeting_time, meeting_location, leader_name, default_meeting_length FROM group_profiles WHERE user_id = ? AND church_id = ? LIMIT 1';
    const profileParams = groupProfileId
      ? [groupProfileId, auth.churchId]
      : [auth.userId, auth.churchId];

    const profile = await env.DB.prepare(profileQuery).bind(...profileParams).first();
    if (profile) {
      if (!meetingTime) meetingTime = profile.meeting_time;
      if (!meetingLocation) meetingLocation = profile.meeting_location;
      if (!leaderName) leaderName = profile.leader_name;
      if (meetingLength === 75 && profile.default_meeting_length) meetingLength = profile.default_meeting_length;
    }
  }

  const agendaMarkdown = buildAgendaMarkdown({
    guideJson,
    guideMarkdown,
    agendaInputs: body.agenda_inputs || {},
    meetingLength: parseInt(meetingLength) || 75,
    meetingTime,
    meetingDate,
    meetingLocation,
    leaderName,
  });

  const shareToken = crypto.randomUUID();

  return json({
    agenda_markdown: agendaMarkdown,
    share_token: shareToken,
    meeting_length: meetingLength,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
}
