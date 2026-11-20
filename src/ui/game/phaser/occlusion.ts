import { depthOrder, type Point } from '../projection';

/** Render-only seats. Authoritative positions and movement paths stay on tiles. */
export function standingFoot(
  tile: { kind: string; special?: string },
  ground: Point & { width: number; height: number },
  seat: number,
  ordinaryFoot: Point,
): Point {
  if (
    tile.kind !== 'special' ||
    (tile.special !== 'lugia-trial' && tile.special !== 'ho-oh-trial')
  )
    return ordinaryFoot;

  // A front arc inside the diamond, clear of the tall central silhouette.
  // Outer seats flank the pad; inner seats stand farther forward. All four
  // feet sort after this tile's model, without jumping over foreground tiles.
  const seats = [
    [-0.3, 0.16],
    [-0.105, 0.35],
    [0.105, 0.35],
    [0.3, 0.16],
  ] as const;
  const [x, y] = seats[seat % seats.length]!;
  return { x: ground.x + ground.width * x, y: ground.y + ground.height * y };
}

/** Ground contact orders both parts, including while the sprite is airborne. */
export function pawnDepth(foot: Point) {
  const shadow = depthOrder(foot);
  return { shadow, sprite: shadow + 1 };
}
