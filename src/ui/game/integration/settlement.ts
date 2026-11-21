import {
  verifyCommittedReceipt,
  type EconomyContext,
  type EconomyTransition,
} from '../../../game/economy/index.ts';
import type { AbilityActivation } from '../../../game/abilities/activation.ts';
import type { IntegratedState } from './adapter.ts';

/** Compatibility boundary: old automatic cash traits are disabled in real matches.
 * Pure historical ability modules remain available for isolated previews only.
 */
export function settleAbilities(
  _before: IntegratedState,
  context: EconomyContext,
  result: Extract<EconomyTransition<IntegratedState>, { ok: true }>,
): { next: IntegratedState; activations: AbilityActivation[] } {
  if (
    !result.replayed &&
    !verifyCommittedReceipt(result.state, context, result.receipt)
  )
    throw new Error('영수증 검증 실패');
  return { next: result.state, activations: [] };
}
