// Run: node --experimental-strip-types src/data/maps/kanto-johto.test.ts
import { kantoJohtoMap } from './kanto-johto.ts';
import { constructionStages, toMapDefinition } from './types.ts';
import type { BoardDefinition, BoardTile } from './types.ts';
import { assertValidMap, validateMap } from './validate.ts';

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
const board = kantoJohtoMap;
const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);
const rejects = (changed: BoardDefinition, fragment: string) => {
  const result = validateMap(changed);
  check(
    !result.valid && result.errors.some((error) => error.includes(fragment)),
    `Expected rejection: ${fragment}`,
  );
};
const withTile = (
  index: number,
  update: (tile: BoardTile) => BoardTile,
): BoardDefinition => ({
  ...board,
  tiles: board.tiles.map((tile, i) => (i === index ? update(tile) : tile)),
});

test('32 slots, 8 groups, 19 settlements and 4 named landmarks', () => {
  assertValidMap(board);
  check(
    board.tiles.length === 32 && board.cityGroups.length === 8,
    'MVP dimensions',
  );
  check(
    board.tiles.filter((tile) => tile.placeKind === 'settlement').length === 19,
    'Settlement count',
  );
  check(
    board.tiles
      .filter((tile) => tile.kind === 'landmark')
      .map((tile) => tile.nameKo)
      .join(',') === '무인발전소,쌍둥이섬,소용돌이섬,방울탑',
    'Landmark candidates',
  );
});
test('all 56 triples of groups form independent attainable ownership sets', () => {
  const { groups } = validateMap(board).monopolyTargets;
  let combinations = 0;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      for (let k = j + 1; k < groups.length; k++) {
        const chosen = [groups[i]!, groups[j]!, groups[k]!];
        const ids = chosen.flat();
        check(
          new Set(ids).size === ids.length && ids.length === 9,
          'Groups overlap or are empty',
        );
        check(
          ids.every((id) =>
            board.tiles.some((tile) => tile.id === id && tile.kind === 'city'),
          ),
          'Unpurchasable target',
        );
        combinations++;
      }
    }
  }
  check(combinations === 56, 'Missing group triple');
});

test('corners are nonpurchasable, eight groups each have three cities, projection preserves specials', () => {
  check(
    board.cityGroups.every((group) => group.cityIds.length === 3),
    'Group sizes',
  );
  check(
    board.tiles.filter((tile) => tile.kind === 'city').length === 24,
    'City count',
  );
  const core = toMapDefinition(board);
  for (const [index, special] of [
    [8, 'lugia-trial'],
    [16, 'ho-oh-trial'],
    [24, 'fly'],
  ] as const) {
    const tile = board.tiles[index]!;
    check(
      tile.kind === 'special' && tile.special === special && !tile.economy,
      'Special corner',
    );
    const projected = core.tiles[index]!;
    check(
      projected.kind === 'special' && projected.special === special,
      'Special projection',
    );
    rejects(
      withTile(index, (tile) => ({
        ...tile,
        economy: { purchasePrice: 1, upgradeCosts: [], tollByLevel: [1] },
      })),
      'Special cannot',
    );
  }
  rejects(
    withTile(8, (tile) => ({ ...tile, kind: 'landmark' })),
    'Wrong special corner',
  );
  rejects(
    withTile(1, (tile) => ({ ...tile, kind: 'special', special: 'fly' })),
    'Exactly three special',
  );
});
test('all four sides and all four landmarks have purchasable distinct targets', () => {
  const targets = validateMap(board).monopolyTargets;
  check(
    Object.values(targets.sides)
      .map((ids) => ids.length)
      .join(',') === '6,6,6,6',
    'Side target sizes',
  );
  check(
    new Set(Object.values(targets.sides).flat()).size === 24,
    'Side coverage',
  );
  check(
    targets.landmarks.length === 4 && new Set(targets.landmarks).size === 4,
    'Landmark coverage',
  );
  check(
    targets.landmarks.every((id) =>
      board.tiles.some((tile) => tile.id === id && tile.economy),
    ),
    'Unpurchasable landmark',
  );
});
test('projection preserves core IDs, group membership and movement order', () => {
  const core = toMapDefinition(board);
  check(
    core.tiles.map((tile) => tile.id).join() ===
      board.tiles.map((tile) => tile.id).join(),
    'Movement order changed',
  );
  check(
    JSON.stringify(core.cityGroups) === JSON.stringify(board.cityGroups),
    'Group mapping changed',
  );
  check(
    core.tiles.every((tile) => !('economy' in tile) && !('placeKind' in tile)),
    'Metadata leaked',
  );
});

