import type { BoardSide, CityGroupId, TileId } from '../../game/contracts';
import type { BoardDefinition, BoardTile, Region } from './types.ts';

const wiki = (name: string) =>
  `https://pokemon.fandom.com/ko/wiki/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
const tileId = (slug: string): TileId => `tile:kj:${slug}`;
const groupId = (slug: string): CityGroupId => `group:kj:${slug}`;

// Group ordering is a board design choice, not a reconstruction of the routes.
const groups = [
  {
    slug: 'kanto-origin',
    name: '관동 시작',
    side: 'south',
    region: 'kanto',
    places: [
      ['pallet', '태초마을'],
      ['viridian', '상록시티'],
      ['pewter', '회색시티'],
    ],
  },
  {
    slug: 'kanto-coast',
    name: '관동 해안',
    side: 'south',
    region: 'kanto',
    places: [
      ['fuchsia', '연분홍시티'],
      ['cinnabar', '홍련마을'],
      ['safari-kanto', '관동 사파리존', 'poi'],
    ],
  },
  {
    slug: 'kanto-east',
    name: '관동 동부',
    side: 'west',
    region: 'kanto',
    places: [
      ['cerulean', '블루시티'],
      ['vermilion', '갈색시티'],
      ['lavender', '보라타운'],
    ],
  },
  {
    slug: 'kanto-central',
    name: '관동 중심',
    side: 'west',
    region: 'kanto',
    places: [
      ['celadon', '무지개시티'],
      ['saffron', '노랑시티'],
      ['mt-moon', '달맞이산', 'poi'],
    ],
  },
  {
    slug: 'johto-origin',
    name: '성도 시작',
    side: 'north',
    region: 'johto',
    places: [
      ['new-bark', '연두마을'],
      ['cherrygrove', '무궁시티'],
      ['violet', '도라지시티'],
    ],
  },
  {
    slug: 'johto-west',
    name: '성도 서부',
    side: 'north',
    region: 'johto',
    places: [
      ['azalea', '고동마을'],
      ['goldenrod', '금빛시티'],
      ['olivine', '담청시티'],
    ],
  },
  {
    slug: 'johto-tradition',
    name: '성도 전통',
    side: 'east',
    region: 'johto',
    places: [
      ['ecruteak', '인주시티'],
      ['mahogany', '황토마을'],
      ['ruins-alph', '알프의 유적', 'poi'],
    ],
  },
  {
    slug: 'summit',
    name: '성도·관동 정상',
    side: 'east',
    region: 'johto',
    places: [
      ['blackthorn', '검은먹시티'],
      ['mt-silver', '은빛산', 'poi'],
      ['indigo', '석영고원', 'poi'],
    ],
  },
] as const;

const cities: BoardTile[][] = groups.map((group, rank) =>
  group.places.map((place): BoardTile => {
    const [slug, nameKo] = place;
    const price = 100 + rank * 30;
    return {
      id: tileId(slug),
      kind: 'city',
      nameKo,
      groupId: groupId(group.slug),
      side: group.side,
      region: slug === 'indigo' ? 'shared' : group.region,
      placeKind: place.length === 3 ? 'point-of-interest' : 'settlement',
      sourceUrl: wiki(nameKo),
      economy: {
        purchasePrice: price,
        upgradeCosts: [price / 2, price / 2, price / 2],
        tollByLevel: [price / 10, price / 2, price, price * 2],
      },
    };
  }),
);

function landmark(
  slug: string,
  nameKo: string,
  region: Region,
  side: BoardSide,
  sourceName = nameKo,
): BoardTile {
  return {
    id: tileId(slug),
    kind: 'landmark',
    nameKo,
    region,
    side,
    placeKind: 'point-of-interest',
    sourceUrl: wiki(sourceName),
    economy: { purchasePrice: 250, upgradeCosts: [], tollByLevel: [50] },
  };
}

function special(
  special: 'lugia-trial' | 'ho-oh-trial' | 'fly',
  nameKo: string,
  side: BoardSide,
): BoardTile {
  return {
    id: tileId(special),
    kind: 'special',
    special,
    nameKo,
    side,
    region: 'johto',
    placeKind: 'special',
    sourceUrl: wiki(
      special === 'lugia-trial'
        ? '소용돌이섬'
        : special === 'ho-oh-trial'
          ? '방울탑'
          : '공중날기',
    ),
  };
}

export const kantoJohtoMap: BoardDefinition = {
  id: 'map:kanto-johto:v2',
  completeness: 'complete',
  assumptions: {
    tileCount: 32,
    groupCount: 8,
    groupsToMonopolize: 3,
    landmarksToMonopolize: 4,
    maxCityLevel: 3,
    sideOrder: ['south', 'west', 'north', 'east'],
    slotsPerSide: 8,
  },
  tiles: [
    {
      id: tileId('start'),
      kind: 'start',
      nameKo: '출발',
      side: 'south',
      region: 'shared',
      placeKind: 'start',
      sourceUrl: '',
    },
    ...cities.slice(0, 2).flat(),
    landmark('seafoam', '쌍둥이섬', 'kanto', 'south'),
    special('lugia-trial', '소용돌이섬 · 루기아 시험', 'west'),
    ...cities.slice(2, 4).flat(),
    landmark(
      'power-plant',
      '무인발전소',
      'kanto',
      'west',
      '무인 발전소 (관동)',
    ),
    special('ho-oh-trial', '방울탑 · 칠색조 시험', 'north'),
    ...cities.slice(4, 6).flat(),
    landmark('whirl', '소용돌이섬', 'johto', 'north'),
    special('fly', '공중날기', 'east'),
    ...cities.slice(6, 8).flat(),
    landmark('bell-tower', '방울탑', 'johto', 'east'),
  ],
  cityGroups: groups.map((group) => ({
    id: groupId(group.slug),
    nameKo: group.name,
    cityIds: group.places.map(([slug]) => tileId(slug)),
  })),
};
