import type { AssetRank, GameEvent } from '../contracts.ts';
import type { EconomyState, EconomyContext } from '../economy/types.ts';
import { validateEconomyState, money } from '../economy/catalog.ts';
import { propertyCapital } from '../economy/quotes.ts';
import { finalizeVictory, type VictoryOptions } from '../victory/index.ts';
import { validMatch } from './rounds.ts';
export {
  createMatch,
  validMatch,
  completeBasicTurn,
  roundStatus,
} from './rounds.ts';

/** Full catalog land + cumulative construction cost; never liquidation or takeover price. */
export function rankAssets(
  state: EconomyState,
  context: EconomyContext,
): readonly AssetRank[] {
  validateEconomyState(state, context);
  if (state.economy.pendingDebt)
    throw new Error('Settle debt before asset ranking');
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
  if (state.economy.pendingDebt) return { state, events: [] };
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
