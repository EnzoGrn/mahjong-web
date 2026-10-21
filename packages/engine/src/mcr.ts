/**
 * Mahjong Competition Rules (MCR, 国标麻将): the 81 fans and how they combine.
 *
 * A hand must be worth at least 8 points, flowers excluded. Scoring follows the usual principles:
 *  - non-repeat: a fan implied by another one is not counted (EXCLUDES below);
 *  - non-split / account-once: for fans made of several sets (chows or pungs), each new fan must
 *    bring in at least one set not used yet, and two fans may not share two sets;
 *  - the reading of the hand that scores the most is kept.
 */
import { decompose, honorsKnitted, isThirteenOrphans, knittedStraights, waitingTiles, type Decomposition } from './hand.ts';
import { IDX, Tile, counts } from './tiles.ts';
import type { FanItem, Meld, Wind, WinScore } from './types.ts';

export const MCR_MIN = 8;

/** key: [points, French name, Chinese name] */
const FANS: Record<string, [number, string, string]> = {
  bigFourWinds: [88, 'Grands quatre vents', '大四喜'],
  bigThreeDragons: [88, 'Grands trois dragons', '大三元'],
  allGreen: [88, 'Tout vert', '绿一色'],
  nineGates: [88, 'Neuf portes', '九莲宝灯'],
  fourKongs: [88, 'Quatre kongs', '四杠'],
  sevenShiftedPairs: [88, 'Sept paires qui se suivent', '连七对'],
  thirteenOrphans: [88, 'Treize orphelins', '十三幺'],
  allTerminals: [64, 'Tout extrémités', '清幺九'],
  littleFourWinds: [64, 'Petits quatre vents', '小四喜'],
  littleThreeDragons: [64, 'Petits trois dragons', '小三元'],
  allHonors: [64, 'Tout honneurs', '字一色'],
  fourConcealedPungs: [64, 'Quatre pungs cachés', '四暗刻'],
  pureTerminalChows: [64, 'Double dragon pur', '一色双龙会'],
  quadrupleChow: [48, 'Quatre suites identiques', '一色四同顺'],
  fourPureShiftedPungs: [48, 'Quatre pungs qui se suivent', '一色四节高'],
  fourPureShiftedChows: [32, 'Quatre suites en escalier', '一色四步高'],
  threeKongs: [32, 'Trois kongs', '三杠'],
  allTerminalsAndHonors: [32, 'Extrémités et honneurs', '混幺九'],
  sevenPairs: [24, 'Sept paires', '七对'],
  greaterHonorsKnitted: [24, 'Sept honneurs et tuiles tissées', '七星不靠'],
  allEvenPungs: [24, 'Tous pungs pairs', '全双刻'],
  fullFlush: [24, 'Couleur pure', '清一色'],
  pureTripleChow: [24, 'Trois suites identiques', '一色三同顺'],
  pureShiftedPungs: [24, 'Trois pungs qui se suivent', '一色三节高'],
  upperTiles: [24, 'Tout hautes (7 à 9)', '全大'],
  middleTiles: [24, 'Tout milieu (4 à 6)', '全中'],
  lowerTiles: [24, 'Tout basses (1 à 3)', '全小'],
  pureStraight: [16, 'Dragon pur', '清龙'],
  threeSuitedTerminalChows: [16, 'Double dragon trois familles', '三色双龙会'],
  pureShiftedChows: [16, 'Trois suites en escalier', '一色三步高'],
  allFives: [16, 'Un cinq partout', '全带五'],
  triplePung: [16, 'Triple pung', '三同刻'],
  threeConcealedPungs: [16, 'Trois pungs cachés', '三暗刻'],
  lesserHonorsKnitted: [12, 'Honneurs et tuiles tissées', '全不靠'],
  knittedStraight: [12, 'Dragon tissé', '组合龙'],
  upperFour: [12, 'Supérieur à cinq', '大于五'],
  lowerFour: [12, 'Inférieur à cinq', '小于五'],
  bigThreeWinds: [12, 'Trois pungs de vents', '三风刻'],
  mixedStraight: [8, 'Dragon mêlé', '花龙'],
  reversibleTiles: [8, 'Tuiles réversibles', '推不倒'],
  mixedTripleChow: [8, 'Même suite en trois familles', '三色三同顺'],
  mixedShiftedPungs: [8, 'Pungs en escalier, trois familles', '三色三节高'],
  chickenHand: [8, 'Main sans combinaison', '无番和'],
  lastTileDraw: [8, 'Dernière tuile du mur', '妙手回春'],
  lastTileClaim: [8, 'Dernière défausse', '海底捞月'],
  outWithReplacement: [8, 'Victoire sur remplacement de kong', '杠上开花'],
  robbingKong: [8, 'Vol de kong', '抢杠和'],
  twoConcealedKongs: [8, 'Deux kongs cachés', '双暗杠'],
  allPungs: [6, 'Tous pungs', '碰碰和'],
  halfFlush: [6, 'Couleur mêlée', '混一色'],
  mixedShiftedChows: [6, 'Suites en escalier, trois familles', '三色三步高'],
  allTypes: [6, 'Cinq types', '五门齐'],
  meldedHand: [6, 'Main toute exposée', '全求人'],
  twoDragonPungs: [6, 'Deux pungs de dragons', '双箭刻'],
  outsideHand: [4, 'Extrémité ou honneur partout', '全带幺'],
  fullyConcealed: [4, 'Main cachée en auto-pioche', '不求人'],
  twoMeldedKongs: [4, 'Deux kongs exposés', '双明杠'],
  lastTile: [4, 'Dernière tuile de son espèce', '和绝张'],
  dragonPung: [2, 'Pung de dragons', '箭刻'],
  prevalentWind: [2, 'Vent dominant', '圈风刻'],
  seatWind: [2, 'Vent de sa place', '门风刻'],
  concealedHand: [2, 'Main fermée', '门前清'],
  allChows: [2, 'Toutes suites', '平和'],
  tileHog: [2, 'Quatre tuiles sans kong', '四归一'],
  doublePung: [2, 'Double pung', '双同刻'],
  twoConcealedPungs: [2, 'Deux pungs cachés', '双暗刻'],
  concealedKong: [2, 'Kong caché', '暗杠'],
  allSimples: [2, 'Tout simples', '断幺'],
  pureDoubleChow: [1, 'Deux suites identiques', '一般高'],
  mixedDoubleChow: [1, 'Même suite en deux familles', '喜相逢'],
  shortStraight: [1, 'Six qui se suivent', '连六'],
  twoTerminalChows: [1, 'Suites des extrémités', '老少副'],
  pungTerminalsHonors: [1, 'Pung d’extrémités ou de vent', '幺九刻'],
  meldedKong: [1, 'Kong exposé', '明杠'],
  oneVoidedSuit: [1, 'Une famille absente', '缺一门'],
  noHonors: [1, 'Sans honneur', '无字'],
  edgeWait: [1, 'Attente au bord', '边张'],
  closedWait: [1, 'Attente au milieu', '嵌张'],
  singleWait: [1, 'Attente sur la paire', '单钓将'],
  selfDrawn: [1, 'Auto-pioche', '自摸'],
  flowerTiles: [1, 'Fleur', '花牌'],
};

