/** AI-local transport contract. The authority, never the planner, creates actions. */
export type ActionKind =
  | 'roll'
  | 'buy'
  | 'build'
  | 'takeover'
  | 'sell'
  | 'pay-debt'
  | 'bankrupt'
  | 'end-turn'
  | 'pass'
  | 'trial'
  | 'rope'
  | 'fly';

export interface Estimate {
  readonly value: number;
  readonly source: 'authority' | 'heuristic';
}

export interface Property {
  readonly id: string;
  readonly ownerId: string | null;
}

/** Public victory-relevant sets; a landmark set must contain all four landmarks. */
export interface Collection {
  readonly id: string;
  readonly kind: 'group' | 'line' | 'four-landmarks';
  readonly propertyIds: readonly string[];
}

export interface Candidate<Action = unknown> {
  readonly id: string;
  readonly kind: ActionKind;
  readonly action: Action;
  readonly targetId?: string;
  /** Exact quote, in the game's currency. No planner-generated discounts. */
  readonly quote: { readonly debit: number; readonly credit: number };
  readonly outlook?: {
    readonly income?: Estimate;
    readonly tollExposure?: Estimate;
    readonly assetLoss?: Estimate;
    readonly destinationValue?: Estimate;
    /** Supplied probability, not a preview of RNG or hidden dice. */
    readonly trialSuccessProbability?: number;
    readonly trialReward?: Estimate;
    readonly lostTurnCost?: Estimate;
    readonly ropeValue?: Estimate;
    /** Authority/adapter confirms an immediately available rival completion. */
    readonly blocksImmediateMonopoly?: boolean;
  };
}

export interface Snapshot<Action = unknown> {
  readonly session: string;
  readonly turn: string;
  /** Must change after every accepted command, including a pass. */
  readonly revision: string;
  readonly phase: 'playing' | 'finished';
  readonly activePlayerId: string;
  readonly players: readonly {
    readonly id: string;
    readonly controller: 'human' | 'computer';
    readonly bankrupt: boolean;
  }[];
  readonly cash: number;
  /** Positive amount still owed; candidates must already respect debt rules. */
  readonly debt: number;
  readonly expectedToll: Estimate;
  readonly properties: readonly Property[];
  readonly collections: readonly Collection[];
  /** Already resolved public dice only. No random generator is accepted. */
  readonly diceResult?: readonly number[];
  readonly candidates: readonly Candidate<Action>[];
}

export interface Ranked<Action = unknown> {
  readonly candidate: Candidate<Action>;
  readonly score: number;
  readonly reasons: readonly string[];
}

/** One initial difficulty. These are strategy heuristics, not game rules. */
export const STANDARD = Object.freeze({
  difficulty: 'standard' as const,
  minimumReserve: 150,
  tollReserveMultiplier: 1.5,
  incomeWeight: 2,
  groupProgress: 100,
  groupCompletion: 450,
  lineProgress: 120,
  lineCompletion: 650,
  landmarkProgress: 140,
  landmarkCompletion: 900,
  immediateDefense: 500,
  trialReward: 180,
  lostTurnCost: 80,
  ropeValue: 100,
});
