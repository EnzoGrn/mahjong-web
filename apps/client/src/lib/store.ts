/** Server connection and shared app state. */
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Action, type ClientMessage, type Mode, type PlayerView, type RoomView, type ServerMessage, type Settings } from '@mahjong/engine';

export interface AppState {
  connected: boolean;
  everConnected: boolean;
  room: RoomView | null;
  view: PlayerView | null;
  /** Time (performance.now) of the current phase's deadline. */
  deadline: number;
  code: string | null;
  name: string;
  settings: Settings;
  toast: { msg: string; id: number } | null;
  emotes: { seat: number; e: string; id: number }[];
}

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

const sessions: Record<string, string> = read('mj2.sessions', {});
const params = new URLSearchParams(location.search);
export const urlCode = (params.get('table') ?? params.get('room') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

let state: AppState = {
  connected: false,
  everConnected: false,
  room: null,
  view: null,
  deadline: 0,
  code: urlCode && sessions[urlCode] ? urlCode : null,
  name: read('mj2.name', ''),
  settings: { ...DEFAULT_SETTINGS, ...read('mj2.settings', {}) },
  toast: null,
  emotes: [],
};
const listeners = new Set<() => void>();
const set = (patch: Partial<AppState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

export const useApp = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
export const getState = () => state;

/** Game event listeners (sounds, animations). */
type ViewListener = (prev: PlayerView | null, next: PlayerView) => void;
const viewListeners = new Set<ViewListener>();
export const onView = (l: ViewListener) => { viewListeners.add(l); return () => { viewListeners.delete(l); }; };

let ws: WebSocket | null = null;
let retry = 0;
let queue: ClientMessage[] = [];
let toastId = 0;

export function toast(msg: string) { set({ toast: { msg, id: ++toastId } }); }

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}/ws`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    set({ connected: true, everConnected: true });
    if (state.code) send({ t: 'join', code: state.code, token: sessions[state.code], name: state.name });
    const q = queue; queue = [];
    q.forEach(send);
  };
  sock.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  sock.onclose = () => {
    if (ws !== sock) return;
    set({ connected: false });
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ws && ws.readyState > 1) connect();
});

export function send(m: ClientMessage) {
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
  else queue.push(m);
}
export const act = (action: Action) => send({ t: 'act', action });

function handle(m: ServerMessage) {
  switch (m.t) {
    case 'joined':
      sessions[m.code] = m.token;
      write('mj2.sessions', sessions);
      history.replaceState(null, '', `?table=${m.code}`);
      set({ code: m.code });
      break;
    case 'state': {
      const prev = state.view;
      set({ room: m.room, view: m.view, deadline: m.view ? performance.now() + m.view.remainingMs : 0 });
      // Practice game: as soon as the table exists, fill it with bots and start.
      if (practicePending && m.room && m.room.youAreHost && !m.room.started) {
        practicePending = false;
        m.room.seats.forEach((p, seat) => { if (!p) send({ t: 'addBot', seat }); });
        send({ t: 'start' });
      }
      if (m.view) viewListeners.forEach((l) => l(prev, m.view!));
      break;
    }
    case 'error':
      toast(m.msg);
      if (m.fatal) leaveTable(false);
      break;
    case 'emote': {
      const id = ++toastId;
      set({ emotes: [...state.emotes, { seat: m.seat, e: m.e, id }] });
      setTimeout(() => set({ emotes: state.emotes.filter((x) => x.id !== id) }), 2600);
      break;
    }
    case 'kicked':
      toast("L'hôte vous a retiré de la table.");
      leaveTable(false);
      break;
  }
}

export function setName(name: string) { write('mj2.name', name); set({ name }); }

let practicePending = false;

/** Creates a table with the given rules, fills it with three bots and starts the game. */
export function startPractice(name: string, mode?: Mode) {
  practicePending = true;
  if (mode) {
    const settings = { ...state.settings, mode };
    write('mj2.settings', settings);
    set({ settings });
  }
  createTable(name);
}

export function createTable(name: string) {
  setName(name);
  send({ t: 'create', name, settings: state.settings });
}

export function joinTable(code: string, name: string) {
  setName(name);
  set({ code });
  send({ t: 'join', code, name, token: sessions[code] });
}

export function updateSettings(settings: Settings) {
  write('mj2.settings', settings);
  set({ settings });
  send({ t: 'settings', settings });
}

export function leaveTable(notify = true) {
  if (notify) send({ t: 'leave' });
  if (state.code) { delete sessions[state.code]; write('mj2.sessions', sessions); }
  history.replaceState(null, '', location.pathname);
  set({ code: null, room: null, view: null });
}

// For automated tests.
(window as unknown as { __mj: unknown }).__mj = { getState, send, act };
