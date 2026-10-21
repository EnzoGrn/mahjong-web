/**
 * State machine of a four-player game. The engine has no clock:
 * it exposes a deadline (`deadlineAt`), and the host (server, or an offline app)
 * calls `timeout()` once it has passed, and plays the automatic seats.
 *
 * Phases of a hand:
 *   turn     player `turn` holds 14 effective tiles: discards, or declares kong / mahjong
 *   claims   a tile was just discarded, the others may claim it
 *   robbing  a player is adding to an exposed pung, the others may rob it to win
 *   end      the hand is over, waiting for everyone to be ready
 *   over     the game is over
 */
import { waitingTiles } from './hand.ts';
import { rulesFor, type RuleContext, type Ruleset } from './rules.ts';
import { Tile, countOf, fullSet, isFlower, removeOne, shuffle, sortTiles } from './tiles.ts';
import {
  DEFAULT_SETTINGS, NEXT_HAND_MS, PACE_MS,
  type Action, type ClaimKind, type GameEvent, type HandResult, type HistoryEntry, type Meld, type Phase,
  type PlayerView, type Settings, type Waiting, type WinScore, type Wind,
} from './types.ts';

export interface PlayerInfo { name: string; isBot: boolean; connected: boolean }

interface ClaimOption { win?: WinScore; pung?: boolean; kong?: boolean; chows?: [Tile, Tile][] }
interface Pending {
  from: number;
  tile: Tile;
  robbing: boolean;
  options: Record<number, ClaimOption>;
  responses: Record<number, { kind: ClaimKind; tiles?: [Tile, Tile] }>;
}

export interface GameHooks {
  random?: () => number;
  now?: () => number;
}

export type ActResult = { ok: true } | { error: string };

export class Game {
  players: PlayerInfo[];
  settings: Settings;
  private rng: () => number;
  private now: () => number;

  scores = [0, 0, 0, 0];
  dealer = 0;
  roundWind: Wind = 1;
  handNo = 0;
  dealerStreak = 0;
  history: HistoryEntry[] = [];
  /** Incremented on every state change. */
  version = 0;
  private seq = 0;
  lastEvent: GameEvent | null = null;

  // Current hand state
  wall: Tile[] = [];
  frontTaken = 0;
  backTaken = 0;
  dice = [1, 1, 1];
  hands: Tile[][] = [];
  melds: Meld[][] = [];
  flowers: Tile[][] = [];
  discards: { tile: Tile; claimed: boolean }[][] = [];
  drawn: (Tile | null)[] = [];
  private drawCount = [0, 0, 0, 0];
  private noClaimsYet = true;
  private kongReplacement = false;
  private canTsumo = false;
  lastDiscard: { seat: number; tile: Tile } | null = null;
  pending: Pending | null = null;
  result: HandResult | null = null;
  ready = [false, false, false, false];
  turn = 0;
  phase: Phase = 'turn';
  deadlineAt = 0;
  phaseMs = 0;
  private next: { dealer: number; roundWind: number } = { dealer: 0, roundWind: 1 };

  constructor(players: PlayerInfo[], settings: Partial<Settings> = {}, hooks: GameHooks = {}) {
    this.players = players.map((p) => ({ ...p }));
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.rng = hooks.random ?? Math.random;
    this.now = hooks.now ?? Date.now;
    this.startHand();
  }

  private get pace() { return PACE_MS[this.settings.pace]; }
  get rules(): Ruleset { return rulesFor(this.settings); }
  seatWind(seat: number): Wind { return (((seat - this.dealer + 4) % 4) + 1) as Wind; }
  isAuto(seat: number) { return this.players[seat].isBot || !this.players[seat].connected; }

  setConnected(seat: number, connected: boolean) {
    this.players[seat].connected = connected;
    if (this.phase === 'end' && !connected) this.ready[seat] = true;
    this.bump();
  }

  /* ---------------------------------------------------------------- */
  /* Playing a hand                                                    */
  /* ---------------------------------------------------------------- */

