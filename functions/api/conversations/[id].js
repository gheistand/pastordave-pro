import { verifyClerkToken } from '../_auth.js';

export async function onRequestGet(context) {
  const { params, request, env } = context;
  const { id } = params;

  // Verify Clerk session JWT
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);

  try {
    await verifyClerkToken(token);
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Call ElevenLabs API to get single conversation
  const apiKey = env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ElevenLabs credentials not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(id)}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs API error: ${res.status}`);
    }

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ElevenLabs API error:', err);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch conversation from ElevenLabs' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
