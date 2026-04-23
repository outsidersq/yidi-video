// sidebar.js — Sidebar panel logic (vanilla JS)
// Communication: window.postMessage with __tongpin flag (from content.js)
//                window.postMessage with __tongpin_sidebar flag (to content.js)

// ── STATE ─────────────────────────────────────────────────────
const state = {
  tab: 'chat',          // chat | members | voice | subtitle
  roomCode: null,
  isHost: false,
  connected: false,
  messages: [],
  members: [],
  progress: { current: 0, duration: 0, paused: true },
  // Voice
  micOn: true,
  noiseReduce: true,
  echoCancel: true,
  autoGain: false,
  noiseLevel: 70,
  volume: 80,
  quality: 'balanced',
  // WebRTC
  localStream: null,
  peers: {},            // userId -> RTCPeerConnection
};

const AVATAR_COLORS = ['#7B6FCD','#FF6B9D','#4CAF88','#4A90D9','#E07B30'];
const AVATAR_EMOJIS = ['🐱','🐰','🦊','🐻','🐼'];
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// ── RENDER ────────────────────────────────────────────────────
function render() {
  document.getElementById('app').innerHTML = buildApp();
  bindEvents();
}

function buildApp() {
  return `
    <div class="sidebar-header">
      <div class="logo">同</div>
      <div style="flex:1">
        <div class="header-title">同频观影中</div>
        <div class="header-sub">${state.roomCode ? `房间 ${state.roomCode} · ${state.members.length || 3} 人` : '连接中...'}</div>
      </div>
      <div class="badge-live"><div class="live-dot"></div>直播中</div>
    </div>

    ${buildPlayerBar()}

    <div class="tabs">
      ${['chat','members','voice','subtitle'].map(t => `
        <div class="tab ${state.tab===t?'active':''}" data-tab="${t}">
          ${{ chat:'💬 聊天', members:'👥 成员', voice:'🎤 语音', subtitle:'📝 字幕' }[t]}
        </div>`).join('')}
    </div>

    <div class="tab-content" id="tab-content">
      ${buildTabContent()}
    </div>

    ${state.tab === 'chat' ? `
      <div class="chat-footer">
        <div class="chat-input-row">
          <input class="chat-input" id="chat-input" placeholder="说点什么..." />
          <button class="send-btn" id="send-btn">➤</button>
        </div>
      </div>` : ''}
  `;
}

function buildPlayerBar() {
  const { current, duration, paused } = state.progress;
  const pct = duration ? Math.min(100, current / duration * 100) : 38;
  return `
    <div class="player-bar">
      <div class="progress-track" id="progress-track">
        <div class="progress-fill" style="width:${pct.toFixed(1)}%"></div>
      </div>
      <div class="progress-times">
        <span>${formatSec(current)}</span>
        <span style="color:var(--pri);font-weight:700">
          ${state.isHost ? '👑 你在控制' : '👑 主持人控制'}
        </span>
        <span>${formatSec(duration)}</span>
      </div>
      <div class="player-controls">
        <div class="ctrl-btn" id="ctrl-prev" title="上一集">⏮</div>
        <div class="ctrl-btn ${paused ? '' : 'active'}" id="ctrl-play" title="${paused?'播放':'暂停'}">
          ${paused ? '▶' : '⏸'}
        </div>
        <div class="ctrl-btn" id="ctrl-next" title="下一集">⏭</div>
        <div class="emoji-bar">
          ${['😂','❤️','😮','👏','😭'].map(e =>
            `<span class="emoji-pill" data-emoji="${e}">${e}</span>`
          ).join('')}
        </div>
      </div>
    </div>`;
}

function buildTabContent() {
  switch(state.tab) {
    case 'chat':     return buildChat();
    case 'members':  return buildMembers();
    case 'voice':    return buildVoice();
    case 'subtitle': return buildSubtitle();
  }
}

