/** A table: 4 seats, a host, bots, the current game and its timers. */
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  DEFAULT_SETTINGS, Game, PACE_MS, botAction,
  type ClientMessage, type RoomView, type ServerMessage, type Settings,
} from '@mahjong/engine';

const BOT_NAMES = ['Mei', 'Lin', 'Wong', 'Chan', 'Ho', 'Lau', 'Yip', 'Tse'];
const LOBBY_GRACE_MS = 20000;

export interface Client extends WebSocket { room?: Room | null; alive?: boolean; msgCount?: number }

interface SeatSlot {
  token: string | null;
  name: string;
  isBot: boolean;
  ws: Client | null;
  connected: boolean;
  lastEmote?: number;
}

export const newToken = () => randomBytes(12).toString('base64url');

export function cleanName(name: unknown): string {
  // eslint-disable-next-line no-control-regex
  const n = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  return n || 'Joueur';
}

export function cleanSettings(s: Partial<Settings> = {}, base: Settings = DEFAULT_SETTINGS): Settings {
  const out = { ...base };
  if ([0, 1, 3].includes(Number(s.minFan))) out.minFan = Number(s.minFan) as Settings['minFan'];
  if ([1, 2, 4].includes(Number(s.rounds))) out.rounds = Number(s.rounds) as Settings['rounds'];
  if (s.pace && s.pace in PACE_MS) out.pace = s.pace;
  if (typeof s.sevenPairs === 'boolean') out.sevenPairs = s.sevenPairs;
  if (typeof s.hints === 'boolean') out.hints = s.hints;
  if (s.mode === 'hk' || s.mode === 'mcr') out.mode = s.mode;
  return out;
}

export class Room {
  seats: (SeatSlot | null)[] = [null, null, null, null];
  hostToken: string | null = null;
  settings: Settings = { ...DEFAULT_SETTINGS };
  game: Game | null = null;
  lastActive = Date.now();
  private broadcastQueued = false;
  private deadlineTimer: NodeJS.Timeout | null = null;
  private botTimers = new Set<NodeJS.Timeout>();
  private scheduledVersion = -1;

  constructor(public code: string, private opts: { botDelay?: () => number; endDelay?: number } = {}) {}

  private seatOf(ws: Client) { return this.seats.findIndex((p) => p?.ws === ws); }
  private seatByToken(token?: string | null) { return token ? this.seats.findIndex((p) => p && !p.isBot && p.token === token) : -1; }
  humans() { return this.seats.filter((p): p is SeatSlot => !!p && !p.isBot); }

  /** The host, or if absent, the first connected player. */
  hostSeat() {
    const h = this.seatByToken(this.hostToken);
    if (h >= 0 && this.seats[h]!.connected) return h;
    return this.seats.findIndex((p) => p && !p.isBot && p.connected);
  }

  join(ws: Client, name: unknown, token?: string): { error?: string } {
    this.lastActive = Date.now();
    let seat = this.seatByToken(token);
    if (seat >= 0) {
      const p = this.seats[seat]!;
      if (p.ws && p.ws !== ws) { try { p.ws.close(4000, 'replaced'); } catch { /* already closed */ } }
      p.ws = ws;
      p.connected = true;
      if (name) p.name = cleanName(name);
      this.game?.setConnected(seat, true);
    } else {
      if (this.game) return { error: 'La partie a déjà commencé à cette table.' };
      seat = this.seats.findIndex((p) => p === null);
      if (seat < 0) return { error: 'Cette table est complète.' };
      const t = newToken();
      this.seats[seat] = { token: t, name: cleanName(name), isBot: false, ws, connected: true };
      this.hostToken ??= t;
    }
    ws.room = this;
    this.send(ws, { t: 'joined', code: this.code, token: this.seats[seat]!.token! });
    this.changed();
    return {};
  }

  leave(ws: Client, explicit: boolean) {
    const seat = this.seatOf(ws);
    if (seat < 0) return;
    const p = this.seats[seat]!;
    const tok = p.token;
    p.ws = null;
    p.connected = false;
    if (this.game) {
      if (explicit) {
        // Voluntary leave: a bot takes over the seat.
        p.isBot = true;
        p.token = null;
        p.name += ' (bot)';
        this.game.players[seat].isBot = true;
        this.game.players[seat].name = p.name;
      }
      this.game.setConnected(seat, false);
    } else if (explicit) {
      this.seats[seat] = null;
    } else {
      setTimeout(() => {
        if (!this.game && this.seats[seat] === p && !p.connected) {
          this.seats[seat] = null;
          if (tok === this.hostToken) this.passHost();
          this.changed();
        }
      }, LOBBY_GRACE_MS).unref();
    }
    if (explicit && tok === this.hostToken) this.passHost();
    this.lastActive = Date.now();
    this.changed();
  }

  private passHost() {
    this.hostToken = this.humans().find((h) => h.connected && h.token)?.token ?? null;
  }

