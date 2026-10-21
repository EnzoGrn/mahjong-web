/** Automatic player: bots and disconnected players. */
import type { Game } from './game.ts';
import { mcrBotAction } from './botMcr.ts';
import { shanten } from './hand.ts';
import { KINDS, SUITS, Tile, removeOne } from './tiles.ts';
import type { Action, Meld } from './types.ts';

interface Ctx { seatWind: number; roundWind: number; visible: Record<Tile, number>; minFan: number }

const without = (arr: Tile[], ...ts: Tile[]) => { const out = arr.slice(); ts.forEach((t) => removeOne(out, t)); return out; };
const isValuedHonor = (t: Tile, ctx: Ctx) => t[0] === 'z' && (Number(t[1]) >= 5 || Number(t[1]) === ctx.seatWind || Number(t[1]) === ctx.roundWind);

/** Target suit if the hand leans towards a flush (full or half). */
function flushSuit(hand: Tile[], melds: Meld[]): string | null {
  const all = [...hand, ...melds.flatMap((m) => m.tiles)];
  let best: string | null = null, bestN = 0;
  for (const s of SUITS) {
    const n = all.filter((t) => t[0] === s).length;
    if (n > bestN) { best = s; bestN = n; }
  }
  const honors = all.filter((t) => t[0] === 'z').length;
  return all.length - bestN - honors <= 3 && bestN >= 7 ? best : null;
}

function ukeire(hand: Tile[], meldCount: number, visible: Record<Tile, number>, sh: number): number {
  let n = 0;
  for (const k of KINDS) {
    const left = 4 - (visible[k] ?? 0);
    if (left > 0 && shanten([...hand, k], meldCount) < sh) n += left;
  }
  return n;
}

function tileValue(t: Tile, hand: Tile[], ctx: Ctx, flush: string | null): number {
  const c = hand.filter((x) => x === t).length;
  if (t[0] === 'z') return (isValuedHonor(t, ctx) ? (c >= 2 ? 30 : 4) : c >= 2 ? 12 : 0) + c * 3;
  let v = 6 - Math.abs(5 - Number(t[1]));
  if (flush) v += t[0] === flush ? 10 : -6;
  return v + c * 3;
}

export function chooseDiscard(hand: Tile[], melds: Meld[], ctx: Ctx): Tile {
  const flush = flushSuit(hand, melds);
  let best: { t: Tile; score: number } | null = null;
  for (const t of new Set(hand)) {
    const rest = without(hand, t);
    const sh = shanten(rest, melds.length);
    const uk = sh <= 3 ? ukeire(rest, melds.length, ctx.visible, sh) : 0;
    const score = -sh * 1000 + uk * 4 - tileValue(t, hand, ctx, flush);
    if (!best || score > best.score) best = { t, score };
  }
  return best!.t;
}

function hasFanPotential(hand: Tile[], melds: Meld[], ctx: Ctx): boolean {
  if (ctx.minFan <= 1 || flushSuit(hand, melds)) return true;
  if (melds.some((m) => m.kind !== 'chow' && isValuedHonor(m.tiles[0], ctx))) return true;
  return [...new Set(hand)].some((k) => hand.filter((x) => x === k).length >= 3 && isValuedHonor(k, ctx));
}

/** Automatic decision for seat `seat`. */
export function botAction(g: Game, seat: number): Action {
  if (g.settings.mode === 'mcr') return mcrBotAction(g, seat);
  const ctx: Ctx = { seatWind: g.seatWind(seat), roundWind: g.roundWind, visible: g.visibleCounts(seat), minFan: g.settings.minFan };
  const hand = g.hands[seat], melds = g.melds[seat];

  if (g.phase === 'turn') {
    const ts = g.tsumoEval(seat);
    if (ts && !ts.tooLow) return { type: 'tsumo' };
    const kong = g.turnKongs(seat)[0];
    if (kong) return { type: 'kong', tile: kong.tile };
    return { type: 'discard', tile: chooseDiscard(hand, melds, ctx) };
  }

  const p = g.pending;
  const o = p?.options[seat];
  if (!p || !o) return { type: 'claim', kind: 'pass' };
  if (o.win) return { type: 'claim', kind: 'win' };
  const cur = shanten(hand, melds.length);
  const after = (used: Tile[], kong = false) => {
    const rest = without(hand, ...used);
    if (kong) return shanten(rest, melds.length + 1);
    return Math.min(...[...new Set(rest)].map((t) => shanten(without(rest, t), melds.length + 1)));
  };
  if (o.kong && after([p.tile, p.tile, p.tile], true) <= cur) return { type: 'claim', kind: 'kong' };
  if (o.pung) {
    if (isValuedHonor(p.tile, ctx)) return { type: 'claim', kind: 'pung' };
    if (after([p.tile, p.tile]) < cur && hasFanPotential(hand, melds, ctx)) return { type: 'claim', kind: 'pung' };
  }
  if (o.chows && cur <= 3 && hasFanPotential(hand, melds, ctx)) {
    for (const used of o.chows) if (after(used) < cur) return { type: 'claim', kind: 'chow', tiles: used };
  }
  return { type: 'claim', kind: 'pass' };
}