// ── CHAT TAB ──────────────────────────────────────────────────
function buildChat() {
  const msgs = state.messages.length ? state.messages : getMockMessages();
  return msgs.map(m => {
    if (m.type === 'system') return `<div class="chat-system"><span>🔄 ${m.text}</span></div>`;
    const mine = m.mine;
    return `
      <div class="chat-msg" style="flex-direction:${mine?'row-reverse':'row'}">
        ${!mine ? `<div class="avatar-sm" style="background:${AVATAR_COLORS[m.avatarIdx||0]}">${AVATAR_EMOJIS[m.avatarIdx||0]}</div>` : ''}
        <div style="display:flex;flex-direction:column;align-items:${mine?'flex-end':'flex-start'}">
          ${!mine ? `<div class="chat-name">${m.name}</div>` : ''}
          <div class="chat-bubble ${mine?'bubble-mine':'bubble-other'}">${escHtml(m.text)}</div>
          <div class="chat-time">${m.time}</div>
        </div>
      </div>`;
  }).join('');
}

function getMockMessages() {
  return [
    { name:'晨晨', text:'好久没看这部了！', time:'22:28', mine:false, avatarIdx:1 },
    { name:'阿阳', text:'这集超感动的', time:'22:29', mine:false, avatarIdx:2 },
    { mine:true, text:'快到精彩部分了 😭', time:'22:30' },
    { type:'system', text:'视频已同步至 22:31' },
    { name:'晨晨', text:'等一下！我要去拿零食！', time:'22:31', mine:false, avatarIdx:1 },
  ];
}

// ── MEMBERS TAB ───────────────────────────────────────────────
function buildMembers() {
  const list = state.members.length ? state.members : getMockMembers();
  return `
    ${list.map((m,i) => `
      <div class="member-row">
        <div class="avatar-md" style="background:${AVATAR_COLORS[i%5]}">${AVATAR_EMOJIS[i%5]}</div>
        <div style="flex:1">
          <div class="member-name">${escHtml(m.name)}${m.isMe?' (你)':''}</div>
          <div class="member-status">● 在线</div>
        </div>
        ${m.speaking ? `<div class="wave">${[14,8,18,6,12].map((h,j)=>`<div class="wave-bar" style="--h:${h}px;--d:${.35+j*.08}s"></div>`).join('')}</div>` : ''}
        ${m.isHost ? `<span class="tag tag-host">主持</span>` : ''}
      </div>`).join('')}
    <button class="invite-btn">🔗 邀请更多好友</button>`;
}

function getMockMembers() {
  return [
    { name:'你 (月月)', isHost:false, isMe:true, speaking:true },
    { name:'晨晨', isHost:true, isMe:false, speaking:false },
    { name:'阿阳', isHost:false, isMe:false, speaking:true },
  ];
}