/** Fans implied by another fan, hence not counted with it (non-repeat principle). */
const EXCLUDES: Record<string, string[]> = {
  bigFourWinds: ['bigThreeWinds', 'littleFourWinds', 'allPungs', 'seatWind', 'prevalentWind', 'pungTerminalsHonors'],
  bigThreeDragons: ['littleThreeDragons', 'twoDragonPungs', 'dragonPung'],
  allGreen: ['halfFlush'],
  nineGates: ['fullFlush', 'concealedHand', 'pungTerminalsHonors', 'noHonors', 'fullyConcealed'],
  fourKongs: ['threeKongs', 'twoMeldedKongs', 'twoConcealedKongs', 'meldedKong', 'concealedKong', 'allPungs', 'singleWait'],
  sevenShiftedPairs: ['sevenPairs', 'fullFlush', 'concealedHand', 'singleWait', 'noHonors', 'fullyConcealed'],
  thirteenOrphans: ['allTypes', 'concealedHand', 'singleWait', 'allTerminalsAndHonors', 'fullyConcealed'],
  allTerminals: ['allTerminalsAndHonors', 'allPungs', 'outsideHand', 'pungTerminalsHonors', 'noHonors', 'doublePung', 'triplePung'],
  littleFourWinds: ['bigThreeWinds'],
  littleThreeDragons: ['twoDragonPungs', 'dragonPung'],
  allHonors: ['allPungs', 'pungTerminalsHonors', 'allTerminalsAndHonors', 'outsideHand'],
  fourConcealedPungs: ['allPungs', 'concealedHand', 'threeConcealedPungs', 'twoConcealedPungs', 'fullyConcealed'],
  pureTerminalChows: ['fullFlush', 'allChows', 'noHonors', 'sevenPairs'],
  quadrupleChow: ['tileHog'],
  fourPureShiftedPungs: ['allPungs'],
  threeKongs: ['twoMeldedKongs', 'twoConcealedKongs', 'meldedKong', 'concealedKong'],
  allTerminalsAndHonors: ['allPungs', 'outsideHand', 'pungTerminalsHonors'],
  sevenPairs: ['concealedHand', 'singleWait', 'fullyConcealed'],
  greaterHonorsKnitted: ['lesserHonorsKnitted', 'allTypes', 'concealedHand', 'singleWait', 'fullyConcealed'],
  lesserHonorsKnitted: ['allTypes', 'concealedHand', 'singleWait', 'fullyConcealed'],
  allEvenPungs: ['allPungs', 'allSimples', 'noHonors'],
  fullFlush: ['noHonors'],
  upperTiles: ['upperFour', 'noHonors'],
  middleTiles: ['allSimples', 'noHonors'],
  lowerTiles: ['lowerFour', 'noHonors'],
  threeSuitedTerminalChows: ['allChows', 'noHonors'],
  allFives: ['allSimples', 'noHonors'],
  threeConcealedPungs: ['twoConcealedPungs'],
  upperFour: ['noHonors'],
  lowerFour: ['noHonors'],
  reversibleTiles: ['oneVoidedSuit'],
  lastTileDraw: ['selfDrawn'],
  outWithReplacement: ['selfDrawn'],
  robbingKong: ['lastTile'],
  twoConcealedKongs: ['concealedKong', 'twoConcealedPungs'],
  meldedHand: ['singleWait'],
  twoDragonPungs: ['dragonPung'],
  fullyConcealed: ['concealedHand', 'selfDrawn'],
  twoMeldedKongs: ['meldedKong'],
  allChows: ['noHonors'],
  allSimples: ['noHonors'],
};