  private startHand() {
    this.handNo++;
    this.wall = shuffle(fullSet(), this.rng);
    this.frontTaken = 0;
    this.backTaken = 0;
    this.dice = [0, 0, 0].map(() => 1 + Math.floor(this.rng() * 6));
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.flowers = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.drawn = [null, null, null, null];
    this.drawCount = [0, 0, 0, 0];
    this.noClaimsYet = true;
    this.kongReplacement = false;
    this.canTsumo = false;
    this.lastDiscard = null;
    this.pending = null;
    this.result = null;
    this.ready = [false, false, false, false];
    for (let r = 0; r < 13; r++) for (let i = 0; i < 4; i++) this.hands[(this.dealer + i) % 4].push(this.takeFront());
    for (let i = 0; i < 4; i++) this.replaceFlowers((this.dealer + i) % 4);
    this.event({ type: 'deal' });
    this.drawTile(this.dealer, false, true);
  }

  private takeFront() { this.frontTaken++; return this.wall.shift()!; }
  private takeBack() { this.backTaken++; return this.wall.pop()!; }

  private replaceFlowers(seat: number) {
    let again = true;
    while (again) {
      again = false;
      for (const t of this.hands[seat].slice()) {
        if (!isFlower(t)) continue;
        removeOne(this.hands[seat], t);
        this.flowers[seat].push(t);
        if (this.wall.length) this.hands[seat].push(this.takeBack());
        again = true;
      }
    }
  }

  /** Draws a tile (flowers are replaced automatically). Returns false if the wall is exhausted. */
  private drawTile(seat: number, fromBack = false, initial = false): boolean {
    for (;;) {
      if (!this.wall.length) { this.finishHand({ type: 'draw', deltas: [0, 0, 0, 0] }); return false; }
      const t = fromBack ? this.takeBack() : this.takeFront();
      if (isFlower(t)) {
        this.flowers[seat].push(t);
        this.event({ type: 'flower', seat, tile: t });
        fromBack = true;
        continue;
      }
      this.hands[seat].push(t);
      this.drawn[seat] = t;
      if (!initial) this.drawCount[seat]++;
      break;
    }
    this.turn = seat;
    this.phase = 'turn';
    this.canTsumo = true;
    this.kongReplacement = fromBack && !initial;
    this.setDeadline(this.pace.turn);
    this.bump();
    return true;
  }

  /** Copies of `tile` visible on the table (discards and melds), the live discard excepted. */
  private shown(tile: Tile, exceptLiveDiscard: boolean): number {
    let n = 0;
    for (let s = 0; s < 4; s++) {
      this.discards[s].forEach((d, i) => {
        const live = exceptLiveDiscard && this.lastDiscard?.seat === s && i === this.discards[s].length - 1;
        if (!d.claimed && !live && d.tile === tile) n++;
      });
      for (const m of this.melds[s]) n += m.tiles.filter((t) => t === tile).length;
    }
    return n;
  }

  private winContext(seat: number, extra: Partial<RuleContext> & Pick<RuleContext, 'concealed' | 'winTile' | 'selfDraw'>): RuleContext {
    return {
      lastOfKind: this.shown(extra.winTile, !extra.selfDraw) >= 3,
      melds: this.melds[seat],
      seatWind: this.seatWind(seat),
      roundWind: this.roundWind,
      flowers: this.flowers[seat],
      sevenPairs: this.settings.sevenPairs,
      lastTile: this.wall.length === 0,
      ...extra,
    };
  }

  /** Mahjong on one's own draw; `tooLow` if the hand is complete but under the fan minimum. */
  tsumoEval(seat: number): (WinScore & { tooLow: boolean }) | null {
    if (!this.canTsumo || this.turn !== seat || this.phase !== 'turn') return null;
    const res = this.rules.evaluate(this.winContext(seat, {
      concealed: this.hands[seat],
      winTile: this.drawn[seat]!,
      selfDraw: true,
      kongReplacement: this.kongReplacement,
      heavenly: seat === this.dealer && this.noClaimsYet && this.drawCount[seat] === 0,
      earthly: seat !== this.dealer && this.noClaimsYet && this.drawCount[seat] === 1,
    }));
    return res ? { ...res, tooLow: !this.rules.qualifies(res) } : null;
  }

  private ronEval(seat: number, tile: Tile, robbingKong = false): WinScore | null {
    const res = this.rules.evaluate(this.winContext(seat, {
      concealed: [...this.hands[seat], tile], winTile: tile, selfDraw: false, robbingKong,
    }));
    return res && this.rules.qualifies(res) ? res : null;
  }

