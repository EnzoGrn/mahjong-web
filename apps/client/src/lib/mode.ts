/** Labels that depend on the rule set: hand values are fans in Hong Kong, points in MCR. */
import type { Mode } from '@mahjong/engine';

export const MODE_NAMES: Record<Mode, string> = { hk: 'Hong Kong', mcr: 'MCR' };

export function valueLabel(mode: Mode, n: number): string {
  if (mode === 'mcr') return `${n} pt${n > 1 ? 's' : ''}`;
  return `${n} fan${n > 1 ? 's' : ''}`;
}
