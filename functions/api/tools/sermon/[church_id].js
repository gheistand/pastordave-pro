export async function onRequestGet(context) {
  const { params, env } = context;
  const { church_id } = params;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const result = await env.DB.prepare(
    `SELECT id, title, speaker as pastor, date, series, scripture, summary, key_points, discussion_questions, youtube_id
     FROM sermons
     WHERE church_id = ?
     ORDER BY date DESC
     LIMIT 1`
  )
    .bind(church_id)
    .first();

  if (!result) {
    return Response.json(
      { message: "No sermons loaded yet" },
      { headers: corsHeaders }
    );
  }

  const sermon = {
    ...result,
    key_points: result.key_points ? JSON.parse(result.key_points) : [],
    discussion_questions: result.discussion_questions
      ? JSON.parse(result.discussion_questions)
      : [],
  };

  return Response.json(sermon, { headers: corsHeaders });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
