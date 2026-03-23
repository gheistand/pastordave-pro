// Pastor Dave Pro — User Memory Tool (flat URL, query param based)
// GET  /api/tools/memory?user_id=xxx  → fetch memories
// POST /api/tools/memory              → save memory (user_id in body)
// Uses Mem0 for persistent cross-session memory

const MEM0_BASE = 'https://api.mem0.ai/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// GET — fetch memories for user (query param based)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const user_id = url.searchParams.get('user_id');

  if (!user_id) return json({ memories: [], error: 'user_id query param required' }, 400);
  if (!env.MEM0_API_KEY) return json({ memories: [], error: 'MEM0_API_KEY not configured' });

  return fetchMemories(user_id, env);
}

// POST — unified endpoint: action="get" fetches, action="save" (or memory field) saves
// Both get_user_memory and save_user_memory tools POST here
export async function onRequestPost({ request, env }) {
  if (!env.MEM0_API_KEY) return json({ success: false, error: 'MEM0_API_KEY not configured' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400);
  }

  // ElevenLabs may wrap params under "parameters"
  const p = body.parameters || body;
  const user_id = p.user_id;
  const memory = p.memory || p.text || p.content;
  const action = p.action || (memory ? 'save' : 'get');

  if (!user_id) return json({ success: false, error: 'user_id required' }, 400);

  if (action === 'get') {
    return fetchMemories(user_id, env);
  }

  // Save memory
  if (!memory) return json({ success: false, error: 'memory field required for save' }, 400);

  try {
    const res = await fetch(`${MEM0_BASE}/memories/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.MEM0_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: memory }],
        user_id,
        metadata: { source: 'pastor-dave-pro' },
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

async function fetchMemories(user_id, env) {
  try {
    const res = await fetch(`${MEM0_BASE}/memories/?user_id=${encodeURIComponent(user_id)}&limit=20`, {
      headers: {
        Authorization: `Token ${env.MEM0_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Mem0 API error: ${res.status}`);
    const data = await res.json();
    const memories = (data.results || data || [])
      .map(m => m.memory || m.text || String(m))
      .filter(Boolean);
    return json({ memories, count: memories.length });
  } catch (err) {
    return json({ memories: [], error: err.message });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}
