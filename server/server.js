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

const EMPTY_DATA = { groom: [], bride: [], groomParent: [], brideParent: [], groomUnknown: [], brideUnknown: [] };
const TABS = ['groom', 'bride', 'groomParent', 'brideParent', 'groomUnknown', 'brideUnknown'];
const ADMIN_PASSWORD = 'aredsea';

function countRecords(data) {
  if (!data) return 0;
  return TABS.reduce((s, k) => s + (Array.isArray(data[k]) ? data[k].length : 0), 0);
}

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

// REST: tunnel URL (for auto-discovery)
app.get('/api/tunnel-url', (req, res) => {
  const urlFile = path.join(__dirname, 'tunnel-url.txt');
  try {
    const url = fs.readFileSync(urlFile, 'utf8').trim();
    res.json({ url });
  } catch (e) {
    res.json({ url: null });
  }
});

// REST: admin — list rooms with at least one record
app.post('/api/admin/rooms', (req, res) => {
  if (!req.body || req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  let files = [];
  try { files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')); }
  catch (e) { return res.json({ rooms: [] }); }

  const rooms = [];
  for (const f of files) {
    const code = f.replace(/\.json$/, '');
    const data = loadRoom(code);
    const count = countRecords(data);
    if (count < 1) continue;
    let total = 0;
    for (const k of TABS) {
      (data[k] || []).forEach(g => { total += (g.cash || 0) + (g.transfer || 0); });
    }
    let mtime = 0;
    try { mtime = fs.statSync(roomPath(code)).mtimeMs; } catch (e) {}
    rooms.push({ code, count, total, mtime });
  }
  rooms.sort((a, b) => b.mtime - a.mtime);
  res.json({ rooms });
});

// REST: admin — delete a room
app.post('/api/admin/room/:code/delete', (req, res) => {
  if (!req.body || req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const code = req.params.code.replace(/[^0-9]/g, '');
  const fp = roomPath(code);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    io.to(code).emit('room-deleted');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'delete_failed' });
  }
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
