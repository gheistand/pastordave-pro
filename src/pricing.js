// pricing.js — logic for pricing.html

document.addEventListener('DOMContentLoaded', async () => {
  await window.Clerk.load();

  // Mount user button if signed in
  const userButtonContainer = document.getElementById('user-button');
  if (userButtonContainer && window.Clerk.user) {
    window.PastorDaveAuth.mountUserButton(userButtonContainer);
  }

  // Highlight current tier if signed in
  if (window.Clerk.user) {
    await highlightCurrentTier();
  }

  // Wire up checkout buttons
  document.getElementById('btn-get-pro')?.addEventListener('click', () => startCheckout('pro'));
  document.getElementById('btn-get-church')?.addEventListener('click', () => startCheckout('church'));
});

async function highlightCurrentTier() {
  try {
    const token = await window.PastorDaveAuth.getSessionToken();
    const res = await fetch('/api/subscription', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const { tier } = await res.json();

    const cardMap = {
      free: 'card-free',
      pro: 'card-pro',
      church: 'card-church',
    };

    const cardId = cardMap[tier];
    if (cardId) {
      const card = document.getElementById(cardId);
      if (card) {
        card.classList.add('current-plan');
        const badge = document.createElement('div');
        badge.className = 'current-plan-badge';
        badge.textContent = 'Your current plan';
        card.prepend(badge);
      }
    }

    // Update CTA buttons for already-subscribed tiers
    if (tier === 'pro') {
      const btn = document.getElementById('btn-get-pro');
      if (btn) {
        btn.textContent = 'Current Plan';
        btn.disabled = true;
      }
    }
    if (tier === 'church') {
      const btn = document.getElementById('btn-get-church');
      if (btn) {
        btn.textContent = 'Current Plan';
        btn.disabled = true;
      }
    }
  } catch (err) {
    console.error('Failed to load current tier:', err);
  }
}

async function startCheckout(tier) {
  const btn = document.getElementById(`btn-get-${tier}`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Redirecting…';
  }

  // If not signed in, send to index to authenticate first
  if (!window.Clerk.user) {
    window.location.href = `/index.html?redirect=pricing&tier=${tier}`;
    return;
  }

  try {
    const token = await window.PastorDaveAuth.getSessionToken();
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tier }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { url } = await res.json();
    window.location.href = url;
  } catch (err) {
    console.error('Checkout error:', err);
    const errorEl = document.getElementById('checkout-error');
    if (errorEl) {
      errorEl.textContent = 'Something went wrong starting checkout. Please try again.';
      errorEl.style.display = 'block';
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = tier === 'pro' ? 'Get Pro' : 'Get Church Plan';
    }
  }
}
