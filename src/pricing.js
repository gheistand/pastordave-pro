// pricing.js — logic for pricing.html

document.addEventListener('DOMContentLoaded', async () => {
  await window.PastorDaveAuth.clerkReady;

  // Mount user button if signed in
  const userButtonContainer = document.getElementById('user-button');
  if (userButtonContainer && window.Clerk.user) {
    window.PastorDaveAuth.mountUserButton(userButtonContainer);
  }

  // Annual/monthly toggle
  const toggle = document.getElementById('billing-toggle');
  const labelMonthly = document.getElementById('label-monthly');
  const labelAnnual = document.getElementById('label-annual');

  toggle?.addEventListener('change', () => {
    const isAnnual = toggle.checked;
    labelMonthly.classList.toggle('active', !isAnnual);
    labelAnnual.classList.toggle('active', isAnnual);

    document.querySelectorAll('.price-val').forEach(el => {
      el.textContent = isAnnual ? el.dataset.annual : el.dataset.monthly;
    });

    document.querySelectorAll('.annual-note').forEach(el => {
      el.style.display = isAnnual ? '' : 'none';
    });
  });

  // Highlight current tier if signed in
  if (window.Clerk.user) {
    await highlightCurrentTier();
  }

  // Wire up checkout buttons
  document.getElementById('btn-get-pro')?.addEventListener('click', () => startCheckout('pro'));
  document.getElementById('btn-get-church_starter')?.addEventListener('click', () => startCheckout('church_starter'));
  document.getElementById('btn-get-church_growth')?.addEventListener('click', () => startCheckout('church_growth'));
});

async function highlightCurrentTier() {
  try {
    const token = await window.PastorDaveAuth.getSessionToken();
    const res = await fetch('/api/subscription', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const { tier } = await res.json();

    // D1 stores "church" for both church plans — highlight the appropriate card
    const cardMap = {
      free: 'card-free',
      pro: 'card-pro',
      church: 'card-church-starter', // default to starter for "church" tier display
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

    // Disable CTA for current plan
    if (tier === 'pro') {
      const btn = document.getElementById('btn-get-pro');
      if (btn) { btn.textContent = 'Current Plan'; btn.disabled = true; }
    }
    if (tier === 'church') {
      const btnS = document.getElementById('btn-get-church_starter');
      const btnG = document.getElementById('btn-get-church_growth');
      if (btnS) { btnS.textContent = 'Current Plan'; btnS.disabled = true; }
      if (btnG) { btnG.textContent = 'Current Plan'; btnG.disabled = true; }
    }
  } catch (err) {
    console.error('Failed to load current tier:', err);
  }
}

const BUTTON_LABELS = {
  pro: 'Start Personal Pro',
  church_starter: 'Start Church Starter',
  church_growth: 'Start Church Growth',
};

async function startCheckout(tier) {
  // If not signed in, redirect to sign-in first
  if (!window.Clerk.user) {
    window.location.href = '/app.html';
    return;
  }

  const btn = document.getElementById(`btn-get-${tier}`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Redirecting…';
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
      btn.textContent = BUTTON_LABELS[tier] ?? 'Get Started';
    }
  }
}