export interface McrContext {
  /** Concealed tiles, winning tile included. */
  concealed: Tile[];
  melds: Meld[];
  winTile: Tile;
  selfDraw: boolean;
  seatWind: Wind;
  roundWind: Wind;
  flowers: Tile[];
  /** The wall is empty: last tile drawn or last discard. */
  lastTile?: boolean;
  kongReplacement?: boolean;
  robbingKong?: boolean;
  /** The other three copies of the winning tile are already visible. */
  lastOfKind?: boolean;
}

/* ------------------------------------------------------------------ */
/* Readings of a hand                                                  */
/* ------------------------------------------------------------------ */

type Kind = 'chow' | 'pung' | 'kong';
/** A set of the hand. `open`: exposed meld. `concealed`: counts as a concealed pung. `fixed`: an existing meld. */
interface HSet { kind: Kind; idx: number; open: boolean; concealed: boolean; fixed: boolean }

const suit = (i: number) => (i < 27 ? Math.floor(i / 9) : 3);
const num = (i: number) => (i % 9) + 1;
const isHonor = (i: number) => i >= 27;
const isTerminal = (i: number) => i < 27 && (i % 9 === 0 || i % 9 === 8);
const setTiles = (s: HSet) => (s.kind === 'chow' ? [s.idx, s.idx + 1, s.idx + 2] : s.kind === 'kong' ? [s.idx, s.idx, s.idx, s.idx] : [s.idx, s.idx, s.idx]);
const GREEN = new Set(['s2', 's3', 's4', 's6', 's8', 'z6'].map((t) => IDX[t]));
const REVERSIBLE = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p8', 'p9', 's2', 's4', 's5', 's6', 's8', 's9', 'z7'].map((t) => IDX[t]));

