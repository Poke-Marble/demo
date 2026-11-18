/** Orthographic 2.5D projection in a fixed 1000 × 720 scene. No game rules. */
export const sceneSize = { width: 1000, height: 720 } as const;
export interface Point {
  x: number;
  y: number;
}
export interface Cell {
  row: number;
  column: number;
}
export function projectWorld(row: number, column: number, side: number): Point {
  return {
    x: 500 + ((column - row) * 400) / side,
    y: 120 + ((row + column + 1) * 230) / side,
  };
}
export function unproject(point: Point, side: number) {
  const difference = ((point.x - 500) * side) / 400;
  const sum = ((point.y - 120) * side) / 230 - 1;
  return { row: (sum - difference) / 2, column: (sum + difference) / 2 };
}
export function tileGeometry(cell: Cell, side: number) {
  const center = projectWorld(cell.row - 1, cell.column - 1, side);
  const width = (800 / side) * 0.96,
    height = (460 / side) * 0.96;
  const thickness = 10;
  return {
    ...center,
    width,
    height,
    thickness,
    left: center.x - width / 2,
    top: center.y - height / 2,
  };
}
/** The same silhouette drives visible faces and native CSS pointer clipping. */
export function tileSilhouette(g: ReturnType<typeof tileGeometry>) {
  const h = g.height,
    t = g.thickness,
    w = g.width;
  return [
    [w / 2, 0],
    [w, h / 2],
    [w, h / 2 + t],
    [w / 2, h + t],
    [0, h / 2 + t],
    [0, h / 2],
  ] as const;
}
export function depthOrder(point: Point) {
  return 1000 + Math.round(point.y * 10);
}
export function pawnFoot(cell: Cell, side: number, seat: number) {
  return projectWorld(
    cell.row - 1 + (seat % 2 ? 0.18 : -0.18),
    cell.column - 1 + (seat < 2 ? -0.2 : 0.2),
    side,
  );
}
