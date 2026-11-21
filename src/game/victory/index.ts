import type {
  BoardSide,
  CityGroupId,
  GameEvent,
  GameState,
  MapDefinition,
  PlayerId,
  TileId,
  VictoryReason,
} from '../contracts';
import { defaultVictoryConfig } from './config.ts';
import type { VictoryConfig } from './config.ts';

export { defaultVictoryConfig } from './config.ts';
export type { VictoryConfig } from './config.ts';

export type VictoryErrorCode =
  | 'incomplete-map'
  | 'invalid-map'
  | 'map-mismatch'
  | 'invalid-config'
  | 'invalid-players'
  | 'invalid-phase'
  | 'invalid-victory'
  | 'invalid-actor'
  | 'duplicate-holding'
  | 'invalid-property'
  | 'unknown-owner'
  | 'bankrupt-owner'
  | 'no-survivors';

export interface VictoryError {
  readonly code: VictoryErrorCode;
  readonly message: string;
}

export interface VictoryOptions {
  /** Actor of the fully settled transaction, not necessarily activePlayerId. */
  readonly actorId?: PlayerId;
  readonly config?: VictoryConfig;
}

export interface VictoryCandidate {
  readonly playerId: PlayerId;
  readonly reasons: readonly VictoryReason[];
  readonly completedGroupIds: readonly CityGroupId[];
  readonly completedSides: readonly BoardSide[];
  readonly landmarkIds: readonly TileId[];
}

export type VictoryEvaluation =
  | { readonly ok: false; readonly error: VictoryError }
  | {
      readonly ok: true;
      readonly status: 'evaluated' | 'already-finished';
      readonly victory: GameState['victory'];
      /** Player array order. Reasons use configured priority order. */
      readonly candidates: readonly VictoryCandidate[];
    };

export type VictoryFinalization<S extends GameState = GameState> =
  | {
      readonly ok: false;
      readonly error: VictoryError;
      readonly state: S;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly ok: true;
      readonly state: S;
      readonly events: readonly GameEvent[];
      readonly evaluation: Extract<VictoryEvaluation, { ok: true }>;
    };

const sides: readonly BoardSide[] = ['south', 'west', 'north', 'east'];
const reasons = defaultVictoryConfig.reasonPriority;
const fail = (code: VictoryErrorCode, message: string): VictoryEvaluation => ({
  ok: false,
  error: { code, message },
});

