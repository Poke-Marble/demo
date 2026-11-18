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

export interface SetupParticipant {
  id: PlayerId;
  name: string;
  pokemonId: PokemonId;
  controller: 'human' | 'computer';
}
export interface GameSetup {
  mapId: MapId;
  participants: readonly SetupParticipant[];
}
export interface UIChoice {
  id: string;
  label: string;
  description?: string;
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
  state: GameState;
  map: MapDefinition;
  mapName: string;
  participants: readonly SetupParticipant[];
  computer: { connected: boolean; status: string };
  /** Authoritative available actions; UI never infers legality from balances. */
  actions: readonly UIChoice[];
  prompt?: GamePrompt;
  notice?: string;
}
export interface UIUpdate {
  view: GameView;
  events: readonly GameEvent[];
  /** Authoritative intermediate positions, including destination. No UI dice math. */
  movement?: { playerId: GameState['activePlayerId']; path: readonly TileId[] };
}
export interface GameUIAdapter {
  readonly demo?: boolean;
  getView(): GameView;
  subscribe(listener: (update: UIUpdate) => void): () => void;
  dispatch(action: GameAction): void | Promise<void>;
  start(setup: GameSetup): void | Promise<void>;
  choose(promptId: string, choiceId: string): void | Promise<void>;
  restart(): void | Promise<void>;
  /** Delegates the entire computer turn to the integration layer, never UI rules. */
  runComputerTurn?(playerId: PlayerId, signal: AbortSignal): Promise<void>;
}
