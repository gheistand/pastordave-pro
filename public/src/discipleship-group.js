// discipleship-group.js — logic for discipleship-group.html

var DG = (function () {
  var state = {
    groupProfile: null,
    currentSermon: null,
    currentReadings: null,
    currentGuideJson: null,
    currentGuideMarkdown: null,
    currentAgendaMarkdown: null,
    currentShareToken: null,
    savedGuides: [],
    savedAgendas: [],
  };

  // ─── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    await window.PastorDaveAuth.clerkReady;

    if (!window.Clerk.user) {
      window.location.href = '/index.html';
      return;
    }

    var userButton = document.getElementById('user-button');
    if (userButton) window.PastorDaveAuth.mountUserButton(userButton);

    await loadSubscriptionStatus();
  }

  async function loadSubscriptionStatus() {
    var statusBar = document.getElementById('status-bar');
    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/subscription', {
        headers: { Authorization: 'Bearer ' + token },
      });
      var data = await res.json();
      var tier = data.tier;

      if (statusBar) {
        statusBar.innerHTML =
          '<span class="tier-badge tier-' + tier + '">' + capitalize(tier) + '</span>' +
          '<span>Discipleship Group Tools</span>';
      }

      if (tier !== 'church') {
        document.getElementById('tier-gate').style.display = 'block';
        return;
      }

      // Church tier — show app
      document.getElementById('app-content').style.display = 'block';
      initTabs();
      await loadGroupProfile();
    } catch (err) {
      console.error('Failed to load subscription:', err);
      if (statusBar) statusBar.textContent = 'Could not load subscription info.';
    }
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  function initTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTab(tab.dataset.tab);
      });
    });
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(function (t) {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + tabId);
    });

    if (tabId === 'saved-guides') loadSavedGuides();
    if (tabId === 'saved-agendas') loadSavedAgendas();
    if (tabId === 'agenda-builder') populateAgendaGuideSelect();
  }

  // ─── Group Profile ─────────────────────────────────────────────────────────

  async function loadGroupProfile() {
    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/profile', {
        headers: { Authorization: 'Bearer ' + token },
      });
      var data = await res.json();
      state.groupProfile = data.profile;

      if (!state.groupProfile) {
        // No profile — show onboarding gate on guide tab
        document.getElementById('guide-onboarding-gate').style.display = 'block';
        document.getElementById('guide-generator-content').style.display = 'none';
      } else {
        document.getElementById('guide-onboarding-gate').style.display = 'none';
        document.getElementById('guide-generator-content').style.display = 'block';
        prefillSettingsForm(state.groupProfile);
        initGuideGenerator();
      }
    } catch (err) {
      console.error('Failed to load group profile:', err);
    }
  }

  function prefillSettingsForm(profile) {
    setVal('settings-group-name', profile.group_name);
    setVal('settings-group-type', profile.group_type);
    setVal('settings-group-desc', profile.group_description);
    setVal('settings-leader-name', profile.leader_name);
    setVal('settings-meeting-day', profile.meeting_day);
    setVal('settings-meeting-time', profile.meeting_time);
    setVal('settings-meeting-length', String(profile.default_meeting_length || 75));
    setVal('settings-meeting-location', profile.meeting_location);
    setVal('settings-bible-translation', profile.bible_translation || 'NLT');
    setChecked('settings-follow-tyndale', profile.follow_tyndale !== 0);
    setChecked('settings-use-hhh', profile.use_hhh_framework !== 0);
  }

  async function saveSettings() {
    var statusEl = document.getElementById('settings-status');
    setStatus(statusEl, 'Saving…', 'info');

    var groupName = getVal('settings-group-name');
    if (!groupName) {
      setStatus(statusEl, 'Group name is required.', 'error');
      return;
    }

    var body = {
      group_name: groupName,
      group_description: getVal('settings-group-desc'),
      group_type: getVal('settings-group-type'),
      leader_name: getVal('settings-leader-name'),
      meeting_day: getVal('settings-meeting-day'),
      meeting_time: getVal('settings-meeting-time'),
      meeting_location: getVal('settings-meeting-location'),
      default_meeting_length: parseInt(getVal('settings-meeting-length')) || 75,
      bible_translation: getVal('settings-bible-translation'),
      follow_tyndale: getChecked('settings-follow-tyndale') ? 1 : 0,
      use_hhh_framework: getChecked('settings-use-hhh') ? 1 : 0,
    };

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      state.groupProfile = data.profile;
      setStatus(statusEl, 'Settings saved!', 'success');

      // If we just created the profile, unhide guide generator
      document.getElementById('guide-onboarding-gate').style.display = 'none';
      document.getElementById('guide-generator-content').style.display = 'block';
      if (!state.currentSermon) initGuideGenerator();
    } catch (err) {
      console.error('Save settings error:', err);
      setStatus(statusEl, 'Error saving: ' + err.message, 'error');
    }
  }

  // ─── Guide Generator ───────────────────────────────────────────────────────

  function initGuideGenerator() {
    // Default meeting date to today
    var dateInput = document.getElementById('meeting-date-input');
    if (dateInput && !dateInput.value) {
      dateInput.value = todayDateStr();
    }

    // Load sermon + readings on date change
    dateInput.addEventListener('change', function () {
      loadSermonForWeek(dateInput.value);
      loadReadings(dateInput.value);
    });

    // Initial load
    loadSermonForWeek(dateInput.value || todayDateStr());
    loadReadings(dateInput.value || todayDateStr());
  }

  async function loadSermonForWeek(dateStr) {
    var card = document.getElementById('sermon-card');
    card.innerHTML = '<div class="loading">Loading sermon…</div>';

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/sermon-for-week?meeting_date=' + encodeURIComponent(dateStr), {
        headers: { Authorization: 'Bearer ' + token },
      });
      var data = await res.json();
      state.currentSermon = data.sermon;

      if (!data.sermon) {
        card.innerHTML = '<p style="color:#999; font-size:0.9rem;">No sermon found for this week. Check the Admin Dashboard to ensure a sermon is loaded.</p>';
        return;
      }

      var s = data.sermon;
      var html = '<div class="sermon-info">';
      html += '<div class="sermon-title">' + esc(s.title) + '</div>';
      html += '<div class="sermon-meta">';
      if (s.date) html += esc(s.date) + ' &nbsp;·&nbsp; ';
      if (s.speaker) html += esc(s.speaker) + ' &nbsp;·&nbsp; ';
      if (s.scripture) html += esc(s.scripture);
      html += '</div>';
      if (s.summary) {
        html += '<p style="margin-top:0.6rem; font-size:0.875rem; line-height:1.5; color:#444;">' + esc(s.summary) + '</p>';
      }
      html += '</div>';
      card.innerHTML = html;
    } catch (err) {
      card.innerHTML = '<p style="color:#842029; font-size:0.9rem;">Failed to load sermon.</p>';
      console.error(err);
    }
  }

  async function loadReadings(dateStr) {
    var card = document.getElementById('readings-card');
    card.innerHTML = '<div class="loading">Loading readings…</div>';

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var profileId = state.groupProfile ? state.groupProfile.id : '';
      var url = '/api/discipleship-group/tyndale-readings?meeting_date=' + encodeURIComponent(dateStr);
      if (profileId) url += '&group_id=' + encodeURIComponent(profileId);

      var res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      var data = await res.json();
      state.currentReadings = data.readings || [];

      if (!state.currentReadings.length) {
        card.innerHTML = '<p style="color:#999; font-size:0.9rem;">No readings found for this window.</p>';
        return;
      }

      var html = '<ul class="readings-list">';
      state.currentReadings.forEach(function (r) {
        var dateLabel = pad2(r.month) + '/' + pad2(r.day);
        var parts = [r.old_testament, r.new_testament, r.psalm, r.proverbs].filter(Boolean);
        html += '<li><span class="readings-day">' + dateLabel + '</span> ' + esc(parts.join(' · ')) + '</li>';
      });
      html += '</ul>';
      if (data.meeting_day) {
        html += '<p style="font-size:0.78rem; color:#aaa; margin-top:0.5rem;">7-day window for ' + esc(data.meeting_day) + ' meeting</p>';
      }
      card.innerHTML = html;
    } catch (err) {
      card.innerHTML = '<p style="color:#842029; font-size:0.9rem;">Failed to load readings.</p>';
      console.error(err);
    }
  }

  async function generateGuide() {
    var btn = document.getElementById('generate-guide-btn');
    var statusEl = document.getElementById('guide-status');
    var outputEl = document.getElementById('guide-output');
    var actionsEl = document.getElementById('guide-actions');

    btn.disabled = true;
    setStatus(statusEl, 'Generating guide with AI… this may take 10–20 seconds.', 'info');
    outputEl.style.display = 'none';
    actionsEl.style.display = 'none';

    var meetingDate = getVal('meeting-date-input') || todayDateStr();
    var weekTheme = getVal('week-theme-input');

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/generate-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          group_profile: state.groupProfile,
          sermon: state.currentSermon,
          readings: state.currentReadings,
          week_theme: weekTheme,
          meeting_length: state.groupProfile ? state.groupProfile.default_meeting_length : 75,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      state.currentGuideJson = data.guide_json;
      state.currentGuideMarkdown = data.guide_markdown;

      renderGuideOutput(data.guide_json, meetingDate, weekTheme);
      setStatus(statusEl, '', '');
      outputEl.style.display = 'block';
      actionsEl.style.display = 'flex';
    } catch (err) {
      setStatus(statusEl, 'Error: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  function renderGuideOutput(guideJson, meetingDate, weekTheme) {
    var outputEl = document.getElementById('guide-output');
    var g = guideJson;
    var html = '';

    if (g.key_verse) {
      html += '<div class="key-verse-box"><span class="key-verse-ref">Key Verse: ' + esc(g.key_verse) + '</span> <em style="font-size:0.8rem; color:#888;">(verify text via Bible API)</em></div>';
    }

    if (g.opening_prayer_prompt) {
      html += '<div style="margin-bottom:1rem;"><strong style="font-size:0.85rem; color:#555;">Opening Prayer Focus:</strong> <span style="font-size:0.875rem;">' + esc(g.opening_prayer_prompt) + '</span></div>';
    }

    var SECTION_CLASSES = { HEAD: 'head', HEART: 'heart', HANDS: 'hands' };
    var SECTION_EMOJIS = { HEAD: '🧠', HEART: '❤️', HANDS: '🙌' };

    (g.sections || []).forEach(function (section) {
      var cls = SECTION_CLASSES[section.type] || 'head';
      var emoji = SECTION_EMOJIS[section.type] || '';
      html += '<div class="hhh-section ' + cls + '">';
      html += '<h3>' + emoji + ' ' + esc(section.title) + '</h3>';
      if (section.guiding_question) {
        html += '<div class="hhh-guiding">' + esc(section.guiding_question) + '</div>';
      }
      html += '<ol class="hhh-questions">';
      (section.questions || []).forEach(function (q) {
        html += '<li>' + esc(q) + '</li>';
      });
      html += '</ol></div>';
    });

    if (g.closing_prayer_prompt) {
      html += '<div style="margin-top:1rem;"><strong style="font-size:0.85rem; color:#555;">Closing Prayer Focus:</strong> <span style="font-size:0.875rem;">' + esc(g.closing_prayer_prompt) + '</span></div>';
    }

    outputEl.innerHTML = html;
  }

  async function copyGuide() {
    if (!state.currentGuideMarkdown) return;
    try {
      await navigator.clipboard.writeText(state.currentGuideMarkdown);
      alert('Markdown copied to clipboard!');
    } catch {
      prompt('Copy this markdown:', state.currentGuideMarkdown);
    }
  }

  async function saveGuide() {
    if (!state.currentGuideJson) return;
    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var dateStr = getVal('meeting-date-input') || todayDateStr();
      var res = await fetch('/api/discipleship-group/save-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          group_profile_id: state.groupProfile ? state.groupProfile.id : null,
          meeting_date: dateStr,
          week_theme: getVal('week-theme-input'),
          sermon_id: state.currentSermon ? state.currentSermon.id : null,
          sermon_title: state.currentSermon ? state.currentSermon.title : null,
          sermon_scripture: state.currentSermon ? state.currentSermon.scripture : null,
          sermon_summary: state.currentSermon ? state.currentSermon.summary : null,
          readings_json: state.currentReadings || [],
          meeting_length: state.groupProfile ? state.groupProfile.default_meeting_length : 75,
          guide_json: state.currentGuideJson,
          guide_markdown: state.currentGuideMarkdown,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      alert('Guide saved!');
    } catch (err) {
      alert('Error saving guide: ' + err.message);
    }
  }

  function buildAgendaFromGuide() {
    // Pre-populate the agenda date and switch to tab
    var dateStr = getVal('meeting-date-input') || todayDateStr();
    setVal('agenda-date', dateStr);
    if (state.groupProfile) {
      if (state.groupProfile.meeting_location) setVal('agenda-location', state.groupProfile.meeting_location);
      if (state.groupProfile.leader_name) {
        setVal('agenda-opening-prayer', state.groupProfile.leader_name);
      }
    }
    switchTab('agenda-builder');
  }

  // ─── Agenda Builder ────────────────────────────────────────────────────────

  async function populateAgendaGuideSelect() {
    var select = document.getElementById('agenda-guide-select');
    if (!select) return;
    // Only reload if empty
    if (select.options.length > 1) return;

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/guides', {
        headers: { Authorization: 'Bearer ' + token },
      });
      var data = await res.json();
      (data.guides || []).forEach(function (g) {
        var opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = (g.meeting_date || 'Undated') + (g.sermon_title ? ' — ' + g.sermon_title : '');
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('Failed to load guides for select:', err);
    }
  }

  async function buildAgenda() {
    var btn = document.getElementById('build-agenda-btn');
    var statusEl = document.getElementById('agenda-status');
    var outputSection = document.getElementById('agenda-output-section');

    btn.disabled = true;
    setStatus(statusEl, 'Building agenda…', 'info');
    outputSection.style.display = 'none';

    var guideId = getVal('agenda-guide-select') || null;

    var agendaInputs = {
      opening_prayer_leader: getVal('agenda-opening-prayer'),
      closing_prayer_leader: getVal('agenda-closing-prayer'),
      worship_song: getVal('agenda-worship-song'),
      announcements: getVal('agenda-announcements'),
      next_week_preview: getVal('agenda-next-week'),
      readings: state.currentReadings || [],
    };

    var body = {
      guide_id: guideId || null,
      guide_json: guideId ? null : state.currentGuideJson,
      group_profile_id: state.groupProfile ? state.groupProfile.id : null,
      meeting_date: getVal('agenda-date') || todayDateStr(),
      meeting_location: getVal('agenda-location'),
      leader_name: state.groupProfile ? state.groupProfile.leader_name : null,
      meeting_length: state.groupProfile ? state.groupProfile.default_meeting_length : 75,
      meeting_time: state.groupProfile ? state.groupProfile.meeting_time : null,
      agenda_inputs: agendaInputs,
    };

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/build-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Build failed');

      state.currentAgendaMarkdown = data.agenda_markdown;
      state.currentShareToken = data.share_token;

      document.getElementById('agenda-output').textContent = data.agenda_markdown;
      outputSection.style.display = 'block';
      setStatus(statusEl, '', '');
    } catch (err) {
      setStatus(statusEl, 'Error: ' + err.message, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  async function copyAgenda() {
    if (!state.currentAgendaMarkdown) return;
    try {
      await navigator.clipboard.writeText(state.currentAgendaMarkdown);
      alert('Agenda copied to clipboard!');
    } catch {
      prompt('Copy this agenda:', state.currentAgendaMarkdown);
    }
  }

  async function saveAgenda() {
    if (!state.currentAgendaMarkdown) return;
    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/save-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          group_profile_id: state.groupProfile ? state.groupProfile.id : null,
          meeting_date: getVal('agenda-date') || todayDateStr(),
          meeting_location: getVal('agenda-location'),
          leader_name: state.groupProfile ? state.groupProfile.leader_name : null,
          opening_prayer_leader: getVal('agenda-opening-prayer'),
          closing_prayer_leader: getVal('agenda-closing-prayer'),
          worship_song: getVal('agenda-worship-song'),
          announcements: getVal('agenda-announcements'),
          next_week_preview: getVal('agenda-next-week'),
          agenda_markdown: state.currentAgendaMarkdown,
          share_token: state.currentShareToken,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      // Show share link
      var shareSection = document.getElementById('agenda-share-section');
      var shareInput = document.getElementById('agenda-share-link');
      var shareUrl = window.location.origin + '/api/discipleship-group/agenda-share/' + data.share_token;
      shareInput.value = shareUrl;
      shareSection.style.display = 'block';

      alert('Agenda saved!');
    } catch (err) {
      alert('Error saving agenda: ' + err.message);
    }
  }

  async function copyShareLink() {
    var shareInput = document.getElementById('agenda-share-link');
    if (!shareInput || !shareInput.value) return;
    try {
      await navigator.clipboard.writeText(shareInput.value);
      alert('Share link copied!');
    } catch {
      shareInput.select();
      document.execCommand('copy');
    }
  }

  // ─── Saved Guides ──────────────────────────────────────────────────────────

  async function loadSavedGuides() {
    var listEl = document.getElementById('saved-guides-list');
    listEl.innerHTML = '<div class="loading">Loading saved guides…</div>';

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/guides', {
        headers: { Authorization: 'Bearer ' + token },
      });
      var data = await res.json();
      state.savedGuides = data.guides || [];

      if (!state.savedGuides.length) {
        listEl.innerHTML = '<div class="loading">No saved guides yet. Generate and save a guide to see it here.</div>';
        return;
      }

      var html = '';
      state.savedGuides.forEach(function (g) {
        var title = g.sermon_title || 'Untitled Guide';
        var meta = [g.meeting_date, g.sermon_scripture].filter(Boolean).join(' · ');
        html += '<div class="saved-item">';
        html += '<div class="saved-item-info">';
        html += '<div class="saved-item-title">' + esc(title) + '</div>';
        if (meta) html += '<div class="saved-item-meta">' + esc(meta) + '</div>';
        html += '</div>';
        html += '<div class="saved-item-actions">';
        html += '<button class="btn btn-secondary btn-sm" onclick="DG.viewSavedGuide(\'' + esc(g.id) + '\')">View</button>';
        html += '</div>';
        html += '</div>';
      });

      listEl.innerHTML = html;
    } catch (err) {
      listEl.innerHTML = '<div class="loading" style="color:#842029;">Failed to load guides.</div>';
      console.error(err);
    }
  }

  function viewSavedGuide(id) {
    var guide = state.savedGuides.find(function (g) { return g.id === id; });
    if (!guide || !guide.guide_markdown) return;
    // Open in a new window/tab for easy reading
    var win = window.open('', '_blank');
    if (win) {
      win.document.write('<pre style="font-family:sans-serif; max-width:700px; margin:2rem auto; white-space:pre-wrap; line-height:1.6;">' + escHtml(guide.guide_markdown) + '</pre>');
      win.document.close();
    }
  }

  // ─── Saved Agendas ─────────────────────────────────────────────────────────

  async function loadSavedAgendas() {
    var listEl = document.getElementById('saved-agendas-list');
    listEl.innerHTML = '<div class="loading">Loading saved agendas…</div>';

    try {
      var token = await window.PastorDaveAuth.getSessionToken();
      var res = await fetch('/api/discipleship-group/agendas', {
        headers: { Authorization: 'Bearer ' + token },
      });
      var data = await res.json();
      state.savedAgendas = data.agendas || [];

      if (!state.savedAgendas.length) {
        listEl.innerHTML = '<div class="loading">No saved agendas yet. Build and save an agenda to see it here.</div>';
        return;
      }

      var html = '';
      state.savedAgendas.forEach(function (a) {
        var title = a.meeting_date ? 'Meeting: ' + a.meeting_date : 'Agenda';
        var meta = [a.meeting_location, a.leader_name].filter(Boolean).join(' · ');
        html += '<div class="saved-item">';
        html += '<div class="saved-item-info">';
        html += '<div class="saved-item-title">' + esc(title) + '</div>';
        if (meta) html += '<div class="saved-item-meta">' + esc(meta) + '</div>';
        html += '</div>';
        html += '<div class="saved-item-actions">';
        html += '<button class="btn btn-secondary btn-sm" onclick="DG.viewSavedAgenda(\'' + esc(a.id) + '\')">View</button>';
        if (a.share_token) {
          html += '<button class="btn btn-secondary btn-sm" onclick="DG.copyAgendaShareLink(\'' + esc(a.share_token) + '\')">Copy Link</button>';
        }
        html += '</div>';
        html += '</div>';
      });

      listEl.innerHTML = html;
    } catch (err) {
      listEl.innerHTML = '<div class="loading" style="color:#842029;">Failed to load agendas.</div>';
      console.error(err);
    }
  }

  function viewSavedAgenda(id) {
    var agenda = state.savedAgendas.find(function (a) { return a.id === id; });
    if (!agenda || !agenda.agenda_markdown) return;
    var win = window.open('', '_blank');
    if (win) {
      win.document.write('<pre style="font-family:sans-serif; max-width:700px; margin:2rem auto; white-space:pre-wrap; line-height:1.6;">' + escHtml(agenda.agenda_markdown) + '</pre>');
      win.document.close();
    }
  }

  async function copyAgendaShareLink(shareToken) {
    var url = window.location.origin + '/api/discipleship-group/agenda-share/' + shareToken;
    try {
      await navigator.clipboard.writeText(url);
      alert('Share link copied!');
    } catch {
      prompt('Share link:', url);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getVal(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  function getChecked(id) {
    var el = document.getElementById(id);
    return el ? el.checked : false;
  }

  function setChecked(id, value) {
    var el = document.getElementById(id);
    if (el) el.checked = !!value;
  }

  function setStatus(el, msg, type) {
    if (!el) return;
    if (!msg) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="status-msg ' + type + '">' + esc(msg) + '</div>';
  }

  function todayDateStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function esc(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function escHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    init: init,
    switchTab: switchTab,
    saveSettings: saveSettings,
    generateGuide: generateGuide,
    copyGuide: copyGuide,
    saveGuide: saveGuide,
    buildAgendaFromGuide: buildAgendaFromGuide,
    buildAgenda: buildAgenda,
    copyAgenda: copyAgenda,
    saveAgenda: saveAgenda,
    copyShareLink: copyShareLink,
    viewSavedGuide: viewSavedGuide,
    viewSavedAgenda: viewSavedAgenda,
    copyAgendaShareLink: copyAgendaShareLink,
  };
})();

// Kick off initialization
DG.init();