function meldSets(melds: Meld[]): HSet[] {
  return melds.map((m) => ({
    kind: m.kind, idx: Math.min(...m.tiles.filter((t) => t !== 'back').map((t) => IDX[t])),
    open: !m.concealed, concealed: m.concealed, fixed: true,
  }));
}

/* ------------------------------------------------------------------ */
/* Fans made of several sets                                           */
/* ------------------------------------------------------------------ */

interface Combo { key: string; members: number[] }

/** Best fan made by exactly these chows (start indices), or null. `pair` for the fans that need one. */
function chowFan(starts: number[], pair: number): string | null {
  const su = starts.map(suit), n = starts.map((i) => i % 9);
  const sameSuit = su.every((s) => s === su[0]);
  const sorted = n.slice().sort((a, b) => a - b);
  const steps = sorted.slice(1).map((v, i) => v - sorted[i]);
  const evenStep = (d: number) => steps.every((x) => x === d);
  if (starts.length === 4) {
    if (sameSuit) {
      if (evenStep(0)) return 'quadrupleChow';
      if (evenStep(1) || evenStep(2)) return 'fourPureShiftedChows';
      if (sorted.join() === '0,0,6,6' && pair === su[0] * 9 + 4) return 'pureTerminalChows';
      return null;
    }
    // Three-suited terminal chows: 123 + 789 in two suits, a pair of fives in the third.
    const bySuit = [0, 1, 2].map((s) => n.filter((_, k) => su[k] === s).sort((a, b) => a - b).join());
    const two = bySuit.filter((x) => x === '0,6').length === 2;
    const third = bySuit.findIndex((x) => x === '');
    if (two && third >= 0 && pair === third * 9 + 4) return 'threeSuitedTerminalChows';
    return null;
  }
  if (starts.length === 3) {
    if (sameSuit) {
      if (evenStep(0)) return 'pureTripleChow';
      if (sorted.join() === '0,3,6') return 'pureStraight';
      if (evenStep(1) || evenStep(2)) return 'pureShiftedChows';
      return null;
    }
    if (new Set(su).size === 3) {
      if (evenStep(0)) return 'mixedTripleChow';
      if (sorted.join() === '0,3,6') return 'mixedStraight';
      if (evenStep(1)) return 'mixedShiftedChows';
    }
    return null;
  }
  if (starts.length === 2) {
    if (sameSuit) {
      if (steps[0] === 0) return 'pureDoubleChow';
      if (steps[0] === 3) return 'shortStraight';
      if (steps[0] === 6) return 'twoTerminalChows';
      return null;
    }
    return steps[0] === 0 ? 'mixedDoubleChow' : null;
  }
  return null;
}

