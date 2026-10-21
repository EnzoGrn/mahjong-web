/**
 * Mahjong tiles (144 tiles).
 *
 *   m1..m9  Characters (萬)      p1..p9  Dots (筒)      s1..s9  Bamboos (索)
 *   z1..z4  Winds East, South, West, North
 *   z5 Red dragon (中)  z6 Green dragon (發)  z7 White dragon
 *   f1..f4  Flowers (梅蘭菊竹)     f5..f8  Seasons (春夏秋冬)
 */
export type Tile = string;
export type Suit = 'm' | 'p' | 's';

export const SUITS: Suit[] = ['m', 'p', 's'];
export const KINDS: Tile[] = [
  ...SUITS.flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => s + n)),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => 'z' + n),
];
export const FLOWERS: Tile[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'];

export const IDX: Record<Tile, number> = Object.fromEntries(KINDS.map((k, i) => [k, i]));
const ORDER: Record<Tile, number> = Object.fromEntries([...KINDS, ...FLOWERS].map((k, i) => [k, i]));

export const isFlower = (t: Tile) => t[0] === 'f';
export const isHonorIdx = (i: number) => i >= 27;
export const isTerminalIdx = (i: number) => i < 27 && (i % 9 === 0 || i % 9 === 8);
export const isTermOrHonorIdx = (i: number) => isHonorIdx(i) || isTerminalIdx(i);
export const suitOfIdx = (i: number) => (i < 27 ? Math.floor(i / 9) : 3);
export const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** The full, unshuffled set. */
export function fullSet(): Tile[] {
  return [...KINDS.flatMap((k) => [k, k, k, k]), ...FLOWERS];
}

/** Reproducible pseudo-random generator (mulberry32), handy for tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const sortTiles = (tiles: Tile[]) => tiles.slice().sort((a, b) => ORDER[a] - ORDER[b]);

export function counts(tiles: Tile[]): number[] {
  const c = new Array(34).fill(0);
  for (const t of tiles) if (!isFlower(t)) c[IDX[t]]++;
  return c;
}

export function removeOne(arr: Tile[], t: Tile): boolean {
  const i = arr.indexOf(t);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

export const countOf = (arr: Tile[], t: Tile) => arr.reduce((n, x) => n + (x === t ? 1 : 0), 0);

/** Number 1-4 of a flower or season (matches the seat wind). */
export const flowerNumber = (f: Tile) => ((Number(f.slice(1)) - 1) % 4) + 1;

const SUIT_NAMES: Record<string, string> = { m: 'caractère', p: 'cercle', s: 'bambou' };
const HONOR_NAMES = ['vent d’Est', 'vent du Sud', 'vent d’Ouest', 'vent du Nord', 'dragon rouge', 'dragon vert', 'dragon blanc'];
const FLOWER_NAMES = ['prunier', 'orchidée', 'chrysanthème', 'bambou', 'printemps', 'été', 'automne', 'hiver'];

/** Human-readable tile name, for accessibility. */
export function tileName(t: Tile): string {
  const n = Number(t.slice(1));
  if (t[0] === 'z') return HONOR_NAMES[n - 1];
  if (t[0] === 'f') return (n <= 4 ? 'fleur ' : 'saison ') + FLOWER_NAMES[n - 1];
  return `${n} ${SUIT_NAMES[t[0]]}`;
}
