import type { PlayerId, TileId } from '../../../game/contracts';

/** IDs must be stable across redelivery and unique within one game session. */
export type SpecialEventRequest = { id: string } & (
  | {
      type: 'trial-intro';
      legendary: 'lugia' | 'ho-oh';
      playerId: PlayerId;
      tileId: TileId;
    }
  | { type: 'fly'; playerId: PlayerId; from: TileId; to: TileId }
);

/** Supplied by rules. The UI neither discovers nor filters legal destinations. */
export interface FlightSelection {
  id: string;
  playerId: PlayerId;
  title?: string;
  destinations: readonly {
    tileId: TileId;
    label: string;
    description?: string;
  }[];
  cancellable: boolean;
}

export interface EventPresentation {
  playerName: string;
  partnerName: string;
  destinationName?: string;
}
