/**
 * End-to-end test: 4 WebSocket clients play a full one-round game.
 * One of them disconnects, then comes back with its token.
 * Usage: npx tsx apps/server/test/online.ts [ws://localhost:3000/ws] [hk|mcr]
 */
import WebSocket from 'ws';
import type { PlayerView, RoomView, ServerMessage } from '@mahjong/engine';

const URL = process.argv[2] ?? 'ws://localhost:3000/ws';
const MODE = process.argv[3] ?? 'hk';

class Bot {
  ws!: WebSocket; view: PlayerView | null = null; room: RoomView | null = null;
  token = ''; code = ''; paused = false;
  constructor(public name: string) {}
  open() {
    return new Promise<void>((res) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => res());
      this.ws.on('message', (raw) => {
        const m = JSON.parse(String(raw)) as ServerMessage;
        if (m.t === 'joined') { this.token = m.token; this.code = m.code; }
        if (m.t === 'state') { this.room = m.room; this.view = m.view; this.play(); }
        if (m.t === 'error' && !m.soft) console.log(this.name, 'error:', m.msg);
      });
    });
  }
  send(m: object) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  play() {
    const v = this.view;
    if (!v || this.paused) return;
    setTimeout(() => {
      const me = v.me;
      if (me.turn) {
        if (me.turn.tsumo && !me.turn.tsumo.tooLow) return this.send({ t: 'act', action: { type: 'tsumo' } });
        return this.send({ t: 'act', action: { type: 'discard', tile: me.drawn ?? me.hand[me.hand.length - 1] } });
      }
      if (me.claim) return this.send({ t: 'act', action: { type: 'claim', kind: me.claim.win ? 'win' : me.claim.pung ? 'pung' : 'pass' } });
      if (v.phase === 'end' && !v.seats[me.seat].ready) this.send({ t: 'act', action: { type: 'ready' } });
    }, 5);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [a, b, c, d] = ['Alice', 'Bruno', 'Chloé', 'David'].map((n) => new Bot(n));
for (const x of [a, b, c, d]) await x.open();
a.send({ t: 'create', name: a.name, settings: { mode: MODE, minFan: 1, rounds: 1, pace: 'fast' } });
await wait(200);
for (const x of [b, c, d]) x.send({ t: 'join', code: a.code, name: x.name });
await wait(300);
console.log(`Table ${a.code} (${a.room!.settings.mode}): ${a.room!.seats.map((s) => s?.name).join(', ')}; Alice is host: ${a.room!.youAreHost}`);
a.send({ t: 'start' });

setTimeout(() => { b.paused = true; b.ws.close(); console.log('Bruno disconnects (a bot plays for him)'); }, 1500);
setTimeout(async () => {
  b.paused = false;
  await b.open();
  b.send({ t: 'join', code: a.code, token: b.token, name: b.name });
  await wait(300);
  console.log(`Bruno is back: seat ${b.room!.seat}, connected = ${b.view!.seats[b.room!.seat].connected}`);
}, 5000);

const t0 = Date.now();
for (;;) {
  await wait(200);
  const v = a.view;
  if (v?.phase === 'over') {
    console.log(`Game over in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${v.history.length} hands`);
    console.log('Scores:', v.seats.map((s) => `${s.name} ${s.score}`).join(', '));
    const all = [b, c, d].every((x) => x.view?.phase === 'over');
    console.log('Every client sees the end:', all);
    process.exit(all ? 0 : 1);
  }
  if (Date.now() - t0 > 240000) { console.log('FAILED: timed out, phase', v?.phase); process.exit(1); }
}
