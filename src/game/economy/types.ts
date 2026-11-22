import type {
  MapDefinition,
  PlayerId,
  TileId,
  GameAction,
} from '../contracts.ts';
import type { CoreState, CoreEvent } from '../core/index.ts';
import type { LegendaryAction, PresentationRequest } from '../legendary.ts';

export type Stage = 0 | 1 | 2 | 3;
export interface EconomyProfile {
  readonly id: string;
  readonly version: string;
  readonly unlockLaps: readonly [number, number, number, number];
  readonly requireFinalRevisit: boolean;
  readonly groupTollMultiplier: number;
  readonly takeoverMultiplier: number;
  readonly saleRate: number;
  readonly finalTakeoverImmune: boolean;
  readonly landmarkTakeoverAllowed: boolean;
}
export type Property = {
  readonly tileId: TileId;
  readonly landCost: number;
} & (
  | {
      readonly kind: 'city';
      readonly buildCosts: readonly number[];
      readonly tolls: readonly number[];
      readonly finalFacilityKey: string;
    }
  | { readonly kind: 'landmark'; readonly baseToll: number }
);
/** Trusted session input, never accepted from a player command. Basis points compose before blessing. */
export interface EconomyModifier {
  readonly id: string;
  readonly kind: 'upgrade' | 'toll';
  readonly playerId: PlayerId;
  readonly tileId?: TileId;
  readonly multiplierBps: number;
}
export interface EconomyContext {
  readonly map: MapDefinition;
  readonly catalogVersion: string;
  readonly properties: Readonly<Record<TileId, Property>>;
  readonly profile: EconomyProfile;
  readonly modifiers: readonly EconomyModifier[];
}
export interface Development {
  readonly stage: Stage;
  readonly facilities: readonly string[];
  readonly centerReadyVisitOrdinal: number | null;
}
export interface Landing {
  readonly id: string;
  readonly playerId: PlayerId;
  readonly tileId: TileId;
  readonly visitOrdinal: number;
  readonly propertyDecisionUsed: boolean;
  /** False for flight/forced arrivals; serialized to forbid subsequent takeover skills too. */
  readonly skillEligible?: boolean;
}
export interface Debt {
  readonly id: string;
  readonly landingId: string;
  readonly debtorId: PlayerId;
  readonly creditorId: PlayerId;
  readonly tileId: TileId;
  readonly gross: number;
  readonly amount: number;
  readonly consumesBlessing: boolean;
}
export type EconomyIntent =
  | GameAction
  | {
      readonly type: 'start-build';
      readonly opportunityId: string;
      readonly tileId: TileId;
      readonly quoteId: string;
    }
  | { readonly type: 'skip-start-build'; readonly opportunityId: string }
  | {
      readonly type: 'use-skill';
      readonly mode: 'signature' | 'breakthrough';
      readonly tileId: TileId;
      readonly landingId: string;
    }
  | { readonly type: 'pay-toll'; readonly landingId: string }
  | LegendaryAction
  | {
      readonly type: 'construct-property';
      readonly tileId: TileId;
      readonly targetStage: Stage;
      readonly landingId: string;
    }
  | {
      readonly type: 'buy-landmark' | 'takeover-property' | 'pass-property';
      readonly tileId: TileId;
      readonly landingId: string;
    }
  | {
      readonly type: 'sell-property';
      readonly tileId: TileId;
      readonly debtId?: string;
    }
  | { readonly type: 'declare-bankruptcy'; readonly debtId: string };
export interface EconomyCommand {
  readonly sessionId: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly playerId: PlayerId;
  readonly intent: EconomyIntent;
}
export interface Quote {
  readonly quoteId: string;
  readonly revision: number;
  readonly profileVersion: string;
  readonly catalogVersion: string;
  readonly tileId: TileId;
  readonly landingId: string | null;
  readonly fromStage: Stage | null;
  readonly toStage: Stage | null;
  readonly kind: 'construction' | 'landmark' | 'takeover' | 'sale' | 'toll';
  readonly lineItems: readonly {
    readonly key: string;
    readonly amount: number;
    readonly alreadyOwned: boolean;
  }[];
  readonly landSubtotal: number;
  readonly upgradeSubtotal: number;
  readonly gross: number;
  readonly discount: number;
  readonly total: number;
  readonly expectedCost: number;
  readonly expectedRevenue: number;
  readonly balanceAfter: number;
  readonly shortfall: number;
  readonly consumesBlessing: boolean;
  readonly modifierIds: readonly string[];
  readonly eligible: boolean;
  readonly reasons: readonly string[];
}
export interface Receipt {
  readonly sessionId: string;
  readonly commandId: string;
  readonly revision: number;
  readonly playerId: PlayerId;
  readonly intentType: EconomyIntent['type'];
  readonly quote: Quote | null;
  readonly ownershipChanged: boolean;
  readonly debtPending: boolean;
}
export interface EconomyExtension {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly revision: number;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly catalogVersion: string;
  readonly configurationKey: string;
  readonly completedLapsByPlayerId: Readonly<Record<PlayerId, number>>;
  readonly visitOrdinalByPlayerId: Readonly<Record<PlayerId, number>>;
  readonly developmentByTileId: Readonly<Record<TileId, Development>>;
  readonly landing: Landing | null;
  readonly pendingStartBuild?: {
    readonly id: string;
    readonly playerId: PlayerId;
    readonly landingId: string;
  } | null;
  readonly pendingDebt: Debt | null;
  readonly pendingToll?: {
    readonly tileId: TileId;
    readonly landingId: string;
  } | null;
  readonly processedCommands: Readonly<
    Record<string, { readonly fingerprint: string; readonly receipt: Receipt }>
  >;
}
export interface EconomyState extends CoreState {
  readonly economy: EconomyExtension;
}
export type EconomyEvent =
  | CoreEvent
  | {
      readonly type: 'skill-activated';
      readonly activation: import('../skills/index.ts').SkillActivation;
    }
  | { readonly type: 'economy-committed'; readonly receipt: Receipt }
  | { readonly type: 'debt-opened'; readonly debt: Debt }
  | {
      readonly type: 'toll-settled';
      readonly debtorId: PlayerId;
      readonly creditorId: PlayerId;
      readonly amount: number;
      readonly recovered: number;
      readonly forgiven: number;
    }
  | {
      readonly type: 'property-sold';
      readonly playerId: PlayerId;
      readonly tileId: TileId;
      readonly amount: number;
    };
export type EconomyTransition<S extends EconomyState = EconomyState> =
  | {
      readonly ok: true;
      readonly state: S;
      readonly events: readonly EconomyEvent[];
      readonly presentations: readonly PresentationRequest[];
      readonly receipt: Receipt;
      readonly replayed: boolean;
    }
  | {
      readonly ok: false;
      readonly state: S;
      readonly events: readonly [];
      readonly presentations: readonly [];
      readonly error: string;
    };
export interface LegalActionSet {
  readonly revision: number;
  readonly playerId: PlayerId;
  readonly phase:
    | 'inactive'
    | 'liquidating'
    | 'choosing-property'
    | 'choosing-start-build'
    | 'core';
  readonly actions: readonly {
    readonly actionKey: string;
    readonly intent: EconomyIntent;
    readonly quote?: Quote;
  }[];
}