  handle(ws: Client, msg: ClientMessage) {
    this.lastActive = Date.now();
    const seat = this.seatOf(ws);
    if (seat < 0) return;
    if (msg.t === 'act') {
      if (!this.game) return;
      const r = this.game.act(seat, msg.action);
      if ('error' in r) this.send(ws, { t: 'error', msg: r.error, soft: true });
      this.changed();
      return;
    }
    if (msg.t === 'emote') {
      const e = String(msg.e ?? '').slice(0, 8);
      const p = this.seats[seat]!;
      const now = Date.now();
      if (!e || (p.lastEmote && now - p.lastEmote < 1500)) return;
      p.lastEmote = now;
      for (const q of this.seats) if (q?.ws) this.send(q.ws, { t: 'emote', seat, e });
      return;
    }
    if (msg.t === 'leave') { this.leave(ws, true); ws.room = null; return; }

    if (seat !== this.hostSeat()) { this.send(ws, { t: 'error', msg: "Seul l'hôte peut faire ça.", soft: true }); return; }
    switch (msg.t) {
      case 'settings':
        if (!this.game) this.settings = cleanSettings(msg.settings, this.settings);
        break;
      case 'addBot': {
        if (this.game) return;
        const s = Number.isInteger(msg.seat) && !this.seats[msg.seat!] ? msg.seat! : this.seats.findIndex((p) => !p);
        if (s < 0) return;
        const used = new Set(this.seats.filter(Boolean).map((p) => p!.name));
        this.seats[s] = { token: null, name: BOT_NAMES.find((n) => !used.has(n)) ?? 'Bot', isBot: true, ws: null, connected: true };
        break;
      }
      case 'kick': {
        if (this.game || !this.seats[msg.seat] || msg.seat === this.hostSeat()) return;
        const p = this.seats[msg.seat]!;
        if (p.ws) { this.send(p.ws, { t: 'kicked' }); p.ws.room = null; }
        this.seats[msg.seat] = null;
        break;
      }
      case 'start':
        if (this.game) return;
        if (this.seats.some((p) => !p)) { this.send(ws, { t: 'error', msg: 'Il faut 4 joueurs. Ajoutez des bots.' }); return; }
        this.startGame();
        break;
      case 'rematch':
        if (this.game?.phase === 'over') this.startGame();
        break;
      default:
        return;
    }
    this.changed();
  }

  private startGame() {
    // Seats are drawn at random, like drawing winds.
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.seats[i], this.seats[j]] = [this.seats[j], this.seats[i]];
    }
    this.game = new Game(this.seats.map((p) => ({ name: p!.name, isBot: p!.isBot, connected: p!.connected })), this.settings);
  }

  /* -------------------------------------------------------------- */
  /* Timers: phase deadline and automatic decisions                  */
  /* -------------------------------------------------------------- */

  private schedule() {
    const g = this.game;
    if (!g || g.version === this.scheduledVersion) return;
    this.scheduledVersion = g.version;
    const v = g.version;
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    for (const t of this.botTimers) clearTimeout(t);
    this.botTimers.clear();
    if (g.phase === 'over') return;

    const fire = (fn: () => void) => () => {
      if (this.game !== g || g.version !== v) return;
      fn();
      this.changed();
    };
    this.deadlineTimer = setTimeout(fire(() => g.timeout(v)), Math.max(0, g.deadlineAt - Date.now()));

    for (const s of g.autoActors()) {
      const delay = g.players[s].isBot ? (this.opts.botDelay?.() ?? 700 + Math.random() * 700) : 1000;
      const t = setTimeout(fire(() => {
        if (g.autoActors().includes(s)) g.act(s, botAction(g, s));
      }), delay);
      this.botTimers.add(t);
    }
    // No human to wait for at the end of the hand: move on.
    if (g.phase === 'end' && g.ready.every(Boolean)) {
      this.botTimers.add(setTimeout(fire(() => g.nextHand()), this.opts.endDelay ?? 3000));
    }
  }

  /* -------------------------------------------------------------- */
  /* Broadcast                                                       */
  /* -------------------------------------------------------------- */

  summary(seat: number): RoomView {
    const host = this.hostSeat();
    return {
      code: this.code,
      settings: this.settings,
      started: !!this.game,
      seat,
      youAreHost: seat >= 0 && seat === host,
      seats: this.seats.map((p, i) => p && { name: p.name, isBot: p.isBot, connected: p.connected, isHost: i === host }),
    };
  }

  /** After any change: reschedule timers and notify everyone (batched). */
  changed() {
    this.schedule();
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    setImmediate(() => {
      this.broadcastQueued = false;
      this.schedule();
      this.seats.forEach((p, s) => {
        if (p?.ws) this.send(p.ws, { t: 'state', room: this.summary(s), view: this.game ? this.game.view(s) : null });
      });
    });
  }

  send(ws: Client, msg: ServerMessage) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  destroy() {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    for (const t of this.botTimers) clearTimeout(t);
  }
}
