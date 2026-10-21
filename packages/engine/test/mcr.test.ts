import { describe, expect, it } from 'vitest';
import { evaluateMcr, isWinningShape, MCR_SHAPES, waitingTiles, type McrContext, type Meld } from '../src/index.ts';

const T = (s: string) => s.trim().split(/\s+/);
const open = (kind: Meld['kind'], s: string): Meld => ({ kind, tiles: T(s), concealed: false });
const base: Omit<McrContext, 'concealed' | 'winTile'> = { melds: [], seatWind: 1, roundWind: 1, flowers: [], selfDraw: false };
const score = (ctx: Partial<McrContext> & Pick<McrContext, 'concealed' | 'winTile'>) => evaluateMcr({ ...base, ...ctx })!;
const fans = (r: { items: { key: string }[] }) => r.items.map((i) => i.key).sort();

describe('MCR shapes', () => {
  it('knitted straight with a set and a pair', () => {
    expect(isWinningShape(T('m1 m4 m7 p2 p5 p8 s3 s6 s9 z1 z1 z1 z5 z5'), 0, MCR_SHAPES)).toBe(true);
    expect(isWinningShape(T('m1 m4 m7 p2 p5 p8 s3 s6 s9 z1 z1 z1 z5 z5'), 0, { sevenPairs: true })).toBe(false);
  });
  it('honors and knitted tiles', () => {
    expect(isWinningShape(T('m1 m4 m7 p2 p5 s3 s6 s9 z1 z2 z3 z5 z6 z7'), 0, MCR_SHAPES)).toBe(true);
  });
  it('waits include knitted shapes', () => {
    expect(waitingTiles(T('m1 m4 m7 p2 p5 p8 s3 s6 s9 z1 z1 z1 z5'), 0, MCR_SHAPES)).toEqual(['z5']);
  });
});

describe('MCR scoring', () => {
  it('chicken hand when nothing else scores', () => {
    const r = score({
      melds: [open('chow', 'm2 m3 m4'), open('pung', 'p8 p8 p8'), open('chow', 's5 s6 s7')],
      concealed: T('m6 m7 m8 z7 z7'), winTile: 'm8',
    });
    expect(fans(r)).toEqual(['chickenHand']);
    expect(r.base).toBe(8);
  });

  it('pure straight, all chows, concealed hand, single wait', () => {
    const r = score({ concealed: T('m1 m2 m3 m4 m5 m6 m7 m8 m9 p2 p3 p4 s5 s5'), winTile: 's5' });
    expect(fans(r)).toEqual(['allChows', 'concealedHand', 'pureStraight', 'singleWait']);
    expect(r.base).toBe(21);
  });

  it('all pungs, half flush, winds, terminal pungs, two concealed pungs', () => {
    const r = score({ melds: [open('pung', 'z1 z1 z1')], concealed: T('m1 m1 m1 m5 m5 m5 m9 m9 m9 z5 z5'), winTile: 'm9' });
    expect(fans(r)).toEqual(['allPungs', 'halfFlush', 'prevalentWind', 'pungTerminalsHonors', 'pungTerminalsHonors', 'seatWind', 'twoConcealedPungs']);
    expect(r.base).toBe(20);
  });

  it('seven pairs', () => {
    const r = score({ concealed: T('m1 m1 m4 m4 p2 p2 p7 p7 s3 s3 s8 s8 z5 z5'), winTile: 'z5' });
    expect(fans(r)).toEqual(['sevenPairs']);
  });

  it('thirteen orphans on a self-draw', () => {
    const r = score({ selfDraw: true, concealed: T('m1 m9 p1 p9 s1 s9 z1 z2 z3 z4 z5 z6 z7 z7'), winTile: 'z7' });
    expect(fans(r)).toEqual(['selfDrawn', 'thirteenOrphans']);
    expect(r.base).toBe(89);
  });

  it('knitted straight', () => {
    const r = score({ concealed: T('m1 m4 m7 p2 p5 p8 s3 s6 s9 z1 z1 z1 z5 z5'), winTile: 'z5' });
    expect(fans(r)).toEqual(['allTypes', 'concealedHand', 'knittedStraight', 'prevalentWind', 'seatWind', 'singleWait']);
    expect(r.base).toBe(25);
  });

  it('lesser honors and knitted tiles', () => {
    const r = score({ concealed: T('m1 m4 m7 p2 p5 s3 s6 s9 z1 z2 z3 z5 z6 z7'), winTile: 'z7' });
    expect(fans(r)).toEqual(['lesserHonorsKnitted']);
  });

  it('account-once: mixed triple chow plus one pure double chow, not more', () => {
    const r = score({ concealed: T('m2 m3 m4 m2 m3 m4 p2 p3 p4 s2 s3 s4 p9 p9'), winTile: 'p9' });
    const k = fans(r);
    expect(k.filter((x) => x === 'mixedTripleChow')).toHaveLength(1);
    expect(k.filter((x) => x === 'pureDoubleChow')).toHaveLength(1);
    expect(k).not.toContain('mixedDoubleChow');
  });

  it('flowers add points but do not count towards the minimum', () => {
    const r = score({
      flowers: ['f1', 'f6'],
      melds: [open('chow', 'm2 m3 m4'), open('pung', 'p8 p8 p8'), open('chow', 's5 s6 s7')],
      concealed: T('m6 m7 m8 z7 z7'), winTile: 'm8',
    });
    expect(r.base).toBe(8);
    expect(r.fan).toBe(10);
  });

  it('full flush excludes no honors', () => {
    const r = score({ concealed: T('s1 s2 s3 s3 s4 s5 s5 s6 s7 s7 s8 s9 s9 s9'), winTile: 's9', selfDraw: true });
    expect(fans(r)).toContain('fullFlush');
    expect(fans(r)).not.toContain('noHonors');
    expect(fans(r)).toContain('fullyConcealed');
    expect(fans(r)).not.toContain('selfDrawn');
  });

  it('big three dragons excludes the dragon pungs', () => {
    const r = score({ concealed: T('z5 z5 z5 z6 z6 z6 z7 z7 z7 m1 m2 m3 p9 p9'), winTile: 'p9' });
    expect(fans(r)).toContain('bigThreeDragons');
    expect(fans(r)).not.toContain('dragonPung');
    expect(fans(r)).not.toContain('twoDragonPungs');
  });

  it('melded kong and edge wait', () => {
    const r = score({
      melds: [{ kind: 'kong', tiles: T('p5 p5 p5 p5'), concealed: false }, open('chow', 's6 s7 s8')],
      concealed: T('m1 m2 m3 m7 m8 m9 z6 z6'), winTile: 'm3',
    });
    expect(fans(r)).toEqual(expect.arrayContaining(['meldedKong', 'edgeWait', 'twoTerminalChows', 'dragonPung'].filter((k) => k !== 'dragonPung')));
  });

  it('a non-winning hand returns null', () => {
    expect(evaluateMcr({ ...base, concealed: T('m1 m2 m4 p4 p5 p6 s7 s8 s9 z1 z1 z1 m5 m5'), winTile: 'm5' })).toBeNull();
  });
});
