// server.js — 同频 WebSocket 信令 + 同步服务器
// 运行: node server.js
// 默认端口: 8080  (环境变量 PORT 可覆盖)

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss  = new WebSocketServer({ port: PORT });

// rooms: Map<roomCode, Map<userId, { ws, name, isHost }>>
const rooms = new Map();

wss.on('listening', () => {
  console.log(`[同频] Server running on ws://localhost:${PORT}`);
});

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[同频] New connection from ${ip}`);

  let roomCode = null;
  let userId   = null;
  let userName = '用户';
  let isHost   = false;

  // ── Handle incoming messages ──────────────────────────────
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    switch (msg.type) {

      // ── Create or Join room ───────────────────────────────
      case 'create':
      case 'join': {
        roomCode = String(msg.roomCode || '').toUpperCase().slice(0, 8);
        userId   = String(msg.userId || generateId());
        userName = String(msg.name   || '用户').slice(0, 20);
        isHost   = msg.isHost === true || msg.type === 'create';

        if (!roomCode) { ws.send(err('invalid room code')); return; }

        // Create room if not exists
        if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());

        const room = rooms.get(roomCode);

        // Kick old connection if same userId reconnects
        const existing = room.get(userId);
        if (existing && existing.ws !== ws) {
          existing.ws.close(1000, 'reconnected');
        }

        room.set(userId, { ws, name: userName, isHost });

        // Send full member list to the joining client
        ws.send(JSON.stringify({
          type: 'room_state',
          roomCode,
          members: [...room.entries()]
            .filter(([id]) => id !== userId)
            .map(([id, m]) => ({ userId: id, name: m.name, isHost: m.isHost }))
        }));

        // Notify others in room
        broadcast(roomCode, {
          type: 'member_join',
          userId, name: userName, isHost
        }, userId);

        console.log(`[同频] ${userName} ${msg.type === 'create' ? 'created' : 'joined'} room ${roomCode} (${room.size} members)`);
        break;
      }

      // ── Video sync (play / pause / seek) ──────────────────
      case 'sync': {
        if (!authorized(roomCode, userId, isHost, msg)) return;
        broadcast(roomCode, {
          type:   'sync',
          action: msg.action, // 'play' | 'pause' | 'seek'
          time:   Number(msg.time) || 0,
          userId,
        }, userId);
        break;
      }

      // ── Chat message ──────────────────────────────────────
      case 'chat': {
        if (!roomCode) return;
        const text = String(msg.text || '').slice(0, 500);
        if (!text) return;
        broadcast(roomCode, {
          type: 'chat',
          userId, name: userName, text,
          time: new Date().toISOString(),
        }, userId);
        break;
      }

      // ── Host transfer ─────────────────────────────────────
      case 'transfer_host': {
        if (!isHost) return; // only current host can transfer
        const room = rooms.get(roomCode);
        if (!room || !msg.newHostId) return;
        const target = room.get(msg.newHostId);
        if (!target) return;

        // Update host flags
        room.get(userId).isHost = false;
        target.isHost = true;
        isHost = false;

        broadcastAll(roomCode, {
          type: 'host_transfer',
          prevHostId: userId,
          newHostId:  msg.newHostId,
        });
        break;
      }

      // ── Leave room ────────────────────────────────────────
      case 'leave': {
        handleLeave();
        break;
      }

      // ── WebRTC signaling (offer / answer / ice) ───────────
      // These are routed to a specific peer (point-to-point)
      case 'rtc_offer':
      case 'rtc_answer':
      case 'rtc_ice': {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || !msg.to) return;
        const target = room.get(msg.to);
        if (target && target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({
            ...msg,
            from: userId,
          }));
        }
        break;
      }

      // ── Ping / keepalive ──────────────────────────────────
      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }
    }
  });

  // ── Disconnection ─────────────────────────────────────────
  ws.on('close', () => {
    handleLeave();
    console.log(`[同频] ${userName || 'Unknown'} disconnected`);
  });

  ws.on('error', (e) => console.error('[同频] WS error:', e.message));

  // ── Helpers (scoped to connection) ────────────────────────
  function handleLeave() {
    if (!roomCode || !userId) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    room.delete(userId);

    if (room.size === 0) {
      // Last person left — clean up
      rooms.delete(roomCode);
      console.log(`[同频] Room ${roomCode} closed (empty)`);
    } else {
      broadcast(roomCode, { type: 'member_leave', userId, name: userName }, userId);

      // If host left, auto-assign host to oldest member
      if (isHost) {
        const [newHostId, newHost] = [...room.entries()][0];
        newHost.isHost = true;
        broadcastAll(roomCode, {
          type:       'host_transfer',
          prevHostId: userId,
          newHostId,
          auto:       true,
        });
        console.log(`[同频] Host transferred to ${newHost.name} in room ${roomCode}`);
      }
    }

    roomCode = null;
    userId   = null;
    isHost   = false;
  }
});

// ── Broadcast helpers ──────────────────────────────────────────
function broadcast(roomCode, msg, excludeId) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const data = JSON.stringify(msg);
  room.forEach((client, id) => {
    if (id !== excludeId && client.ws.readyState === 1) {
      client.ws.send(data);
    }
  });
}

function broadcastAll(roomCode, msg) {
  broadcast(roomCode, msg, null);
}

// ── Auth check ─────────────────────────────────────────────────
function authorized(roomCode, userId, isHost, msg) {
  if (!roomCode || !userId) return false;
  // For sync events, only host can trigger (unless free mode — server trusts client flag for now)
  return true;
}

// ── Utils ──────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function err(msg) {
  return JSON.stringify({ type: 'error', message: msg });
}

// ── Stats endpoint (optional HTTP) ────────────────────────────
// Uncomment to add a /stats page alongside the WS server:
//
// const http = require('http');
// const httpServer = http.createServer((req, res) => {
//   if (req.url === '/stats') {
//     const stats = {};
//     rooms.forEach((members, code) => { stats[code] = members.size; });
//     res.writeHead(200, { 'Content-Type': 'application/json' });
//     res.end(JSON.stringify({ rooms: stats, totalRooms: rooms.size }));
//   } else {
//     res.writeHead(404); res.end();
//   }
// });
// const wss = new WebSocketServer({ server: httpServer });
// httpServer.listen(PORT);
