export async function onRequestGet({ params, env }) {
  const { church_id } = params;

  const result = await env.DB.prepare(
    "SELECT * FROM churches WHERE id = ? AND active = 1"
  )
    .bind(church_id)
    .first();

  if (!result) {
    return new Response(JSON.stringify({ error: "Church not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (result.next_steps && typeof result.next_steps === "string") {
    try {
      result.next_steps = JSON.parse(result.next_steps);
    } catch {
      // leave as string if parse fails
    }
  }

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
