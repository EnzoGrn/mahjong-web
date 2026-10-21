import { describe, expect, it } from 'vitest';
import { suggestTargets } from '../src/index.ts';

const T = (s: string) => s.trim().split(/\s+/);

describe('player aid targets', () => {
  it('MCR: a pure straight one tile away comes first', () => {
    const r = suggestTargets(T('p1 p2 p3 p5 p6 p7 p8 p9 z5 z5 m3 s7 s8 z2'), [], { mode: 'mcr', seatWind: 2, roundWind: 1 });
    expect(r.targets[0].key).toBe('pureStraight');
    expect(r.targets[0].groups.flat().filter((t) => !t.have).map((t) => t.tile)).toEqual(['p4']);
  });
  it('seven pairs counts the pairs already held', () => {
    const r = suggestTargets(T('m1 m1 m5 m5 p2 p2 p7 s3 s3 s9 z1 z1 z6 m8'), [], { mode: 'mcr', seatWind: 2, roundWind: 1 });
    const sp = r.targets.find((t) => t.key === 'sevenPairs')!;
    expect(sp.missing).toBe(2);
  });
  it('Hong Kong uses fans and suggests valued honor pungs', () => {
    const r = suggestTargets(T('p1 p2 p3 p5 p6 p7 p8 p9 z5 z5 m3 s7 s8 z2'), [], { mode: 'hk', seatWind: 2, roundWind: 1 });
    expect(r.targets.map((t) => t.key)).toContain('dragonPung');
    expect(r.targets.every((t) => !t.enough)).toBe(true);
  });
  it('no seven pairs once a set is melded', () => {
    const r = suggestTargets(T('m1 m1 m5 m5 p2 p2 p7 s3 s3 s9 z1'), [{ kind: 'pung', tiles: T('z6 z6 z6'), concealed: false }], { mode: 'mcr', seatWind: 2, roundWind: 1 });
    expect(r.targets.map((t) => t.key)).not.toContain('sevenPairs');
  });
});
