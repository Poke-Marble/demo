/** Presentation only: never supplies movement distance or game RNG. */
export function diceLabel(
  values: readonly number[] | null,
  phase: 'rolling' | 'moving' | 'complete' = 'complete',
) {
  if (phase === 'rolling') return '굴리는 중…';
  if (!values?.length) return '이동 —';
  const total = values.reduce((sum, value) => sum + value, 0);
  return `이동 ${total}칸${phase === 'moving' ? ' · 이동 중…' : ' · 완료'}`;
}
