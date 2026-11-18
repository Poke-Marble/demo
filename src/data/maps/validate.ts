import type { BoardSide, TileId } from '../../game/contracts';
import type { BoardDefinition } from './types.ts';

export interface MapValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Static ownership targets only; this does not evaluate players or victory. */
  readonly monopolyTargets: {
    readonly groups: readonly (readonly TileId[])[];
    readonly sides: Readonly<Record<BoardSide, readonly TileId[]>>;
    readonly landmarks: readonly TileId[];
  };
}

const sides: readonly BoardSide[] = ['south', 'west', 'north', 'east'];
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;

/** Validates an already typed board, not arbitrary/untrusted JSON. */
export function validateMap(board: BoardDefinition): MapValidation {
  const errors: string[] = [];
  const fail = (condition: boolean, message: string) => {
    if (!condition) errors.push(message);
  };
  const { tiles, cityGroups, assumptions: a } = board;
  fail(board.completeness === 'complete', 'Map must be complete');
  fail(board.id.startsWith('map:'), 'Invalid map ID');
  fail(
    positive(a.tileCount) && tiles.length === a.tileCount,
    'Tile count mismatch',
  );
  fail(
    positive(a.groupCount) && cityGroups.length === a.groupCount,
    'Group count mismatch',
  );
  fail(
    positive(a.groupsToMonopolize) && a.groupsToMonopolize <= cityGroups.length,
    'Unattainable group monopoly',
  );
  fail(
    positive(a.landmarksToMonopolize),
    'Invalid landmark monopoly threshold',
  );
  fail(positive(a.maxCityLevel), 'Invalid city level limit');
  fail(
    positive(a.slotsPerSide) && a.slotsPerSide * 4 === tiles.length,
    'Invalid side capacity',
  );
  fail(
    a.sideOrder.length === 4 &&
      new Set(a.sideOrder).size === 4 &&
      a.sideOrder.every((side) => sides.includes(side)),
    'Side order must contain four distinct sides',
  );
  fail(
    tiles.filter((tile) => tile.kind === 'start').length === 1 &&
      tiles[0]?.kind === 'start',
    'Exactly one start must be at index 0',
  );
  fail(
    new Set(tiles.map((tile) => tile.id)).size === tiles.length,
    'Duplicate tile ID',
  );
  fail(
    new Set(tiles.map((tile) => tile.nameKo)).size === tiles.length,
    'Duplicate tile name',
  );
  fail(
    new Set(cityGroups.map((group) => group.id)).size === cityGroups.length,
    'Duplicate group ID',
  );

  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  const memberships = new Map<TileId, number>();
  for (const group of cityGroups) {
    fail(
      group.id.startsWith('group:') && group.nameKo.trim().length > 0,
      `Invalid group metadata: ${group.id}`,
    );
    fail(group.cityIds.length >= 2, `Empty or singleton group: ${group.id}`);
    fail(
      new Set(group.cityIds).size === group.cityIds.length,
      `Duplicate group member: ${group.id}`,
    );
    for (const id of group.cityIds) {
      memberships.set(id, (memberships.get(id) ?? 0) + 1);
      const tile = byId.get(id);
      fail(
        tile?.kind === 'city' && tile.groupId === group.id,
        `Invalid group reference: ${group.id}/${id}`,
      );
    }
  }
  for (const [index, tile] of tiles.entries()) {
    fail(
      tile.id.startsWith('tile:') && tile.nameKo.trim().length > 0,
      `Invalid tile metadata: ${tile.id}`,
    );
    fail(
      tile.side === a.sideOrder[Math.floor(index / a.slotsPerSide)],
      `Wrong side at index ${index}`,
    );
    if (tile.kind === 'start') {
      fail(
        tile.placeKind === 'start' && !tile.economy,
        'Start cannot be purchasable',
      );
      continue;
    }
    fail(
      tile.region === 'kanto' ||
        tile.region === 'johto' ||
        tile.region === 'shared',
      `Invalid region: ${tile.id}`,
    );
    fail(
      tile.placeKind === 'settlement' || tile.placeKind === 'point-of-interest',
      `Invalid place kind: ${tile.id}`,
    );
    fail(
      /^https:\/\//.test(tile.sourceUrl),
      `Missing place source: ${tile.id}`,
    );
    if (tile.kind === 'city') {
      fail(
        memberships.get(tile.id) === 1,
        `City must belong to exactly one group: ${tile.id}`,
      );
    } else {
      fail(
        !memberships.has(tile.id) && tile.placeKind === 'point-of-interest',
        `Landmark cannot be a city member: ${tile.id}`,
      );
    }
    const seed = tile.economy;
    if (!seed) {
      errors.push(`Missing property seed: ${tile.id}`);
      continue;
    }
    fail(positive(seed.purchasePrice), `Invalid price: ${tile.id}`);
    const levels = tile.kind === 'city' ? a.maxCityLevel : 0;
    fail(
      seed.upgradeCosts.length === levels && seed.upgradeCosts.every(positive),
      `Invalid upgrade costs: ${tile.id}`,
    );
    fail(
      seed.tollByLevel.length === levels + 1 &&
        seed.tollByLevel.every(positive),
      `Invalid toll levels: ${tile.id}`,
    );
    fail(
      seed.tollByLevel.every(
        (value, level, values) =>
          level === 0 || value >= (values[level - 1] ?? Infinity),
      ),
      `Decreasing toll: ${tile.id}`,
    );
  }
  const sideTargets: Record<BoardSide, TileId[]> = {
    south: [],
    west: [],
    north: [],
    east: [],
  };
  for (const tile of tiles) {
    if (tile.kind === 'city' && sides.includes(tile.side))
      sideTargets[tile.side].push(tile.id);
  }
  for (const side of sides)
    fail(sideTargets[side].length > 0, `Empty side monopoly: ${side}`);
  const landmarks = tiles
    .filter((tile) => tile.kind === 'landmark')
    .map((tile) => tile.id);
  fail(
    landmarks.length === a.landmarksToMonopolize,
    'Landmark count must equal monopoly threshold',
  );
  return {
    valid: errors.length === 0,
    errors,
    monopolyTargets: {
      groups: cityGroups.map((group) => [...group.cityIds]),
      sides: sideTargets,
      landmarks,
    },
  };
}

export function assertValidMap(board: BoardDefinition): void {
  const result = validateMap(board);
  if (!result.valid)
    throw new Error(`Invalid board:\n${result.errors.join('\n')}`);
}
