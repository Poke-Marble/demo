import type { BoardSide, CityGroupId, TileId } from '../../game/contracts';
import type { BoardDefinition, BoardTile, Region } from './types.ts';
import { finalFacilities } from './facilities.ts';

const wiki = (name: string) =>
  `https://pokemon.fandom.com/ko/wiki/${encodeURIComponent(name.replaceAll(' ', '_'))}`;
const tileId = (slug: string): TileId => `tile:kj:${slug}`;
const groupId = (slug: string): CityGroupId => `group:kj:${slug}`;

// Travel/story chapters, not geographic reconstruction or ascending prices.
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
    slug: 'kanto-east',
    name: '관동 달맞이산·항구 여행',
    side: 'south',
    region: 'kanto',
    places: [
      ['mt-moon', '달맞이산', 'poi'],
      ['cerulean', '블루시티'],
      ['vermilion', '갈색시티'],
    ],
  },
  {
    slug: 'kanto-central',
    name: '관동 대도시 사건',
    side: 'west',
    region: 'kanto',
    places: [
      ['lavender', '보라타운'],
      ['celadon', '무지개시티'],
      ['saffron', '노랑시티'],
    ],
  },
  {
    slug: 'kanto-coast',
    name: '관동 사파리·남부 해안',
    side: 'west',
    region: 'kanto',
    places: [
      ['fuchsia', '연분홍시티'],
      ['safari-kanto', '관동 사파리존', 'poi'],
      ['cinnabar', '홍련마을'],
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
    name: '성도 유적·로켓단 단서',
    side: 'north',
    region: 'johto',
    places: [
      ['ruins-alph', '알프의 유적', 'poi'],
      ['azalea', '고동마을'],
      ['goldenrod', '금빛시티'],
    ],
  },
  {
    slug: 'johto-tradition',
    name: '성도 전설·등대·황토 사건',
    side: 'east',
    region: 'johto',
    places: [
      ['ecruteak', '인주시티'],
      ['olivine', '담청시티'],
      ['mahogany', '황토마을'],
    ],
  },
  {
    slug: 'summit',
    name: '성도·관동 정상',
    side: 'east',
    region: 'johto',
    places: [
      ['blackthorn', '검은먹시티'],
      ['indigo', '석영고원', 'poi'],
      ['mt-silver', '은빛산', 'poi'],
    ],
  },
] as const;

// Preserve v2 place-specific draft prices independently of the new chapters.
const draftPrices = {
  pallet: 100,
  viridian: 100,
  pewter: 100,
  fuchsia: 130,
  cinnabar: 130,
  'safari-kanto': 130,
  cerulean: 160,
  vermilion: 160,
  lavender: 160,
  celadon: 190,
  saffron: 190,
  'mt-moon': 190,
  'new-bark': 220,
  cherrygrove: 220,
  violet: 220,
  azalea: 250,
  goldenrod: 250,
  olivine: 250,
  ecruteak: 280,
  mahogany: 280,
  'ruins-alph': 280,
  blackthorn: 310,
  'mt-silver': 310,
  indigo: 310,
} as const satisfies Readonly<Record<keyof typeof finalFacilities, number>>;

const cities: BoardTile[][] = groups.map((group) =>
  group.places.map((place): BoardTile => {
    const [slug, nameKo] = place;
    const price = draftPrices[slug];
    return {
      id: tileId(slug),
      kind: 'city',
      nameKo,
      groupId: groupId(group.slug),
      side: group.side,
      region: slug === 'indigo' ? 'shared' : group.region,
      placeKind: place.length === 3 ? 'point-of-interest' : 'settlement',
      sourceUrl: wiki(nameKo),
      finalFacility: finalFacilities[slug],
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
  id: 'map:kanto-johto:v3',
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
    landmark(
      'power-plant',
      '무인발전소',
      'kanto',
      'south',
      '무인 발전소 (관동)',
    ),
    special('lugia-trial', '소용돌이섬 · 루기아 시험', 'west'),
    ...cities.slice(2, 4).flat(),
    landmark('seafoam', '쌍둥이섬', 'kanto', 'west'),
    special('ho-oh-trial', '방울탑 · 칠색조 시험', 'north'),
    ...cities.slice(4, 6).flat(),
    // Legacy IDs preserve saved holdings and the four-landmark victory target.
    landmark('whirl', '분노의호수', 'johto', 'north', '분노의 호수'),
    special('fly', '공중날기', 'east'),
    ...cities.slice(6, 8).flat(),
    landmark('bell-tower', '용의굴', 'johto', 'east', '용의 굴'),
  ],
  cityGroups: groups.map((group) => ({
    id: groupId(group.slug),
    nameKo: group.name,
    cityIds: group.places.map(([slug]) => tileId(slug)),
  })),
};
