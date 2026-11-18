import type { GameState, PokemonId } from '../../game/contracts';
import type { SetupParticipant } from './adapter';

export const startingPartners: {
  id: PokemonId;
  name: string;
  type: string;
  color: string;
}[] = [
  { id: 'pokemon:0001', name: '이상해씨', type: '풀', color: 'grass' },
  { id: 'pokemon:0004', name: '파이리', type: '불꽃', color: 'fire' },
  { id: 'pokemon:0007', name: '꼬부기', type: '물', color: 'water' },
  { id: 'pokemon:0025', name: '피카츄', type: '전기', color: 'electric' },
];

/** Initial UI assignment only: no balances, positions, turn or AI decisions. */
export function createInitialRoster(
  selected: PokemonId,
): readonly SetupParticipant[] {
  if (!startingPartners.some((partner) => partner.id === selected))
    throw new Error('선택할 수 없는 스타팅입니다.');
  const ordered = [
    selected,
    ...startingPartners
      .filter((partner) => partner.id !== selected)
      .map((partner) => partner.id),
  ];
  return ordered.map((pokemonId, i) => ({
    id: `player:${i + 1}`,
    name: i === 0 ? '나' : `COMPUTER ${i}`,
    pokemonId,
    controller: i === 0 ? 'human' : 'computer',
  }));
}

export function isHumanTurn(
  state: Pick<GameState, 'phase' | 'activePlayerId'>,
  participants: readonly SetupParticipant[],
) {
  return (
    state.phase === 'playing' &&
    participants.some(
      (p) => p.id === state.activePlayerId && p.controller === 'human',
    )
  );
}
