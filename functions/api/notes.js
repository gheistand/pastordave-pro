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

  // Get sermon_id from query params
  const url = new URL(request.url);
  const sermonId = url.searchParams.get('sermon_id');

  if (!sermonId) {
    return new Response(JSON.stringify({ error: 'sermon_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const note = await env.DB.prepare(
      'SELECT notes FROM sermon_notes WHERE user_id = ? AND sermon_id = ?'
    )
      .bind(userId, sermonId)
      .first();

    return new Response(
      JSON.stringify({ notes: note?.notes ?? '' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Database error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestPost(context) {
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

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { sermon_id, notes } = body;

  if (!sermon_id) {
    return new Response(JSON.stringify({ error: 'sermon_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const noteId = `${userId}-${sermon_id}`;
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT OR REPLACE INTO sermon_notes (id, user_id, sermon_id, notes, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(noteId, userId, sermon_id, notes ?? '', now)
      .run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Database error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
