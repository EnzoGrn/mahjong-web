/**
 * "For my hand" hints: which valuable combinations the current hand is closest to, which tiles
 * each one still lacks, and which tiles serve none of them. Used by the in-game player aid.
 *
 * This is an estimate meant to be read by a person, not an exact solver: each target is a fixed
 * pattern (or a simple rule) matched against the tiles held.
 */
import { KNITS, shanten } from './hand.ts';
import { MCR_FAN_TABLE } from './mcr.ts';
import { FAN_TABLE } from './scoring.ts';
import { IDX, KINDS, ORPHANS, SUITS, Tile, counts } from './tiles.ts';
import type { Meld, Mode, Wind } from './types.ts';

export interface TargetTile { tile: Tile; have: boolean }

export interface Target {
  key: string;
  name: string;
  /** Points (MCR) or fans (HK); a string for limit hands. */
  value: number | string;
  /** Tiles to show, grouped (sets, pairs…), each marked held or missing. */
  groups: TargetTile[][];
  missing: number;
  /** MCR: the fan alone reaches the 8-point minimum. */
  enough: boolean;
}

export interface TargetOptions { mode: Mode; seatWind: Wind; roundWind: Wind; sevenPairs?: boolean }

const mcrPts = (k: string) => MCR_FAN_TABLE.find((f) => f.key === k)!;
const hkFan = (k: string) => FAN_TABLE.find((f) => f.key === k)!;

/** Marks pattern tiles as held while there are copies left in `pool` (tile index → count). */
function take(pool: number[], tiles: number[]): TargetTile[] {
  return tiles.map((i) => {
    const have = pool[i] > 0;
    if (have) pool[i]--;
    return { tile: KINDS[i], have };
  });
}
const missingOf = (groups: TargetTile[][]) => groups.reduce((n, g) => n + g.filter((t) => !t.have).length, 0);

/** Tiles still needed to complete the rest of the hand around a pattern (`sets` sets already accounted for). */
function restNeed(pool: number[], sets: number): number {
  const rest = pool.flatMap((n, i) => Array(n).fill(KINDS[i]) as Tile[]);
  return Math.max(0, shanten(rest, sets) + 1);
}
const chow = (st: number) => [st, st + 1, st + 2];

