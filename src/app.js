// app.js — logic for app.html (authenticated app page)

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for Clerk to finish loading (auth.js calls Clerk.load())
  await window.Clerk.load();

  // 1. Redirect if not signed in
  if (!window.Clerk.user) {
    window.location.href = '/index.html';
    return;
  }

  // Mount user button in the nav
  const userButtonContainer = document.getElementById('user-button');
  if (userButtonContainer) {
    window.PastorDaveAuth.mountUserButton(userButtonContainer);
  }

  // 2. Show upgrade banner if redirected from successful checkout
  const params = new URLSearchParams(window.location.search);
  if (params.get('upgraded') === 'true') {
    const banner = document.getElementById('upgrade-banner');
    if (banner) {
      banner.textContent = 'You\'ve upgraded to Pro! Unlimited conversations unlocked.';
      banner.style.display = 'block';
      // Clean the URL without reloading
      window.history.replaceState({}, '', '/app.html');
    }
  }

  // 3. Load subscription status
  await loadSubscriptionStatus();

  // 4. Wire up the Start Conversation button
  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', startConversation);
  }
});

async function loadSubscriptionStatus() {
  const statusBar = document.getElementById('status-bar');
  if (!statusBar) return;

  try {
    const token = await window.PastorDaveAuth.getSessionToken();
    const res = await fetch('/api/subscription', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.tier === 'free') {
      const used = data.conversations_today ?? 0;
      const limit = data.conversations_limit ?? 2;
      const remaining = Math.max(0, limit - used);
      statusBar.innerHTML = `
        <span class="tier-badge tier-free">Free</span>
        <span>${remaining} of ${limit} conversations remaining today</span>
        <a href="/pricing.html" class="upgrade-link">Upgrade to Pro</a>
      `;
    } else {
      statusBar.innerHTML = `
        <span class="tier-badge tier-${data.tier}">${capitalize(data.tier)}</span>
        <span>Unlimited conversations</span>
      `;
    }
  } catch (err) {
    console.error('Failed to load subscription status:', err);
    statusBar.textContent = 'Could not load subscription info.';
  }
}

async function startConversation() {
  const startBtn = document.getElementById('start-btn');
  const limitMsg = document.getElementById('limit-message');
  const widgetContainer = document.getElementById('widget-container');
  const statusBar = document.getElementById('status-bar');

  if (startBtn) startBtn.disabled = true;
  if (limitMsg) limitMsg.style.display = 'none';

  try {
    const token = await window.PastorDaveAuth.getSessionToken();
    const res = await fetch('/api/el-token', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 403) {
      const data = await res.json();
      if (data.error === 'limit_reached') {
        if (limitMsg) {
          limitMsg.innerHTML = `
            ${data.message}
            <a href="/pricing.html">Upgrade to Pro for unlimited access.</a>
          `;
          limitMsg.style.display = 'block';
        }
        if (startBtn) startBtn.disabled = false;
        return;
      }
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { signed_url } = await res.json();

    // Initialize ElevenLabs widget with signed URL
    initElevenLabsWidget(signed_url, widgetContainer);

    // Hide start button — conversation is live
    if (startBtn) startBtn.style.display = 'none';

    // Refresh subscription status to reflect updated usage count
    await loadSubscriptionStatus();
  } catch (err) {
    console.error('Failed to start conversation:', err);
    const errorEl = document.getElementById('error-message');
    if (errorEl) {
      errorEl.textContent = 'Something went wrong. Please try again.';
      errorEl.style.display = 'block';
    }
    if (startBtn) startBtn.disabled = false;
  }
}

function initElevenLabsWidget(signedUrl, container) {
  // ElevenLabs ConvAI widget initialized programmatically.
  // The <script src="https://elevenlabs.io/convai-widget/index.js"> tag in
  // app.html registers the custom element <elevenlabs-convai>.
  if (!container) return;

  container.innerHTML = '';

  const widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('signed-url', signedUrl);
  container.appendChild(widget);
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
