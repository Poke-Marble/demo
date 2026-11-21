import type { VictoryReason } from '../contracts';

export interface VictoryConfig {
  readonly groupsToWin: number;
  readonly landmarksToWin: number;
  /** Four immediate reasons required; optional asset reason is always deferred to match. */
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
