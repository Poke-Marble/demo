import type { VictoryReason } from '../contracts';

export interface VictoryConfig {
  readonly groupsToWin: number;
  readonly landmarksToWin: number;
  /** Every reason exactly once, highest priority first. */
  readonly reasonPriority: readonly VictoryReason[];
}

export const defaultVictoryConfig: VictoryConfig = Object.freeze({
  groupsToWin: 3,
  landmarksToWin: 4,
  reasonPriority: Object.freeze([
    'last-player-standing',
    'three-city-groups',
    'one-side-cities',
    'four-landmarks',
  ] satisfies VictoryReason[]),
});
