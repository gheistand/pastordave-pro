import { verifyClerkToken } from './_auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  // Verify Clerk session JWT
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  let userId;

  try {
    const payload = await verifyClerkToken(token);
    userId = payload.sub;
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const urlParams = new URL(request.url).searchParams;
  const agentId = urlParams.get('agent_id') || env.ELEVENLABS_AGENT_ID;
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return new Response(
      JSON.stringify({ error: 'ElevenLabs credentials not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Fetch all conversations for this agent — ElevenLabs list API doesn't support
    // filtering by dynamic_variables, so we fetch and filter server-side.
    // We fetch up to 100 and filter to the requesting user's conversations only.
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${encodeURIComponent(agentId)}&page_size=100`,
      {
        method: 'GET',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      }
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs API error: ${res.status}`);
    }

    const data = await res.json();
    const allConversations = data.conversations || [];

    // Filter to only conversations belonging to the requesting user.
    // The list endpoint doesn't include dynamic_variables, so we need to check
    // each conversation's detail — but that's expensive. Instead we use the
    // ElevenLabs filter by metadata endpoint if available, or fallback to
    // checking the conversation_initiation_client_data on each record.
    // Since list endpoint doesn't return dynamic_variables, filter by fetching
    // details for each conversation in parallel (capped at 20 most recent).
    const recent = allConversations.slice(0, 20);

    const userConversations = await Promise.all(
      recent.map(async (conv) => {
        try {
          const dr = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}`,
            { headers: { 'xi-api-key': apiKey } }
          );
          if (!dr.ok) return null;
          const detail = await dr.json();
          const dynVars = detail?.conversation_initiation_client_data?.dynamic_variables || {};
          if (dynVars.user_id === userId) {
            // Return the summary-level data (not full detail with transcript)
            return conv;
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const filtered = userConversations.filter(Boolean);

    return new Response(JSON.stringify({ conversations: filtered }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ElevenLabs API error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch conversations from ElevenLabs' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
