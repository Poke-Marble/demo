import type { BoardSide, MapDefinition, Tile } from '../../game/contracts';

export type Region = 'kanto' | 'johto';
export interface PropertySeed {
  readonly purchasePrice: number;
  /** Index 0 is level 0; city levels 1..3 each consume the corresponding cost. */
  readonly tollByLevel: readonly number[];
  readonly upgradeCosts: readonly number[];
}

/** Local extension: city means a normal purchasable destination, not geography. */
export type BoardTile = Tile & {
  readonly side: BoardSide;
  readonly region: Region | 'shared';
  readonly placeKind: 'start' | 'settlement' | 'point-of-interest';
  readonly sourceUrl: string;
  readonly economy?: PropertySeed;
};

export interface BoardDefinition extends MapDefinition {
  readonly tiles: readonly BoardTile[];
  readonly assumptions: {
    readonly tileCount: number;
    readonly groupCount: number;
    readonly groupsToMonopolize: number;
    readonly landmarksToMonopolize: number;
    readonly maxCityLevel: number;
    readonly sideOrder: readonly BoardSide[];
    readonly slotsPerSide: number;
  };
}

/** Explicit projection avoids making consumers depend on local metadata. */
export function toMapDefinition(board: BoardDefinition): MapDefinition {
  return {
    id: board.id,
    completeness: board.completeness,
    tiles: board.tiles.map((tile): Tile => {
      const base = { id: tile.id, nameKo: tile.nameKo };
      return tile.kind === 'city'
        ? { ...base, kind: 'city', groupId: tile.groupId, side: tile.side }
        : { ...base, kind: tile.kind };
    }),
    cityGroups: board.cityGroups.map((group) => ({
      ...group,
      cityIds: [...group.cityIds],
    })),
  };
}
