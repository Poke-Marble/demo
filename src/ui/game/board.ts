import { modelPlacement } from './art/model-geometry';
import {
  constructionFromHolding,
  type ConstructionVisual,
  type BuildingMetadata,
} from './art/construction';
import { alignPawnFoot } from './art/pawn-foot';
import { createArtCredits } from './art/credits';
import {
  ownerFromInput,
  ownerTheme,
  ownerDescription,
  applyConstructionOwner,
  type OwnerVisual,
} from './art/ownership';
import {
  animateConstruction,
  shouldAnimateConstruction,
} from './art/buildings';
import type { PokemonId, TileId } from '../../game/contracts';
import type { GameView } from './adapter';
import { boardCells } from './presentation';
import {
  atPoint,
  createFacility,
  createIsoGround,
  createIsoTrees,
  createTileFaces,
  placeTile,
} from './isometric';
import { depthOrder, pawnFoot, sceneSize, tileGeometry } from './projection';

export function createProjectedBoard(options: {
  view: GameView;
  dice: string;
  animating: boolean;
  positions: ReadonlyMap<string, TileId>;
  from: ReadonlyMap<string, TileId>;
  sprite(id: PokemonId, walk?: boolean): HTMLElement;
  openTile(id: TileId): void;
  construction?: ReadonlyMap<TileId, ConstructionVisual>;
  previousConstruction?: ReadonlyMap<TileId, ConstructionVisual>;
  visualMetadata?: ReadonlyMap<TileId, BuildingMetadata>;
  ownership?: ReadonlyMap<TileId, OwnerVisual | null>;
}) {
  const { view, positions, from } = options;
  const board = document.createElement('div');
  board.className = 'pm-board pm-board-iso';
  board.setAttribute('aria-label', `${view.map.tiles.length}칸 입체 게임 보드`);
  const { side, cells } = boardCells(view.map.tiles.length);
  board.append(createIsoGround(), ...createIsoTrees(side));
  const center = document.createElement('div');
  center.className = 'pm-iso-center';
  const turn = document.createElement('small');
  turn.textContent = `TURN ${view.state.turnNumber}`;
  const dice = document.createElement('span');
  dice.className = 'pm-dice';
  dice.textContent = options.dice;
  center.append(turn, dice);
  board.append(createArtCredits());
  board.append(center);
  view.map.tiles.forEach((tile, index) => {
    const cell = cells[index]!,
      g = tileGeometry(cell, side);
    const tileButton = document.createElement('button');
    tileButton.type = 'button';
    tileButton.className = `pm-iso-tile pm-${tile.kind}`;
    tileButton.dataset.focus = tile.id;
    tileButton.dataset.tileId = tile.id;
    const holding = view.state.holdings.find((h) => h.tileId === tile.id);
    const requested = options.construction?.get(tile.id);
    const base = requested ?? constructionFromHolding(holding);
    const explicit =
      options.ownership?.has(tile.id) || requested?.owner !== undefined;
    const resolved = ownerFromInput(
      options.ownership?.has(tile.id)
        ? (options.ownership.get(tile.id) ?? null)
        : requested?.owner,
      holding?.ownerId,
      view.state.players,
    );
    const visual = applyConstructionOwner(
      base,
      explicit ? resolved : (resolved ?? undefined),
    );
    const owner = visual.stage === 'unowned' ? null : resolved;
    tileButton.dataset.ownerId = owner?.id ?? '';
    tileButton.dataset.ownerType = ownerTheme(owner).key;
    const group =
      tile.kind === 'city'
        ? view.map.cityGroups.find((g) => g.id === tile.groupId)
        : undefined;
    const groupIndex = group
      ? view.map.cityGroups.findIndex((g) => g.id === group.id) + 1
      : 0;
    if (group) tileButton.dataset.groupId = group.id;
    const info =
      (tile.kind === 'city' ? ` · ${visual.stage}` : '') +
      ` · ${owner ? ownerDescription(owner) : visual.stage === 'unowned' ? '미소유' : '소유자 미지정 · 중립'}` +
      (group ? ` · 그룹 ${group.nameKo}` : '');
    tileButton.setAttribute('aria-label', tile.nameKo + info);
    tileButton.title = tile.nameKo + info;
    tileButton.onclick = () => options.openTile(tile.id);
    placeTile(tileButton, g);
    tileButton.append(createTileFaces(tile.kind, g, owner));
    board.append(tileButton);
    const label = document.createElement('span');
    label.className = 'pm-iso-label';
    if (group) {
      const marker = document.createElement('small');
      marker.className = 'pm-group-marker';
      marker.textContent = `G${groupIndex}`;
      label.append(marker);
    }
    label.append(tile.nameKo);
    label.setAttribute('aria-hidden', 'true');
    atPoint(label, { x: g.x, y: g.y + g.height / 2 + g.thickness + 8 }, 20000);
    label.style.maxWidth = `${(g.width / sceneSize.width) * 100}%`;
    board.append(label);
    {
      const building = document.createElement('span');
      building.setAttribute('aria-hidden', 'true');
      building.className = `pm-iso-facility ${tile.kind === 'landmark' ? 'is-landmark' : ''}`;
      building.title = tile.nameKo + info;
      const placement = modelPlacement(g);
      atPoint(building, placement, depthOrder({ x: g.x, y: placement.depthY }));
      building.style.width = `${(placement.width / sceneSize.width) * 100}%`;
      building.style.height = `${(placement.height / sceneSize.height) * 100}%`;
      building.dataset.tileId = tile.id;
      building.append(
        createFacility(
          tile.kind,
          holding?.facilityLevel ?? 0,
          index,
          { ...tile, ...options.visualMetadata?.get(tile.id) },
          visual,
        ),
      );
      if (
        tile.kind === 'city' &&
        shouldAnimateConstruction(
          options.previousConstruction?.get(tile.id),
          visual,
        )
      )
        animateConstruction(building.firstElementChild!);
      board.append(building);
    }
  });
  view.state.players.forEach((player, seat) => {
    if (player.bankrupt) return;
    const tileId = positions.get(player.id) ?? player.position;
    const index = view.map.tiles.findIndex((tile) => tile.id === tileId);
    if (index < 0) return;
    const point = pawnFoot(cells[index]!, side, seat);
    const pawn = document.createElement('span');
    pawn.className = `pm-iso-pawn pm-player-${seat}`;
    pawn.setAttribute('role', 'img');
    pawn.setAttribute('aria-label', player.name);
    pawn.title = `${player.name} · ${view.map.tiles[index]!.nameKo}`;
    const shadow = document.createElement('span');
    shadow.className = 'pm-pawn-shadow';
    const figure = options.sprite(player.pokemonId, positions.has(player.id));
    figure.classList.add('pm-pawn-figure');
    alignPawnFoot(figure);
    pawn.append(shadow, figure);
    atPoint(pawn, point);
    board.append(pawn);
    const oldId = from.get(player.id),
      oldIndex = view.map.tiles.findIndex((tile) => tile.id === oldId);
    if (
      oldIndex >= 0 &&
      oldId !== tileId &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const previous = pawnFoot(cells[oldIndex]!, side, seat);
      pawn.animate(
        [
          {
            left: `${(previous.x / sceneSize.width) * 100}%`,
            top: `${(previous.y / sceneSize.height) * 100}%`,
            zIndex: depthOrder(previous),
          },
          {
            left: `${(point.x / sceneSize.width) * 100}%`,
            top: `${(point.y / sceneSize.height) * 100}%`,
            zIndex: depthOrder(point),
          },
        ],
        { duration: 220, easing: 'linear' },
      );
      figure.animate(
        [{ translate: '0 0' }, { translate: '0 -5px' }, { translate: '0 0' }],
        { duration: 220, easing: 'ease-out' },
      );
    }
  });
  return board;
}
