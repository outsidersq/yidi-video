// popup.js — Extension popup logic (vanilla JS, no bundler needed)

const AVATAR_COLORS = ['#7B6FCD','#FF6B9D','#4CAF88','#4A90D9','#E07B30'];
const AVATAR_EMOJIS = ['🐱','🐰','🦊','🐻','🐼'];

// ── STATE ────────────────────────────────────────────────────
let screen = 'loading'; // loading | home | create | invite | join | session
let selectedMode = 'host';
let createdCode = '';
let joinCodeInput = '';
let nameInput = '';
let sessionData = null; // { roomCode, isHost }
let copied = false;

// ── RENDER ───────────────────────────────────────────────────
function render() {
  const root = document.getElementById('root');
  root.innerHTML = buildScreen(screen);
  bindEvents();
}

function buildHeader(subtitle, showBack = false, showLive = false) {
  return `
    <div class="header">
      ${showBack ? `<button class="back-btn" id="btn-back">← 返回</button>` : `
        <div class="logo">同</div>
        <div>
          <div class="header-title">同频</div>
          <div class="header-sub">${subtitle}</div>
        </div>
      `}
      ${showLive
        ? `<div class="badge badge-live" style="margin-left:auto"><div class="live-dot"></div>观影中</div>`
        : !showBack ? `<div class="badge badge-default">v1.0</div>` : ''
      }
    </div>`;
}

function buildScreen(s) {
  switch (s) {
    case 'loading': return buildLoading();
    case 'home':    return buildHome();
    case 'create':  return buildCreate();
    case 'invite':  return buildInvite();
    case 'join':    return buildJoin();
    case 'session': return buildSession();
    default:        return buildHome();
  }
}

function buildLoading() {
  return `
    ${buildHeader('一起看，同一刻')}
    <div class="body" style="align-items:center;justify-content:center;min-height:200px">
      <div class="spin" style="font-size:28px">⟳</div>
    </div>`;
}

function buildHome() {
  const platform = detectPlatform();
  return `
    ${buildHeader('一起看，同一刻')}
    <div class="body fade-in">
      <div class="card">
        <div class="card-title">当前页面</div>
        <div class="detect-card">
          <div class="detect-icon">${platform.icon}</div>
          <div>
            <div class="detect-title">${platform.name}</div>
            <div class="detect-sub">${platform.desc}</div>
          </div>
          <span class="platform-chip" style="margin-left:auto">${platform.tag}</span>
        </div>
      </div>
      <div class="divider">开始观影</div>
      <button class="btn btn-primary" id="btn-create">✨ 创建观影房间</button>
      <button class="btn btn-outline" id="btn-goto-join">🔗 加入已有房间</button>
      <div class="footer-links">
        <button class="footer-link">设置</button>
        <button class="footer-link">帮助</button>
      </div>
    </div>`;
}

function buildCreate() {
  return `
    ${buildHeader('', true)}
    <div class="body fade-in">
      <div class="input-group">
        <div class="input-label">你的昵称</div>
        <input class="input-field" id="input-name" placeholder="起个好听的名字..." value="${nameInput}">
      </div>
      <div class="card">
        <div class="card-title">同步模式</div>
        <div id="mode-host" class="mode-option ${selectedMode==='host'?'selected':''}">
          <span class="mode-icon">👑</span>
          <div>
            <div class="mode-label">主持人模式</div>
            <div class="mode-desc">只有你能控制播放进度</div>
          </div>
          ${selectedMode==='host'?'<span class="mode-check">✓</span>':''}
        </div>
        <div id="mode-free" class="mode-option ${selectedMode==='free'?'selected':''}">
          <span class="mode-icon">🤝</span>
          <div>
            <div class="mode-label">自由模式</div>
            <div class="mode-desc">所有人都能控制进度</div>
          </div>
          ${selectedMode==='free'?'<span class="mode-check">✓</span>':''}
        </div>
      </div>
      <button class="btn btn-primary" id="btn-do-create">生成邀请码 →</button>
    </div>`;
}

