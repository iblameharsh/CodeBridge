const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const OT = require('../client/src/ot');

const app = express();
const server = http.createServer(app);

const CLIENT_BUILD_DIR = path.join(__dirname, '..', 'client', 'build');

// CORS — reflects the request origin so the dev client (localhost:3000),
// a hosted client, or the same-origin production client all work.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST']
}));

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const HISTORY_LIMIT = 200;
// roomId -> { code, language, rev, history: [{rev, clientId, ops}], clients: Set<socketId> }
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      code: '',
      language: 'javascript',
      rev: 0,
      history: [],
      clients: new Set()
    });
  }
  return rooms.get(roomId);
}

function getClientId(socket) {
  return (socket.handshake.query && socket.handshake.query.clientId) || socket.id;
}

function cleanupRoom(roomId, socket) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.clients.delete(socket.id);
  console.log(`👋 ${socket.id} left room ${roomId}`);
  if (room.clients.size === 0) {
    rooms.delete(roomId);
    console.log(`🧹 Room ${roomId} cleaned up`);
  }
}

io.on('connection', (socket) => {
  const socketClientId = getClientId(socket);
  console.log('🔌 A user connected:', socket.id, 'client:', socketClientId);

  socket.on('join', (payload) => {
    const roomId = payload.roomId;
    const room = getRoom(roomId);
    socket.join(roomId);
    room.clients.add(socket.id);
    console.log(`📥 ${socket.id} joined room: ${roomId}`);
    socket.emit('snapshot', { rev: room.rev, code: room.code, language: room.language });
  });

  socket.on('request-snapshot', (payload) => {
    const room = getRoom(payload.roomId);
    socket.emit('snapshot', { rev: room.rev, code: room.code, language: room.language });
  });

  socket.on('edit', (payload) => {
    const roomId = payload.roomId;
    const room = getRoom(roomId);
    const { opId, baseRev, ops } = payload;
    const clientId = (ops && ops.clientId) || payload.clientId || socketClientId;

    const oldestRev = room.history.length ? room.history[0].rev : 0;
    // baseRev + 1 < oldestRev means the client is behind by more than one op
    // (gaps in history make exact transformation impossible); baseRev > room.rev
    // means the client is ahead of us. Both require a resync.
    if (baseRev + 1 < oldestRev || baseRev > room.rev) {
      socket.emit('resync', {
        reason: 'baseRev-out-of-range',
        baseRev,
        minRev: oldestRev,
        curRev: room.rev
      });
      return;
    }

    // Transform the incoming op against every history op the client has not
    // seen (rev > baseRev). The single-outstanding-op client never sends with
    // a baseRev that still includes its own unacked op, so no clientId filter
    // is needed (matches ot.js).
    let transformed = ops;
    for (const entry of room.history) {
      if (entry.rev > baseRev) {
        transformed = OT.opTransform(transformed, entry.ops)[0];
      }
    }

    room.code = OT.applyOps(room.code, transformed);
    room.rev += 1;
    room.history.push({ rev: room.rev, clientId, ops: transformed });
    if (room.history.length > HISTORY_LIMIT) {
      room.history.splice(0, room.history.length - HISTORY_LIMIT);
    }

    socket.to(roomId).emit('op', { rev: room.rev, ops: transformed, clientId });
    socket.emit('ack', { opId, rev: room.rev, ops: transformed });
  });

  socket.on('language-change', (payload) => {
    const room = getRoom(payload.roomId);
    room.language = payload.language;
    socket.to(payload.roomId).emit('language-change', { language: payload.language });
  });

  socket.on('disconnecting', () => {
    const roomsJoined = Array.from(socket.rooms).filter((r) => r !== socket.id);
    roomsJoined.forEach((roomId) => cleanupRoom(roomId, socket));
  });

  socket.on('disconnect', () => {
    console.log('❌ A user disconnected:', socket.id);
  });

  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    cleanupRoom(roomId, socket);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'CodeBridge server' });
});

// Serve the built client so a single server hosts the whole app
app.use(express.static(CLIENT_BUILD_DIR));

// SPA fallback: let client-side routes (/home, /session/:id, ...) load index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/socket.io')) {
    const indexFile = path.join(CLIENT_BUILD_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
      return res.sendFile(indexFile);
    }
    return res.status(200).send('CodeBridge API server is running. Build the client with `npm run build`.');
  }
  next();
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 CodeBridge server listening on http://localhost:${PORT}`);
});