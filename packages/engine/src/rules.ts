/**
 * Rule sets: what differs between Hong Kong and MCR, behind one interface used by the game.
 */
import type { ShapeOptions } from './hand.ts';
import { evaluateMcr, MCR_MIN, MCR_SHAPES } from './mcr.ts';
import { evaluateWin, pointsFor, type WinContext } from './scoring.ts';
import type { Mode, Settings, WinScore } from './types.ts';

export interface RuleContext extends WinContext {
  /** The other three copies of the winning tile are already visible (MCR). */
  lastOfKind?: boolean;
}

export interface Ruleset {
  mode: Mode;
  shapes: ShapeOptions;
  /** Scores a winning hand, or null if the tiles do not win. */
  evaluate(ctx: RuleContext): WinScore | null;
  /** Value that must reach the minimum: fans (HK) or points without flowers (MCR). */
  minimum: number;
  qualifies(res: WinScore): boolean;
  /** Score changes for a win. `from` is the discarder, null on a self-draw. */
  deltas(res: WinScore, winner: number, from: number | null): { deltas: number[]; points: number };
  /** Does the dealer keep the deal after this hand? */
  dealerKeeps(winner: number | undefined, dealer: number): boolean;
}

function hongKong(s: Settings): Ruleset {
  const shapes = { sevenPairs: s.sevenPairs };
  return {
    mode: 'hk',
    shapes,
    evaluate: (ctx) => evaluateWin({ ...ctx, sevenPairs: s.sevenPairs }),
    minimum: s.minFan,
    qualifies: (res) => res.fan >= s.minFan,
    deltas(res, winner, from) {
      const pts = pointsFor(res.fan);
      const d = [0, 0, 0, 0];
      if (from === null) {
        for (let k = 0; k < 4; k++) if (k !== winner) { d[k] -= pts; d[winner] += pts; }
      } else {
        // The discarder pays double.
        d[from] -= pts * 2;
        d[winner] += pts * 2;
      }
      return { deltas: d, points: pts };
    },
    // The dealer keeps the deal on a win or a drawn hand.
    dealerKeeps: (winner, dealer) => winner === undefined || winner === dealer,
  };
}

const mcr: Ruleset = {
  mode: 'mcr',
  shapes: MCR_SHAPES,
  evaluate: (ctx) => evaluateMcr(ctx),
  minimum: MCR_MIN,
  qualifies: (res) => (res.base ?? res.fan) >= MCR_MIN,
  deltas(res, winner, from) {
    // Everyone pays 8 to the winner; the discarder (or everyone, on a self-draw) also pays the hand value.
    const d = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      if (k === winner) continue;
      const pay = 8 + (from === null || from === k ? res.fan : 0);
      d[k] -= pay;
      d[winner] += pay;
    }
    return { deltas: d, points: res.fan };
  },
  // The deal always passes on.
  dealerKeeps: () => false,
};

export function rulesFor(s: Settings): Ruleset {
  return s.mode === 'mcr' ? mcr : hongKong(s);
}
