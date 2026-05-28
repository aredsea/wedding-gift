const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, '..')));

const DATA_DIR = path.join(__dirname, 'rooms');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const EMPTY_DATA = { groom: [], bride: [], groomParent: [], brideParent: [] };

function genCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function roomPath(code) {
  return path.join(DATA_DIR, `${code}.json`);
}

function loadRoom(code) {
  const fp = roomPath(code);
  if (fs.existsSync(fp)) {
    try { return JSON.parse(fs.readFileSync(fp, 'utf8')); }
    catch (e) { return null; }
  }
  return null;
}

function saveRoom(code, data) {
  fs.writeFileSync(roomPath(code), JSON.stringify(data));
}

// REST: create room
app.post('/api/room', (req, res) => {
  let code, attempts = 0;
  do { code = genCode(); attempts++; } while (loadRoom(code) && attempts < 100);
  if (attempts >= 100) return res.status(500).json({ error: 'Failed to generate code' });

  const initial = req.body && req.body.data ? req.body.data : EMPTY_DATA;
  saveRoom(code, initial);
  res.json({ code });
});

// REST: check room exists
app.get('/api/room/:code', (req, res) => {
  const code = req.params.code.replace(/[^0-9]/g, '');
  const data = loadRoom(code);
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.json({ exists: true });
});

// Socket.io
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('join-room', (code, callback) => {
    code = String(code).replace(/[^0-9]/g, '');
    const data = loadRoom(code);
    if (!data) {
      if (typeof callback === 'function') callback({ error: 'not_found' });
      return;
    }
    socket.join(code);
    socket.roomCode = code;

    const count = io.sockets.adapter.rooms.get(code)?.size || 1;
    if (typeof callback === 'function') callback({ ok: true, data, online: count });

    socket.to(code).emit('user-joined', count);
    console.log(`  ${socket.id} → room ${code} (${count} online)`);
  });

  socket.on('data-update', (newData) => {
    if (!socket.roomCode) return;
    saveRoom(socket.roomCode, newData);
    socket.to(socket.roomCode).emit('data-sync', newData);
  });

  socket.on('disconnect', () => {
    if (socket.roomCode) {
      const count = io.sockets.adapter.rooms.get(socket.roomCode)?.size || 0;
      socket.to(socket.roomCode).emit('user-left', count);
    }
    console.log(`[-] ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  💒 Wedding Gift Server`);
  console.log(`  http://localhost:${PORT}\n`);
});
