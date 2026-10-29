/** Snap a moving raster's origin without changing its size with pixel phase.
 * Rounding both edges independently makes a fixed-size page grow/shrink by one
 * physical pixel as it moves, resampling every scan line on native Canvas. */
export function nativeRasterRectangle(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, dpr: number): number[] {
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const left = Math.round(rect.left * scale) / scale;
  const top = Math.round(rect.top * scale) / scale;
  return [left, top, left + Math.round(rect.width * scale) / scale, top + Math.round(rect.height * scale) / scale];
}
