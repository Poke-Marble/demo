import type { GameState, MapDefinition } from '../game/contracts';

/** 구조 확인용 4칸. 전체 맵, 실제 이동 경로, 그룹 구성 또는 경제 설계가 아니다. */
export const sampleMap = {
  id: 'map:kanto-johto:sample-v1',
  completeness: 'sample',
  tiles: [
    { id: 'tile:sample:start', kind: 'start', nameKo: '출발' },
    {
      id: 'tile:sample:pallet',
      kind: 'city',
      nameKo: '태초마을',
      groupId: 'group:sample:kanto',
      side: 'south',
    },
    {
      id: 'tile:sample:viridian',
      kind: 'city',
      nameKo: '상록시티',
      groupId: 'group:sample:kanto',
      side: 'south',
    },
    {
      id: 'tile:sample:landmark',
      kind: 'landmark',
      nameKo: '특별 명소 (샘플)',
    },
  ],
  cityGroups: [
    {
      id: 'group:sample:kanto',
      nameKo: '관동 샘플 그룹',
      cityIds: ['tile:sample:pallet', 'tile:sample:viridian'],
    },
  ],
} as const satisfies MapDefinition;

export const sampleState = {
  schemaVersion: 1,
  mapId: sampleMap.id,
  phase: 'setup',
  players: [
    {
      id: 'player:1',
      name: '플레이어 1',
      pokemonId: 'pokemon:0001',
      position: 'tile:sample:start',
      balance: 0,
      bankrupt: false,
    },
    {
      id: 'player:2',
      name: '플레이어 2',
      pokemonId: 'pokemon:0004',
      position: 'tile:sample:start',
      balance: 0,
      bankrupt: false,
    },
  ],
  activePlayerId: 'player:1',
  turnNumber: 0,
  holdings: [],
  victory: null,
} as const satisfies GameState;