test('travel chapters connect early routes, urban events, Johto clues and the post-League summit', () => {
  const chapters = [
    ['pallet', 'viridian', 'pewter'],
    ['mt-moon', 'cerulean', 'vermilion'],
    ['lavender', 'celadon', 'saffron'],
    ['fuchsia', 'safari-kanto', 'cinnabar'],
    ['new-bark', 'cherrygrove', 'violet'],
    ['ruins-alph', 'azalea', 'goldenrod'],
    ['ecruteak', 'olivine', 'mahogany'],
    ['blackthorn', 'indigo', 'mt-silver'],
  ];
  check(
    board.id === 'map:kanto-johto:v3',
    'New layout needs a distinct save identity',
  );
  chapters.forEach((places, index) => {
    check(
      board.cityGroups[index]!.cityIds.join() ===
        places.map((slug) => `tile:kj:${slug}`).join(),
      'Travel chapter order',
    );
  });
  for (const side of ['south', 'west', 'north', 'east'] as const) {
    const groups = board.cityGroups.filter((group) =>
      group.cityIds.every(
        (id) => board.tiles.find((tile) => tile.id === id)?.side === side,
      ),
    );
    check(
      groups.length === 2 &&
        groups.flatMap((group) => group.cityIds).length === 6,
      'Two complete groups per line',
    );
  }
  const prices = board.tiles
    .filter((tile) => tile.side === 'south' && tile.kind === 'city')
    .map((tile) => tile.economy!.purchasePrice);
  check(
    prices.some((price, i) => i > 0 && price < prices[i - 1]!),
    'Travel order must not be replaced by ascending draft prices',
  );
});

test('construction content is diverse, optional, sourced and absent from the core projection', () => {
  check(
    constructionStages.map((stage) => stage.key).join() ===
      'camp,shop,center,final-facility',
    'Construction display stages',
  );
  check(constructionStages[0].marker === 'flag', 'Camp ownership marker');
  const cities = board.tiles.filter((tile) => tile.kind === 'city');
  check(
    cities.every((tile) => tile.finalFacility),
    'Every current destination has a facility proposal',
  );
  check(
    new Set(cities.map((tile) => tile.finalFacility!.key)).size === 24,
    'Distinct facility keys',
  );
  for (const [slug, key] of [
    ['pallet', 'oak-lab'],
    ['new-bark', 'elm-lab'],
    ['celadon', 'celadon-department-store'],
    ['saffron', 'silph-head-office'],
    ['goldenrod', 'goldenrod-radio-tower'],
    ['olivine', 'olivine-lighthouse'],
    ['ecruteak', 'ecruteak-dance-theater'],
  ]) {
    check(
      cities.find((tile) => tile.id === `tile:kj:${slug}`)?.finalFacility
        ?.key === key,
      'Representative facility',
    );
  }
  check(
    cities.filter((tile) => tile.finalFacility!.key.endsWith('-gym')).length ===
      2,
    'Gyms are not the universal final facility',
  );
  check(
    cities.filter((tile) => tile.finalFacility!.basis === 'board-adaptation')
      .length === 5,
    'Creative facilities explicitly distinguished',
  );
  check(
    board.tiles
      .filter((tile) => tile.kind !== 'city')
      .every((tile) => !tile.finalFacility),
    'Noncities have no city facilities',
  );
  check(
    toMapDefinition(board).tiles.every((tile) => !('finalFacility' in tile)),
    'Core does not depend on art metadata',
  );
  const withoutFacilities = {
    ...board,
    tiles: board.tiles.map((tile) => {
      const { finalFacility: ignored, ...rest } = tile;
      void ignored;
      return rest;
    }),
  };
  assertValidMap(withoutFacilities);
});

