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
    const todayDate = new Date().toISOString().slice(0, 10);

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
      };
    }

    // Resolve conversations_today, accounting for date rollover
    let conversationsToday = user.free_conversations_today ?? 0;
    if (user.tier === 'free' && user.free_conversations_date !== todayDate) {
      conversationsToday = 0;
    }

    // 3. Return subscription status
    const isPaid = user.tier === 'pro' || user.tier === 'church';

    return new Response(
      JSON.stringify({
        tier: user.tier,
        conversations_today: isPaid ? null : conversationsToday,
        conversations_limit: isPaid ? null : 2,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}
