import { createClerkClient } from '@clerk/backend';
import Stripe from 'stripe';

export async function onRequestPost(context) {
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

      // Fetch the full user record from Clerk to get primary email
      const clerkUser = await clerk.users.getUser(userId);
      email =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId
        )?.emailAddress ?? '';
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse and validate request body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { tier } = body;
    if (tier !== 'pro' && tier !== 'church') {
      return new Response(
        JSON.stringify({ error: 'tier must be "pro" or "church"' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const priceId =
      tier === 'pro' ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_CHURCH_PRICE_ID;

    // 3. Look up existing Stripe customer ID for this user (if any)
    const dbUser = await env.DB.prepare(
      'SELECT stripe_customer_id FROM users WHERE id = ?'
    ).bind(userId).first();

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      // Workers-compatible fetch
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 4. Build Stripe Checkout session params
    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: 'https://app.askpastordave.org/app.html?upgraded=true',
      cancel_url: 'https://app.askpastordave.org/pricing.html',
      metadata: { clerk_user_id: userId },
      subscription_data: {
        metadata: { clerk_user_id: userId },
      },
    };

    if (dbUser?.stripe_customer_id) {
      // Reuse existing Stripe customer so payment methods are preserved
      sessionParams.customer = dbUser.stripe_customer_id;
    } else {
      sessionParams.customer_email = email;
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (err) {
      console.error('Stripe checkout session error:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to create checkout session' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}
