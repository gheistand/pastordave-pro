// app.js - logic for app.html (authenticated app page)

var currentUser = null;
var currentTier = null;
var currentSermon = null;
var notesAutoSaveTimer = null;

(async () => {
  await window.PastorDaveAuth.clerkReady;

  if (!window.Clerk.user) {
    window.location.href = '/index.html';
    return;
  }

  currentUser = window.Clerk.user;

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
  initTabSwitching();
  loadPastConversations();

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
    currentTier = data.tier;

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

      if (data.tier === 'church') {
        var nav = document.querySelector('nav');
        if (nav && !document.getElementById('admin-link')) {
          var adminLink = document.createElement('a');
          adminLink.id = 'admin-link';
          adminLink.href = '/admin.html';
          adminLink.textContent = 'Admin Dashboard';
          adminLink.style.cssText = 'color:var(--brand,#7c4f2a);text-decoration:none;font-size:0.9rem;font-weight:600;';
          nav.insertBefore(adminLink, nav.firstChild);
        }
        loadChurchBranding(token);
      }

      // Load sermon content for paid users
      await loadDiscipleshipContent(token);
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
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('SDK: Microphone access granted');
    } catch (micErr) {
      console.error('SDK: Microphone access denied:', micErr);
      statusEl.textContent = 'Microphone access is required. Please allow mic access and try again.';
      statusEl.style.color = '#842029';
      if (startBtn) {
        startBtn.style.display = 'inline-block';
        startBtn.disabled = false;
      }
      return;
    }

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

async function loadChurchBranding(token) {
  try {
    var res = await fetch('/api/admin/church-profile', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) return;
    var data = await res.json();
    var church = data.church;
    if (!church) return;
    if (church.accent_color) {
      document.documentElement.style.setProperty('--brand', church.accent_color);
    }
    if (church.logo_url) {
      var logoEl = document.querySelector('.logo');
      if (logoEl) {
        logoEl.innerHTML = '<img src="' + church.logo_url + '" alt="Church logo" style="max-height:32px;vertical-align:middle;" />';
      }
    }
  } catch { /* non-fatal */ }
}

// Tab switching
function initTabSwitching() {
  var tabs = document.querySelectorAll('.app-tab-btn');
  var panels = document.querySelectorAll('.app-panel');

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var tabId = tab.dataset.tab;

      tabs.forEach(function(t) {
        t.classList.toggle('active', t.dataset.tab === tabId);
      });

      panels.forEach(function(p) {
        p.classList.toggle('active', p.id === 'panel-' + tabId);
      });

      if (tabId === 'discipleship') {
        loadDiscipleshipContentOnTab();
      }
    });
  });
}

// Load Discipleship Group content
async function loadDiscipleshipContent(token) {
  try {
    var res = await fetch('/api/tools/sermon/new-horizon-champaign');
    if (!res.ok) {
      console.error('Failed to load sermon');
      return;
    }
    var sermon = await res.json();
    currentSermon = sermon;
  } catch (err) {
    console.error('Failed to load sermon content:', err);
  }
}

async function loadDiscipleshipContentOnTab() {
  var contentContainer = document.getElementById('discipleship-content');
  if (!contentContainer) return;

  // Free users get upsell
  if (currentTier === 'free') {
    contentContainer.innerHTML =
      '<div class="upsell-message">' +
      '<p>Upgrade to Pro to access the Discipleship Group guide.</p>' +
      '<p>Get discussion questions, key takeaways, and personal notes for every sermon.</p>' +
      '<a href="/pricing.html">Upgrade to Pro</a>' +
      '</div>';
    return;
  }

  // No sermon loaded yet
  if (!currentSermon || !currentSermon.id) {
    contentContainer.innerHTML = '<p style="text-align:center; color:#999;">No sermon loaded yet. Check back after Sunday.</p>';
    return;
  }

  var sermon = currentSermon;
  var keyPoints = sermon.key_points || [];
  var discussionQuestions = sermon.discussion_questions || [];

  var html = '<button class="print-btn" onclick="window.print()">🖨️ Print</button>';

  html += '<div class="sermon-header">';
  html += '<h2>' + escapeHtml(sermon.title || 'Sermon') + '</h2>';
  html += '<div class="sermon-meta">';
  if (sermon.pastor) html += '<div class="sermon-meta-item"><span class="sermon-meta-label">Pastor</span>' + escapeHtml(sermon.pastor) + '</div>';
  if (sermon.date) html += '<div class="sermon-meta-item"><span class="sermon-meta-label">Date</span>' + escapeHtml(sermon.date) + '</div>';
  if (sermon.series) html += '<div class="sermon-meta-item"><span class="sermon-meta-label">Series</span>' + escapeHtml(sermon.series) + '</div>';
  if (sermon.scripture) html += '<div class="sermon-meta-item"><span class="sermon-meta-label">Scripture</span>' + escapeHtml(sermon.scripture) + '</div>';
  html += '</div>';
  html += '</div>';

  if (sermon.summary) {
    html += '<div class="sermon-summary">' + escapeHtml(sermon.summary) + '</div>';
  }

  if (keyPoints.length > 0) {
    html += '<div class="sermon-section">';
    html += '<h3>Key Takeaways</h3>';
    html += '<ol class="sermon-list">';
    keyPoints.forEach(function(point) {
      html += '<li>' + escapeHtml(point) + '</li>';
    });
    html += '</ol>';
    html += '</div>';
  }

  if (discussionQuestions.length > 0) {
    html += '<div class="sermon-section">';
    html += '<h3>Discussion Questions</h3>';
    html += '<ol class="sermon-list">';
    discussionQuestions.forEach(function(q) {
      html += '<li>' + escapeHtml(q) + '</li>';
    });
    html += '</ol>';
    html += '</div>';
  }

  // My Notes section
  html += '<div class="sermon-section">';
  html += '<h3>My Notes</h3>';
  html += '<textarea id="notes-textarea" placeholder="Jot down your thoughts, takeaways, or prayer points…"></textarea>';
  html += '<div class="notes-button-group">';
  html += '<button id="save-notes-btn">Save Notes</button>';
  html += '<span class="notes-save-status">Saved ✓</span>';
  html += '</div>';
  html += '</div>';

  contentContainer.innerHTML = html;

  // Load existing notes
  await loadNotes(sermon.id);

  // Attach event listeners
  var notesTextarea = document.getElementById('notes-textarea');
  var saveNotesBtn = document.getElementById('save-notes-btn');

  if (saveNotesBtn) {
    saveNotesBtn.addEventListener('click', function() {
      saveNotes(sermon.id);
    });
  }

  if (notesTextarea) {
    notesTextarea.addEventListener('input', function() {
      // Debounce auto-save
      if (notesAutoSaveTimer) clearTimeout(notesAutoSaveTimer);
      notesAutoSaveTimer = setTimeout(function() {
        saveNotes(sermon.id);
      }, 2000);
    });
  }
}

