import { describe, expect, it } from 'vitest';
import { Game, botAction, seededRandom, type Settings } from '../src/index.ts';

/** Plays a full game between bots, checking invariants at every step. */
export function playBotGame(seed: number, settings: Partial<Settings> = {}, onStep?: (g: Game) => void) {
  let clock = 0;
  const g = new Game([0, 1, 2, 3].map((i) => ({ name: 'Bot' + i, isBot: true, connected: true })),
    { pace: 'fast', ...settings }, { random: seededRandom(seed), now: () => clock });
  for (let guard = 0; guard < 20000 && g.phase !== 'over'; guard++) {
    onStep?.(g);
    if (g.phase === 'end') { g.timeout(); continue; }
    const actors = g.autoActors();
    if (!actors.length) throw new Error('Nobody to play in phase ' + g.phase);
    for (const s of actors) {
      if ((g.phase as string) === 'end' || (g.phase as string) === 'over') break;
      if (!g.autoActors().includes(s)) continue;
      const r = g.act(s, botAction(g, s));
      if ('error' in r) throw new Error(`Bot ${s}: ${r.error}`);
    }
    clock += 1000;
  }
  return g;
}

function tileCount(g: Game) {
  let n = g.wall.length;
  for (let s = 0; s < 4; s++) {
    n += g.hands[s].length + g.flowers[s].length;
    n += g.discards[s].filter((d) => !d.claimed).length;
    n += g.melds[s].reduce((a, m) => a + m.tiles.length, 0);
  }
  return n;
}

const invariants = (g: Game) => {
  if (g.phase === 'turn' || g.phase === 'claims') {
    expect(tileCount(g)).toBe(144);
    for (let s = 0; s < 4; s++) {
      const eff = g.hands[s].length + 3 * g.melds[s].length;
      expect(eff).toBe(g.phase === 'turn' && g.turn === s ? 14 : 13);
    }
  }
  for (let s = 0; s < 4; s++) JSON.stringify(g.view(s));
};

describe('full game', () => {
  it('MCR: every win is worth 8 points, the deal passes on every hand', () => {
    const g = playBotGame(5, { mode: 'mcr' }, invariants);
    expect(g.phase).toBe('over');
    expect(g.history).toHaveLength(4);
    expect(g.scores.reduce((a, b) => a + b, 0)).toBe(0);
    for (const h of g.history) if (h.type === 'win') expect(h.fan!).toBeGreaterThanOrEqual(8);
  }, 60000);

  it('keeps the 144 tiles and hands of the right size', () => {
    for (const seed of [1, 2, 3]) {
      const g = playBotGame(seed, { minFan: 1 }, (g) => {
        if (g.phase === 'turn' || g.phase === 'claims') {
          expect(tileCount(g)).toBe(144);
          for (let s = 0; s < 4; s++) {
            const eff = g.hands[s].length + 3 * g.melds[s].length;
            expect(eff).toBe(g.phase === 'turn' && g.turn === s ? 14 : 13);
          }
        }
        for (let s = 0; s < 4; s++) JSON.stringify(g.view(s));
      });
      expect(g.phase).toBe('over');
      expect(g.scores.reduce((a, b) => a + b, 0)).toBe(0);
      expect(g.history.some((h) => h.type === 'win')).toBe(true);
    }
  }, 60000);

  it('never shows the others\' hands during play', () => {
    const g = new Game([0, 1, 2, 3].map((i) => ({ name: 'J' + i, isBot: false, connected: true })), {}, { random: seededRandom(7) });
    const v = g.view(1);
    expect(v.seats.every((s) => s.revealed === undefined)).toBe(true);
    expect(v.me.hand.length + (v.me.drawn ? 1 : 0)).toBe(g.hands[1].length);
  });

  it('refuses to play out of turn', () => {
    const g = new Game([0, 1, 2, 3].map((i) => ({ name: 'J' + i, isBot: false, connected: true })), {}, { random: seededRandom(9) });
    const other = (g.turn + 1) % 4;
    expect(g.act(other, { type: 'discard', tile: g.hands[other][0] })).toHaveProperty('error');
  });
});
