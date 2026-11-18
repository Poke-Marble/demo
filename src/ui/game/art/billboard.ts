/** Shared logical pixel scale. All upright art has its foot at (50, 108). */
export const billboard = {
  width: 64,
  height: 76.8,
  footX: 50,
  footY: 108,
  sourceScale: 0.5,
} as const;
export function spriteRect(width: number, height: number) {
  const w = width * billboard.sourceScale,
    h = height * billboard.sourceScale;
  return {
    x: billboard.footX - w / 2,
    y: billboard.footY - h,
    width: w,
    height: h,
  };
}