// ── VOICE TAB ─────────────────────────────────────────────────
function buildVoice() {
  const { micOn, noiseReduce, echoCancel, autoGain, noiseLevel, volume, quality } = state;
  const members = state.members.length ? state.members : getMockMembers();

  return `
    <div class="voice-header">
      <div class="voice-status-row">
        <div class="voice-dot"></div>
        <span class="voice-status-text">语音通话中</span>
        <span class="voice-duration" id="call-timer">00:00</span>
      </div>
      <div class="voice-members">
        ${members.slice(0,4).map((m,i) => `
          <div class="voice-member">
            <div class="voice-avatar-wrap">
              <div class="avatar-voice" style="background:${AVATAR_COLORS[i%5]}">${AVATAR_EMOJIS[i%5]}</div>
              ${m.speaking ? '<div class="voice-ring"></div>' : ''}
            </div>
            <div class="voice-member-name">${escHtml(m.name.split(' ')[0])}</div>
            ${m.speaking
              ? `<div class="voice-wave">${[14,8,18,6,12,16,4].map((h,j)=>`<div class="voice-wave-bar" style="--h:${h}px;--d:${.35+j*.07}s"></div>`).join('')}</div>`
              : `<div style="font-size:10px;opacity:.4">—</div>`}
          </div>`).join('')}
      </div>
    </div>

    <div class="mic-section">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="mic-btn ${micOn?'on':'off'}" id="mic-btn">${micOn?'🎤':'🔇'}</button>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:5px">
            ${micOn ? '麦克风音量' : '麦克风已关闭'}
          </div>
          <div class="mic-level">
            ${micOn ? '<div class="mic-fill"></div>' : ''}
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">
            ${micOn ? '输入正常' : '点击左侧开启'}
          </div>
        </div>
      </div>
      <div class="range-wrap">
        <div class="range-label"><span>对方音量</span><span>${volume}%</span></div>
        <input type="range" id="vol-slider" min="0" max="100" value="${volume}"
          style="background:linear-gradient(90deg,var(--pri) ${volume}%,var(--border) ${volume}%)">
      </div>
    </div>

    <div class="section-title">音频优化</div>

    <div class="toggle-row ${noiseReduce?'on':''}" id="toggle-noise">
      <span class="toggle-icon">🎚️</span>
      <div class="toggle-info">
        <div class="toggle-label">背景降噪</div>
        <div class="toggle-desc">过滤键盘声、环境噪音</div>
      </div>
      <div class="switch ${noiseReduce?'on':'off'}"><div class="knob"></div></div>
    </div>
    ${noiseReduce ? `
      <div class="noise-level-wrap">
        <div class="noise-level-label"><span>降噪强度</span><span>${noiseLevel<40?'轻柔':noiseLevel<75?'标准':'强力'}</span></div>
        <input type="range" id="noise-slider" min="0" max="100" value="${noiseLevel}"
          style="background:linear-gradient(90deg,var(--pri) ${noiseLevel}%,rgba(123,111,205,.15) ${noiseLevel}%)">
        <div class="noise-ticks"><span>轻柔</span><span>标准</span><span>强力</span></div>
      </div>` : ''}

    <div class="toggle-row ${echoCancel?'on':''}" id="toggle-echo">
      <span class="toggle-icon">🔁</span>
      <div class="toggle-info">
        <div class="toggle-label">回声消除</div>
        <div class="toggle-desc">防止对方声音回传</div>
      </div>
      <div class="switch ${echoCancel?'on':'off'}"><div class="knob"></div></div>
    </div>

    <div class="toggle-row ${autoGain?'on':''}" id="toggle-gain">
      <span class="toggle-icon">📈</span>
      <div class="toggle-info">
        <div class="toggle-label">自动增益</div>
        <div class="toggle-desc">自动调节麦克风音量</div>
      </div>
      <div class="switch ${autoGain?'on':'off'}"><div class="knob"></div></div>
    </div>

    <div class="section-title" style="margin-top:12px">通话质量</div>
    <div class="quality-chips">
      ${[{id:'smooth',label:'流畅优先',sub:'64kbps'},{id:'balanced',label:'均衡',sub:'96kbps'},{id:'hd',label:'HD 高清',sub:'128kbps'}].map(q=>`
        <div class="quality-chip ${quality===q.id?'selected':''}" data-quality="${q.id}">
          <div class="chip-label">${q.label}</div>
          <div class="chip-sub">${q.sub}</div>
        </div>`).join('')}
    </div>

    <button class="leave-btn" id="leave-btn">离开房间</button>`;
}

// ── SUBTITLE TAB ──────────────────────────────────────────────
function buildSubtitle() {
  const cur = state.progress.current || 1351;
  const subs = [
    { time: 1320, text: '我不知道该怎么表达...' },
    { time: 1338, text: '但我的吉他不会说谎' },
    { time: 1351, text: '这就是我想传达的一切' },
    { time: 1368, text: '即使只有你一个人听见' },
    { time: 1385, text: '弦声颤动的那一刻' },
  ];
  return `
    <div style="background:var(--green-light);border-radius:10px;padding:9px 12px;display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--green);margin-bottom:10px">
      📝 字幕同步已开启
    </div>
    ${subs.map(s => {
      const active = Math.abs(s.time - cur) < 15;
      return `<div class="subtitle-item ${active?'current':''}">
        <span class="sub-time">${formatSec(s.time)}</span>
        <span class="sub-text">${escHtml(s.text)}</span>
      </div>`;
    }).join('')}`;
}

