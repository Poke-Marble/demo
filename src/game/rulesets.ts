/** Shared new-game selector. Omitted values always select the standard rules. */
export type RulesPreset = 'standard' | 'quick';

export const rulesPresets = Object.freeze({
  standard: Object.freeze({
    roundLimit: 30,
    unlockLaps: Object.freeze([0, 0, 1, 2] as const),
  }),
  quick: Object.freeze({
    roundLimit: 20,
    unlockLaps: Object.freeze([0, 0, 1, 1] as const),
  }),
});

export function normalizeRulesPreset(
  value: RulesPreset = 'standard',
): RulesPreset {
  if (value !== 'standard' && value !== 'quick')
    throw new RangeError('invalid-rules-preset');
  return value;
}
