import { regionalScene, type ArtTile, type RegionalScene } from './places';
import { box, polygon } from './model-geometry';
import { createConstructionArt } from './buildings';
const NS = 'http://www.w3.org/2000/svg';
const foliage = ['#93ba81', '#689269', '#456f60'] as const;
const stone = ['#bdc5bc', '#8d9f9d', '#697f89'] as const;
const roof = ['#8caeab', '#63858c', '#496c7f'] as const;
export function createSceneryArt(scene: RegionalScene) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.setAttribute('class', 'pm-construction-model pm-scenery-model');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.scene = scene;
  let art = polygon(
    [
      [-20, -17, 0],
      [21, -17, 0],
      [21, 18, 0],
      [-20, 18, 0],
    ],
    '#304b55',
    0.18,
  );
  switch (scene) {
    case 'forest':
      art +=
        box(-3, -3, 6, 6, 23, ['#b9a47f', '#998364', '#7d755d']) +
        box(-15, -13, 30, 26, 12, foliage, 17) +
        box(-11, -9, 22, 18, 12, foliage, 29) +
        box(-6, -5, 12, 10, 8, foliage, 41);
      break;
    case 'whirl':
      art += box(-21, -18, 42, 36, 1, ['#80bdc9', '#548ba4', '#3a6f90']);
      art += box(-18, -13, 12, 13, 13, stone) + box(8, -7, 11, 12, 18, stone);
      for (let i = 0; i < 3; i++)
        art += polygon(
          [
            [-9 + i * 3, -1 + i * 3, 2],
            [5 + i * 2, -1 + i * 3, 2],
            [5 + i * 2, 2 + i * 3, 2],
            [-9 + i * 3, 2 + i * 3, 2],
          ],
          '#d2e7df',
        );
      break;
    case 'bell':
      for (let i = 0; i < 4; i++) {
        const size = 28 - i * 4,
          z = i * 13;
        art +=
          box(
            -size / 2,
            -size / 2,
            size,
            size,
            12,
            ['#e3c18b', '#be966b', '#957e70'],
            z,
          ) +
          box(
            -size / 2 - 3,
            -size / 2 - 3,
            size + 6,
            size + 6,
            3,
            roof,
            z + 12,
          );
      }
      art += box(-2, -2, 4, 4, 6, ['#f3d88e', '#d8b765', '#aa935d'], 57);
      break;
    case 'fly':
      art +=
        box(-20, -17, 40, 34, 2, ['#d6d9bf', '#a9bda9', '#8eaaa4']) +
        box(-2, -2, 4, 4, 38, stone) +
        box(0, -1, 17, 3, 5, ['#e9c787', '#d0a16e', '#ad8068'], 30) +
        polygon(
          [
            [-11, 5, 3],
            [-1, 5, 3],
            [-1, 1, 3],
            [10, 9, 3],
            [-1, 16, 3],
            [-1, 12, 3],
            [-11, 12, 3],
          ],
          '#f2ecd0',
        );
      break;
    case 'start':
      art +=
        box(-19, -13, 38, 26, 2, stone) +
        box(-15, 0, 4, 4, 31, stone) +
        box(11, 0, 4, 4, 31, stone) +
        box(-18, -2, 36, 8, 5, ['#f0cc88', '#d0a170', '#ac7e66'], 31);
      break;
    case 'power':
      art +=
        box(-15, -12, 29, 24, 20, stone) +
        box(-16, -13, 31, 26, 4, roof, 20) +
        box(6, -9, 5, 5, 16, stone, 24);
      break;
    default:
      art += box(-14, -11, 15, 15, 16, stone) + box(4, 1, 12, 12, 10, stone);
  }
  svg.innerHTML = art;
  return svg;
}
/** Compatibility wrapper; city ownership must be supplied through createConstructionArt. */
export function createRegionalFacility(tile: ArtTile, _level = 0) {
  void _level;
  return tile.kind === 'city'
    ? createConstructionArt(tile, { stage: 'unowned' })
    : createSceneryArt(regionalScene(tile));
}
