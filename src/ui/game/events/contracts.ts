import type { PlayerId, TileId } from '../../../game/contracts';

/** IDs must be stable across redelivery and unique within one game session. */
export type SpecialEventRequest = { id: string } & (
  | {
      type: 'trial-intro' | 'world-event';
      expiresAfterRound?: number;
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
    metadata?: {
      kind: 'city' | 'landmark' | 'trial' | 'start' | 'fly';
      ownership?: 'unowned' | 'self' | 'opponent';
      ownerName?: string;
      ownerType?: string;
      ownerColor?: string;
      facilityStage?: number;
      facilityName?: string;
      /** Read-only authority quotes, never a promise of settlement. */
      toll?: number;
      purchase?: number;
    };
  }[];
  /** Presentation only; switching axis never changes legal destinations. */
  layout?: 'vertical' | 'horizontal';
  cancellable: boolean;
}

export interface EventPresentation {
  playerName: string;
  partnerName: string;
  destinationName?: string;
}
