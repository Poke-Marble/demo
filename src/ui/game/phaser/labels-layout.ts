export interface LabelPoint {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  preferredX?: number;
  preferredY?: number;
}
export interface LabelBox extends LabelPoint {
  left: number;
  top: number;
}
export interface LabelObstacle {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Screen-space layout only: never changes tile geometry or camera hit testing. */
export function layoutLabels(
  points: readonly LabelPoint[],
  width: number,
  height: number,
  obstacles: readonly LabelObstacle[] = [],
): LabelBox[] {
  const placed: LabelBox[] = [];
  const overlap = (a: LabelObstacle, b: LabelObstacle) =>
    Math.max(
      0,
      Math.min(a.left + a.width + 3, b.left + b.width + 3) -
        Math.max(a.left, b.left),
    ) *
    Math.max(
      0,
      Math.min(a.top + a.height + 3, b.top + b.height + 3) -
        Math.max(a.top, b.top),
    );
  for (const point of points) {
    const preferredX = point.preferredX ?? point.x;
    const preferredY = point.preferredY ?? point.y;
    let best: LabelBox | undefined;
    let bestScore = Infinity;
    for (let row = 0; row <= 12; row++) {
      for (const direction of row ? [-1, 1] : [1]) {
        for (const dx of [0, -24, 24, -48, 48, -72, 72, -96, 96]) {
          const box = {
            ...point,
            left: Math.max(
              2,
              Math.min(
                width - point.width - 2,
                preferredX - point.width / 2 + dx,
              ),
            ),
            top: Math.max(
              2,
              Math.min(
                height - point.height - 2,
                preferredY + row * (point.height + 4) * direction,
              ),
            ),
          };
          const score =
            [...placed, ...obstacles].reduce(
              (sum, other) => sum + overlap(box, other),
              0,
            ) *
              10000 +
            Math.abs(box.top - preferredY) +
            Math.abs(dx) * 0.5;
          if (score < bestScore) {
            best = box;
            bestScore = score;
          }
        }
      }
    }
    placed.push(best!);
  }
  return placed;
}