/** Best fan made by exactly these suited pungs (tile indices), or null. */
function pungFan(idx: number[]): string | null {
  const su = idx.map(suit), n = idx.map((i) => i % 9);
  const sameSuit = su.every((s) => s === su[0]);
  const sorted = n.slice().sort((a, b) => a - b);
  const consecutive = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  const sameNum = n.every((v) => v === n[0]);
  const allSuits = new Set(su).size === idx.length;
  if (idx.length === 4) return sameSuit && consecutive ? 'fourPureShiftedPungs' : null;
  if (idx.length === 3) {
    if (sameSuit && consecutive) return 'pureShiftedPungs';
    if (allSuits && sameNum) return 'triplePung';
    if (allSuits && consecutive) return 'mixedShiftedPungs';
    return null;
  }
  if (idx.length === 2) return !sameSuit && sameNum ? 'doublePung' : null;
  return null;
}

function subsets(n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const s: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s.push(i);
    if (s.length >= 2) out.push(s);
  }
  return out;
}

/** Can these combos be counted together? No two may share two sets, and each must bring a new set. */
function validSelection(sel: Combo[]): boolean {
  for (let a = 0; a < sel.length; a++) {
    for (let b = a + 1; b < sel.length; b++) {
      if (sel[a].members.filter((m) => sel[b].members.includes(m)).length >= 2) return false;
    }
  }
  // Bigger fans are counted first; each following fan must then bring a set not used yet.
  const tryOrder = (left: Combo[], used: Set<number>): boolean => {
    if (!left.length) return true;
    const biggest = Math.max(...left.map((c) => c.members.length));
    return left.some((c, i) => {
      if (c.members.length < biggest) return false;
      if (used.size && c.members.every((m) => used.has(m))) return false;
      const next = new Set(used);
      c.members.forEach((m) => next.add(m));
      return tryOrder(left.filter((_, j) => j !== i), next);
    });
  };
  return tryOrder(sel, new Set());
}

/** The most valuable set of multi-set fans among `items`, according to the account-once principle. */
function bestCombos(items: number[], fanOf: (members: number[]) => string | null): string[] {
  const cands: Combo[] = [];
  for (const sub of subsets(items.length)) {
    const key = fanOf(sub.map((k) => items[k]));
    if (key) cands.push({ key, members: sub });
  }
  let best: Combo[] = [];
  let bestPts = 0;
  const rec = (start: number, sel: Combo[], pts: number) => {
    if (pts > bestPts) { bestPts = pts; best = sel.slice(); }
    if (sel.length === 3) return;
    for (let i = start; i < cands.length; i++) {
      sel.push(cands[i]);
      if (validSelection(sel)) rec(i + 1, sel, pts + FANS[cands[i].key][0]);
      sel.pop();
    }
  };
  rec(0, [], 0);
  return best.map((c) => c.key);
}

/* ------------------------------------------------------------------ */
/* Scoring one reading                                                 */
/* ------------------------------------------------------------------ */

type FanCount = Record<string, number>;

/** Fans that depend only on which tiles the hand contains. */
function tileFans(all: number[], f: FanCount) {
  const add = (k: string) => { f[k] = (f[k] ?? 0) + 1; };
  const suits = new Set(all.filter((i) => i < 27).map(suit));
  const honors = all.some(isHonor);
  const winds = all.some((i) => i >= 27 && i <= 30);
  const dragons = all.some((i) => i >= 31);
  const suited = all.filter((i) => i < 27);
  if (suits.size === 3 && winds && dragons) add('allTypes');
  if (suits.size === 0) add('allHonors');
  else if (suits.size === 1) add(honors ? 'halfFlush' : 'fullFlush');
  else if (suits.size === 2) add('oneVoidedSuit');
  if (!honors) add('noHonors');
  if (!honors && suited.every((i) => !isTerminal(i))) add('allSimples');
  if (!honors && suited.every(isTerminal)) add('allTerminals');
  else if (honors && suits.size > 0 && all.every((i) => isHonor(i) || isTerminal(i))) add('allTerminalsAndHonors');
  if (!honors) {
    const nums = suited.map(num);
    if (nums.every((v) => v >= 7)) add('upperTiles');
    else if (nums.every((v) => v >= 6)) add('upperFour');
    if (nums.every((v) => v >= 4 && v <= 6)) add('middleTiles');
    if (nums.every((v) => v <= 3)) add('lowerTiles');
    else if (nums.every((v) => v <= 4)) add('lowerFour');
  }
  if (all.every((i) => REVERSIBLE.has(i))) add('reversibleTiles');
  if (all.every((i) => GREEN.has(i))) add('allGreen');
}

