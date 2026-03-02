// app.js - logic for app.html (authenticated app page)

(async () => {
  await window.PastorDaveAuth.clerkReady;

  if (!window.Clerk.user) {
    window.location.href = '/index.html';
    return;
  }

  var userButtonContainer = document.getElementById('user-button');
  if (userButtonContainer) {
    window.PastorDaveAuth.mountUserButton(userButtonContainer);
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get('upgraded') === 'true') {
    var banner = document.getElementById('upgrade-banner');
    if (banner) {
      banner.textContent = "You have upgraded to Pro - Unlimited conversations unlocked.";
      banner.style.display = 'block';
      window.history.replaceState({}, '', '/app.html');
    }
  }

  await loadSubscriptionStatus();

  var startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', startConversation);
  }
})();

async function loadSubscriptionStatus() {
  var statusBar = document.getElementById('status-bar');
  if (!statusBar) return;

  try {
    var token = await window.PastorDaveAuth.getSessionToken();
    var res = await fetch('/api/subscription', {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);

    var data = await res.json();

    if (data.tier === 'free') {
      var used = data.conversations_today || 0;
      var limit = data.conversations_limit || 2;
      var remaining = Math.max(0, limit - used);
      statusBar.innerHTML =
        '<span class="tier-badge tier-free">Free</span>' +
        '<span>' + remaining + ' of ' + limit + ' conversations remaining today</span>' +
        '<a href="/pricing.html" class="upgrade-link">Upgrade to Pro</a>';
    } else {
      statusBar.innerHTML =
        '<span class="tier-badge tier-' + data.tier + '">' + capitalize(data.tier) + '</span>' +
        '<span>Unlimited conversations</span>';
    }
  } catch (err) {
    console.error('Failed to load subscription status:', err);
    statusBar.textContent = 'Could not load subscription info.';
  }
}

async function startConversation() {
  var startBtn = document.getElementById('start-btn');
  var limitMsg = document.getElementById('limit-message');
  var errorEl = document.getElementById('error-message');
  var widgetContainer = document.getElementById('widget-container');

  if (startBtn) startBtn.disabled = true;
  if (limitMsg) limitMsg.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';

  try {
    var token = await window.PastorDaveAuth.getSessionToken();
    var res = await fetch('/api/el-token', {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (res.status === 403) {
      var data = await res.json();
      if (data.error === 'limit_reached') {
        if (limitMsg) {
          limitMsg.innerHTML = data.message +
            ' <a href="/pricing.html">Upgrade to Pro for unlimited access.</a>';
          limitMsg.style.display = 'block';
        }
        if (startBtn) startBtn.disabled = false;
        return;
      }
    }

    if (!res.ok) throw new Error('HTTP ' + res.status);

    var result = await res.json();
    var signed_url = result.signed_url;

    await startElevenLabsConversation(signed_url, widgetContainer, startBtn);

    await loadSubscriptionStatus();
  } catch (err) {
    console.error('Failed to start conversation:', err);
    if (errorEl) {
      errorEl.textContent = 'Something went wrong. Please try again.';
      errorEl.style.display = 'block';
    }
    if (startBtn) startBtn.disabled = false;
  }
}

async function startElevenLabsConversation(signedUrl, container, startBtn) {
  if (!container) return;

  container.innerHTML =
    '<div id="conversation-ui" style="text-align:center; width:100%;">' +
    '<div id="conv-status" style="margin-bottom:1rem; font-size:0.95rem; color:#666;">Connecting to Pastor Dave...</div>' +
    '<div id="conv-visualizer" style="width:80px; height:80px; margin:0 auto 1.5rem; border-radius:50%; background:#7c4f2a; display:flex; align-items:center; justify-content:center;">' +
    '<span style="color:#fff; font-size:2rem;">&#127908;</span></div>' +
    '<div id="conv-transcript" style="min-height:100px; max-height:300px; overflow-y:auto; text-align:left; padding:1rem; background:#fff; border-radius:8px; border:1px solid #e5e0d8; margin-bottom:1rem; font-size:0.9rem; line-height:1.6;"></div>' +
    '<button id="end-btn" style="background:#842029; color:#fff; border:none; padding:0.7rem 2rem; font-size:1rem; font-weight:600; border-radius:8px; cursor:pointer;">End Conversation</button>' +
    '</div>';

  var statusEl = document.getElementById('conv-status');
  var transcriptEl = document.getElementById('conv-transcript');
  var visualizer = document.getElementById('conv-visualizer');
  var endBtn = document.getElementById('end-btn');

  var conversation;

  try {
    console.log('SDK: calling startSession with signedUrl');
    conversation = await window.client.Conversation.startSession({
      signedUrl: signedUrl,

      onConnect: function() {
        console.log('SDK: Connected to Pastor Dave');
        statusEl.textContent = 'Connected - speak to Pastor Dave';
        visualizer.style.background = '#28a745';
      },

      onDisconnect: function() {
        console.log('SDK: Disconnected from Pastor Dave');
        statusEl.textContent = 'Conversation ended.';
        visualizer.style.background = '#6c757d';
        if (startBtn) {
          startBtn.style.display = 'inline-block';
          startBtn.disabled = false;
        }
      },

      onMessage: function(message) {
        console.log('SDK message:', message);
      },

      onError: function(error) {
        console.error('SDK error:', error);
        statusEl.textContent = 'Error occurred. Please try again.';
        statusEl.style.color = '#842029';
      },

      onModeChange: function(mode) {
        console.log('SDK mode:', mode);
        if (mode.mode === 'speaking') {
          statusEl.textContent = 'Pastor Dave is speaking...';
          visualizer.style.background = '#7c4f2a';
        } else {
          statusEl.textContent = 'Listening...';
          visualizer.style.background = '#28a745';
        }
      }
    });
  } catch (err) {
    console.error('SDK startSession failed:', err);
    statusEl.textContent = 'Failed to connect. Please try again.';
    statusEl.style.color = '#842029';
    if (startBtn) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = false;
    }
    return;
  }

  endBtn.addEventListener('click', async function() {
    if (conversation) {
      try {
        await conversation.endSession();
      } catch (e) {
        console.error('Error ending session:', e);
      }
    }
    statusEl.textContent = 'Conversation ended.';
    visualizer.style.background = '#6c757d';
    endBtn.disabled = true;
    if (startBtn) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = false;
    }
  });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