function buildInvite() {
  return `
    ${buildHeader('', true)}
    <div class="body fade-in">
      <div class="invite-card">
        <div style="font-size:12px;font-weight:700;color:var(--muted)">房间码</div>
        <div class="invite-code">${createdCode}</div>
        <div class="invite-hint">发给朋友，最多 5 人可加入</div>
      </div>
      <div class="card">
        <div class="card-title">或者分享链接</div>
        <div class="copy-row">
          <div class="copy-link">tongpin.app/room/${createdCode}</div>
          <button class="copy-btn" id="btn-copy">${copied ? '✓ 已复制' : '复制'}</button>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-start-watching">开始观影 →</button>
      <div class="hint">好友加入后会自动同步到你的进度</div>
    </div>`;
}

function buildJoin() {
  return `
    ${buildHeader('', true)}
    <div class="body fade-in">
      <div style="text-align:center;font-size:38px;margin-top:4px">🎉</div>
      <div class="input-group">
        <div class="input-label">你的昵称</div>
        <input class="input-field" id="input-name" placeholder="起个好听的名字..." value="${nameInput}">
      </div>
      <div class="input-group">
        <div class="input-label">房间码</div>
        <input class="input-field input-code" id="input-code" placeholder="ABC123" maxlength="6" value="${joinCodeInput}">
      </div>
      <button class="btn btn-primary" id="btn-do-join">加入观影 →</button>
      <div class="hint">加入后视频将自动同步到房间进度</div>
    </div>`;
}

function buildSession() {
  if (!sessionData) return buildHome();
  const { roomCode, isHost, members = [], progress = {} } = sessionData;
  const pct = progress.duration ? Math.round(progress.current / progress.duration * 100) : 38;
  const curTime = formatSec(progress.current || 1351);
  const durTime = formatSec(progress.duration || 3560);

  return `
    ${buildHeader('', false, true)}
    <div class="body fade-in">
      <div class="sync-bar">
        🔄 已同步 · 房间 ${roomCode}
        <span style="margin-left:auto;font-size:11px">${curTime}</span>
      </div>
      <div class="card">
        <div class="card-title">播放进度</div>
        <div class="progress-track" style="margin-top:6px">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="progress-times">
          <span>${curTime}</span>
          <span style="color:var(--pri);font-weight:700">${isHost ? '👑 你在控制' : '👑 主持人控制'}</span>
          <span>${durTime}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-title">成员 (${(members.length || 3)}/5)</div>
        ${buildMockMembers()}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline" id="btn-open-sidebar" style="flex:1;font-size:13px">💬 打开聊天</button>
        <button class="btn btn-danger btn-sm" id="btn-leave" style="flex:1;font-size:13px">离开</button>
      </div>
    </div>`;
}

function buildMockMembers() {
  const list = [
    { name: '你', isHost: false, speaking: true, idx: 0 },
    { name: '晨晨', isHost: true, speaking: false, idx: 1 },
    { name: '阿阳', isHost: false, speaking: true, idx: 2 },
  ];
  return list.map(m => `
    <div class="member-row">
      <div class="avatar" style="background:${AVATAR_COLORS[m.idx]}">${AVATAR_EMOJIS[m.idx]}</div>
      <span class="member-name">${m.name}</span>
      ${m.speaking ? `<div class="wave">${[14,8,18,6,12].map((h,j)=>`<div class="wave-bar" style="--h:${h}px;--d:${.35+j*.08}s"></div>`).join('')}</div>` : ''}
      ${m.isHost ? `<span class="tag tag-host">主持</span>` : ''}
    </div>`).join('');
}

// ── EVENTS ───────────────────────────────────────────────────
function bindEvents() {
  q('#btn-back')?.addEventListener('click', () => {
    if (screen === 'invite') { screen = 'create'; render(); }
    else { screen = 'home'; render(); }
  });

  q('#btn-create')?.addEventListener('click', () => { screen = 'create'; render(); });
  q('#btn-goto-join')?.addEventListener('click', () => { screen = 'join'; render(); });

  q('#mode-host')?.addEventListener('click', () => { selectedMode = 'host'; render(); });
  q('#mode-free')?.addEventListener('click', () => { selectedMode = 'free'; render(); });

  q('#input-name')?.addEventListener('input', e => { nameInput = e.target.value; });
  q('#input-code')?.addEventListener('input', e => {
    joinCodeInput = e.target.value.toUpperCase();
    e.target.value = joinCodeInput;
  });

  q('#btn-do-create')?.addEventListener('click', doCreate);
  q('#btn-copy')?.addEventListener('click', doCopy);
  q('#btn-start-watching')?.addEventListener('click', doStartWatching);
  q('#btn-do-join')?.addEventListener('click', doJoin);
  q('#btn-leave')?.addEventListener('click', doLeave);
  q('#btn-open-sidebar')?.addEventListener('click', openSidebar);
}

