import { HK_STEPS } from './hk.tsx';
import { MCR_STEPS } from './mcr.tsx';
import type { ModeTutorial } from './types.ts';

export type { ModeTutorial, Step, Choice } from './types.ts';

/** One tutorial per game mode. */
export const TUTORIALS: ModeTutorial[] = [
  { key: 'hk', name: 'Hong Kong', tagline: 'Rapide et convivial, le mahjong le plus joué entre amis.', steps: HK_STEPS },
  { key: 'mcr', name: 'MCR', tagline: 'Le mahjong de compétition chinois, avec 81 combinaisons.', steps: MCR_STEPS },
];
