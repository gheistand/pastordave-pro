/**
 * GET /api/bible-plan?month=3&day=24
 * GET /api/bible-plan (returns today's reading based on UTC date)
 * Returns the One Year Bible reading plan entry for the given day.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  let month = parseInt(url.searchParams.get('month'));
  let day = parseInt(url.searchParams.get('day'));

  // Default to today (Central Time approximate via UTC-5/6)
  if (!month || !day) {
    const now = new Date();
    // Adjust for Central Time (UTC-6 standard, UTC-5 daylight)
    const ct = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    month = ct.getUTCMonth() + 1;
    day = ct.getUTCDate();
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return json({ error: 'Invalid month or day' }, 400);
  }

  const id = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  try {
    const result = await env.DB.prepare(
      'SELECT * FROM bible_reading_plan WHERE id = ?'
    ).bind(id).first();

    if (!result) {
      return json({ error: `No reading found for ${month}/${day}` }, 404);
    }

    return json({
      id: result.id,
      month: result.month,
      day: result.day,
      readings: {
        old_testament: result.old_testament,
        new_testament: result.new_testament,
        psalm: result.psalm,
        proverbs: result.proverbs,
      },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
