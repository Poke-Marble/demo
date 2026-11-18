/** Same ground-edge slope as projection.ts: 230 / 400. Vertical edges stay upright. */
export const modelGeometry = {
  originX: 50,
  originY: 85.575,
  slope: 230 / 400,
  footY: 108,
  footprintWidth: 42,
  footprintDepth: 36,
} as const;
export function modelPoint(u: number, v: number, z = 0) {
  return {
    x: 50 + u - v,
    y: modelGeometry.originY + (u + v) * modelGeometry.slope - z,
  };
}
export type Vertex = readonly [number, number, number?];
export function polygon(
  vertices: readonly Vertex[],
  fill: string,
  opacity = 1,
) {
  const points = vertices
    .map(([u, v, z = 0]) => {
      const p = modelPoint(u, v, z);
      return `${p.x},${p.y}`;
    })
    .join(' ');
  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}" stroke="#354e59" stroke-width=".65" stroke-linejoin="round"/>`;
}
export function box(
  u: number,
  v: number,
  w: number,
  d: number,
  h: number,
  colors: readonly [string, string, string],
  base = 0,
) {
  return (
    polygon(
      [
        [u, v + d, base],
        [u + w, v + d, base],
        [u + w, v + d, base + h],
        [u, v + d, base + h],
      ],
      colors[1],
    ) +
    polygon(
      [
        [u + w, v, base],
        [u + w, v + d, base],
        [u + w, v + d, base + h],
        [u + w, v, base + h],
      ],
      colors[2],
    ) +
    polygon(
      [
        [u, v, base + h],
        [u + w, v, base + h],
        [u + w, v + d, base + h],
        [u, v + d, base + h],
      ],
      colors[0],
    )
  );
}
/** Position SVG so pad center stays on its tile, and the front foot is at y=108. */
export function modelPlacement(tile: { x: number; y: number; width: number }) {
  const width = Math.min(64, tile.width * 0.75),
    scale = width / 100;
  const centerY = tile.y - 3 * scale;
  return {
    x: tile.x,
    y: centerY + (108 - modelGeometry.originY) * scale,
    depthY: centerY,
    width,
    height: width * 1.2,
  };
}
