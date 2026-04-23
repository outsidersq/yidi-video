// content.js — injected into video pages
// Responsibilities:
//   1. Detect video element on page
//   2. Maintain WebSocket connection to sync server
//   3. Hook video events → broadcast to room
//   4. Receive sync messages → apply to video
//   5. Inject / remove sidebar iframe
//   6. Bridge popup ↔ sidebar communication

(() => {
  if (window.__tongpinLoaded) return;
  window.__tongpinLoaded = true;

  // ─── CONFIG ──────────────────────────────────────────────
  const SERVER_URL = 'ws://localhost:8080'; // Change to your deployed server

  // ─── STATE ───────────────────────────────────────────────
  let ws = null;
  let roomCode = null;
  let userId = generateId();
  let userName = '用户';
  let isHost = false;
  let syncing = false;   // guard against sync-echo loops
  let reconnectTimer = null;
  let members = [];      // { userId, name, isHost }

  // ─── HELPERS ─────────────────────────────────────────────
  function generateId() {
    return Math.random().toString(36).slice(2, 10);
  }

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  // Find video element — supports Bilibili, iQIYI, Youku, Tencent, YouTube, generic
  function getVideo() {
    const selectors = [
      '.bilibili-player-video video',
      'bwp-video',
      '.player-container video',
      '.iqiyi-player video',
      '#player video',
      'video'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // ─── WEBSOCKET ───────────────────────────────────────────
  function connectWS(onOpen) {
    if (ws && ws.readyState <= 1) return; // already connected

    ws = new WebSocket(SERVER_URL);

    ws.onopen = () => {
      console.log('[同频] WebSocket connected');
      clearTimeout(reconnectTimer);
      onOpen?.();
    };

    ws.onmessage = (e) => {
      try { handleServerMsg(JSON.parse(e.data)); } catch {}
    };

    ws.onclose = () => {
      console.warn('[同频] WebSocket disconnected, reconnecting in 3s...');
      postToSidebar({ type: 'connection_status', status: 'disconnected' });
      if (roomCode) {
        reconnectTimer = setTimeout(() => connectWS(() => rejoin()), 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('[同频] WebSocket error', err);
    };
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function rejoin() {
    send({ type: isHost ? 'create' : 'join', roomCode, userId, name: userName, isHost });
  }

  // ─── SERVER MESSAGE HANDLER ──────────────────────────────
  function handleServerMsg(msg) {
    switch (msg.type) {

      case 'room_state': {
        // Full member list sent on join
        members = msg.members;
        postToSidebar({ type: 'members_update', members });
        postToSidebar({ type: 'connection_status', status: 'connected', roomCode, isHost });
        break;
      }

      case 'member_join': {
        members = members.filter(m => m.userId !== msg.userId);
        members.push({ userId: msg.userId, name: msg.name, isHost: msg.isHost });
        postToSidebar({ type: 'members_update', members });
        postToSidebar({ type: 'system_msg', text: `${msg.name} 加入了房间` });
        break;
      }

      case 'member_leave': {
        members = members.filter(m => m.userId !== msg.userId);
        postToSidebar({ type: 'members_update', members });
        postToSidebar({ type: 'system_msg', text: `${msg.name} 离开了房间` });
        break;
      }

      case 'sync': {
        if (!isHost) applySync(msg); // only non-hosts receive sync
        break;
      }

      case 'chat': {
        postToSidebar({ type: 'chat_receive', userId: msg.userId, name: msg.name, text: msg.text, time: formatTime() });
        break;
      }

      case 'host_transfer': {
        if (msg.newHostId === userId) {
          isHost = true;
          hookVideo();
          postToSidebar({ type: 'became_host' });
          postToSidebar({ type: 'system_msg', text: '你成为了新主持人' });
        }
        break;
      }

      // WebRTC signaling — forward to sidebar
      case 'rtc_offer':
      case 'rtc_answer':
      case 'rtc_ice': {
        postToSidebar(msg);
        break;
      }
    }
  }

  // ─── VIDEO SYNC ──────────────────────────────────────────
  let videoHooked = false;

  function hookVideo() {
    if (videoHooked) return;
    const video = getVideo();
    if (!video) {
      // Retry after a short delay (video may load later)
      setTimeout(hookVideo, 1000);
      return;
    }
    videoHooked = true;

    video.addEventListener('play', () => {
      if (syncing || !isHost) return;
      send({ type: 'sync', roomCode, action: 'play', time: video.currentTime });
    });

    video.addEventListener('pause', () => {
      if (syncing || !isHost) return;
      send({ type: 'sync', roomCode, action: 'pause', time: video.currentTime });
    });

    video.addEventListener('seeked', () => {
      if (syncing || !isHost) return;
      send({ type: 'sync', roomCode, action: 'seek', time: video.currentTime });
    });

    // Periodically report progress to sidebar
    setInterval(() => {
      if (video && roomCode) {
        postToSidebar({
          type: 'progress_update',
          current: video.currentTime,
          duration: video.duration || 0,
          paused: video.paused
        });
      }
    }, 1000);

    console.log('[同频] Video hooked:', video);
  }

  function applySync(msg) {
    const video = getVideo();
    if (!video) return;
    syncing = true;

    if (msg.action === 'play') {
      video.currentTime = msg.time;
      video.play().catch(() => {});
    } else if (msg.action === 'pause') {
      video.currentTime = msg.time;
      video.pause();
    } else if (msg.action === 'seek') {
      video.currentTime = msg.time;
    }

    postToSidebar({ type: 'sync_applied', action: msg.action });
    setTimeout(() => { syncing = false; }, 600);
  }

  // ─── SIDEBAR IFRAME ──────────────────────────────────────
  function injectSidebar() {
    if (document.getElementById('tongpin-sidebar-iframe')) return;

    const iframe = document.createElement('iframe');
    iframe.id = 'tongpin-sidebar-iframe';
    iframe.src = chrome.runtime.getURL('sidebar.html');
    iframe.setAttribute('allowmicrophone', '');
    iframe.allow = 'microphone';
    iframe.style.cssText = `
      position: fixed;
      right: 0; top: 0;
      width: 340px; height: 100vh;
      border: none;
      z-index: 2147483647;
      box-shadow: -4px 0 32px rgba(0,0,0,0.12);
      transition: transform 0.3s cubic-bezier(.4,0,.2,1);
    `;

    document.body.appendChild(iframe);
    document.documentElement.style.setProperty('margin-right', '340px', 'important');
  }

  function removeSidebar() {
    const el = document.getElementById('tongpin-sidebar-iframe');
    if (el) el.remove();
    document.documentElement.style.removeProperty('margin-right');
  }

  function postToSidebar(msg) {
    const iframe = document.getElementById('tongpin-sidebar-iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ ...msg, __tongpin: true }, '*');
    }
  }

  // ─── MESSAGES FROM SIDEBAR ───────────────────────────────
  window.addEventListener('message', (e) => {
    if (!e.data?.__tongpin_sidebar) return;
    const msg = e.data;

    switch (msg.type) {
      case 'sidebar_ready':
        // Sidebar loaded — send current state
        postToSidebar({
          type: 'connection_status',
          status: ws?.readyState === 1 ? 'connected' : 'connecting',
          roomCode, isHost
        });
        postToSidebar({ type: 'members_update', members });
        break;

      case 'chat_send':
        send({ type: 'chat', roomCode, userId, name: userName, text: msg.text });
        break;

      case 'force_sync': {
        // Host pressed "强制同步"
        const video = getVideo();
        if (video && isHost) {
          send({ type: 'sync', roomCode, action: video.paused ? 'pause' : 'play', time: video.currentTime });
        }
        break;
      }

      case 'leave_room':
        doLeave();
        break;

      // WebRTC signaling relay to server
      case 'rtc_offer':
      case 'rtc_answer':
      case 'rtc_ice':
        send({ ...msg, roomCode, from: userId });
        break;
    }
  });

  // ─── MESSAGES FROM POPUP ─────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.type === 'create_room') {
      roomCode = generateRoomCode();
      isHost = true;
      userName = msg.name || '主持人';

      connectWS(() => {
        send({ type: 'create', roomCode, userId, name: userName, isHost: true });
        injectSidebar();
        hookVideo();
        // Notify background for badge
        chrome.runtime.sendMessage({ type: 'room_joined', roomCode, isHost: true });
        sendResponse({ success: true, roomCode });
      });
      return true; // async
    }

    if (msg.type === 'join_room') {
      roomCode = msg.roomCode.toUpperCase();
      isHost = false;
      userName = msg.name || '观众';

      connectWS(() => {
        send({ type: 'join', roomCode, userId, name: userName, isHost: false });
        injectSidebar();
        hookVideo();
        chrome.runtime.sendMessage({ type: 'room_joined', roomCode, isHost: false });
        sendResponse({ success: true });
      });
      return true;
    }

    if (msg.type === 'get_status') {
      sendResponse({
        inRoom: !!roomCode,
        roomCode,
        isHost,
        connected: ws?.readyState === WebSocket.OPEN
      });
      return true;
    }

    if (msg.type === 'leave_room') {
      doLeave();
      sendResponse({ success: true });
    }
  });

  // ─── LEAVE ───────────────────────────────────────────────
  function doLeave() {
    send({ type: 'leave', roomCode, userId, name: userName });
    ws?.close();
    ws = null;
    roomCode = null;
    isHost = false;
    videoHooked = false;
    members = [];
    removeSidebar();
    chrome.runtime.sendMessage({ type: 'room_left' });
  }

  // ─── UTILS ───────────────────────────────────────────────
  function formatTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

})();