/** Typed domain input, not a parser for arbitrary JSON. Never mutates input. */
export function evaluateVictory(
  state: GameState,
  map: MapDefinition,
  options: VictoryOptions = {},
): VictoryEvaluation {
  const config = options.config ?? defaultVictoryConfig;
  if (map.completeness !== 'complete')
    return fail('incomplete-map', 'Victory requires a complete map');
  if (state.mapId !== map.id)
    return fail('map-mismatch', 'State and map IDs differ');
  if (
    !Number.isSafeInteger(config.groupsToWin) ||
    config.groupsToWin < 1 ||
    !Number.isSafeInteger(config.landmarksToWin) ||
    config.landmarksToWin < 1 ||
    new Set(config.reasonPriority).size !== config.reasonPriority.length ||
    !reasons.every((reason) => config.reasonPriority.includes(reason)) ||
    !config.reasonPriority.every(
      (reason) => reasons.includes(reason) || reason === 'round-limit-assets',
    )
  )
    return fail(
      'invalid-config',
      'Positive thresholds and all four reasons required',
    );

  const tiles = new Map(map.tiles.map((tile) => [tile.id, tile]));
  const groups = new Set(map.cityGroups.map((group) => group.id));
  const memberships = new Set<TileId>();
  const citySides = Object.fromEntries(
    sides.map((side) => [side, [] as TileId[]]),
  ) as Record<BoardSide, TileId[]>;
  if (
    tiles.size !== map.tiles.length ||
    groups.size !== map.cityGroups.length ||
    map.tiles.filter((tile) => tile.kind === 'start').length !== 1
  )
    return fail('invalid-map', 'Duplicate map IDs or invalid start count');
  for (const group of map.cityGroups) {
    if (group.cityIds.length === 0)
      return fail('invalid-map', `Empty city group: ${group.id}`);
    for (const id of group.cityIds) {
      const tile = tiles.get(id);
      if (
        memberships.has(id) ||
        tile?.kind !== 'city' ||
        tile.groupId !== group.id
      )
        return fail('invalid-map', `Invalid city membership: ${id}`);
      memberships.add(id);
    }
  }
  for (const tile of map.tiles) {
    if (tile.kind !== 'city') continue;
    if (!memberships.has(tile.id) || !sides.includes(tile.side))
      return fail('invalid-map', `Ungrouped city or invalid side: ${tile.id}`);
    citySides[tile.side].push(tile.id);
  }
  const landmarks = map.tiles.filter((tile) => tile.kind === 'landmark');
  if (sides.some((side) => citySides[side].length === 0))
    return fail('invalid-map', 'Every side must contain normal cities');
  if (
    config.groupsToWin > groups.size ||
    config.landmarksToWin > landmarks.length
  )
    return fail('invalid-config', 'Victory threshold exceeds map targets');

  const players = new Map(state.players.map((player) => [player.id, player]));
  if (
    state.players.length < 2 ||
    state.players.length > 4 ||
    players.size !== state.players.length ||
    !players.has(state.activePlayerId)
  )
    return fail(
      'invalid-players',
      'Expected 2–4 unique players and a known active player',
    );
  if (state.phase !== 'playing' && state.phase !== 'finished')
    return fail('invalid-phase', 'Victory requires playing or finished phase');
  if (
    (state.phase === 'playing' && state.victory !== null) ||
    (state.phase === 'finished' &&
      (!state.victory ||
        !players.has(state.victory.winnerId) ||
        players.get(state.victory.winnerId)?.bankrupt ||
        (!reasons.includes(state.victory.reason) &&
          state.victory.reason !== 'round-limit-assets')))
  )
    return fail(
      'invalid-victory',
      'Phase and recorded victory are inconsistent',
    );

  const ownership = new Map<TileId, PlayerId>();
  for (const holding of state.holdings) {
    if (ownership.has(holding.tileId))
      return fail('duplicate-holding', `Repeated property: ${holding.tileId}`);
    const tile = tiles.get(holding.tileId);
    if (!tile || (tile.kind !== 'city' && tile.kind !== 'landmark'))
      return fail(
        'invalid-property',
        `Not a purchasable property: ${holding.tileId}`,
      );
    const owner = players.get(holding.ownerId);
    if (!owner)
      return fail('unknown-owner', `Unknown owner: ${holding.ownerId}`);
    if (owner.bankrupt)
      return fail('bankrupt-owner', `Bankruptcy cleanup required: ${owner.id}`);
    ownership.set(holding.tileId, holding.ownerId);
  }
  const alive = state.players.filter((player) => !player.bankrupt);
  if (alive.length === 0)
    return fail('no-survivors', 'No living player; no winner');

  // Replay trusts the recorded winner, after domain consistency checks.
  if (state.phase === 'finished')
    return {
      ok: true,
      status: 'already-finished',
      victory: state.victory,
      candidates: [],
    };
  if (options.actorId !== undefined && !players.has(options.actorId))
    return fail('invalid-actor', `Unknown actor: ${options.actorId}`);

  const candidates: VictoryCandidate[] = [];
  for (const player of alive) {
    const ownsAll = (ids: readonly TileId[]) =>
      ids.length > 0 && ids.every((id) => ownership.get(id) === player.id);
    const completedGroupIds = map.cityGroups
      .filter((group) => ownsAll(group.cityIds))
      .map((group) => group.id);
    const completedSides = sides.filter((side) => ownsAll(citySides[side]));
    const landmarkIds = landmarks
      .filter((tile) => ownership.get(tile.id) === player.id)
      .map((tile) => tile.id);
    const matches: Record<VictoryReason, boolean> = {
      'last-player-standing': alive.length === 1,
      'three-city-groups': completedGroupIds.length >= config.groupsToWin,
      'one-side-cities': completedSides.length > 0,
      'four-landmarks': landmarkIds.length >= config.landmarksToWin,
      'round-limit-assets': false,
    };
    const matched = config.reasonPriority.filter((reason) => matches[reason]);
    if (matched.length > 0)
      candidates.push({
        playerId: player.id,
        reasons: matched,
        completedGroupIds,
        completedSides,
        landmarkIds,
      });
  }
  const winner =
    candidates.find((candidate) => candidate.playerId === options.actorId) ??
    candidates[0];
  const reason = winner?.reasons[0];
  return {
    ok: true,
    status: 'evaluated',
    victory: winner && reason ? { winnerId: winner.playerId, reason } : null,
    candidates,
  };
}

/** Call only after settlement, bankruptcy and ownership cleanup have completed. */
export function finalizeVictory<S extends GameState>(
  state: S,
  map: MapDefinition,
  options: VictoryOptions = {},
): VictoryFinalization<S> {
  const evaluation = evaluateVictory(state, map, options);
  if (!evaluation.ok)
    return { ok: false, error: evaluation.error, state, events: [] };
  if (evaluation.status === 'already-finished' || !evaluation.victory)
    return { ok: true, state, events: [], evaluation };
  const victory = evaluation.victory;
  return {
    ok: true,
    state: { ...state, phase: 'finished', victory },
    events: [
      { type: 'game-won', playerId: victory.winnerId, reason: victory.reason },
    ],
    evaluation,
  };
}