function situationFans(ctx: McrContext, f: FanCount) {
  const add = (k: string) => { f[k] = (f[k] ?? 0) + 1; };
  if (ctx.selfDraw) add('selfDrawn');
  if (ctx.lastTile) add(ctx.selfDraw ? 'lastTileDraw' : 'lastTileClaim');
  if (ctx.kongReplacement) add('outWithReplacement');
  if (ctx.robbingKong) add('robbingKong');
  if (ctx.lastOfKind) add('lastTile');
  const open = ctx.melds.some((m) => !m.concealed);
  if (!open) add(ctx.selfDraw ? 'fullyConcealed' : 'concealedHand');
}

/** Tile hog: four copies of a tile used without forming a kong. */
function tileHogs(all: number[], sets: HSet[], f: FanCount) {
  const c = new Array(34).fill(0);
  all.forEach((i) => c[i]++);
  for (let i = 0; i < 34; i++) {
    if (c[i] === 4 && !sets.some((s) => s.kind === 'kong' && s.idx === i)) f.tileHog = (f.tileHog ?? 0) + 1;
  }
}

/** Fans of a standard reading: 4 sets and a pair (or a knitted straight, 1 set and a pair). */
function standardFans(ctx: McrContext, sets: HSet[], pair: number, knit: number[] | null, wait: string | null): FanCount {
  const f: FanCount = {};
  const add = (k: string, n = 1) => { if (n > 0) f[k] = (f[k] ?? 0) + n; };
  const all = [pair, pair, ...(knit ?? []), ...sets.flatMap(setTiles)];
  const pungs = sets.filter((s) => s.kind !== 'chow');
  const chows = sets.filter((s) => s.kind === 'chow');

  // Honor pungs
  const dragonP = pungs.filter((s) => s.idx >= 31).length;
  const windP = pungs.filter((s) => s.idx >= 27 && s.idx <= 30);
  const pairDragon = pair >= 31, pairWind = pair >= 27 && pair <= 30;
  if (dragonP === 3) add('bigThreeDragons');
  else if (dragonP === 2 && pairDragon) add('littleThreeDragons');
  else if (dragonP === 2) add('twoDragonPungs');
  else add('dragonPung', dragonP);
  let windsTaken = false;
  if (windP.length === 4) { add('bigFourWinds'); windsTaken = true; }
  else if (windP.length === 3 && pairWind) { add('littleFourWinds'); windsTaken = true; }
  else if (windP.length === 3) { add('bigThreeWinds'); windsTaken = true; }
  for (const s of windP) {
    const seat = s.idx === 26 + ctx.seatWind, round = s.idx === 26 + ctx.roundWind;
    if (seat) add('seatWind');
    if (round) add('prevalentWind');
    if (!seat && !round && !windsTaken) add('pungTerminalsHonors');
  }
  add('pungTerminalsHonors', pungs.filter((s) => isTerminal(s.idx)).length);

  // Kongs and concealed pungs
  const kongs = sets.filter((s) => s.kind === 'kong');
  const openK = kongs.filter((s) => s.open).length, closedK = kongs.length - openK;
  if (kongs.length === 4) add('fourKongs');
  else if (kongs.length === 3) add('threeKongs');
  else if (openK === 2) add('twoMeldedKongs');
  else if (closedK === 2) add('twoConcealedKongs');
  else { add('meldedKong', openK); add('concealedKong', closedK); }
  const cp = pungs.filter((s) => s.concealed).length;
  if (cp === 4) add('fourConcealedPungs');
  else if (cp === 3) add('threeConcealedPungs');
  else if (cp === 2) add('twoConcealedPungs');

  // Whole-hand shapes
  if (!knit && pungs.length === 4) add('allPungs');
  if (!knit && chows.length === 4 && !isHonor(pair)) add('allChows');
  const groups = [...sets.map(setTiles), [pair]];
  if (!knit && groups.every((g) => g.some((i) => isHonor(i) || isTerminal(i)))) add('outsideHand');
  if (!knit && groups.every((g) => g.some((i) => i < 27 && num(i) === 5))) add('allFives');
  if (!knit && pungs.length === 4 && [pair, ...pungs.map((s) => s.idx)].every((i) => i < 27 && num(i) % 2 === 0)) add('allEvenPungs');
  if (knit) add('knittedStraight');
  if (sets.length === 4 && sets.every((s) => s.open) && !ctx.selfDraw) add('meldedHand');

  // Fans made of several sets
  for (const k of bestCombos(chows.map((s) => s.idx), (m) => chowFan(m, pair))) add(k);
  const suitedPungs = pungs.filter((s) => s.idx < 27).map((s) => s.idx);
  for (const k of bestCombos(suitedPungs, pungFan)) add(k);

  tileFans(all, f);
  tileHogs(all, sets, f);
  situationFans(ctx, f);
  if (wait) add(wait);
  return f;
}

