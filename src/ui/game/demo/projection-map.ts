import type { MapDefinition } from '../../../game/contracts';
/** 32-cell render fixture, NOT the complete Kanto/Johto game map or economy. */
const names = [
  '출발',
  '태초마을',
  '상록시티',
  '회색시티',
  '달맞이산',
  '블루시티',
  '정통시티',
  '갈색시티',
  '상트앙느호',
  '디그다굴',
  '보라타운',
  '무지개시티',
  '사파리존',
  '연분홍시티',
  '쌍둥이섬',
  '홍련마을',
  '은빛산',
  '연두마을',
  '무궁시티',
  '도라지시티',
  '알프유적',
  '고동마을',
  '너도밤나무숲',
  '금빛시티',
  '인주시티',
  '불탄탑',
  '담청시티',
  '진청시티',
  '빛남의등대',
  '황토마을',
  '얼음샛길',
  '검은먹시티',
];
export const projectionMap: MapDefinition = {
  id: 'map:kanto-johto:ui-projection-32',
  completeness: 'sample',
  tiles: names.map((nameKo, index) =>
    index === 0
      ? { id: `tile:projection:${index}`, nameKo, kind: 'start' }
      : index % 8 === 0
        ? { id: `tile:projection:${index}`, nameKo, kind: 'landmark' }
        : {
            id: `tile:projection:${index}`,
            nameKo,
            kind: 'city',
            groupId: 'group:projection:fixture',
            side: (['south', 'west', 'north', 'east'] as const)[
              Math.floor(index / 8)
            ]!,
          },
  ),
  cityGroups: [
    {
      id: 'group:projection:fixture',
      nameKo: 'UI 배치 확인용 그룹',
      cityIds: names.flatMap((_, i) =>
        i !== 0 && i % 8 !== 0 ? [`tile:projection:${i}` as const] : [],
      ),
    },
  ],
};
