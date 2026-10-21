/**
 * MCR bot. A hand only wins with 8 points, so plain shanten is not enough: the bot picks the
 * discard that brings it closest to one of a few high-value targets (straights, triple chows,
 * flushes, seven pairs, knitted hands…), and only goes for a ready hand whose waits score 8.
 */
import type { Game } from './game.ts';
import { KNITS, shanten, waitingTiles } from './hand.ts';
import { evaluateMcr, MCR_MIN, MCR_SHAPES } from './mcr.ts';
import { IDX, KINDS, SUITS, Tile, counts, removeOne } from './tiles.ts';
import type { Action, Meld, Wind } from './types.ts';

interface Ctx { seatWind: Wind; roundWind: Wind; visible: Record<Tile, number>; flowers: Tile[] }

const without = (arr: Tile[], ...ts: Tile[]) => { const out = arr.slice(); ts.forEach((t) => removeOne(out, t)); return out; };
const tileOf = (i: number) => KINDS[i];

/** Targets made of three fixed chows (start indices), with a penalty when the fan alone is under 8. */
function chowPatterns(): { starts: number[]; penalty: number }[] {
  const out: { starts: number[]; penalty: number }[] = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (let s = 0; s < 3; s++) out.push({ starts: [s * 9, s * 9 + 3, s * 9 + 6], penalty: 0 }); // pure straight (16)
  for (const [a, b, c] of perms) out.push({ starts: [a * 9, b * 9 + 3, c * 9 + 6], penalty: 0 }); // mixed straight (8)
  for (let n = 0; n < 7; n++) out.push({ starts: [n, 9 + n, 18 + n], penalty: 0 }); // mixed triple chow (8)
  for (const [a, b, c] of perms) {
    for (let n = 0; n < 5; n++) out.push({ starts: [a * 9 + n, b * 9 + n + 1, c * 9 + n + 2], penalty: 0.7 }); // mixed shifted chows (6)
  }
  return out;
}
const CHOW_PATTERNS = chowPatterns();

/**
 * How far the hand is from a pattern of fixed tiles plus free sets: missing pattern tiles
 * plus the shanten of what is left. `slots` free sets remain after the pattern.
 */
function patternShanten(hand: Tile[], patternTiles: number[], outside: number, slots: number, cutoff: number): number {
  if (outside > slots) return 99;
  let rest = hand.slice();
  let missing = 0;
  for (const i of patternTiles) {
    const t = tileOf(i);
    if (rest.includes(t)) rest = without(rest, t);
    else missing++;
  }
  // Shanten is at least -1: skip the expensive part when this target cannot beat the best one.
  if (missing - 1 >= cutoff) return 99;
  return missing + shanten(rest, 4 - slots + outside);
}

/** Effective distance to a winning hand worth 8 points: lower is better. */
export function planDistance(hand: Tile[], melds: Meld[]): number {
  let best = shanten(hand, melds.length) + 1.6; // a plain hand may not reach 8 points
  const chowMelds = melds.filter((m) => m.kind === 'chow').map((m) => IDX[m.tiles[0]]);
  const allPungMelds = melds.every((m) => m.kind !== 'chow');

  // Three fixed chows (straights, triple chows, shifted chows): melded chows can be part of them.
  for (const p of CHOW_PATTERNS) {
    const covered = p.starts.filter((st) => chowMelds.includes(st));
    const outside = melds.length - covered.length;
    const tiles = p.starts.filter((st) => !covered.includes(st)).flatMap((st) => [st, st + 1, st + 2]);
    best = Math.min(best, patternShanten(hand, tiles, outside, 1, best - p.penalty) + p.penalty);
  }

  // Flushes: only one suit, with or without honors.
  for (const s of SUITS) {
    if (!melds.every((m) => m.tiles.every((t) => t[0] === s || t[0] === 'z'))) continue;
    const kept = hand.filter((t) => t[0] === s || t[0] === 'z');
    const honors = [...hand, ...melds.flatMap((m) => m.tiles)].some((t) => t[0] === 'z');
    const d = shanten(kept, melds.length) + (hand.length - kept.length) * 0.15;
    best = Math.min(best, d + (honors ? 0.6 : 0));
  }

  // All pungs.
  if (allPungMelds) {
    const c = counts(hand);
    const triples = c.filter((n) => n >= 3).length;
    const pairs = c.filter((n) => n === 2).length;
    const need = 4 - melds.length;
    const usedPairs = Math.min(pairs, need - Math.min(triples, need) + 1);
    best = Math.min(best, 8 - 2 * (Math.min(triples, need) + melds.length) - usedPairs + 0.6);
  }

  if (!melds.length) {
    // Seven pairs.
    const c = counts(hand);
    const pairs = c.filter((n) => n >= 2).length;
    const kinds = c.filter((n) => n > 0).length;
    best = Math.min(best, 6 - pairs + Math.max(0, 7 - kinds));
    // Knitted straight, and honors with knitted tiles.
    const honorsHeld = c.slice(27).filter((n) => n > 0).length;
    for (const k of KNITS) {
      best = Math.min(best, patternShanten(hand, k, 0, 1, best - 0.2) + 0.2);
      const knitHeld = k.filter((i) => c[i] > 0).length;
      best = Math.min(best, 13 - Math.min(14, knitHeld + honorsHeld) + 0.3);
    }
  }
  return best;
}

