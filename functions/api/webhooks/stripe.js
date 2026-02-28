

// Verify Stripe webhook signature using the raw body and secret.
// Workers don't have Node's crypto, but Stripe's SDK handles this via SubtleCrypto.
async function verifyStripeSignature(request, secret) {
  const body = await request.text();
  const sigHeader = request.headers.get('stripe-signature');

  if (!sigHeader) throw new Error('Missing stripe-signature header');

  // Parse timestamp and signatures from the header
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    if (key === 't') acc.timestamp = value;
    if (key === 'v1') acc.signatures = [...(acc.signatures ?? []), value];
    return acc;
  }, { timestamp: null, signatures: [] });

  if (!parts.timestamp || !parts.signatures.length) {
    throw new Error('Invalid stripe-signature header format');
  }

  // Reject webhooks older than 5 minutes
  const tolerance = 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(parts.timestamp)) > tolerance) {
    throw new Error('Webhook timestamp too old');
  }

  // Compute expected signature: HMAC-SHA256(timestamp.body, secret)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const signedPayload = encoder.encode(`${parts.timestamp}.${body}`);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, signedPayload);
  const computedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const isValid = parts.signatures.some((sig) => sig === computedSig);
  if (!isValid) throw new Error('Webhook signature mismatch');

  return body;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. Verify Stripe webhook signature
    let rawBody;
    try {
      rawBody = await verifyStripeSignature(request, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Stripe signature verification failed:', err.message);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody);
    const now = Math.floor(Date.now() / 1000);

    // Helper: map Stripe price ID → tier
    function tierFromPriceId(priceId) {
      if (priceId === env.STRIPE_PRO_PRICE_ID) return 'pro';
      if (priceId === env.STRIPE_CHURCH_PRICE_ID) return 'church';
      return null;
    }

    // Helper: upsert user tier by stripe_customer_id
    async function updateTierByCustomer(stripeCustomerId, tier, stripeSubscriptionId) {
      const user = await env.DB.prepare(
        'SELECT id FROM users WHERE stripe_customer_id = ?'
      ).bind(stripeCustomerId).first();

      if (user) {
        await env.DB.prepare(
          `UPDATE users
           SET tier = ?, stripe_subscription_id = ?, updated_at = ?
           WHERE stripe_customer_id = ?`
        ).bind(tier, stripeSubscriptionId, now, stripeCustomerId).run();
      } else {
        console.warn(
          'No user found for stripe_customer_id:',
          stripeCustomerId,
          '— will be updated when checkout.session.completed fires'
        );
      }
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const clerkUserId = session.metadata?.clerk_user_id;
          const stripeCustomerId = session.customer;
          const customerEmail = session.customer_email ?? session.customer_details?.email ?? '';

          if (!clerkUserId) {
            console.warn('checkout.session.completed missing clerk_user_id in metadata');
            break;
          }

          // Upsert the user record with the Stripe customer ID
          const existing = await env.DB.prepare(
            'SELECT id FROM users WHERE id = ?'
          ).bind(clerkUserId).first();

          if (existing) {
            await env.DB.prepare(
              `UPDATE users
               SET stripe_customer_id = ?, updated_at = ?
               WHERE id = ?`
            ).bind(stripeCustomerId, now, clerkUserId).run();
          } else {
            await env.DB.prepare(
              `INSERT INTO users (id, email, tier, stripe_customer_id, free_conversations_today, free_conversations_date, created_at, updated_at)
               VALUES (?, ?, 'free', ?, 0, ?, ?, ?)`
            ).bind(
              clerkUserId,
              customerEmail,
              stripeCustomerId,
              new Date().toISOString().slice(0, 10),
              now,
              now
            ).run();
          }

          // Tier will be set by the subscription.created event that follows
          break;
        }

        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object;
          const stripeCustomerId = subscription.customer;
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const tier = tierFromPriceId(priceId);

          if (!tier) {
            console.warn('Unrecognized price ID:', priceId);
            break;
          }

          await updateTierByCustomer(stripeCustomerId, tier, subscription.id);
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const stripeCustomerId = subscription.customer;
          await updateTierByCustomer(stripeCustomerId, 'free', null);
          break;
        }

        default:
          // Ignore unhandled event types
          break;
      }
    } catch (err) {
      console.error('Error processing Stripe event:', event.type, err);
      // Still return 200 so Stripe doesn't retry indefinitely for our bugs
    }

  // 4. Always return 200 quickly
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