  turnKongs(seat: number): { tile: Tile; kind: 'concealed' | 'added' }[] {
    if (this.turn !== seat || this.phase !== 'turn' || !this.wall.length) return [];
    const h = this.hands[seat];
    const out: { tile: Tile; kind: 'concealed' | 'added' }[] = [];
    for (const t of new Set(h)) {
      if (countOf(h, t) === 4) out.push({ tile: t, kind: 'concealed' });
      if (this.melds[seat].some((m) => m.kind === 'pung' && m.tiles[0] === t)) out.push({ tile: t, kind: 'added' });
    }
    return out;
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  act(seat: number, a: Action): ActResult {
    if (!a || typeof a !== 'object') return { error: 'Action invalide' };
    switch (a.type) {
      case 'discard': return this.discard(seat, a.tile);
      case 'tsumo': return this.declareTsumo(seat);
      case 'kong': return this.declareKong(seat, a.tile);
      case 'claim': return this.respond(seat, a.kind, a.tiles);
      case 'ready': return this.setReady(seat);
      default: return { error: 'Action inconnue' };
    }
  }

  private discard(seat: number, tile: Tile): ActResult {
    if (this.phase !== 'turn' || this.turn !== seat) return { error: "Ce n'est pas votre tour" };
    if (!removeOne(this.hands[seat], tile)) return { error: 'Vous n’avez pas cette tuile' };
    this.drawn[seat] = null;
    this.canTsumo = false;
    this.kongReplacement = false;
    this.discards[seat].push({ tile, claimed: false });
    this.lastDiscard = { seat, tile };
    if (seat === this.dealer && this.discards[seat].length > 1) this.noClaimsYet = false;
    this.event({ type: 'discard', seat, tile });
    this.openClaims(seat, tile);
    return { ok: true };
  }

  private declareTsumo(seat: number): ActResult {
    const res = this.tsumoEval(seat);
    if (!res || res.tooLow) return { error: 'Pas de mahjong possible' };
    this.win(seat, null, this.drawn[seat]!, res);
    return { ok: true };
  }

  private declareKong(seat: number, tile: Tile): ActResult {
    const k = this.turnKongs(seat).find((x) => x.tile === tile);
    if (!k) return { error: 'Kong impossible' };
    this.drawn[seat] = null;
    this.canTsumo = false;
    if (k.kind === 'concealed') {
      for (let i = 0; i < 4; i++) removeOne(this.hands[seat], tile);
      this.melds[seat].push({ kind: 'kong', tiles: [tile, tile, tile, tile], concealed: true });
      this.noClaimsYet = false;
      this.event({ type: 'claim', claim: 'kong', seat, tile });
      this.drawTile(seat, true);
      return { ok: true };
    }
    // Added kong: the others may rob it to win.
    removeOne(this.hands[seat], tile);
    const options: Record<number, ClaimOption> = {};
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      const win = this.ronEval(s, tile, true);
      if (win) options[s] = { win };
    }
    if (!Object.keys(options).length) return this.completeAddedKong(seat, tile);
    this.phase = 'robbing';
    this.pending = { from: seat, tile, robbing: true, options, responses: {} };
    this.event({ type: 'addkong', seat, tile });
    this.setDeadline(this.pace.claim);
    this.bump();
    return { ok: true };
  }

  private completeAddedKong(seat: number, tile: Tile): ActResult {
    const m = this.melds[seat].find((x) => x.kind === 'pung' && x.tiles[0] === tile)!;
    m.kind = 'kong';
    m.tiles = [tile, tile, tile, tile];
    this.noClaimsYet = false;
    this.pending = null;
    this.event({ type: 'claim', claim: 'kong', seat, tile });
    this.drawTile(seat, true);
    return { ok: true };
  }