/** Best value (without flowers) among the waits of a ready hand, on a discard and on a self-draw. */
function readyValue(hand: Tile[], melds: Meld[], ctx: Ctx): { value: number; outs: number } {
  let value = 0, outs = 0;
  for (const w of waitingTiles(hand, melds.length, MCR_SHAPES)) {
    const left = 4 - (ctx.visible[w] ?? 0);
    if (left <= 0) continue;
    const base = { concealed: [...hand, w], melds, winTile: w, seatWind: ctx.seatWind, roundWind: ctx.roundWind, flowers: [] };
    const ron = evaluateMcr({ ...base, selfDraw: false })?.base ?? 0;
    const tsumo = evaluateMcr({ ...base, selfDraw: true })?.base ?? 0;
    value = Math.max(value, ron);
    if (ron >= MCR_MIN) outs += left;
    else if (tsumo >= MCR_MIN) outs += left * 0.3;
  }
  return { value, outs };
}

function ukeire(hand: Tile[], melds: Meld[], visible: Record<Tile, number>, d: number): number {
  let n = 0;
  for (const k of KINDS) {
    const left = 4 - (visible[k] ?? 0);
    if (left > 0 && planDistance([...hand, k], melds) < d - 0.5) n += left;
  }
  return n;
}

/** Score of a 13-tile hand after a discard: higher is better. */
function handScore(rest: Tile[], melds: Meld[], ctx: Ctx, cheap = false): number {
  const sh = shanten(rest, melds.length, { sevenPairs: true });
  const d = planDistance(rest, melds);
  if (sh === 0 || d < 1) {
    const r = readyValue(rest, melds, ctx);
    if (r.outs > 0) return 10000 + r.outs * 10 + r.value;
  }
  return -d * 1000 + (cheap ? 0 : ukeire(rest, melds, ctx.visible, d) * 2);
}

function chooseDiscard(hand: Tile[], melds: Meld[], ctx: Ctx): Tile {
  const valued = (t: Tile) => t[0] === 'z' && (Number(t[1]) >= 5 || Number(t[1]) === ctx.seatWind || Number(t[1]) === ctx.roundWind);
  const keepBonus = (t: Tile) => (valued(t) && hand.filter((x) => x === t).length >= 2 ? 30 : 0);
  // Rank every discard cheaply, then refine the best few with the number of useful draws.
  const ranked = [...new Set(hand)]
    .map((t) => ({ t, score: handScore(without(hand, t), melds, ctx, true) - keepBonus(t) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked.filter((r) => r.score >= ranked[0].score - 300).slice(0, 4);
  if (top.length === 1 || top[0].score >= 10000) return top[0].t;
  const refined = top.map((r) => ({ t: r.t, score: handScore(without(hand, r.t), melds, ctx) - keepBonus(r.t) }));
  return refined.reduce((a, b) => (b.score > a.score ? b : a)).t;
}

/** Best score reachable after claiming: the claimed set is melded, then the best discard is made. */
function afterClaim(hand: Tile[], melds: Meld[], used: Tile[], meld: Meld, ctx: Ctx): number {
  const rest = without(hand, ...used);
  const m2 = [...melds, meld];
  if (meld.kind === 'kong') return handScore(rest, m2, ctx, true);
  let best = -Infinity;
  for (const t of new Set(rest)) best = Math.max(best, handScore(without(rest, t), m2, ctx, true));
  return best;
}

export function mcrBotAction(g: Game, seat: number): Action {
  const ctx: Ctx = { seatWind: g.seatWind(seat), roundWind: g.roundWind, visible: g.visibleCounts(seat), flowers: g.flowers[seat] };
  const hand = g.hands[seat], melds = g.melds[seat];

  if (g.phase === 'turn') {
    const ts = g.tsumoEval(seat);
    if (ts && !ts.tooLow) return { type: 'tsumo' };
    for (const k of g.turnKongs(seat)) {
      // A kong only if it does not spoil the hand.
      const meld: Meld = { kind: 'kong', tiles: [k.tile, k.tile, k.tile, k.tile], concealed: k.kind === 'concealed' };
      const used = k.kind === 'concealed' ? [k.tile, k.tile, k.tile, k.tile] : [k.tile];
      const ms = k.kind === 'added' ? melds.filter((m) => !(m.kind === 'pung' && m.tiles[0] === k.tile)) : melds;
      if (afterClaim(hand, ms, used, meld, ctx) >= handScore(without(hand, chooseDiscard(hand, melds, ctx)), melds, ctx, true)) {
        return { type: 'kong', tile: k.tile };
      }
    }
    return { type: 'discard', tile: chooseDiscard(hand, melds, ctx) };
  }

  const p = g.pending;
  const o = p?.options[seat];
  if (!p || !o) return { type: 'claim', kind: 'pass' };
  if (o.win) return { type: 'claim', kind: 'win' };
  const now = handScore(hand, melds, ctx, true);
  const margin = 400; // claiming opens the hand (no more concealed-hand points): it must clearly help
  const t = p.tile;
  if (o.kong && afterClaim(hand, melds, [t, t, t], { kind: 'kong', tiles: [t, t, t, t], concealed: false }, ctx) > now + margin) {
    return { type: 'claim', kind: 'kong' };
  }
  if (o.pung && afterClaim(hand, melds, [t, t], { kind: 'pung', tiles: [t, t, t], concealed: false }, ctx) > now + margin) {
    return { type: 'claim', kind: 'pung' };
  }
  for (const used of o.chows ?? []) {
    const tiles = [t, ...used].sort((a, b) => IDX[a] - IDX[b]);
    if (afterClaim(hand, melds, used, { kind: 'chow', tiles, concealed: false }, ctx) > now + margin) {
      return { type: 'claim', kind: 'chow', tiles: used };
    }
  }
  return { type: 'claim', kind: 'pass' };
}
