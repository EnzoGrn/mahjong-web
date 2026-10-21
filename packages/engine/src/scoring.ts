/** Fan scoring (Hong Kong rules) and the points table. */
import { decompose, isSevenPairs, isThirteenOrphans, type Decomposition } from './hand.ts';
import { IDX, Tile, counts, flowerNumber, isHonorIdx, isTermOrHonorIdx, isTerminalIdx, suitOfIdx } from './tiles.ts';
import type { FanItem, Meld, Wind, WinScore } from './types.ts';

export const LIMIT = 13;

const NAMES: Record<string, [string, string]> = {
  selfDraw: ['Auto-pioche', '自摸'],
  concealed: ['Main fermée', '門前清'],
  noFlowers: ['Sans fleur', '無花'],
  seatFlower: ['Fleur de sa place', '正花'],
  flowerSet: ['Série de fleurs complète', '一台花'],
  allFlowers: ['Huit fleurs', '八仙過海'],
  dragonPung: ['Brelan de dragon', '箭刻'],
  seatWind: ['Vent de sa place', '門風'],
  roundWind: ['Vent dominant', '圈風'],
  allChows: ['Toutes suites', '平糊'],
  allPungs: ['Tous brelans', '對對糊'],
  halfFlush: ['Couleur mêlée', '混一色'],
  fullFlush: ['Couleur pure', '清一色'],
  mixedTerminals: ['Extrémités et honneurs', '花么九'],
  smallDragons: ['Petits trois dragons', '小三元'],
  bigDragons: ['Grands trois dragons', '大三元'],
  smallWinds: ['Petits quatre vents', '小四喜'],
  bigWinds: ['Grands quatre vents', '大四喜'],
  allHonors: ['Tout honneurs', '字一色'],
  allTerminals: ['Tout extrémités', '清么九'],
  fourConcealedPungs: ['Quatre brelans cachés', '坎坎糊'],
  fourKongs: ['Quatre kongs', '十八羅漢'],
  nineGates: ['Neuf portes', '九蓮寶燈'],
  thirteenOrphans: ['Treize orphelins', '十三么'],
  sevenPairs: ['Sept paires', '七對子'],
  lastTile: ['Dernière tuile du mur', '海底撈月'],
  lastDiscard: ['Dernière défausse', '河底撈魚'],
  kongReplacement: ['Victoire sur remplacement de kong', '槓上開花'],
  robbingKong: ['Vol de kong', '搶槓'],
  heavenly: ['Main céleste', '天糊'],
  earthly: ['Main terrestre', '地糊'],
};

const item = (key: string, fan: number): FanItem => ({ key, name: NAMES[key][0], zh: NAMES[key][1], fan, limit: fan >= LIMIT });

export interface WinContext {
  /** Concealed tiles, winning tile included. */
  concealed: Tile[];
  melds: Meld[];
  winTile: Tile;
  selfDraw: boolean;
  seatWind: Wind;
  roundWind: Wind;
  flowers: Tile[];
  lastTile?: boolean;
  kongReplacement?: boolean;
  robbingKong?: boolean;
  heavenly?: boolean;
  earthly?: boolean;
  sevenPairs?: boolean;
}

function bonusItems(ctx: WinContext): FanItem[] {
  const items: FanItem[] = [];
  const fl = ctx.flowers;
  if (fl.length === 8) return [item('allFlowers', LIMIT)];
  if (!fl.length) items.push(item('noFlowers', 1));
  for (const f of fl) if (flowerNumber(f) === ctx.seatWind) items.push(item('seatFlower', 1));
  if (['f1', 'f2', 'f3', 'f4'].every((f) => fl.includes(f))) items.push(item('flowerSet', 2));
  if (['f5', 'f6', 'f7', 'f8'].every((f) => fl.includes(f))) items.push(item('flowerSet', 2));
  if (ctx.selfDraw) items.push(item('selfDraw', 1));
  if (ctx.lastTile) items.push(item(ctx.selfDraw ? 'lastTile' : 'lastDiscard', 1));
  if (ctx.kongReplacement) items.push(item('kongReplacement', 1));
  if (ctx.robbingKong) items.push(item('robbingKong', 1));
  if (ctx.heavenly) items.push(item('heavenly', LIMIT));
  if (ctx.earthly) items.push(item('earthly', LIMIT));
  return items;
}

function suitItems(allIdx: number[]): FanItem[] {
  const suits = new Set(allIdx.filter((i) => i < 27).map(suitOfIdx));
  const honors = allIdx.some(isHonorIdx);
  if (suits.size === 0) return [item('allHonors', LIMIT)];
  if (suits.size === 1) return [honors ? item('halfFlush', 3) : item('fullFlush', 7)];
  return [];
}

interface Group { type: 'pung' | 'chow'; kong: boolean; idx: number; concealed: boolean }