  private openClaims(from: number, tile: Tile) {
    const options: Record<number, ClaimOption> = {};
    for (let s = 0; s < 4; s++) {
      if (s === from) continue;
      const h = this.hands[s];
      const o: ClaimOption = {};
      const win = this.ronEval(s, tile);
      if (win) o.win = win;
      const n = countOf(h, tile);
      if (n >= 2) o.pung = true;
      if (n === 3 && this.wall.length) o.kong = true;
      if (s === (from + 1) % 4 && tile[0] !== 'z') {
        const v = Number(tile[1]), su = tile[0];
        const has = (x: number) => x >= 1 && x <= 9 && h.includes(su + x);
        const chows: [Tile, Tile][] = [];
        for (const [a, b] of [[v - 2, v - 1], [v - 1, v + 1], [v + 1, v + 2]]) if (has(a) && has(b)) chows.push([su + a, su + b]);
        if (chows.length) o.chows = chows;
      }
      if (Object.keys(o).length) options[s] = o;
    }
    if (!Object.keys(options).length) {
      this.pending = null;
      this.drawTile((from + 1) % 4);
      return;
    }
    this.phase = 'claims';
    this.pending = { from, tile, robbing: false, options, responses: {} };
    this.setDeadline(this.pace.claim);
    this.bump();
  }

  private respond(seat: number, kind: ClaimKind, tiles?: [Tile, Tile]): ActResult {
    const p = this.pending;
    if (!p || (this.phase !== 'claims' && this.phase !== 'robbing')) return { error: 'Rien à prendre pour l’instant' };
    const o = p.options[seat];
    if (!o || p.responses[seat]) return { error: 'Vous ne pouvez pas prendre cette tuile' };
    if (kind === 'win' && !o.win) return { error: 'Mahjong impossible' };
    if (kind === 'pung' && !o.pung) return { error: 'Pung impossible' };
    if (kind === 'kong' && !o.kong) return { error: 'Kong impossible' };
    if (kind === 'chow' && !o.chows?.some((c) => tiles && c[0] === tiles[0] && c[1] === tiles[1])) return { error: 'Chow impossible' };
    if (!['win', 'pung', 'kong', 'chow', 'pass'].includes(kind)) return { error: 'Choix inconnu' };
    p.responses[seat] = { kind, tiles };
    if (Object.keys(p.options).every((s) => p.responses[Number(s)])) this.resolveClaims();
    else this.bump();
    return { ok: true };
  }

  private resolveClaims() {
    const p = this.pending!;
    const order = [1, 2, 3].map((d) => (p.from + d) % 4);
    const resp = (s: number) => p.responses[s] ?? { kind: 'pass' as ClaimKind };

    // Mahjong: priority to the nearest player in turn order.
    const winner = order.find((s) => resp(s).kind === 'win');
    if (winner !== undefined) {
      if (!p.robbing) this.discards[p.from][this.discards[p.from].length - 1].claimed = true;
      this.pending = null;
      this.win(winner, p.from, p.tile, p.options[winner].win!);
      return;
    }
    if (p.robbing) { this.completeAddedKong(p.from, p.tile); return; }

    const big = order.find((s) => resp(s).kind === 'pung' || resp(s).kind === 'kong');
    const claimer = big ?? order.find((s) => resp(s).kind === 'chow');
    this.pending = null;
    if (claimer === undefined) { this.drawTile((p.from + 1) % 4); return; }

    const r = resp(claimer);
    const kind = r.kind as 'pung' | 'kong' | 'chow';
    const used: Tile[] = kind === 'chow' ? r.tiles! : kind === 'pung' ? [p.tile, p.tile] : [p.tile, p.tile, p.tile];
    for (const u of used) removeOne(this.hands[claimer], u);
    const tiles = kind === 'chow' ? sortTiles([p.tile, ...used]) : [p.tile, ...used];
    this.melds[claimer].push({ kind, tiles, concealed: false, from: p.from, claimed: p.tile });
    this.discards[p.from][this.discards[p.from].length - 1].claimed = true;
    this.noClaimsYet = false;
    this.lastDiscard = null;
    this.event({ type: 'claim', claim: kind, seat: claimer, from: p.from, tile: p.tile });
    if (kind === 'kong') { this.drawTile(claimer, true); return; }
    this.turn = claimer;
    this.phase = 'turn';
    this.canTsumo = false;
    this.kongReplacement = false;
    this.drawn[claimer] = null;
    this.setDeadline(this.pace.turn);
    this.bump();
  }

  /* ---------------------------------------------------------------- */
  /* End of hand                                                       */
  /* ---------------------------------------------------------------- */

