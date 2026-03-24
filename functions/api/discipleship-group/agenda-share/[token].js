// GET /api/discipleship-group/agenda-share/:token
// Public endpoint — no auth required. Returns agenda_markdown for the given share_token.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function onRequestGet({ params, env }) {
  const { token } = params;

  if (!token) {
    return json({ error: 'Token required' }, 400);
  }

  const agenda = await env.DB.prepare(
    `SELECT id, meeting_date, meeting_location, leader_name,
            agenda_markdown, created_at
     FROM meeting_agendas
     WHERE share_token = ?
     LIMIT 1`
  ).bind(token).first();

  if (!agenda) {
    return json({ error: 'Agenda not found' }, 404);
  }

  return json({
    meeting_date: agenda.meeting_date,
    meeting_location: agenda.meeting_location,
    leader_name: agenda.leader_name,
    agenda_markdown: agenda.agenda_markdown,
    created_at: agenda.created_at,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