// ── BIND EVENTS ───────────────────────────────────────────────
function bindEvents() {
  // Tab switches
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      state.tab = t.dataset.tab;
      render();
      if (state.tab === 'voice') startCallTimer();
    });
  });

  // Chat send
  const chatInput = document.getElementById('chat-input');
  const sendBtn   = document.getElementById('send-btn');
  if (chatInput) {
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  }
  sendBtn?.addEventListener('click', sendChat);

  // Player controls
  document.getElementById('ctrl-play')?.addEventListener('click', () => {
    toParent({ type: 'force_sync' });
  });

  // Emoji reactions
  document.querySelectorAll('.emoji-pill').forEach(el => {
    el.addEventListener('click', () => {
      const emoji = el.dataset.emoji;
      addMessage({ type:'system', text:`你发送了 ${emoji}` });
      toParent({ type: 'chat_send', text: emoji });
    });
  });

  // Voice tab controls
  document.getElementById('mic-btn')?.addEventListener('click', () => {
    state.micOn = !state.micOn;
    toggleMic(state.micOn);
    render();
  });

  document.getElementById('vol-slider')?.addEventListener('input', e => {
    state.volume = Number(e.target.value);
    e.target.style.background = `linear-gradient(90deg,var(--pri) ${state.volume}%,var(--border) ${state.volume}%)`;
    document.querySelector('.range-label span:last-child').textContent = state.volume + '%';
  });

  document.getElementById('noise-slider')?.addEventListener('input', e => {
    state.noiseLevel = Number(e.target.value);
    e.target.style.background = `linear-gradient(90deg,var(--pri) ${state.noiseLevel}%,rgba(123,111,205,.15) ${state.noiseLevel}%)`;
    const lbl = document.querySelector('.noise-level-label span:last-child');
    if (lbl) lbl.textContent = state.noiseLevel < 40 ? '轻柔' : state.noiseLevel < 75 ? '标准' : '强力';
  });

  document.getElementById('toggle-noise')?.addEventListener('click', () => {
    state.noiseReduce = !state.noiseReduce;
    applyAudioConstraints();
    render();
  });
  document.getElementById('toggle-echo')?.addEventListener('click', () => {
    state.echoCancel = !state.echoCancel;
    applyAudioConstraints();
    render();
  });
  document.getElementById('toggle-gain')?.addEventListener('click', () => {
    state.autoGain = !state.autoGain;
    applyAudioConstraints();
    render();
  });

  document.querySelectorAll('.quality-chip').forEach(el => {
    el.addEventListener('click', () => {
      state.quality = el.dataset.quality;
      render();
    });
  });

  document.getElementById('leave-btn')?.addEventListener('click', () => {
    toParent({ type: 'leave_room' });
  });
}

// ── CHAT ──────────────────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input?.value.trim();
  if (!text) return;
  addMessage({ mine: true, text, time: nowTime() });
  toParent({ type: 'chat_send', text });
  input.value = '';
}

function addMessage(msg) {
  state.messages.push(msg);
  // Keep last 100 messages
  if (state.messages.length > 100) state.messages.shift();
  // Re-render just the chat area without full render to preserve input focus
  const tc = document.getElementById('tab-content');
  if (tc && state.tab === 'chat') {
    tc.innerHTML = buildChat();
    tc.scrollTop = tc.scrollHeight;
  }
}

// ── WEBRTC VOICE ──────────────────────────────────────────────
async function startVoiceCall() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: state.noiseReduce,
        echoCancellation: state.echoCancel,
        autoGainControl:  state.autoGain,
      }
    });
    console.log('[同频] Mic access granted');
  } catch (e) {
    console.warn('[同频] Mic access denied:', e.message);
    state.micOn = false;
  }
}

