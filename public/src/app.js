// app.js — logic for app.html (authenticated app page)

(async () => {
  await window.PastorDaveAuth.clerkReady;

  if (!window.Clerk.user) {
    window.location.href = '/index.html';
    return;
  }

  const userButtonContainer = document.getElementById('user-button');
  if (userButtonContainer) {
    window.PastorDaveAuth.mountUserButton(userButtonContainer);
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('upgraded') === 'true') {
    const banner = document.getElementById('upgrade-banner');
    if (banner) {
      banner.textContent = "You've upgraded to Pro! Unlimited conversations unlocked.";
      banner.style.display = 'block';
      window.history.replaceState({}, '', '/app.html');
    }
  }

  await loadSubscriptionStatus();

  const startBtn = document.getElementById('start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', startConversation);
  }
})();

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
  const errorEl = document.getElementById('error-message');
  const widgetContainer = document.getElementById('widget-container');

  if (startBtn) startBtn.disabled = true;
  if (limitMsg) limitMsg.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';

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

    // Start the conversation using the ElevenLabs WebSocket API directly
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

  // Request microphone access
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error('Microphone access denied:', err);
    container.innerHTML = `
      <div style="text-align:center; padding:2rem; color:#842029; background:#f8d7da; border-radius:8px; border:1px solid #f5c2c7;">
        <p><strong>Microphone access is required.</strong></p>
        <p>Please allow microphone access in your browser and try again.</p>
      </div>
    `;
    if (startBtn) startBtn.disabled = false;
    return;
  }

  // Build the conversation UI
  container.innerHTML = `
    <div id="conversation-ui" style="text-align:center; width:100%;">
      <div id="conv-status" style="margin-bottom:1rem; font-size:0.95rem; color:#666;">Connecting to Pastor Dave…</div>
      <div id="conv-visualizer" style="width:80px; height:80px; margin:0 auto 1.5rem; border-radius:50%; background:#7c4f2a; display:flex; align-items:center; justify-content:center;">
        <span style="color:#fff; font-size:2rem;">🎙</span>
      </div>
      <div id="conv-transcript" style="min-height:100px; max-height:300px; overflow-y:auto; text-align:left; padding:1rem; background:#fff; border-radius:8px; border:1px solid #e5e0d8; margin-bottom:1rem; font-size:0.9rem; line-height:1.6;"></div>
      <button id="end-btn" style="background:#842029; color:#fff; border:none; padding:0.7rem 2rem; font-size:1rem; font-weight:600; border-radius:8px; cursor:pointer;">End Conversation</button>
    </div>
  `;

  const statusEl = document.getElementById('conv-status');
  const transcriptEl = document.getElementById('conv-transcript');
  const visualizer = document.getElementById('conv-visualizer');
  const endBtn = document.getElementById('end-btn');

  // Connect via WebSocket
  const ws = new WebSocket(signedUrl);

  // Audio context for playback
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  let audioQueue = [];
  let isPlaying = false;

  // MediaRecorder to capture mic audio
  const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  const audioChunks = [];

  ws.onopen = () => {
    console.log('WebSocket connected to ElevenLabs');
    statusEl.textContent = 'Connected — speak to Pastor Dave';
    visualizer.style.background = '#28a745';

    // Start sending audio
    mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        const arrayBuffer = await event.data.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        ws.send(JSON.stringify({
          user_audio_chunk: base64
        }));
      }
    };
    mediaRecorder.start(250); // Send chunks every 250ms
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'audio') {
        // Decode and play audio
        const audioData = Uint8Array.from(atob(msg.audio?.chunk || msg.data || ''), c => c.charCodeAt(0));
        playAudioChunk(audioContext, audioData);
        visualizer.style.background = '#7c4f2a';
      }

      if (msg.type === 'agent_response' || msg.type === 'transcript') {
        const text = msg.text || msg.agent_response || '';
        if (text) {
          transcriptEl.innerHTML += `<p><strong>Pastor Dave:</strong> ${text}</p>`;
          transcriptEl.scrollTop = transcriptEl.scrollHeight;
        }
      }

      if (msg.type === 'user_transcript') {
        const text = msg.text || msg.user_transcript || '';
        if (text) {
          transcriptEl.innerHTML += `<p style="color:#666;"><strong>You:</strong> ${text}</p>`;
          transcriptEl.scrollTop = transcriptEl.scrollHeight;
        }
      }

      if (msg.type === 'conversation_initiation_metadata') {
        console.log('Conversation initiated:', msg);
        statusEl.textContent = 'Listening…';
      }

      if (msg.type === 'error') {
        console.error('ElevenLabs error:', msg);
        statusEl.textContent = 'Error occurred. Please try again.';
        statusEl.style.color = '#842029';
      }
    } catch (e) {
      // Binary audio data
      if (event.data instanceof Blob) {
        const arrayBuffer = await event.data.arrayBuffer();
        playAudioChunk(audioContext, new Uint8Array(arrayBuffer));
      }
    }
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    statusEl.textContent = 'Connection error. Please try again.';
    statusEl.style.color = '#842029';
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    statusEl.textContent = 'Conversation ended.';
    visualizer.style.background = '#6c757d';
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    stream.getTracks().forEach(t => t.stop());
    if (startBtn) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = false;
    }
  };

  endBtn.addEventListener('click', () => {
    if (ws.readyState === WebSocket.OPEN) ws.close();
    if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    stream.getTracks().forEach(t => t.stop());
    statusEl.textContent = 'Conversation ended.';
    visualizer.style.background = '#6c757d';
    endBtn.disabled = true;
    if (startBtn) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = false;
    }
  });
}

async function playAudioChunk(audioContext, audioData) {
  try {
    // Try decoding as standard audio format first
    const audioBuffer = await audioContext.decodeAudioData(audioData.buffer.slice(0));
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  } catch (e) {
    // If decoding fails, try as raw PCM 16-bit
    try {
      const float32 = new Float32Array(audioData.length / 2);
      const view = new DataView(audioData.buffer);
      for (let i = 0; i < float32.length; i++) {
        float32[i] = view.getInt16(i * 2, true) / 32768;
      }
      const audioBuffer = audioContext.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    } catch (e2) {
      console.warn('Could not play audio chunk:', e2);
    }
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