async function loadNotes(sermonId) {
  if (!sermonId) return;
  try {
    var token = await window.PastorDaveAuth.getSessionToken();
    var res = await fetch('/api/notes?sermon_id=' + encodeURIComponent(sermonId), {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (!res.ok) return;
    var data = await res.json();
    var notesTextarea = document.getElementById('notes-textarea');
    if (notesTextarea && data.notes) {
      notesTextarea.value = data.notes;
    }
  } catch (err) {
    console.error('Failed to load notes:', err);
  }
}

async function saveNotes(sermonId) {
  if (!sermonId) return;
  try {
    var notesTextarea = document.getElementById('notes-textarea');
    var notes = notesTextarea ? notesTextarea.value : '';
    var token = await window.PastorDaveAuth.getSessionToken();

    var res = await fetch('/api/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ sermon_id: sermonId, notes: notes }),
    });

    if (res.ok) {
      var statusEl = document.querySelector('.notes-save-status');
      if (statusEl) {
        statusEl.classList.add('show');
        setTimeout(function() {
          statusEl.classList.remove('show');
        }, 2000);
      }
    }
  } catch (err) {
    console.error('Failed to save notes:', err);
  }
}

// Past Conversations
async function loadPastConversations() {
  try {
    var token = await window.PastorDaveAuth.getSessionToken();
    var res = await fetch('/api/conversations', {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (!res.ok) {
      console.error('Failed to load conversations:', res.status);
      return;
    }

    var data = await res.json();
    var conversations = data.conversations || [];

    var listContainer = document.getElementById('past-conversations-list');
    if (!listContainer) return;

    if (conversations.length === 0) {
      listContainer.innerHTML = '<div style="text-align:center; color:#999; padding:1rem;">No conversations yet.</div>';
      return;
    }

    var html = '';
    conversations.forEach(function(conv) {
      var dateStr = conv.start_time_unix_secs
        ? new Date(conv.start_time_unix_secs * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Unknown date';
      var duration = conv.duration_seconds
        ? Math.floor(conv.duration_seconds / 60) + 'm ' + (conv.duration_seconds % 60) + 's'
        : 'Unknown duration';

      html += '<div class="conversation-item">';
      html += '<div class="conversation-item-info">';
      html += '<div class="conversation-date">' + dateStr + '</div>';
      html += '<div class="conversation-duration">' + duration + '</div>';
      html += '</div>';
      html += '<button class="conversation-view-btn" data-conv-id="' + escapeHtml(conv.id) + '">View Transcript</button>';
      html += '</div>';
    });

    listContainer.innerHTML = html;

    // Attach event listeners
    document.querySelectorAll('.conversation-view-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var convId = btn.dataset.convId;
        viewConversationTranscript(convId);
      });
    });

  } catch (err) {
    console.error('Failed to load past conversations:', err);
  }
}

async function viewConversationTranscript(convId) {
  try {
    var token = await window.PastorDaveAuth.getSessionToken();
    var res = await fetch('/api/conversations/' + encodeURIComponent(convId), {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (!res.ok) {
      alert('Failed to load transcript');
      return;
    }

    var data = await res.json();
    var transcript = data.transcript || 'No transcript available';

    // Simple modal/alert for transcript
    var transcriptText = typeof transcript === 'string'
      ? transcript
      : JSON.stringify(transcript, null, 2);

    alert('Transcript:\n\n' + transcriptText);
  } catch (err) {
    console.error('Failed to load transcript:', err);
    alert('Failed to load transcript');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