  private win(seat: number, from: number | null, tile: Tile, res: WinScore) {
    const { deltas, points: pts } = this.rules.deltas(res, seat, from);
    const concealed = from === null ? this.hands[seat].slice() : [...this.hands[seat], tile];
    removeOne(concealed, tile);
    this.finishHand({
      type: 'win', winner: seat, from, tile, fan: res.fan, base: res.base, items: res.items, limit: res.limit,
      points: pts, deltas, selfDraw: from === null,
      winningHand: { concealed: sortTiles(concealed), melds: this.melds[seat], flowers: this.flowers[seat] },
    });
  }

  private finishHand(r: Omit<HandResult, 'hands' | 'gameEnds' | 'handNo'>) {
    for (let s = 0; s < 4; s++) this.scores[s] += r.deltas[s];
    const dealerKeeps = this.rules.dealerKeeps(r.type === 'win' ? r.winner : undefined, this.dealer);
    this.next = { dealer: this.dealer, roundWind: this.roundWind };
    if (!dealerKeeps) {
      this.next.dealer = (this.dealer + 1) % 4;
      if (this.next.dealer === 0) this.next.roundWind++;
    }
    const gameEnds = this.next.roundWind > this.settings.rounds || this.handNo >= 24 * this.settings.rounds;
    this.result = { ...r, handNo: this.handNo, hands: this.hands.map(sortTiles), gameEnds };
    this.history.push({
      handNo: this.handNo, roundWind: this.roundWind, type: r.type,
      winner: r.winner, from: r.from, fan: r.fan, deltas: r.deltas,
    });
    this.pending = null;
    this.phase = 'end';
    this.ready = this.players.map((_, s) => this.isAuto(s));
    this.event({ type: r.type === 'win' ? 'win' : 'exhaust', seat: r.winner });
    this.setDeadline(NEXT_HAND_MS);
    this.bump();
  }

  private setReady(seat: number): ActResult {
    if (this.phase !== 'end') return { error: 'Pas maintenant' };
    this.ready[seat] = true;
    if (this.ready.every(Boolean)) this.nextHand();
    else this.bump();
    return { ok: true };
  }

  nextHand() {
    if (this.phase !== 'end') return;
    if (this.result?.gameEnds) {
      this.phase = 'over';
      this.deadlineAt = 0;
      this.event({ type: 'over' });
      this.bump();
      return;
    }
    this.dealerStreak = this.next.dealer === this.dealer ? this.dealerStreak + 1 : 0;
    this.dealer = this.next.dealer;
    this.roundWind = this.next.roundWind as Wind;
    this.startHand();
  }

  /** Deadline passed: default action for the current phase. */
  timeout(version?: number) {
    if (version !== undefined && version !== this.version) return;
    if (this.phase === 'turn') {
      const s = this.turn;
      this.discard(s, this.drawn[s] ?? this.hands[s][this.hands[s].length - 1]);
    } else if ((this.phase === 'claims' || this.phase === 'robbing') && this.pending) {
      for (const s of Object.keys(this.pending.options)) this.pending.responses[Number(s)] ??= { kind: 'pass' };
      this.resolveClaims();
    } else if (this.phase === 'end') {
      this.ready = [true, true, true, true];
      this.nextHand();
    }
  }

  /** Automatic seats (bots, disconnected players) whose decision is pending. */
  autoActors(): number[] {
    if (this.phase === 'turn') return this.isAuto(this.turn) ? [this.turn] : [];
    if ((this.phase === 'claims' || this.phase === 'robbing') && this.pending) {
      return Object.keys(this.pending.options).map(Number).filter((s) => this.isAuto(s) && !this.pending!.responses[s]);
    }
    return [];
  }

  private setDeadline(ms: number) {
    this.phaseMs = ms;
    this.deadlineAt = this.now() + ms;
  }

  private event(e: Omit<GameEvent, 'seq'>) {
    this.lastEvent = { ...e, seq: ++this.seq };
  }

  private bump() { this.version++; }

  /* ---------------------------------------------------------------- */
  /* What each player sees                                             */
  /* ---------------------------------------------------------------- */