/** Applies the non-repeat principle, then turns counts into items. */
function finish(f: FanCount, flowers: number): { items: FanItem[]; base: number } {
  // Highest fans first: only a fan that is itself counted can exclude others.
  const dropped = new Set<string>();
  const items: FanItem[] = [];
  let base = 0;
  for (const k of Object.keys(FANS)) {
    if (!f[k] || dropped.has(k)) continue;
    (EXCLUDES[k] ?? []).forEach((x) => dropped.add(x));
    const [pts, name, zh] = FANS[k];
    for (let n = 0; n < f[k]; n++) items.push({ key: k, name, zh, fan: pts, limit: false });
    base += pts * f[k];
  }
  if (base === 0) {
    const [pts, name, zh] = FANS.chickenHand;
    items.push({ key: 'chickenHand', name, zh, fan: pts, limit: false });
    base = pts;
  }
  const [fp, fname, fzh] = FANS.flowerTiles;
  for (let n = 0; n < flowers; n++) items.push({ key: 'flowerTiles', name: fname, zh: fzh, fan: fp, limit: false });
  return { items, base };
}

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export const MCR_SHAPES = { sevenPairs: true, knitted: true } as const;

/** Where the winning tile can sit in a reading, and the wait fan that goes with it. */
function placements(dec: Decomposition, win: number, uniqueWait: boolean): { set: number; wait: string | null }[] {
  const out: { set: number; wait: string | null }[] = [];
  if (dec.pair === win) out.push({ set: -1, wait: uniqueWait ? 'singleWait' : null });
  dec.sets.forEach((s, k) => {
    if (s.type === 'pung' && s.idx === win) out.push({ set: k, wait: null });
    if (s.type === 'chow' && win >= s.idx && win <= s.idx + 2) {
      let wait: string | null = null;
      if (uniqueWait) {
        if (win === s.idx + 1) wait = 'closedWait';
        else if ((num(s.idx) === 1 && win === s.idx + 2) || (num(s.idx) === 7 && win === s.idx)) wait = 'edgeWait';
      }
      out.push({ set: k, wait });
    }
  });
  return out.length ? out : [{ set: -2, wait: null }];
}

/**
 * Scores a winning hand under MCR. Returns null if the tiles do not form a winning hand.
 * `fan` is the total including flowers; `base` is the value without flowers, which must reach 8.
 */
