/** Server: the app's files (client dist folder) + WebSocket on /ws. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { ClientMessage } from '@mahjong/engine';
import { Room, cleanSettings, type Client } from './room.ts';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC = normalize(fileURLToPath(new URL('../../client/dist', import.meta.url)));
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map<string, Room>();

function createRoom(): Room {
  let code: string;
  do code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  while (rooms.has(code));
  const room = new Room(code);
  rooms.set(code, room);
  return room;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  let file = normalize(join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(PUBLIC, 'index.html');
  } catch { file = join(PUBLIC, 'index.html'); }
  try {
    const data = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>Mahjong</title><body style="font-family:system-ui;padding:40px;line-height:1.5">'
      + '<h1>Le jeu est sur un autre port</h1>'
      + '<p>En développement (<code>npm run dev</code>), ouvrez <a href="http://localhost:5173">http://localhost:5173</a>.</p>'
      + '<p>Pour jouer depuis ce port, construisez d’abord l’application : <code>npm run build</code>, puis <code>npm start</code>.</p></body>');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws: Client) => {
  ws.alive = true;
  ws.msgCount = 0;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw) => {
    if ((ws.msgCount = (ws.msgCount ?? 0) + 1) > 40) return;
    let msg: ClientMessage;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const reply = (m: object) => ws.readyState === 1 && ws.send(JSON.stringify(m));

    if (msg.t === 'create') {
      ws.room?.leave(ws, true);
      const room = createRoom();
      room.settings = cleanSettings(msg.settings);
      room.join(ws, msg.name);
      return;
    }
    if (msg.t === 'join') {
      const room = rooms.get(String(msg.code ?? '').toUpperCase());
      if (!room) { reply({ t: 'error', msg: 'Table introuvable. Vérifiez le code.', fatal: true }); return; }
      if (ws.room && ws.room !== room) ws.room.leave(ws, true);
      const r = room.join(ws, msg.name, msg.token);
      if (r.error) reply({ t: 'error', msg: r.error, fatal: true });
      return;
    }
    ws.room?.handle(ws, msg);
  });
  ws.on('close', () => ws.room?.leave(ws, false));
});

// Rate limit (40 messages/s) and dead connection detection.
setInterval(() => { for (const ws of wss.clients as Set<Client>) ws.msgCount = 0; }, 1000).unref();
setInterval(() => {
  for (const ws of wss.clients as Set<Client>) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch { /* closed */ }
  }
}, 20000).unref();

// Cleanup: tables with no connected player for 30 min (5 min if the game has not started).
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.humans().some((h) => h.connected)) continue;
    const idle = now - room.lastActive;
    if (idle > 30 * 60000 || (!room.game && idle > 5 * 60000)) { room.destroy(); rooms.delete(code); }
  }
}, 60000).unref();

server.listen(PORT, () => console.log(`Mahjong prêt sur http://localhost:${PORT}`));