  visibleCounts(seat: number): Record<Tile, number> {
    const v: Record<Tile, number> = {};
    const add = (t: Tile) => { v[t] = (v[t] ?? 0) + 1; };
    this.hands[seat].forEach(add);
    for (let s = 0; s < 4; s++) {
      this.discards[s].forEach((d) => { if (!d.claimed) add(d.tile); });
      for (const m of this.melds[s]) {
        if (m.concealed && s !== seat) { add(m.tiles[1]); add(m.tiles[2]); } else m.tiles.forEach(add);
      }
    }
    return v;
  }

  private hints(seat: number) {
    const h = this.hands[seat];
    const mc = this.melds[seat].length;
    const vis = this.visibleCounts(seat);
    const w = (k: Tile): Waiting => ({ tile: k, left: Math.max(0, 4 - (vis[k] ?? 0)) });
    const opts = this.rules.shapes;
    if (this.phase === 'turn' && this.turn === seat) {
      const discards: Record<Tile, Waiting[]> = {};
      for (const t of new Set(h)) {
        const rest = h.slice();
        removeOne(rest, t);
        const waits = waitingTiles(rest, mc, opts);
        if (waits.length) discards[t] = waits.map(w);
      }
      return { discards };
    }
    return { waits: h.length === 13 - 3 * mc ? waitingTiles(h, mc, opts).map(w) : [] };
  }

  view(seat: number): PlayerView {
    const showAll = this.phase === 'end' || this.phase === 'over';
    const claiming = (this.phase === 'claims' || this.phase === 'robbing') && this.pending;
    const me: PlayerView['me'] = { seat, hand: [], drawn: null };
    const h = this.hands[seat].slice();
    const drawn = this.phase === 'turn' && this.turn === seat ? this.drawn[seat] : null;
    if (drawn) removeOne(h, drawn);
    me.hand = sortTiles(h);
    me.drawn = drawn;
    if (this.phase === 'turn' && this.turn === seat) {
      const ts = this.tsumoEval(seat);
      const kongs = this.turnKongs(seat);
      me.turn = { discard: true, ...(ts ? { tsumo: { fan: ts.fan, tooLow: ts.tooLow, ...(ts.base !== undefined ? { base: ts.base } : {}) } } : {}), ...(kongs.length ? { kongs } : {}) };
    } else if (claiming) {
      const p = this.pending!;
      const o = p.options[seat];
      if (o && !p.responses[seat]) {
        me.claim = {
          tile: p.tile, from: p.from, robbing: p.robbing,
          ...(o.win ? { win: { fan: o.win.fan } } : {}), ...(o.pung ? { pung: true } : {}),
          ...(o.kong ? { kong: true } : {}), ...(o.chows ? { chows: o.chows } : {}),
        };
      } else if (o) me.waitingForOthers = true;
    }
    if (this.settings.hints && !showAll) me.hints = this.hints(seat);

    return {
      phase: this.phase,
      version: this.version,
      handNo: this.handNo,
      roundWind: this.roundWind,
      dealer: this.dealer,
      dealerStreak: this.dealerStreak,
      turn: this.turn,
      wallCount: this.wall.length,
      wall: { front: this.frontTaken, back: this.backTaken, dice: this.dice },
      remainingMs: this.phase === 'over' ? 0 : Math.max(0, this.deadlineAt - this.now()),
      totalMs: this.phaseMs,
      focus: this.phase === 'turn' ? this.turn : claiming ? this.pending!.from : null,
      lastDiscard: this.phase === 'claims' ? this.lastDiscard : null,
      lastEvent: this.lastEvent,
      settings: this.settings,
      seats: this.players.map((p, s) => ({
        name: p.name,
        isBot: p.isBot,
        connected: p.connected,
        wind: this.seatWind(s),
        score: this.scores[s],
        handCount: this.hands[s].length,
        justDrew: this.phase === 'turn' && this.turn === s && !!this.drawn[s],
        melds: this.melds[s].map((m) => (m.concealed && s !== seat && !showAll ? { ...m, tiles: ['back', m.tiles[1], m.tiles[2], 'back'] } : m)),
        flowers: this.flowers[s],
        discards: this.discards[s].filter((d) => !d.claimed).map((d) => d.tile),
        ready: this.ready[s],
        ...(showAll && this.result ? { revealed: this.result.hands[s] } : {}),
      })),
      me,
      result: showAll ? this.result : null,
      history: this.history,
    };
  }
}