test('reject malformed, duplicate, unsourced, misplaced or trial-derived final facilities', () => {
  const facility = board.tiles[1]!.finalFacility!;
  for (const patch of [{ key: '' }, { nameKo: '' }, { noteKo: '' }]) {
    rejects(
      withTile(1, (tile) => ({
        ...tile,
        finalFacility: { ...facility, ...patch },
      })),
      'Invalid final facility',
    );
  }
  rejects(
    withTile(2, (tile) => ({ ...tile, finalFacility: facility })),
    'Duplicate final facility',
  );
  rejects(
    withTile(1, (tile) => ({
      ...tile,
      finalFacility: { ...facility, sourceUrl: '' },
    })),
    'Missing facility source',
  );
  rejects(
    withTile(7, (tile) => ({ ...tile, finalFacility: facility })),
    'Only cities',
  );
  rejects(
    withTile(8, (tile) => ({ ...tile, finalFacility: facility })),
    'Only cities',
  );
  rejects(
    withTile(1, (tile) => ({
      ...tile,
      finalFacility: { ...facility, key: 'bell-tower' },
    })),
    'Trial location reused',
  );
  rejects(
    withTile(1, (tile) => ({
      ...tile,
      finalFacility: {
        ...facility,
        sourceUrl: 'https://bulbapedia.bulbagarden.net/wiki/Whirl_Islands',
      },
    })),
    'Trial location reused',
  );
  const first = board.cityGroups[0]!;
  rejects(
    {
      ...board,
      cityGroups: [
        {
          ...first,
          cityIds: [first.cityIds[0]!, first.cityIds[1]!, board.tiles[9]!.id],
        },
        ...board.cityGroups.slice(1),
      ],
    },
    'Group must stay on one side',
  );
});
test('reject duplicate IDs and names, missing start and wrong dimensions', () => {
  rejects(
    withTile(1, (tile) => ({ ...tile, id: board.tiles[0]!.id })),
    'Duplicate tile ID',
  );
  rejects(
    withTile(1, (tile) => ({ ...tile, nameKo: board.tiles[0]!.nameKo })),
    'Duplicate tile name',
  );
  rejects({ ...board, tiles: board.tiles.slice(1) }, 'Exactly one start');
  rejects({ ...board, tiles: board.tiles.slice(0, -1) }, 'Tile count');
});
test('reject dangling, duplicate, mismatched and absent group memberships', () => {
  const first = board.cityGroups[0]!;
  rejects(
    {
      ...board,
      cityGroups: [
        { ...first, cityIds: ['tile:missing', ...first.cityIds] },
        ...board.cityGroups.slice(1),
      ],
    },
    'Invalid group reference',
  );
  rejects(
    {
      ...board,
      cityGroups: [
        { ...first, cityIds: [...first.cityIds, first.cityIds[0]!] },
        ...board.cityGroups.slice(1),
      ],
    },
    'Duplicate group member',
  );
  rejects(
    {
      ...board,
      cityGroups: [{ ...first, cityIds: [] }, ...board.cityGroups.slice(1)],
    },
    'exactly one group',
  );
  rejects(
    withTile(1, (tile) =>
      tile.kind === 'city' ? { ...tile, groupId: 'group:wrong' } : tile,
    ),
    'Invalid group reference',
  );
});
test('reject invalid sides, empty side targets and impossible monopoly thresholds', () => {
  rejects(
    withTile(1, (tile) => ({ ...tile, side: 'north' })),
    'Wrong side',
  );
  rejects(
    {
      ...board,
      tiles: board.tiles.map((tile) => ({ ...tile, side: 'south' })),
    },
    'Empty side',
  );
  rejects(
    { ...board, assumptions: { ...board.assumptions, groupsToMonopolize: 9 } },
    'Unattainable group',
  );
  rejects(
    {
      ...board,
      assumptions: { ...board.assumptions, landmarksToMonopolize: 5 },
    },
    'Landmark count',
  );
});
test('reject absent, negative, fractional, nonfinite or incomplete seeds', () => {
  rejects(
    withTile(1, (tile) => {
      const { economy: ignored, ...rest } = tile;
      void ignored;
      return rest;
    }),
    'Missing property seed',
  );
  for (const price of [-1, 1.5, Infinity, NaN]) {
    rejects(
      withTile(1, (tile) => ({
        ...tile,
        economy: { ...tile.economy!, purchasePrice: price },
      })),
      'Invalid price',
    );
  }
  rejects(
    withTile(1, (tile) => ({
      ...tile,
      economy: { ...tile.economy!, upgradeCosts: [10] },
    })),
    'Invalid upgrade costs',
  );
  rejects(
    withTile(1, (tile) => ({
      ...tile,
      economy: { ...tile.economy!, tollByLevel: [10, 5, 100, 200] },
    })),
    'Decreasing toll',
  );
  rejects(
    withTile(7, (tile) => ({
      ...tile,
      economy: { ...tile.economy!, upgradeCosts: [10] },
    })),
    'Invalid upgrade costs',
  );
});
test('reject missing sources and a purchasable start', () => {
  rejects(
    withTile(1, (tile) => ({ ...tile, sourceUrl: '' })),
    'Missing place source',
  );
  rejects(
    withTile(0, (tile) => ({
      ...tile,
      economy: { purchasePrice: 100, upgradeCosts: [], tollByLevel: [10] },
    })),
    'Start cannot',
  );
});

for (const [name, run] of tests) {
  run();
  console.log(`PASS ${name}`);
}
console.log(`${tests.length} map rule tests passed`);