function scoreStandard(ctx: WinContext, dec: Decomposition): FanItem[] {
  const items: FanItem[] = [];
  const groups: Group[] = ctx.melds.map((m) => ({
    type: m.kind === 'chow' ? 'chow' : 'pung', kong: m.kind === 'kong', idx: IDX[m.tiles[0]], concealed: m.concealed,
  }));
  const hidden: Group[] = dec.sets.map((s) => ({ type: s.type, kong: false, idx: s.idx, concealed: true }));
  // On a discard, the pung completed by the claimed tile is not concealed,
  // unless that tile can be read as part of the pair or of a chow.
  if (!ctx.selfDraw) {
    const w = IDX[ctx.winTile];
    const elsewhere = dec.pair === w || dec.sets.some((s) => s.type === 'chow' && w >= s.idx && w <= s.idx + 2);
    const g = hidden.find((h) => h.type === 'pung' && h.idx === w);
    if (g && !elsewhere) g.concealed = false;
  }
  groups.push(...hidden);

  const pungs = groups.filter((g) => g.type === 'pung');
  const chows = groups.filter((g) => g.type === 'chow');
  const allIdx = [dec.pair, ...groups.flatMap((g) => (g.type === 'chow' ? [g.idx, g.idx + 1, g.idx + 2] : [g.idx]))];
  const dragons = pungs.filter((g) => g.idx >= 31).length;
  const winds = pungs.filter((g) => g.idx >= 27 && g.idx <= 30).length;
  const fullyConcealed = ctx.melds.every((m) => m.concealed);

  // Limit hands
  if (winds === 4) items.push(item('bigWinds', LIMIT));
  if (allIdx.every(isTerminalIdx)) items.push(item('allTerminals', LIMIT));
  if (pungs.length === 4 && pungs.every((g) => g.concealed)) items.push(item('fourConcealedPungs', LIMIT));
  if (groups.filter((g) => g.kong).length === 4) items.push(item('fourKongs', LIMIT));
  if (ctx.melds.length === 0) {
    const c = counts(ctx.concealed);
    const first = c.findIndex((n) => n > 0);
    const s = suitOfIdx(first);
    if (s < 3) {
      const base = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      const seg = c.slice(s * 9, s * 9 + 9);
      const total = c.reduce((a, n) => a + n, 0);
      if (seg.reduce((a, n) => a + n, 0) === total && seg.every((n, i) => n >= base[i])) items.push(item('nineGates', LIMIT));
    }
  }

  items.push(...suitItems(allIdx));

  if (dragons === 3) items.push(item('bigDragons', 8));
  else if (dragons === 2 && dec.pair >= 31) items.push(item('smallDragons', 5));
  else for (let d = 0; d < dragons; d++) items.push(item('dragonPung', 1));

  if (winds === 3 && dec.pair >= 27 && dec.pair <= 30) items.push(item('smallWinds', 6));
  else if (winds < 4) {
    if (pungs.some((g) => g.idx === 26 + ctx.seatWind)) items.push(item('seatWind', 1));
    if (pungs.some((g) => g.idx === 26 + ctx.roundWind)) items.push(item('roundWind', 1));
  }

  if (chows.length === 4) items.push(item('allChows', 1));
  if (pungs.length === 4) items.push(item('allPungs', 3));
  if (pungs.length === 4 && allIdx.every(isTermOrHonorIdx) && allIdx.some(isHonorIdx) && allIdx.some(isTerminalIdx)) {
    items.push(item('mixedTerminals', 1));
  }
  if (fullyConcealed) items.push(item('concealed', 1));
  return items;
}

function total(items: FanItem[]): number {
  if (items.some((i) => i.limit)) return LIMIT;
  return Math.min(LIMIT, items.reduce((a, i) => a + i.fan, 0));
}

/** Evaluates a hand; returns null if it is not a winning hand. Keeps the most valuable reading. */
export function evaluateWin(ctx: WinContext): WinScore | null {
  const need = 4 - ctx.melds.length;
  if (ctx.concealed.length !== need * 3 + 2) return null;
  const c = counts(ctx.concealed);
  const bonus = bonusItems(ctx);
  const candidates: FanItem[][] = decompose(c, need).map((dec) => [...scoreStandard(ctx, dec), ...bonus]);
  if (ctx.melds.length === 0 && isThirteenOrphans(c)) candidates.push([item('thirteenOrphans', LIMIT), ...bonus]);
  if (ctx.melds.length === 0 && ctx.sevenPairs !== false && isSevenPairs(c)) {
    const allIdx = c.flatMap((n, i) => Array(n).fill(i));
    candidates.push([item('sevenPairs', 4), ...suitItems(allIdx), item('concealed', 1), ...bonus]);
  }
  let best: WinScore | null = null;
  for (const items of candidates) {
    const fan = total(items);
    if (!best || fan > best.fan) best = { fan, items, limit: fan >= LIMIT };
  }
  if (best?.limit) {
    const lim = best.items.filter((i) => i.limit);
    if (lim.length) best.items = lim;
  }
  return best;
}

/** "Half-spicy" points table, capped at 13 fans. */
export const FAN_POINTS = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];
export const pointsFor = (fan: number) => FAN_POINTS[Math.min(fan, LIMIT)];

/** Fan list for the rules screen. */
export const FAN_TABLE: { key: string; name: string; zh: string; fan: number | 'Limite' }[] = [
  ['selfDraw', 1], ['concealed', 1], ['noFlowers', 1], ['seatFlower', 1], ['dragonPung', 1], ['seatWind', 1], ['roundWind', 1],
  ['allChows', 1], ['mixedTerminals', 1], ['lastTile', 1], ['kongReplacement', 1], ['robbingKong', 1], ['flowerSet', 2],
  ['allPungs', 3], ['halfFlush', 3], ['sevenPairs', 4], ['smallDragons', 5], ['smallWinds', 6], ['fullFlush', 7], ['bigDragons', 8],
  ['thirteenOrphans', 'Limite'], ['bigWinds', 'Limite'], ['allHonors', 'Limite'], ['allTerminals', 'Limite'],
  ['fourConcealedPungs', 'Limite'], ['fourKongs', 'Limite'], ['nineGates', 'Limite'], ['heavenly', 'Limite'], ['earthly', 'Limite'],
].map(([key, fan]) => ({ key: key as string, name: NAMES[key as string][0], zh: NAMES[key as string][1], fan: fan as number | 'Limite' }));
