const MEM0_BASE = "https://api.mem0.ai/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// GET — fetch memories for user
export async function onRequestGet({ params, env }) {
  const { user_id } = params;
  if (!env.MEM0_API_KEY) return json({ memories: [], error: "MEM0_API_KEY not configured" });

  try {
    const res = await fetch(`${MEM0_BASE}/memories/?user_id=${encodeURIComponent(user_id)}&limit=20`, {
      headers: {
        Authorization: `Token ${env.MEM0_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Mem0 API error: ${res.status}`);
    const data = await res.json();
    // Return memories as a simple array of strings for the AI
    const memories = (data.results || data || []).map(m => m.memory || m.text || String(m)).filter(Boolean);
    return json({ memories, count: memories.length });
  } catch (err) {
    return json({ memories: [], error: err.message });
  }
}

// POST — save a memory for user
export async function onRequestPost({ params, env, request }) {
  const { user_id } = params;
  if (!env.MEM0_API_KEY) return json({ success: false, error: "MEM0_API_KEY not configured" });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  // ElevenLabs may wrap params under "parameters"
  const p = body.parameters || body;
  const memory = p.memory || p.text || p.content;
  if (!memory) return json({ success: false, error: "memory field required" }, 400);

  try {
    const res = await fetch(`${MEM0_BASE}/memories/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${env.MEM0_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: memory }],
        user_id,
        metadata: { source: "pastor-dave-pro" },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Mem0 error ${res.status}: ${errText}`);
    }
    return json({ success: true });
  } catch (err) {
    return json({ success: false, error: err.message });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