export function suggestTargets(hand: Tile[], melds: Meld[], o: TargetOptions): { targets: Target[]; useless: Tile[] } {
  const c = counts(hand);
  const out: Target[] = [];
  const mcr = o.mode === 'mcr';
  const meldChows = melds.filter((m) => m.kind === 'chow').map((m) => IDX[m.tiles[0]]);
  const meldTiles = melds.flatMap((m) => m.tiles.filter((t) => t !== 'back'));
  const add = (key: string, groups: TargetTile[][], extra: Partial<Target> = {}) => {
    const f = mcr ? mcrPts(key) : hkFan(key);
    const value = f.fan;
    out.push({
      key, name: f.name, value, groups, missing: missingOf(groups),
      enough: mcr && typeof value === 'number' && value >= 8, ...extra,
    });
  };

  // MCR: three fixed chows (straights, triple chows, shifted chows). Melded chows may be part of them.
  if (mcr) {
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const pats: { key: string; starts: number[] }[] = [];
    for (let s = 0; s < 3; s++) pats.push({ key: 'pureStraight', starts: [s * 9, s * 9 + 3, s * 9 + 6] });
    for (const [a, b, d] of perms) pats.push({ key: 'mixedStraight', starts: [a * 9, b * 9 + 3, d * 9 + 6] });
    for (let n = 0; n < 7; n++) pats.push({ key: 'mixedTripleChow', starts: [n, 9 + n, 18 + n] });
    for (const [a, b, d] of perms) for (let n = 0; n < 5; n++) pats.push({ key: 'mixedShiftedChows', starts: [a * 9 + n, b * 9 + n + 1, d * 9 + n + 2] });
    const best: Record<string, Target> = {};
    for (const p of pats) {
      const covered = p.starts.filter((st) => meldChows.includes(st));
      if (melds.length - covered.length > 1) continue;
      const pool = c.slice();
      const groups = p.starts.map((st) => (covered.includes(st) ? chow(st).map((i) => ({ tile: KINDS[i], have: true })) : take(pool, chow(st))));
      const f = mcrPts(p.key);
      const missing = missingOf(groups) + restNeed(pool, 3 + melds.length - covered.length);
      const t: Target = { key: p.key, name: f.name, value: f.fan, groups, missing, enough: f.fan >= 8 };
      if (!best[p.key] || t.missing < best[p.key].missing) best[p.key] = t;
    }
    out.push(...Object.values(best));
  }

  // Flushes: one suit (with or without honors). The tiles to replace are the off-suit ones.
  for (const s of SUITS) {
    if (!meldTiles.every((t) => t[0] === s || t[0] === 'z')) continue;
    const inSuit = hand.filter((t) => t[0] === s);
    const honors = hand.filter((t) => t[0] === 'z');
    const off = hand.length - inSuit.length - honors.length;
    if (inSuit.length + meldTiles.filter((t) => t[0] === s).length < 5) continue;
    // Only held tiles are drawn; `missing` counts the off-suit tiles still to replace.
    const word = { m: 'caractères', p: 'cercles', s: 'bambous' }[s];
    const honorsAnywhere = honors.length > 0 || meldTiles.some((t) => t[0] === 'z');
    add(honorsAnywhere ? 'halfFlush' : 'fullFlush', [[...inSuit, ...honors].map((tile) => ({ tile, have: true }))], { missing: off });
    out[out.length - 1].name += ` (${word})`;
    if (honors.length && !meldTiles.some((t) => t[0] === 'z')) {
      add('fullFlush', [inSuit.map((tile) => ({ tile, have: true }))], { missing: off + honors.length });
      out[out.length - 1].name += ` (${word})`;
    }
  }

  // Seven pairs (concealed hands only).
  if (!melds.length && (mcr || o.sevenPairs !== false)) {
    const pairs: TargetTile[][] = [];
    const singles: TargetTile[][] = [];
    for (let i = 0; i < 34; i++) {
      for (let k = 0; k < Math.floor(c[i] / 2); k++) pairs.push([{ tile: KINDS[i], have: true }, { tile: KINDS[i], have: true }]);
      if (c[i] % 2) singles.push([{ tile: KINDS[i], have: true }, { tile: KINDS[i], have: false }]);
    }
    const groups = [...pairs, ...singles].slice(0, 7);
    add('sevenPairs', groups, { missing: 7 - Math.min(7, pairs.length) + Math.max(0, 7 - groups.length) });
  }

  // All pungs: every pair or triple heads towards a pung (no melded chow).
  if (!meldChows.length) {
    const groups: TargetTile[][] = [];
    for (let i = 0; i < 34; i++) {
      if (c[i] >= 2) groups.push(take(c.slice(), [i, i, i]));
    }
    groups.sort((a, b) => missingOf([a]) - missingOf([b]));
    const need = 4 - melds.length;
    const kept = groups.slice(0, need + 1);
    if (kept.length >= 2) {
      // One group can stay a pair.
      const missing = Math.max(0, missingOf(kept) - 1) + Math.max(0, need + 1 - kept.length) * 2;
      add('allPungs', kept, { missing });
    }
  }

  // Valued honor pungs: dragons, seat wind, prevalent wind.
  const valued: { idx: number; key: string }[] = [
    ...[31, 32, 33].map((idx) => ({ idx, key: 'dragonPung' })),
    { idx: 26 + o.seatWind, key: 'seatWind' },
    { idx: 26 + o.roundWind, key: mcr ? 'prevalentWind' : 'roundWind' },
  ];
  for (const v of valued) {
    if (c[v.idx] < 2) continue;
    add(v.key, [take(c.slice(), [v.idx, v.idx, v.idx])]);
    out[out.length - 1].name += ` (${tileWord(KINDS[v.idx])})`;
  }

  // MCR knitted straight, and thirteen orphans.
  if (mcr && melds.length <= 1) {
    let bestK: Target | null = null;
    for (const k of KNITS) {
      const pool = c.slice();
      const groups = [take(pool, k.slice(0, 3)), take(pool, k.slice(3, 6)), take(pool, k.slice(6, 9))];
      const f = mcrPts('knittedStraight');
      const t: Target = { key: 'knittedStraight', name: f.name, value: f.fan, groups, missing: missingOf(groups) + restNeed(pool, 3 + melds.length), enough: true };
      if (!bestK || t.missing < bestK.missing) bestK = t;
    }
    if (bestK) out.push(bestK);
  }
  if (!melds.length) {
    const groups = [take(c.slice(), ORPHANS)];
    const dup = ORPHANS.some((i) => c[i] >= 2);
    add('thirteenOrphans', groups, { missing: missingOf(groups) + (dup ? 0 : 1) });
  }

  // Keep the closest targets: within reach, then by value.
  const num = (t: Target) => (typeof t.value === 'number' ? t.value : 100);
  // In MCR, targets that reach 8 points on their own come first; smaller ones only complete them.
  const rank = (t: Target) => t.missing + (mcr && !t.enough ? (num(t) >= 6 ? 1 : 2.5) : 0);
  const sorted = out
    .sort((a, b) => rank(a) - rank(b) || num(b) - num(a))
    .filter((t, i, arr) => arr.findIndex((x) => x.key === t.key) === i);
  const near = (t: Target) => t.missing <= (num(t) >= 24 ? 4 : 6) && (t.missing < 6 || t.enough);
  // Within reach first; always offer at least two directions, even far ones, early in the hand.
  const shown = sorted.filter(near).slice(0, 3);
  for (const t of sorted) {
    if (shown.length >= 2) break;
    if (!shown.includes(t) && t.missing <= 8 && t.key !== 'thirteenOrphans') shown.push(t);
  }

  // Useless tiles: isolated, and part of none of the targets shown.
  const usedKinds = new Set(shown.flatMap((t) => t.groups.flat().filter((x) => x.have).map((x) => x.tile)));
  const useless = [...new Set(hand)].filter((t) => {
    if (usedKinds.has(t)) return false;
    const i = IDX[t];
    if (c[i] >= 2) return false;
    if (i >= 27) return !valued.some((v) => v.idx === i);
    const near = [-2, -1, 1, 2].some((d) => {
      const j = i + d;
      return Math.floor(j / 9) === Math.floor(i / 9) && j >= 0 && c[j] > 0;
    });
    return !near;
  }).slice(0, 4);

  return { targets: shown, useless };
}

function tileWord(t: Tile): string {
  return ['Est', 'Sud', 'Ouest', 'Nord', 'rouge', 'vert', 'blanc'][Number(t[1]) - 1];
}
