/** Hand analysis: winning shapes, waits, shanten. */
import { KINDS, ORPHANS, Tile, counts } from './tiles.ts';

export interface Decomposition {
  pair: number;
  sets: { type: 'pung' | 'chow'; idx: number }[];
}

/** Every decomposition of `c` into `need` sets + 1 pair. */
export function decompose(c: number[], need: number): Decomposition[] {
  const out: Decomposition[] = [];
  const sets: Decomposition['sets'] = [];
  let pair = -1;
  const rec = (start: number) => {
    let i = start;
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) {
      if (pair >= 0 && sets.length === need) out.push({ pair, sets: sets.slice() });
      return;
    }
    if (pair < 0 && c[i] >= 2) {
      c[i] -= 2; pair = i; rec(i); pair = -1; c[i] += 2;
    }
    if (sets.length < need && c[i] >= 3) {
      c[i] -= 3; sets.push({ type: 'pung', idx: i }); rec(i); sets.pop(); c[i] += 3;
    }
    if (sets.length < need && i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      sets.push({ type: 'chow', idx: i }); rec(i); sets.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  rec(0);
  return out;
}

export function isSevenPairs(c: number[]): boolean {
  let pairs = 0;
  for (const n of c) {
    if (n === 2) pairs++;
    else if (n !== 0) return false;
  }
  return pairs === 7;
}

export function isThirteenOrphans(c: number[]): boolean {
  let total = 0;
  let pair = false;
  for (let i = 0; i < 34; i++) {
    if (!c[i]) continue;
    if (!ORPHANS.includes(i) || c[i] > 2) return false;
    if (c[i] === 2) { if (pair) return false; pair = true; }
    total += c[i];
  }
  return total === 14 && pair && ORPHANS.every((i) => c[i] > 0);
}

/**
 * The 6 knitted patterns (MCR): 1-4-7 in one suit, 2-5-8 in another, 3-6-9 in the third,
 * as lists of 9 tile indices.
 */
export const KNITS: number[][] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  .map(([a, b, c]) => [0, 3, 6].map((o) => a * 9 + o).concat([1, 4, 7].map((o) => b * 9 + o), [2, 5, 8].map((o) => c * 9 + o)));

/**
 * Honors and knitted tiles (MCR): 14 different tiles, the suited ones all taken from one knitted
 * pattern, the rest honors. Returns the pattern used, or null.
 */
export function honorsKnitted(c: number[]): number[] | null {
  let total = 0;
  for (const n of c) { if (n > 1) return null; total += n; }
  if (total !== 14) return null;
  const suited = c.slice(0, 27).flatMap((n, i) => (n ? [i] : []));
  return KNITS.find((k) => suited.every((i) => k.includes(i))) ?? null;
}

/**
 * Knitted straight (MCR): the 9 tiles of a knitted pattern, plus `need` sets and a pair.
 * Returns each way of reading it (pattern + decompositions of the rest).
 */
export function knittedStraights(c: number[], need: number): { knit: number[]; decs: Decomposition[] }[] {
  if (need < 0) return [];
  const out: { knit: number[]; decs: Decomposition[] }[] = [];
  for (const k of KNITS) {
    if (!k.every((i) => c[i] > 0)) continue;
    const rest = c.slice();
    for (const i of k) rest[i]--;
    const decs = decompose(rest, need);
    if (decs.length) out.push({ knit: k, decs });
  }
  return out;
}

export interface ShapeOptions {
  /** Seven pairs allowed (Hong Kong setting; always on in MCR). */
  sevenPairs?: boolean;
  /** MCR knitted shapes: honors and knitted tiles, knitted straight. */
  knitted?: boolean;
}

/** Does the concealed hand (with `meldCount` exposed sets) form a mahjong? */
export function isWinningShape(concealed: Tile[], meldCount: number, opts: ShapeOptions = {}): boolean {
  const need = 4 - meldCount;
  if (concealed.length !== need * 3 + 2) return false;
  const c = counts(concealed);
  if (decompose(c, need).length) return true;
  if (meldCount === 0 && isThirteenOrphans(c)) return true;
  if (meldCount === 0 && opts.sevenPairs !== false && isSevenPairs(c)) return true;
  if (opts.knitted) {
    if (meldCount === 0 && honorsKnitted(c)) return true;
    if (knittedStraights(c, 1 - meldCount).length) return true;
  }
  return false;
}

/** Tiles that would complete a hand of 13 effective tiles. */
export function waitingTiles(concealed: Tile[], meldCount: number, opts: ShapeOptions = {}): Tile[] {
  const c = counts(concealed);
  return KINDS.filter((k, i) => c[i] < 4 && isWinningShape([...concealed, k], meldCount, opts));
}

function shantenStandard(c: number[], meldCount: number): number {
  let best = 8;
  const maxSets = 4 - meldCount;
  const rec = (start: number, sets: number, partials: number, pair: boolean) => {
    let i = start;
    while (i < 34 && c[i] === 0) i++;
    if (i === 34) {
      const p = Math.min(partials, maxSets - sets);
      best = Math.min(best, 8 - 2 * (sets + meldCount) - p - (pair ? 1 : 0));
      return;
    }
    if (c[i] >= 3) { c[i] -= 3; rec(i, sets + 1, partials, pair); c[i] += 3; }
    if (i < 27 && i % 9 <= 6 && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--; rec(i, sets + 1, partials, pair); c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      if (!pair) rec(i, sets, partials, true);
      rec(i, sets, partials + 1, pair);
      c[i] += 2;
    }
    if (i < 27 && i % 9 <= 7 && c[i + 1]) { c[i]--; c[i + 1]--; rec(i, sets, partials + 1, pair); c[i]++; c[i + 1]++; }
    if (i < 27 && i % 9 <= 6 && c[i + 2]) { c[i]--; c[i + 2]--; rec(i, sets, partials + 1, pair); c[i]++; c[i + 2]++; }
    c[i]--; rec(i + 1, sets, partials, pair); c[i]++;
  };
  rec(0, 0, 0, false);
  return best;
}

/** Number of tiles to change before being ready (-1 = complete hand). */
export function shanten(concealed: Tile[], meldCount: number, opts: ShapeOptions = {}): number {
  const c = counts(concealed);
  let s = shantenStandard(c, meldCount);
  if (meldCount === 0) {
    let pairs = 0, kinds = 0;
    for (const n of c) { if (n >= 2) pairs++; if (n > 0) kinds++; }
    if (opts.sevenPairs !== false) s = Math.min(s, 6 - pairs + Math.max(0, 7 - kinds));
    let o = 0, op = false;
    for (const i of ORPHANS) { if (c[i]) o++; if (c[i] >= 2) op = true; }
    s = Math.min(s, 13 - o - (op ? 1 : 0));
  }
  return s;
}
