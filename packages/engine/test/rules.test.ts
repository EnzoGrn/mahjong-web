import { describe, expect, it } from 'vitest';
import { LIMIT, evaluateWin, fullSet, isWinningShape, shanten, waitingTiles, type WinContext } from '../src/index.ts';

const T = (s: string) => s.trim().split(/\s+/);
const base: Omit<WinContext, 'concealed' | 'winTile'> = { melds: [], seatWind: 1, roundWind: 1, flowers: ['f3'], selfDraw: false };
const keys = (r: { items: { key: string }[] } | null) => r!.items.map((i) => i.key).sort();

describe('tiles and shapes', () => {
  it('full set of 144 tiles', () => expect(fullSet()).toHaveLength(144));
  it('recognises a winning hand and rejects an incomplete one', () => {
    expect(isWinningShape(T('m1 m2 m3 p4 p5 p6 s7 s8 s9 z1 z1 z1 m5 m5'), 0)).toBe(true);
    expect(isWinningShape(T('m1 m2 m4 p4 p5 p6 s7 s8 s9 z1 z1 z1 m5 m5'), 0)).toBe(false);
  });
  it('nine gates waits on the 9 tiles of the suit', () => {
    expect(waitingTiles(T('m1 m1 m1 m2 m3 m4 m5 m6 m7 m8 m9 m9 m9'), 0)).toEqual(T('m1 m2 m3 m4 m5 m6 m7 m8 m9'));
  });
  it('shanten', () => {
    expect(shanten(T('m1 m2 m3 p4 p5 p6 s7 s8 s9 z1 z1 z1 m5'), 0)).toBe(0);
    expect(shanten(T('m1 m2 m3 p4 p5 p6 s7 s8 s9 z1 z1 z1 m5 m5'), 0)).toBe(-1);
    expect(shanten(T('m1 m4 m7 p2 p5 p8 s3 s6 s9 z1 z2 z3 z4'), 0)).toBeGreaterThanOrEqual(4);
  });
});

describe('Hong Kong fans', () => {
  it('concealed hand on a discard with an off-seat flower = 1 fan', () => {
    const r = evaluateWin({ ...base, concealed: T('m1 m2 m3 p4 p5 p6 s7 s8 s9 z2 z2 z2 m5 m5'), winTile: 'm5' });
    expect(keys(r)).toEqual(['concealed']);
  });
  it('full flush + all pungs + self-draw', () => {
    const r = evaluateWin({ ...base, selfDraw: true, melds: [{ kind: 'pung', tiles: T('s2 s2 s2'), concealed: false }],
      concealed: T('s4 s4 s4 s6 s6 s6 s8 s8 s8 s9 s9'), winTile: 's9' });
    expect(keys(r)).toEqual(expect.arrayContaining(['fullFlush', 'allPungs', 'selfDraw']));
    expect(r!.fan).toBe(11);
  });
  it('big three dragons replaces the dragon pungs', () => {
    const r = evaluateWin({ ...base, concealed: T('z5 z5 z5 z6 z6 z6 z7 z7 z7 m1 m2 m3 p9 p9'), winTile: 'p9' });
    expect(keys(r)).toContain('bigDragons');
    expect(keys(r)).not.toContain('dragonPung');
  });
  it('thirteen orphans = limit', () => {
    const r = evaluateWin({ ...base, concealed: T('m1 m9 p1 p9 s1 s9 z1 z2 z3 z4 z5 z6 z7 z7'), winTile: 'z7' });
    expect(r!.fan).toBe(LIMIT);
  });
  it('seven pairs', () => {
    const r = evaluateWin({ ...base, concealed: T('m1 m1 m4 m4 p2 p2 p7 p7 s3 s3 s8 s8 z5 z5'), winTile: 'z5' });
    expect(keys(r)).toContain('sevenPairs');
    expect(r!.fan).toBe(5);
  });
  it('four concealed pungs: not on a discard that completes a pung', () => {
    const hand = T('m1 m1 m1 p3 p3 p3 s5 s5 s5 z6 z6 z6 m9 m9');
    expect(keys(evaluateWin({ ...base, concealed: hand, winTile: 'z6' }))).not.toContain('fourConcealedPungs');
    expect(evaluateWin({ ...base, concealed: hand, winTile: 'z6', selfDraw: true })!.fan).toBe(LIMIT);
    expect(evaluateWin({ ...base, concealed: hand, winTile: 'm9' })!.fan).toBe(LIMIT);
  });
  it('seat wind and prevalent wind add up', () => {
    const r = evaluateWin({ ...base, concealed: T('z1 z1 z1 m2 m3 m4 p5 p6 p7 s1 s2 s3 s9 s9'), winTile: 's9' });
    expect(keys(r)).toEqual(expect.arrayContaining(['seatWind', 'roundWind']));
  });
  it('own flowers (flower and season)', () => {
    const r = evaluateWin({ ...base, seatWind: 2, flowers: ['f2', 'f6', 'f3'], concealed: T('m1 m2 m3 p4 p5 p6 s7 s8 s9 z3 z3 z3 m5 m5'), winTile: 'm5' });
    expect(r!.items.filter((i) => i.key === 'seatFlower')).toHaveLength(2);
  });
});
