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
import {
  depthOrder,
  pawnFoot,
  projectWorld,
  sceneSize,
  tileGeometry,
} from './projection';

export function createProjectedBoard(options: {
  view: GameView;
  dice: string;
  animating: boolean;
  positions: ReadonlyMap<string, TileId>;
  from: ReadonlyMap<string, TileId>;
  sprite(id: PokemonId, walk?: boolean): HTMLElement;
  openTile(id: TileId): void;
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
  const title = document.createElement('strong');
  title.textContent = '관동 · 성도';
  const dice = document.createElement('span');
  dice.className = 'pm-dice';
  dice.textContent = options.dice;
  const hint = document.createElement('small');
  hint.textContent = options.animating
    ? '다음 마을로 이동 중'
    : 'Tiny Town · Kenney · CC0';
  center.append(turn, title, dice, hint);
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
    const info = holding ? ` · 시설 ${holding.facilityLevel}단계` : '';
    tileButton.setAttribute('aria-label', tile.nameKo + info);
    tileButton.title = tile.nameKo + info;
    tileButton.onclick = () => options.openTile(tile.id);
    placeTile(tileButton, g);
    tileButton.append(createTileFaces(tile.kind, g));
    board.append(tileButton);
    const label = document.createElement('span');
    label.className = 'pm-iso-label';
    label.textContent = tile.nameKo;
    label.setAttribute('aria-hidden', 'true');
    atPoint(label, { x: g.x, y: g.y + g.height / 2 + g.thickness + 8 }, 20000);
    label.style.maxWidth = `${(g.width / sceneSize.width) * 100}%`;
    board.append(label);
    if (tile.kind !== 'start') {
      const building = document.createElement('button');
      building.type = 'button';
      building.tabIndex = -1;
      building.setAttribute('aria-hidden', 'true');
      building.className = `pm-iso-facility ${tile.kind === 'landmark' ? 'is-landmark' : ''}`;
      building.title = tile.nameKo + info;
      building.onclick = () => {
        tileButton.focus();
        options.openTile(tile.id);
      };
      const base = projectWorld(
        cell.row - 1 - 0.18,
        cell.column - 1 - 0.12,
        side,
      );
      atPoint(building, base);
      building.style.width = `${(Math.min(70, g.width * 0.57) / sceneSize.width) * 100}%`;
      building.style.height = `${(Math.min(100, g.width * (tile.kind === 'landmark' ? 1.15 : 0.78) + Math.min(3, holding?.facilityLevel ?? 0) * 9) / sceneSize.height) * 100}%`;
      building.append(
        createFacility(tile.kind, holding?.facilityLevel ?? 0, index),
      );
      board.append(building);
    } else {
      const start = document.createElement('span');
      start.className = 'pm-iso-start';
      start.textContent = 'START';
      atPoint(start, g, 20001);
      board.append(start);
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