async function doCreate() {
  const name = q('#input-name')?.value.trim() || '主持人';
  nameInput = name;
  const btn = q('#btn-do-create');
  btn.textContent = '⟳ 创建中...';
  btn.disabled = true;

  try {
    const tab = await getActiveTab();
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'create_room', name, mode: selectedMode });
    createdCode = resp.roomCode;
    screen = 'invite';
    render();
  } catch (e) {
    // Content script not yet loaded on this tab — show code anyway for demo
    createdCode = randomCode();
    screen = 'invite';
    render();
  }
}

async function doCopy() {
  const link = `tongpin.app/room/${createdCode}`;
  try { await navigator.clipboard.writeText(link); } catch {}
  copied = true;
  render();
  setTimeout(() => { copied = false; render(); }, 2000);
}

async function doStartWatching() {
  sessionData = { roomCode: createdCode, isHost: true, members: [] };
  screen = 'session';
  render();
}

async function doJoin() {
  const code = q('#input-code')?.value.trim().toUpperCase();
  const name = q('#input-name')?.value.trim() || '观众';
  if (!code || code.length < 4) {
    q('#input-code').style.borderColor = 'var(--red)';
    return;
  }
  nameInput = name;
  const btn = q('#btn-do-join');
  btn.textContent = '⟳ 连接中...';
  btn.disabled = true;

  try {
    const tab = await getActiveTab();
    await chrome.tabs.sendMessage(tab.id, { type: 'join_room', roomCode: code, name });
    sessionData = { roomCode: code, isHost: false, members: [] };
    screen = 'session';
    render();
  } catch {
    sessionData = { roomCode: code, isHost: false, members: [] };
    screen = 'session';
    render();
  }
}

async function doLeave() {
  try {
    const tab = await getActiveTab();
    await chrome.tabs.sendMessage(tab.id, { type: 'leave_room' });
  } catch {}
  sessionData = null;
  screen = 'home';
  render();
}

async function openSidebar() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.tabs.sendMessage(tab.id, { type: 'show_sidebar' }).catch(() => {});
  window.close();
}

// ── UTILS ────────────────────────────────────────────────────
function q(sel) { return document.querySelector(sel); }

function formatSec(s) {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60), ss = s % 60;
  return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function randomCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => c[Math.floor(Math.random()*c.length)]).join('');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function detectPlatform() {
  // In popup context window.location is the extension URL; check tab URL via storage
  const url = document.referrer || '';
  if (url.includes('bilibili')) return { icon:'🎬', name:'你在看 B 站', desc:'视频同步已就绪', tag:'B站' };
  if (url.includes('iqiyi'))    return { icon:'🎬', name:'你在看 爱奇艺', desc:'视频同步已就绪', tag:'爱奇艺' };
  if (url.includes('youtube'))  return { icon:'▶️', name:'你在看 YouTube', desc:'视频同步已就绪', tag:'YouTube' };
  return { icon:'📺', name:'视频页面已就绪', desc:'支持所有 HTML5 视频', tag:'通用' };
}

// ── INIT ─────────────────────────────────────────────────────
async function init() {
  screen = 'loading';
  render();

  try {
    const tab = await getActiveTab();
    const status = await chrome.tabs.sendMessage(tab.id, { type: 'get_status' });
    if (status?.inRoom) {
      sessionData = { roomCode: status.roomCode, isHost: status.isHost, members: [] };
      screen = 'session';
    } else {
      screen = 'home';
    }
  } catch {
    screen = 'home';
  }
  render();
}

init();
