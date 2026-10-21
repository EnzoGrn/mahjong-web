/** Statistics over bot games. Usage: npm run simulate -- [games] [hk|mcr] */
import { Game, botAction, seededRandom, type Mode } from '../src/index.ts';

const games = Number(process.argv[2] ?? 20);
const mode = (process.argv[3] ?? 'hk') as Mode;
const values: Record<string, number> = {};
const fanKeys: Record<string, number> = {};
let hands = 0, wins = 0, selfDraw = 0, slowest = 0;
const t0 = Date.now();

for (let i = 0; i < games; i++) {
  let clock = 0;
  const g = new Game([0, 1, 2, 3].map((n) => ({ name: 'Bot' + n, isBot: true, connected: true })),
    { mode, minFan: i % 2 ? 3 : 1, pace: 'fast' }, { random: seededRandom(1000 + i), now: () => clock });
  while (g.phase !== 'over') {
    if (g.phase === 'end') {
      const r = g.result!;
      if (r.type === 'win') for (const it of r.items ?? []) fanKeys[it.key] = (fanKeys[it.key] ?? 0) + 1;
      g.timeout();
      continue;
    }
    for (const s of g.autoActors()) {
      if (!g.autoActors().includes(s)) continue;
      const t = Date.now();
      g.act(s, botAction(g, s));
      slowest = Math.max(slowest, Date.now() - t);
    }
    clock += 1000;
  }
  for (const h of g.history) {
    hands++;
    if (h.type === 'win') {
      wins++;
      const b = mode === 'mcr' ? `${Math.floor(h.fan! / 8) * 8}+` : String(h.fan);
      values[b] = (values[b] ?? 0) + 1;
      if (h.from == null) selfDraw++;
    }
  }
}
console.log(`${mode}: ${games} games, ${hands} hands, ${((Date.now() - t0) / 1000).toFixed(1)} s (slowest bot move ${slowest} ms)`);
console.log(`Wins ${wins} (${Math.round((100 * wins) / hands)}%, self-draw ${selfDraw}), draws ${hands - wins}`);
console.log(mode === 'mcr' ? 'Points:' : 'Fans:', values);
console.log('Most frequent fans:', Object.entries(fanKeys).sort((a, b) => b[1] - a[1]).slice(0, 18));
