/** A thin strip inside the front edge of the diamond, clear of the model pad.
 * Local u/v follow the same ground axes as projection.ts. Never depends on
 * selection, pawn animation, construction, viewport size or collision order.
 */
export function tileNamePlate(tile: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  // projectWorld centers the fixed 1000px scene at x=500. The 76×16 CSS
  // plate spans 47.5% of a tile in u and 10% in v; its center is 19.5%
  // along the front v edge, leaving every corner within the diamond.
  const direction = tile.x <= 500 ? 1 : -1;
  const scale = tile.width / 160;
  const slope = tile.height / tile.width;
  const centerX = tile.x - direction * tile.width * 0.195;
  const centerY = tile.y + tile.height * 0.195;
  const a = scale,
    b = direction * slope * scale;
  const c = -direction * scale,
    d = slope * scale;
  return {
    a,
    b,
    c,
    d,
    x: centerX - a * 38 - c * 8,
    y: centerY - b * 38 - d * 8,
  };
}
