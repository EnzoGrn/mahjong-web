/** Types shared by the engine, the server and the app. */
import type { Tile } from './tiles.ts';

export type Seat = 0 | 1 | 2 | 3;
/** Wind: 1 East, 2 South, 3 West, 4 North. */
export type Wind = 1 | 2 | 3 | 4;

export interface Meld {
  kind: 'chow' | 'pung' | 'kong';
  tiles: Tile[];
  concealed: boolean;
  /** Player whose discard was claimed. */
  from?: number;
  /** Tile taken from the discards. */
  claimed?: Tile;
}

/** Rule set: Hong Kong, or Mahjong Competition Rules (MCR). */
export type Mode = 'hk' | 'mcr';

export interface Settings {
  mode: Mode;
  /** Hong Kong only: fans needed to declare mahjong. MCR always needs 8 points. */
  minFan: 0 | 1 | 3;
  rounds: 1 | 2 | 4;
  pace: 'fast' | 'normal' | 'relaxed';
  /** Hong Kong only: seven pairs allowed. Always allowed in MCR. */
  sevenPairs: boolean;
  hints: boolean;
}

export const DEFAULT_SETTINGS: Settings = { mode: 'hk', minFan: 3, rounds: 1, pace: 'normal', sevenPairs: true, hints: true };

export const PACE_MS: Record<Settings['pace'], { turn: number; claim: number }> = {
  fast: { turn: 12000, claim: 6000 },
  normal: { turn: 20000, claim: 10000 },
  relaxed: { turn: 40000, claim: 15000 },
};
export const NEXT_HAND_MS = 45000;

export type ClaimKind = 'win' | 'pung' | 'kong' | 'chow' | 'pass';

export type Action =
  | { type: 'discard'; tile: Tile }
  | { type: 'tsumo' }
  | { type: 'kong'; tile: Tile }
  | { type: 'claim'; kind: ClaimKind; tiles?: [Tile, Tile] }
  | { type: 'ready' };

export type Phase = 'turn' | 'claims' | 'robbing' | 'end' | 'over';

export interface FanItem {
  key: string;
  name: string;
  zh: string;
  fan: number;
  limit: boolean;
}

export interface WinScore {
  /** Hong Kong: fans. MCR: points, flowers included. */
  fan: number;
  items: FanItem[];
  limit: boolean;
  /** MCR: points without flowers, which must reach the minimum. */
  base?: number;
}

/** What happened last, to animate the screen. */
export interface GameEvent {
  seq: number;
  type: 'deal' | 'draw' | 'discard' | 'flower' | 'claim' | 'addkong' | 'win' | 'exhaust' | 'over';
  seat?: number;
  tile?: Tile;
  claim?: 'pung' | 'kong' | 'chow';
  from?: number;
}

export interface HandResult {
  type: 'win' | 'draw';
  handNo: number;
  winner?: number;
  from?: number | null;
  tile?: Tile;
  fan?: number;
  /** MCR: hand value without flowers. */
  base?: number;
  items?: FanItem[];
  limit?: boolean;
  points?: number;
  selfDraw?: boolean;
  deltas: number[];
  winningHand?: { concealed: Tile[]; melds: Meld[]; flowers: Tile[] };
  hands: Tile[][];
  gameEnds: boolean;
}

export interface HistoryEntry {
  handNo: number;
  roundWind: Wind;
  type: 'win' | 'draw';
  winner?: number;
  from?: number | null;
  fan?: number;
  deltas: number[];
}

/* ------------------------------------------------------------------ */
/* A player's view: everything they are allowed to see                 */
/* ------------------------------------------------------------------ */

export interface SeatView {
  name: string;
  isBot: boolean;
  connected: boolean;
  wind: Wind;
  score: number;
  handCount: number;
  justDrew: boolean;
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  ready: boolean;
  /** Revealed hand (end of hand only). */
  revealed?: Tile[];
}

export interface TurnOptions {
  discard: true;
  /** `base`: MCR value without flowers, compared with the minimum. */
  tsumo?: { fan: number; tooLow: boolean; base?: number };
  kongs?: { tile: Tile; kind: 'concealed' | 'added' }[];
}

export interface ClaimOptions {
  tile: Tile;
  from: number;
  robbing: boolean;
  win?: { fan: number };
  pung?: boolean;
  kong?: boolean;
  chows?: [Tile, Tile][];
}

export interface Waiting { tile: Tile; left: number }

export interface PlayerView {
  phase: Phase;
  version: number;
  handNo: number;
  roundWind: Wind;
  dealer: number;
  dealerStreak: number;
  turn: number;
  wallCount: number;
  wall: { front: number; back: number; dice: number[] };
  remainingMs: number;
  totalMs: number;
  /** Player whose decision is pending (turn or claimable discard). */
  focus: number | null;
  lastDiscard: { seat: number; tile: Tile } | null;
  lastEvent: GameEvent | null;
  settings: Settings;
  seats: SeatView[];
  me: {
    seat: number;
    hand: Tile[];
    drawn: Tile | null;
    turn?: TurnOptions;
    claim?: ClaimOptions;
    waitingForOthers?: boolean;
    hints?: { discards?: Record<Tile, Waiting[]>; waits?: Waiting[] };
  };
  result: HandResult | null;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* WebSocket protocol                                                   */
/* ------------------------------------------------------------------ */

export interface RoomSeat { name: string; isBot: boolean; connected: boolean; isHost: boolean }

export interface RoomView {
  code: string;
  settings: Settings;
  started: boolean;
  seat: number;
  youAreHost: boolean;
  seats: (RoomSeat | null)[];
}

export type ClientMessage =
  | { t: 'create'; name: string; settings?: Partial<Settings> }
  | { t: 'join'; code: string; name: string; token?: string }
  | { t: 'settings'; settings: Partial<Settings> }
  | { t: 'addBot'; seat?: number }
  | { t: 'kick'; seat: number }
  | { t: 'start' }
  | { t: 'act'; action: Action }
  | { t: 'emote'; e: string }
  | { t: 'rematch' }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'joined'; code: string; token: string }
  | { t: 'state'; room: RoomView; view: PlayerView | null }
  | { t: 'error'; msg: string; fatal?: boolean; soft?: boolean }
  | { t: 'emote'; seat: number; e: string }
  | { t: 'kicked' };
