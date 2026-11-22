import type { RulesPreset } from '../../game/rulesets';
import type {
  GameAction,
  GameEvent,
  GameState,
  MapDefinition,
  MapId,
  PlayerId,
  PokemonId,
  TileId,
} from '../../game/contracts';
import type { FlightSelection, SpecialEventRequest } from './events/contracts';
import type { EmotionCue } from './portraits/emotions';

export interface SetupParticipant {
  id: PlayerId;
  name: string;
  pokemonId: PokemonId;
  controller: 'human' | 'computer';
}
export interface GameSetup {
  rulesPreset?: RulesPreset;
  mapId: MapId;
  participants: readonly SetupParticipant[];
}
export interface UIChoice {
  id: string;
  /** Revision-bound opaque legal selection, including economic intents. */
  selectionId?: string;
  label: string;
  description?: string;
  /** Presentation grouping only; the selection remains opaque. */
  group?: 'asset-sale';
  disabled?: boolean;
  action?: GameAction;
}
export interface GamePrompt {
  id: string;
  kind: 'purchase' | 'upgrade' | 'liquidate';
  title: string;
  description: string;
  choices: readonly UIChoice[];
  dismissible?: boolean;
}
export interface GameView {
  worldEvents?: import('../../game/world-events/index.ts').WorldEventsState;
  matchProgress?: import('../../game/match/index').MatchProgress;
  activeSkill?: {
    definition: import('../../game/skills/index.ts').SkillDefinition;
    statusLabel: string;
    cooldownLabel: string;
    unavailableReason?: string;
    choice?: UIChoice;
  };
  state: GameState;
  map: MapDefinition;
  mapName: string;
  participants: readonly SetupParticipant[];
  computer: { connected: boolean; status: string };
  /** Authoritative available actions; UI never infers legality from balances. */
  actions: readonly UIChoice[];
  prompt?: GamePrompt;
  notice?: string;
  /** Display metadata projected from the integration's authoritative state. */
  hudMeta?: import('./hud/model').DisplayMeta;
  flightSelection?: FlightSelection;
  /** Extra asset notices supplied by integration; preserve explicit inline terms. */
  credits?: readonly UICredit[];
}
export interface UICredit {
  id: string;
  label: string;
  attribution: string;
  sourceUrl?: string;
  requiredInline?: boolean;
}
export interface UIUpdate {
  skillActivations?: readonly import('../../game/skills/index.ts').SkillActivation[];
  /** Resolve after all presentation or cancellation; never performs a transaction. */
  presentationComplete?: () => void;
  abilityActivations?: readonly import('../../game/abilities/activation').AbilityActivation[];
  /** Stable update identity for serialized event redelivery deduplication. */
  id?: string;
  view: GameView;
  events: readonly GameEvent[];
  /** Core legendary outcomes, kept separate from the base board event vocabulary. */
  specialEvents?: readonly import('../../game/legendary').LegendaryEvent[];
  /** Committed outcomes only; stable IDs suppress repeated presentation. */
  results?: readonly { id: string; text: string }[];
  /** Authoritative intermediate positions, including destination. No UI dice math. */
  movement?: { playerId: GameState['activePlayerId']; path: readonly TileId[] };
  /** Ordered, authoritative requests. No rules are resolved by presentation. */
  effects?: readonly SpecialEventRequest[];
  emotionCues?: readonly EmotionCue[];
}
export interface GameUIAdapter {
  readonly demo?: boolean;
  readonly demoLabel?: string;
  getView(): GameView;
  subscribe(listener: (update: UIUpdate) => void): () => void;
  dispatch(action: GameAction): void | Promise<void>;
  start(setup: GameSetup): void | Promise<void>;
  choose(promptId: string, choiceId: string): void | Promise<void>;
  restart(): void | Promise<void>;
  /** null cancels; the integration validates prompt identity and destination. */
  selectFlightDestination?(
    promptId: string,
    tileId: TileId | null,
  ): void | Promise<void>;
  /** Delegates the entire computer turn to the integration layer, never UI rules. */
  runComputerTurn?(playerId: PlayerId, signal: AbortSignal): Promise<void>;
}