function applyAudioConstraints() {
  if (!state.localStream) return;
  state.localStream.getAudioTracks().forEach(track => {
    track.applyConstraints({
      noiseSuppression: state.noiseReduce,
      echoCancellation: state.echoCancel,
      autoGainControl:  state.autoGain,
    }).catch(() => {});
  });
}

function toggleMic(on) {
  if (!state.localStream) return;
  state.localStream.getAudioTracks().forEach(t => { t.enabled = on; });
}

async function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  state.peers[peerId] = pc;

  // Add local audio track
  if (state.localStream) {
    state.localStream.getTracks().forEach(t => pc.addTrack(t, state.localStream));
  }

  // Play remote audio
  pc.ontrack = (e) => {
    const audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.volume = state.volume / 100;
    audio.play().catch(() => {});
  };

  // ICE candidates → relay via content.js → server
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      toParent({ type: 'rtc_ice', to: peerId, candidate: e.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      delete state.peers[peerId];
    }
  };

  return pc;
}

async function handleRTCSignal(msg) {
  const { from } = msg;
  if (!from) return;

  if (msg.type === 'rtc_offer') {
    const pc = await createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    toParent({ type: 'rtc_answer', to: from, sdp: answer });
  }

  if (msg.type === 'rtc_answer') {
    const pc = state.peers[from];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  }

  if (msg.type === 'rtc_ice') {
    const pc = state.peers[from];
    if (pc && msg.candidate) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
  }
}

// Initiate call to a new member
async function callPeer(peerId) {
  const pc = await createPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  toParent({ type: 'rtc_offer', to: peerId, sdp: offer });
}

// ── MESSAGES FROM CONTENT.JS ──────────────────────────────────
window.addEventListener('message', async (e) => {
  if (!e.data?.__tongpin) return;
  const msg = e.data;

  switch (msg.type) {
    case 'connection_status':
      state.connected = msg.status === 'connected';
      state.roomCode  = msg.roomCode || state.roomCode;
      state.isHost    = msg.isHost   ?? state.isHost;
      render();
      break;

    case 'members_update':
      state.members = msg.members || [];
      if (state.tab === 'members') render();
      break;

    case 'member_join':
      // New peer joined — initiate voice call
      if (state.localStream) callPeer(msg.userId);
      break;

    case 'chat_receive':
      addMessage({
        name: msg.name, text: msg.text, time: msg.time,
        mine: false, avatarIdx: state.members.findIndex(m => m.userId === msg.userId) % 5
      });
      break;

    case 'system_msg':
      addMessage({ type: 'system', text: msg.text });
      break;

    case 'progress_update':
      state.progress = { current: msg.current, duration: msg.duration, paused: msg.paused };
      // Update progress bar without full re-render
      const fill = document.querySelector('.progress-fill');
      if (fill && msg.duration) {
        fill.style.width = Math.min(100, msg.current / msg.duration * 100).toFixed(1) + '%';
      }
      const times = document.querySelectorAll('.progress-times span');
      if (times[0]) times[0].textContent = formatSec(msg.current);
      if (times[2]) times[2].textContent = formatSec(msg.duration);
      break;

    case 'sync_applied':
      // Flash a visual indicator
      break;

    case 'became_host':
      state.isHost = true;
      render();
      break;

    case 'rtc_offer':
    case 'rtc_answer':
    case 'rtc_ice':
      await handleRTCSignal(msg);
      break;
  }
});

// ── CALL TIMER ────────────────────────────────────────────────
let callStart = Date.now();
let callTimerInterval = null;

function startCallTimer() {
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const el = document.getElementById('call-timer');
    if (el) el.textContent = formatSec(Math.floor((Date.now() - callStart) / 1000));
  }, 1000);
}

// ── UTILS ─────────────────────────────────────────────────────
function formatSec(s) {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function toParent(msg) {
  window.parent.postMessage({ ...msg, __tongpin_sidebar: true }, '*');
}

// ── INIT ──────────────────────────────────────────────────────
async function init() {
  render();
  await startVoiceCall();
  // Tell content.js we're ready
  toParent({ type: 'sidebar_ready' });
}

init();
