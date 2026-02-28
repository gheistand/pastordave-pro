import { createClerkClient } from '@clerk/backend';

export async function onRequestGet(context) {
  const { request, env } = context;

  // 1. Verify Clerk session JWT
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.slice(7);
    let userId, email;

    try {
      const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
      const payload = await clerk.verifyToken(token);
      userId = payload.sub;
      email = payload.email ?? '';
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Look up or create user in D1
    const now = Math.floor(Date.now() / 1000);
    const todayDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let user = await env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(userId).first();

    if (!user) {
      await env.DB.prepare(
        `INSERT INTO users (id, email, tier, free_conversations_today, free_conversations_date, created_at, updated_at)
         VALUES (?, ?, 'free', 0, ?, ?, ?)`
      ).bind(userId, email, todayDate, now, now).run();

      user = {
        id: userId,
        email,
        tier: 'free',
        free_conversations_today: 0,
        free_conversations_date: todayDate,
        created_at: now,
        updated_at: now,
      };
    }

    // 3. Check access
    if (user.tier === 'free') {
      // Reset daily counter if date has changed
      let conversationsToday = user.free_conversations_today ?? 0;
      if (user.free_conversations_date !== todayDate) {
        conversationsToday = 0;
        await env.DB.prepare(
          'UPDATE users SET free_conversations_today = 0, free_conversations_date = ?, updated_at = ? WHERE id = ?'
        ).bind(todayDate, now, userId).run();
      }

      if (conversationsToday >= 2) {
        return new Response(
          JSON.stringify({
            error: 'limit_reached',
            message:
              "You've used your 2 free conversations today. Upgrade to Pro for unlimited access.",
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. Get signed ElevenLabs conversation token
    let signedUrl;
    try {
      const elResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${env.ELEVENLABS_AGENT_ID}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': env.ELEVENLABS_API_KEY,
          },
        }
      );

      if (!elResponse.ok) {
        const errText = await elResponse.text();
        console.error('ElevenLabs token error:', elResponse.status, errText);
        return new Response(
          JSON.stringify({ error: 'Failed to obtain conversation token' }),
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const elData = await elResponse.json();
      signedUrl = elData.signed_url;
    } catch (err) {
      console.error('ElevenLabs fetch error:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to reach ElevenLabs API' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 5. Increment free_conversations_today for free tier
    if (user.tier === 'free') {
      await env.DB.prepare(
        `UPDATE users
         SET free_conversations_today = free_conversations_today + 1,
             free_conversations_date = ?,
             updated_at = ?
         WHERE id = ?`
      ).bind(todayDate, now, userId).run();
    }

    // 6. Return signed URL
    return new Response(JSON.stringify({ signed_url: signedUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}
