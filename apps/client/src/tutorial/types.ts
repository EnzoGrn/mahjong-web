import type { ReactNode } from 'react';

/** One possible answer to an exercise. */
export interface Choice {
  label: ReactNode;
  ok: boolean;
  /** Explanation shown after the choice. */
  why: string;
}

export interface Step {
  title: string;
  body: ReactNode;
  /** Illustration next to the text (tiles, example hands). */
  demo?: ReactNode;
  /** Optional exercise. With `hand`, the choices are the tiles of a hand, shown side by side. */
  quiz?: { q: string; choices: Choice[]; hand?: boolean };
}

/** One tutorial per game mode. Empty `steps`: mode not available yet. */
export interface ModeTutorial {
  key: string;
  name: string;
  tagline: string;
  steps: Step[];
}
