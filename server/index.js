const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');

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

// Store code+language per room
const roomState = {};

io.on('connection', (socket) => {
  console.log('🔌 A user connected:', socket.id);

  // Join a room
  socket.on('join', (roomId) => {
    socket.join(roomId);
    console.log(`📥 ${socket.id} joined room: ${roomId}`);

    if (roomState[roomId]) {
      socket.emit('code-change', roomState[roomId]);
    }
  });

  socket.on('code-change', ({ roomId, code, language }) => {
    roomState[roomId] = { code, language };
    socket.to(roomId).emit('code-change', { code, language });
  });

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    rooms.forEach(roomId => {
      const room = io.sockets.adapter.rooms.get(roomId);
      if (!room || room.size <= 1) {
        delete roomState[roomId];
        console.log(`🧹 Room ${roomId} cleaned up`);
      }
      console.log(`👋 ${socket.id} is leaving room: ${roomId}`);
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ A user disconnected:', socket.id);
  });

  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    console.log(`👋 ${socket.id} left room: ${roomId}`);
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