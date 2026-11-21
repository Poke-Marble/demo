import type { GameState, MatchState } from '../contracts.ts';
import { rulesPresets, normalizeRulesPreset } from '../rulesets.ts';

export function createMatch(
  rulesPreset: 'standard' | 'quick' = 'standard',
  playerIds: readonly GameState['activePlayerId'][] = [],
): MatchState {
  normalizeRulesPreset(rulesPreset);
  return {
    rulesPreset,
    roundLimit: rulesPresets[rulesPreset].roundLimit,
    completedRounds: 0,
    completedBasicTurnsByPlayerId: Object.fromEntries(
      playerIds.map((id) => [id, 0]),
    ),
    finalRanking: null,
  };
}

export function validMatch(state: GameState): boolean {
  const m = state.match;
  return (
    !m ||
    ((m.rulesPreset === 'standard' || m.rulesPreset === 'quick') &&
      m.roundLimit === rulesPresets[m.rulesPreset].roundLimit &&
      Number.isSafeInteger(m.completedRounds) &&
      m.completedRounds >= 0 &&
      m.completedRounds <= m.roundLimit &&
      !!m.completedBasicTurnsByPlayerId &&
      Object.keys(m.completedBasicTurnsByPlayerId).length ===
        state.players.length &&
      state.players.every(
        (p) =>
          Number.isSafeInteger(m.completedBasicTurnsByPlayerId[p.id]) &&
          m.completedBasicTurnsByPlayerId[p.id]! >= 0,
      ))
  );
}

/** Called only on completion of a basic turn. Skipped bankrupt seats still wrap the cycle. */
export function completeBasicTurn(
  state: GameState,
  nextPlayerId: GameState['activePlayerId'],
): MatchState | undefined {
  if (!state.match) return undefined;
  const from = state.players.findIndex((p) => p.id === state.activePlayerId);
  const to = state.players.findIndex((p) => p.id === nextPlayerId);
  return {
    ...state.match,
    completedRounds: state.match.completedRounds + (to <= from ? 1 : 0),
    completedBasicTurnsByPlayerId: {
      ...state.match.completedBasicTurnsByPlayerId,
      [state.activePlayerId]:
        state.match.completedBasicTurnsByPlayerId[state.activePlayerId]! + 1,
    },
  };
}

export function roundStatus(state: GameState): string {
  const m = state.match;
  if (!m) return `TURN ${state.turnNumber}`;
  return `ROUND ${Math.min(m.completedRounds + 1, m.roundLimit)}/${m.roundLimit} · 남은 ${Math.max(0, m.roundLimit - m.completedRounds)} ROUND`;
}
