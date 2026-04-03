// admin.js — Church Pro Admin Dashboard for Pastor Dave Pro
// New Horizon Church — Champaign, IL

(async function () {
  // ── Auth ──────────────────────────────────────────────────────────────────
  await window.PastorDaveAuth.clerkReady;

  if (!window.Clerk?.user) {
    window.location.href = '/index.html';
    return;
  }

  // Mount user button in header
  window.PastorDaveAuth.mountUserButton(document.getElementById('user-button'));

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function apiFetch(path, options = {}) {
    const token = await window.PastorDaveAuth.getSessionToken();
    if (!token) throw new Error('Not authenticated');
    return fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    // ts could be a unix timestamp (seconds) or ISO string
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(containerId, msg) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="error-box">${escHtml(msg)}</div>`;
  }

  function setLoading(containerId, msg = 'Loading…') {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = `<div class="loading">${msg}</div>`;
  }

  // ── Branding ──────────────────────────────────────────────────────────────
  function applyBranding(church) {
    if (church.accent_color) {
      document.documentElement.style.setProperty('--brand', church.accent_color);
      // derive a slightly darker shade for hover states
      document.documentElement.style.setProperty('--brand-dark', church.accent_color);
    }
    if (church.logo_url) {
      const logoEl = document.querySelector('.logo');
      if (logoEl) {
        logoEl.innerHTML = `<img src="${church.logo_url}" alt="Church logo" style="max-height:32px;vertical-align:middle;" />`;
      }
    }
    if (church.display_name) {
      const label = document.querySelector('.church-label');
      if (label) label.textContent = church.display_name + ' — Admin';
    }
  }

  async function loadBranding() {
    try {
      const res = await apiFetch('/api/admin/church-profile');
      if (!res.ok) return;
      const { church } = await res.json();
      applyBranding(church);
    } catch { /* non-fatal */ }
  }

  loadBranding();

  // ── Tab switching ─────────────────────────────────────────────────────────
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  function activateTab(tabId) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));
    loadTab(tabId);
  }

  tabs.forEach(t => t.addEventListener('click', () => activateTab(t.dataset.tab)));

  // ── Visitors ──────────────────────────────────────────────────────────────
  async function loadVisitors() {
    setLoading('visitors-table');
    try {
      const res = await apiFetch('/api/admin/visitors');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { visitors } = await res.json();

      if (!visitors.length) {
        document.getElementById('visitors-table').innerHTML =
          '<p class="empty-state">No visitor records yet.</p>';
        return;
      }

      const rows = visitors.map(v => `
        <tr>
          <td>${escHtml(v.name)}</td>
          <td>${escHtml(v.email)}</td>
          <td>${escHtml(v.phone)}</td>
          <td class="notes-cell">${escHtml(v.notes)}</td>
          <td>${escHtml(v.source)}</td>
          <td class="date-cell">${fmtDate(v.created_at)}</td>
        </tr>`).join('');

      document.getElementById('visitors-table').innerHTML = `
        <table>
          <thead><tr>
            <th>Name</th><th>Email</th><th>Phone</th>
            <th>Notes / Interest</th><th>Source</th><th>Date</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch (err) {
      showError('visitors-table', `Failed to load visitors: ${err.message}`);
    }
  }

  // ── Pastoral Alerts ───────────────────────────────────────────────────────
  async function loadAlerts() {
    setLoading('alerts-table');
    try {
      const res = await apiFetch('/api/admin/alerts');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { alerts } = await res.json();

      if (!alerts.length) {
        document.getElementById('alerts-table').innerHTML =
          '<p class="empty-state">No pastoral alerts.</p>';
        return;
      }

      const rows = alerts.map(a => `
        <tr class="${a.resolved ? 'resolved-row' : ''}">
          <td><span class="badge badge-${escHtml(a.type)}">${escHtml(a.type)}</span></td>
          <td class="notes-cell">${escHtml(a.message)}</td>
          <td>${escHtml(a.user_id !== 'anonymous' ? a.user_id : '—')}</td>
          <td class="date-cell">${fmtDate(a.created_at)}</td>
          <td>
            ${a.resolved
              ? '<span class="resolved-label">Resolved</span>'
              : `<button class="resolve-btn" data-id="${escHtml(a.id)}">Mark Resolved</button>`}
          </td>
        </tr>`).join('');

      document.getElementById('alerts-table').innerHTML = `
        <table>
          <thead><tr>
            <th>Type / Severity</th><th>Situation</th>
            <th>Visitor</th><th>Date</th><th>Action</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

      // Wire up resolve buttons
      document.querySelectorAll('.resolve-btn').forEach(btn => {
        btn.addEventListener('click', () => resolveAlert(btn.dataset.id));
      });
    } catch (err) {
      showError('alerts-table', `Failed to load alerts: ${err.message}`);
    }
  }

  async function resolveAlert(id) {
    try {
      const res = await apiFetch('/api/admin/alerts/resolve', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAlerts(); // refresh
    } catch (err) {
      alert(`Failed to resolve alert: ${err.message}`);
    }
  }

  // ── Sermons ───────────────────────────────────────────────────────────────
  async function loadSermons() {
    setLoading('sermons-table');
    try {
      const res = await apiFetch('/api/admin/sermons');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { sermons } = await res.json();

      if (!sermons.length) {
        document.getElementById('sermons-table').innerHTML =
          '<p class="empty-state">No sermons loaded yet.</p>';
        return;
      }

      const rows = sermons.map(s => `
        <tr data-sermon-id="${escHtml(s.id)}">
          <td><strong>${escHtml(s.title)}</strong></td>
          <td>${escHtml(s.speaker || s.pastor)}</td>
          <td class="date-cell">${escHtml(s.date)}</td>
          <td>${escHtml(s.series)}</td>
          <td>${escHtml(s.scripture)}</td>
          <td><button class="edit-btn" data-id="${escHtml(s.id)}">Edit</button></td>
        </tr>
        <tr class="sermon-edit-row" data-edit-row-id="${escHtml(s.id)}">
          <td colspan="6">
            <div class="edit-form-cell">
              <h3 style="margin-bottom: 1rem;">Edit Sermon</h3>
              <form class="sermon-edit-form" data-sermon-id="${escHtml(s.id)}">
                <div class="form-grid">
                  <div>
                    <label for="edit-title-${escHtml(s.id)}">Title</label>
                    <input type="text" id="edit-title-${escHtml(s.id)}" class="edit-title" value="${escHtml(s.title)}" />
                  </div>
                  <div>
                    <label for="edit-pastor-${escHtml(s.id)}">Speaker</label>
                    <input type="text" id="edit-pastor-${escHtml(s.id)}" class="edit-pastor" value="${escHtml(s.speaker || s.pastor)}" />
                  </div>
                  <div>
                    <label for="edit-date-${escHtml(s.id)}">Date</label>
                    <input type="date" id="edit-date-${escHtml(s.id)}" class="edit-date" value="${escHtml(s.date)}" />
                  </div>
                  <div>
                    <label for="edit-series-${escHtml(s.id)}">Series</label>
                    <input type="text" id="edit-series-${escHtml(s.id)}" class="edit-series" value="${escHtml(s.series || '')}" />
                  </div>
                  <div class="form-full">
                    <label for="edit-scripture-${escHtml(s.id)}">Scripture Reference</label>
                    <input type="text" id="edit-scripture-${escHtml(s.id)}" class="edit-scripture" value="${escHtml(s.scripture || '')}" />
                  </div>
                  <div class="form-full">
                    <label for="edit-summary-${escHtml(s.id)}">Summary</label>
                    <textarea id="edit-summary-${escHtml(s.id)}" class="edit-summary">${escHtml(s.summary || '')}</textarea>
                  </div>
                  <div class="form-full">
                    <label for="edit-key_points-${escHtml(s.id)}">Key Points</label>
                    <textarea id="edit-key_points-${escHtml(s.id)}" class="edit-key_points">${escHtml(s.key_points || '')}</textarea>
                  </div>
                  <div class="form-full">
                    <label for="edit-discussion_questions-${escHtml(s.id)}">Discussion Questions</label>
                    <textarea id="edit-discussion_questions-${escHtml(s.id)}" class="edit-discussion_questions">${escHtml(s.discussion_questions || '')}</textarea>
                  </div>
                  <div>
                    <label for="edit-youtube_id-${escHtml(s.id)}">YouTube Video ID</label>
                    <input type="text" id="edit-youtube_id-${escHtml(s.id)}" class="edit-youtube_id" value="${escHtml(s.youtube_id || '')}" placeholder="e.g. 8K_BInk1qsQ" />
                  </div>
                </div>
                <div class="form-actions" style="margin-top: 1rem;">
                  <button type="submit" class="submit-btn edit-save-btn" data-id="${escHtml(s.id)}">Save</button>
                  <button type="button" class="cancel-btn edit-cancel-btn" data-id="${escHtml(s.id)}">Cancel</button>
                  <button type="button" class="cancel-btn delete-sermon-btn" data-id="${escHtml(s.id)}" data-title="${escHtml(s.title)}" style="color:#c0392b; margin-left:auto;">🗑 Delete</button>
                  <span class="form-status edit-status" data-id="${escHtml(s.id)}"></span>
                </div>
              </form>
            </div>
          </td>
        </tr>
      `).join('');

      document.getElementById('sermons-table').innerHTML = `
        <table>
          <thead><tr>
            <th>Title</th><th>Speaker</th><th>Date</th><th>Series</th><th>Scripture</th><th>Action</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;

      // Wire up edit buttons
      document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleEditForm(btn.dataset.id));
      });

      // Wire up edit form submit and cancel buttons
      document.querySelectorAll('.sermon-edit-form').forEach(form => {
        form.addEventListener('submit', (e) => saveSermonEdit(e));
        const cancelBtn = form.querySelector('.edit-cancel-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => toggleEditForm(cancelBtn.dataset.id));
        }
      });

      // Wire up delete buttons
      document.querySelectorAll('.delete-sermon-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteSermon(btn.dataset.id, btn.dataset.title));
      });
    } catch (err) {
      showError('sermons-table', `Failed to load sermons: ${err.message}`);
    }
  }

  function toggleEditForm(sermonId) {
    const editRow = document.querySelector(`tr[data-edit-row-id="${sermonId}"]`);
    if (editRow) {
      editRow.classList.toggle('open');
    }
  }

  async function saveSermonEdit(e) {
    e.preventDefault();
    const form = e.target;
    const sermonId = form.dataset.sermonId;
    const statusEl = document.querySelector(`.edit-status[data-id="${sermonId}"]`);
    const saveBtn = form.querySelector('.edit-save-btn');

    statusEl.textContent = '';
    statusEl.className = 'form-status edit-status';
    saveBtn.disabled = true;

    const data = {
      title: form.querySelector('.edit-title').value.trim(),
      pastor: form.querySelector('.edit-pastor').value.trim(),
      date: form.querySelector('.edit-date').value,
      series: form.querySelector('.edit-series').value.trim() || null,
      scripture: form.querySelector('.edit-scripture').value.trim() || null,
      summary: form.querySelector('.edit-summary').value.trim() || null,
      key_points: form.querySelector('.edit-key_points').value.trim() || null,
      discussion_questions: form.querySelector('.edit-discussion_questions').value.trim() || null,
      youtube_id: form.querySelector('.edit-youtube_id').value.trim() || null,
    };

    try {
      const res = await apiFetch(`/api/admin/sermons/${sermonId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

      statusEl.textContent = 'Sermon updated successfully.';
      statusEl.className = 'form-status edit-status success';
      setTimeout(() => {
        toggleEditForm(sermonId);
        loadSermons();
      }, 500);
    } catch (err) {
      statusEl.textContent = `Update failed: ${err.message}`;
      statusEl.className = 'form-status edit-status error';
    } finally {
      saveBtn.disabled = false;
    }
  }

  // Sermon upload form
  document.getElementById('sermon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button[type=submit]');
    const statusEl = document.getElementById('sermon-form-status');

    btn.disabled = true;
    btn.textContent = 'Uploading…';
    statusEl.textContent = '';
    statusEl.className = '';

    const data = {
      title: form.title.value.trim(),
      pastor: form.pastor.value.trim(),
      date: form.date.value,
      series: form.series.value.trim() || null,
      scripture: form.scripture.value.trim() || null,
      summary: form.summary.value.trim() || null,
      key_points: form.key_points.value.trim() || null,
      discussion_questions: form.discussion_questions.value.trim() || null,
      youtube_id: form.youtube_id.value.trim() || null,
    };

    try {
      const res = await apiFetch('/api/admin/sermons', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

      statusEl.textContent = 'Sermon uploaded successfully.';
      statusEl.className = 'form-status success';
      form.reset();
      await loadSermons();
    } catch (err) {
      statusEl.textContent = `Upload failed: ${err.message}`;
      statusEl.className = 'form-status error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Upload Sermon';
    }
  });

  // Toggle sermon form
  document.getElementById('toggle-sermon-form').addEventListener('click', () => {
    const form = document.getElementById('sermon-form-wrapper');
    const btn = document.getElementById('toggle-sermon-form');
    const hidden = form.style.display === 'none';
    form.style.display = hidden ? 'block' : 'none';
    btn.textContent = hidden ? 'Hide Form' : '+ Add Sermon';
  });

  async function deleteSermon(sermonId, title) {
    if (!confirm('Delete sermon "' + title + '"?\n\nThis cannot be undone.')) return;
    const statusEl = document.querySelector('.edit-status[data-id="' + sermonId + '"]');
    try {
      const res = await apiFetch('/api/admin/sermons', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sermonId })
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
      loadSermons(); // Refresh the list
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  async function loadStats() {
    setLoading('stats-content');
    try {
      const res = await apiFetch('/api/admin/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = await res.json();

      document.getElementById('stats-content').innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">${s.visitors}</div>
            <div class="stat-label">Total Visitors</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${s.alerts_open}</div>
            <div class="stat-label">Open Alerts</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${s.alerts_resolved}</div>
            <div class="stat-label">Resolved Alerts</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${s.sermons}</div>
            <div class="stat-label">Sermons Loaded</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${s.users_pro}</div>
            <div class="stat-label">Pro Users</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">${s.users_church}</div>
            <div class="stat-label">Church Users</div>
          </div>
        </div>`;
    } catch (err) {
      showError('stats-content', `Failed to load stats: ${err.message}`);
    }
  }

  // ── Church Settings ───────────────────────────────────────────────────────
  async function loadChurchSettings() {
    const container = document.getElementById('church-settings-content');
    container.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const res = await apiFetch('/api/admin/church-profile');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { church } = await res.json();

      container.innerHTML = `
        <div class="settings-card">
          <div class="settings-field">
            <label>Church Name</label>
            <p style="font-size:0.95rem; color:#333;">${escHtml(church.name || '')}</p>
          </div>
          <div class="settings-field">
            <label>Pastor</label>
            <p style="font-size:0.95rem; color:#333;">${escHtml(church.pastor_name || '')}</p>
          </div>
          <div class="settings-field">
            <label for="cs-display-name">Display Name</label>
            <input type="text" id="cs-display-name" value="${escHtml(church.display_name || '')}" placeholder="e.g. New Horizon Church" />
          </div>
          <div class="settings-field">
            <label for="cs-logo-url">Logo URL</label>
            <input type="text" id="cs-logo-url" value="${escHtml(church.logo_url || '')}" placeholder="https://…/logo.png" />
            <img id="cs-logo-preview" class="logo-preview" src="${escHtml(church.logo_url || '')}" alt="Logo preview" ${church.logo_url ? 'style="display:block"' : ''} />
          </div>
          <div class="settings-field">
            <label for="cs-accent-text">Accent Color</label>
            <div class="color-row">
              <input type="color" id="cs-accent-color" value="${escHtml(church.accent_color || '#7c4f2a')}" />
              <input type="text" id="cs-accent-text" value="${escHtml(church.accent_color || '#7c4f2a')}" placeholder="#7c4f2a" style="flex:1;" />
            </div>
          </div>
          <div class="settings-field">
            <label for="cs-weekly-bulletin">Weekly Bulletin</label>
            <textarea id="cs-weekly-bulletin" placeholder="Paste this week's church bulletin / announcements here. Pastor Dave will use this to answer questions about upcoming events, groups, and activities.">${escHtml(church.weekly_bulletin || '')}</textarea>
          </div>
          <div class="settings-field">
            <label for="cs-bulletin-url">Auto-Fetch URL <span style="font-weight:400;color:#888;">(optional — fetched every Monday)</span></label>
            <input type="text" id="cs-bulletin-url" value="${escHtml(church.bulletin_url || '')}" placeholder="https://yourchurch.org/weekly-updates" />
            <p style="font-size:0.78rem;color:#888;margin-top:0.25rem;">If set, the Weekly Bulletin above is updated automatically every Monday morning.</p>
          </div>
          <div class="form-actions">
            <button class="submit-btn" id="cs-save-btn">Save</button>
            <span id="cs-status" class="form-status"></span>
          </div>
        </div>`;

      // Live logo preview
      document.getElementById('cs-logo-url').addEventListener('input', (e) => {
        const preview = document.getElementById('cs-logo-preview');
        const val = e.target.value.trim();
        preview.src = val;
        preview.style.display = val ? 'block' : 'none';
      });

      // Sync color picker ↔ text input
      const colorPicker = document.getElementById('cs-accent-color');
      const colorText = document.getElementById('cs-accent-text');
      colorPicker.addEventListener('input', () => { colorText.value = colorPicker.value; });
      colorText.addEventListener('input', () => {
        if (/^#[0-9a-fA-F]{6}$/.test(colorText.value)) colorPicker.value = colorText.value;
      });

      // Save
      document.getElementById('cs-save-btn').addEventListener('click', async () => {
        const btn = document.getElementById('cs-save-btn');
        const status = document.getElementById('cs-status');
        btn.disabled = true;
        status.textContent = '';
        status.className = 'form-status';
        try {
          const r = await apiFetch('/api/admin/church-profile', {
            method: 'PATCH',
            body: JSON.stringify({
              display_name: document.getElementById('cs-display-name').value.trim() || null,
              logo_url: document.getElementById('cs-logo-url').value.trim() || null,
              accent_color: document.getElementById('cs-accent-text').value.trim() || null,
              weekly_bulletin: document.getElementById('cs-weekly-bulletin').value.trim() || null,
              bulletin_url: document.getElementById('cs-bulletin-url').value.trim() || null,
            }),
          });
          const result = await r.json();
          if (!r.ok) throw new Error(result.error || `HTTP ${r.status}`);
          status.textContent = 'Settings saved.';
          status.className = 'form-status success';
          // Apply branding live
          const color = document.getElementById('cs-accent-text').value.trim();
          if (color) applyBranding({ accent_color: color });
        } catch (err) {
          status.textContent = `Save failed: ${err.message}`;
          status.className = 'form-status error';
        } finally {
          btn.disabled = false;
        }
      });
    } catch (err) {
      showError('church-settings-content', `Failed to load church settings: ${err.message}`);
    }
  }

  // ── Tab loader dispatch ───────────────────────────────────────────────────
  const loaded = new Set();

  function loadTab(tabId) {
    if (loaded.has(tabId)) return;
    loaded.add(tabId);
    if (tabId === 'visitors') loadVisitors();
    else if (tabId === 'alerts') loadAlerts();
    else if (tabId === 'sermons') loadSermons();
    else if (tabId === 'stats') loadStats();
    else if (tabId === 'church-settings') loadChurchSettings();
  }

  // Activate default tab (Insights first)
  activateTab('stats');
})();