export function evaluateMcr(ctx: McrContext): (WinScore & { base: number }) | null {
  const need = 4 - ctx.melds.length;
  if (ctx.concealed.length !== need * 3 + 2) return null;
  const c = counts(ctx.concealed);
  const win = IDX[ctx.winTile];
  const fixed = meldSets(ctx.melds);
  const before = ctx.concealed.slice();
  before.splice(before.indexOf(ctx.winTile), 1);
  const uniqueWait = waitingTiles(before, ctx.melds.length, MCR_SHAPES).length === 1;
  const flowers = ctx.flowers.length;
  const cands: FanCount[] = [];

  const fromDec = (dec: Decomposition, knit: number[] | null) => {
    const pls = placements(dec, win, uniqueWait);
    if (knit?.includes(win) && !pls.some((p) => p.set === -2)) pls.push({ set: -2, wait: null });
    for (const pl of pls) {
      const sets: HSet[] = [...fixed, ...dec.sets.map((s, k) => ({
        kind: s.type as Kind, idx: s.idx, open: false, fixed: false,
        // On a discard, the pung completed by the winning tile is not concealed.
        concealed: s.type === 'pung' && !(k === pl.set && !ctx.selfDraw),
      }))];
      cands.push(standardFans(ctx, sets, dec.pair, knit, pl.wait));
    }
  };
  for (const dec of decompose(c, need)) fromDec(dec, null);
  for (const ks of knittedStraights(c, need - 3)) for (const dec of ks.decs) fromDec(dec, ks.knit);

  if (ctx.melds.length === 0) {
    const all = c.flatMap((n, i) => Array(n).fill(i) as number[]);
    const special = (key: string) => {
      const f: FanCount = { [key]: 1 };
      tileFans(all, f);
      situationFans(ctx, f);
      return f;
    };
    // Seven pairs; four identical tiles count as two pairs (and score tile hog).
    if (c.every((n) => n % 2 === 0)) {
      const first = c.findIndex((n) => n > 0);
      const shifted = first < 27 && first % 9 <= 2 && [0, 1, 2, 3, 4, 5, 6].every((d) => c[first + d] === 2);
      const f = special(shifted ? 'sevenShiftedPairs' : 'sevenPairs');
      tileHogs(all, [], f);
      cands.push(f);
    }
    if (isThirteenOrphans(c)) cands.push(special('thirteenOrphans'));
    const hk = honorsKnitted(c);
    if (hk) {
      const allHonors = [27, 28, 29, 30, 31, 32, 33].every((i) => c[i] === 1);
      const f = special(allHonors ? 'greaterHonorsKnitted' : 'lesserHonorsKnitted');
      if (hk.every((i) => c[i] === 1)) f.knittedStraight = 1;
      cands.push(f);
    }
    // Nine gates: 1112345678999 of one suit, waiting on any tile of that suit.
    const s0 = suit(win);
    if (s0 < 3) {
      const rest = counts(before);
      const seg = rest.slice(s0 * 9, s0 * 9 + 9);
      if (seg.join() === '3,1,1,1,1,1,1,1,3' && rest.reduce((a, n) => a + n, 0) === 13) {
        for (const dec of decompose(c, 4)) {
          const sets: HSet[] = dec.sets.map((s) => ({ kind: s.type as Kind, idx: s.idx, open: false, fixed: false, concealed: s.type === 'pung' }));
          const f = standardFans(ctx, sets, dec.pair, null, null);
          f.nineGates = 1;
          cands.push(f);
        }
      }
    }
  }

  let best: { items: FanItem[]; base: number } | null = null;
  for (const f of cands) {
    const r = finish(f, flowers);
    if (!best || r.base > best.base) best = r;
  }
  if (!best) return null;
  return { fan: best.base + flowers, base: best.base, items: best.items, limit: false };
}

/** Fan list for the rules screen, highest first. */
export const MCR_FAN_TABLE = Object.entries(FANS).map(([key, [fan, name, zh]]) => ({ key, name, zh, fan }));
