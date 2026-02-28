import { createClerkClient } from '@clerk/backend';

async function createStripeCheckoutSession(secretKey, params) {
  const body = new URLSearchParams();
  body.append('mode', params.mode);
  body.append('success_url', params.success_url);
  body.append('cancel_url', params.cancel_url);
  body.append('line_items[0][price]', params.line_items[0].price);
  body.append('line_items[0][quantity]', '1');
  body.append('metadata[clerk_user_id]', params.metadata.clerk_user_id);
  body.append('subscription_data[metadata][clerk_user_id]', params.metadata.clerk_user_id);

  if (params.customer) {
    body.append('customer', params.customer);
  } else if (params.customer_email) {
    body.append('customer_email', params.customer_email);
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Stripe API error');
  return data;
}

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

  // 3. Look up existing Stripe customer ID
  const dbUser = await env.DB.prepare(
    'SELECT stripe_customer_id FROM users WHERE id = ?'
  ).bind(userId).first();

  // 4. Build and create Stripe Checkout session
  const sessionParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://app.askpastordave.org/app.html?upgraded=true',
    cancel_url: 'https://app.askpastordave.org/pricing.html',
    metadata: { clerk_user_id: userId },
  };

  if (dbUser?.stripe_customer_id) {
    sessionParams.customer = dbUser.stripe_customer_id;
  } else {
    sessionParams.customer_email = email;
  }

  let session;
  try {
    session = await createStripeCheckoutSession(env.STRIPE_SECRET_KEY, sessionParams);
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
