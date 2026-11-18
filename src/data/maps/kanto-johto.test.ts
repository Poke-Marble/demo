// Run: node --experimental-strip-types src/data/maps/kanto-johto.test.ts
import { kantoJohtoMap } from './kanto-johto.ts';
import { toMapDefinition } from './types.ts';
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
      .join(',') === '쌍둥이섬,무인발전소,소용돌이섬,방울탑',
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
          new Set(ids).size === ids.length && ids.length >= 9,
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
