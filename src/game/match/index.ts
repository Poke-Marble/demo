import type { AssetRank, GameEvent, BoardSide } from '../contracts.ts';
import { createWorldEvents } from '../world-events/index.ts';
import type { EconomyState, EconomyContext } from '../economy/types.ts';
import { validateEconomyState, money } from '../economy/catalog.ts';
import { propertyCapital } from '../economy/quotes.ts';
import {
  finalizeVictory,
  defaultVictoryConfig,
  type VictoryOptions,
} from '../victory/index.ts';
import { validMatch } from './rounds.ts';
export {
  createMatch,
  validMatch,
  completeBasicTurn,
  roundStatus,
} from './rounds.ts';

/** No final score may bypass an unresolved movement or payment choice. */
export function hasPendingSettlement(state: EconomyState): boolean {
  return !!(
    state.core.pendingDice ||
    state.economy.pendingDebt ||
    state.economy.pendingToll ||
    state.economy.pendingStartBuild
  );
}

/** Public, authoritative UI projection. All remaining rounds include the current unfinished cycle. */
export function matchProgress(state: EconomyState, context: EconomyContext) {
  const m = state.match;
  if (!m) return undefined;
  const ownership = new Map(state.holdings.map((h) => [h.tileId, h.ownerId]));
  const sides: readonly BoardSide[] = ['south', 'west', 'north', 'east'];
  return {
    rulesPreset: m.rulesPreset,
    roundLimit: m.roundLimit,
    currentRound: Math.min(m.completedRounds + 1, m.roundLimit),
    completedRounds: m.completedRounds,
    remainingRounds: Math.max(0, m.roundLimit - m.completedRounds),
    globalTurnNumber: state.turnNumber,
    activePlayerId: state.activePlayerId,
    extraRoll:
      !!state.core.doubleChain?.extraRollPending &&
      state.core.turnStage === 'awaiting-roll',
    roundDefinition:
      '원래 seat 순서의 생존 참가자 기본 차례 1순환. 파산자 건너뛰기, 시험 체류 포함. 추가 굴림은 라운드를 늘리지 않음.',
    settlementPending: hasPendingSettlement(state),
    criteria: {
      groupsToWin: defaultVictoryConfig.groupsToWin,
      sideRule: 'all-cities-on-one-side' as const,
      landmarksToWin: defaultVictoryConfig.landmarksToWin,
      survivorsToWin: 1 as const,
      assetFormula: '현금 + 소유 토지 원가 + 누적 건설원가',
      assetTieBreak: ['cash-desc', 'original-seat-asc'] as const,
      immediateBeforeRoundLimit: true as const,
    },
    players: state.players.map((p, seat) => ({
      playerId: p.id,
      seat,
      bankrupt: p.bankrupt,
      completedBasicTurns: m.completedBasicTurnsByPlayerId[p.id]!,
      completedLaps: state.economy.completedLapsByPlayerId[p.id]!,
      trial: state.legendary?.players[p.id]?.trial ?? null,
      groups: context.map.cityGroups.map((g) => ({
        groupId: g.id,
        owned: g.cityIds.filter((id) => ownership.get(id) === p.id).length,
        total: g.cityIds.length,
      })),
      sides: sides.map((side) => {
        const cities = context.map.tiles.filter(
          (t) => t.kind === 'city' && t.side === side,
        );
        return {
          side,
          owned: cities.filter((t) => ownership.get(t.id) === p.id).length,
          total: cities.length,
        };
      }),
      landmarksOwned: context.map.tiles.filter(
        (t) => t.kind === 'landmark' && ownership.get(t.id) === p.id,
      ).length,
    })),
    survivors: state.players.filter((p) => !p.bankrupt).length,
    assetRanking: hasPendingSettlement(state)
      ? null
      : (m.finalRanking ?? rankAssets(state, context)),
    finalRanking: m.finalRanking,
    endReason: state.victory?.reason ?? null,
  };
}
export type MatchProgress = NonNullable<ReturnType<typeof matchProgress>>;

/** Full catalog land + cumulative construction cost; never liquidation or takeover price. */
export function rankAssets(
  state: EconomyState,
  context: EconomyContext,
): readonly AssetRank[] {
  validateEconomyState(state, context);
  if (hasPendingSettlement(state))
    throw new Error('Settle debt or pending dice/toll before asset ranking');
  return state.players
    .map((p, seat) => {
      const propertyCost = state.holdings
        .filter((h) => h.ownerId === p.id)
        .reduce(
          (sum, h) => money(sum + propertyCapital(state, context, h.tileId)),
          0,
        );
      return {
        playerId: p.id,
        seat,
        cash: p.balance,
        propertyCost,
        total: money(p.balance + propertyCost),
        bankrupt: p.bankrupt,
      };
    })
    .sort(
      (a, b) =>
        Number(a.bankrupt) - Number(b.bankrupt) ||
        b.total - a.total ||
        b.cash - a.cash ||
        a.seat - b.seat,
    );
}

/** Atomic settled-transaction boundary. Immediate victories always precede the round limit. */
export function finalizeMatch<S extends EconomyState>(
  state: S,
  context: EconomyContext,
  options: VictoryOptions = {},
): { state: S; events: readonly GameEvent[] } {
  if (!validMatch(state)) throw new Error('Invalid match rounds');
  validateEconomyState(state, context);
  if (hasPendingSettlement(state)) return { state, events: [] };
  const immediate = finalizeVictory(state, context.map, options);
  if (!immediate.ok) throw new Error(immediate.error.message);
  if (state.phase === 'finished') return { state, events: [] };
  const expired =
    !!state.match && state.match.completedRounds >= state.match.roundLimit;
  if (!immediate.state.victory && !expired) return { state, events: [] };
  const finalRanking = rankAssets(immediate.state, context);
  const winner = finalRanking.find((p) => !p.bankrupt);
  if (!winner) throw new Error('No surviving asset winner');
  const victory = immediate.state.victory ?? {
    winnerId: winner.playerId,
    reason: 'round-limit-assets' as const,
  };
  return {
    state: {
      ...immediate.state,
      phase: 'finished',
      ...(state.worldEvents ? { worldEvents: createWorldEvents() } : {}),
      victory,
      ...(state.match ? { match: { ...state.match, finalRanking } } : {}),
    },
    events: immediate.events.length
      ? immediate.events
      : [
          {
            type: 'game-won',
            playerId: victory.winnerId,
            reason: victory.reason,
          },
        ],
  };
}
