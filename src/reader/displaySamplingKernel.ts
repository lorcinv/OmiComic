// Limit high frequencies before discarding any source pixels.
export const DISPLAY_FILTER_WIDTH = 0.9;
export const DISPLAY_TILE_LIMIT = 2048;
export function samplingRadius(ratio: number) { return Math.ceil(3 / (ratio * DISPLAY_FILTER_WIDTH)) + 1; }
export function samplingTileSize(source: number, target: number, limit: number, maximum: number) {
  return Math.min(maximum, Math.floor((limit - 2 * samplingRadius(target / source) - 4) * target / source));
}
export function samplingCrop(start: number, count: number, source: number, target: number) {
  const ratio = target / source, radius = samplingRadius(ratio);
  const first = Math.max(0, Math.floor((start + .5) / ratio - .5) - radius);
  const end = Math.min(source, Math.ceil((start + count - .5) / ratio - .5) + radius + 1);
  return { first, length: end - first };
}
export function samplingWeights(source: number, target: number) {
  const ratio = target / source, scale = ratio * DISPLAY_FILTER_WIDTH, radius = samplingRadius(ratio);
  return Array.from({ length: target }, (_, out) => {
    const center = (out + .5) / ratio - .5;
    const first = Math.max(0, Math.floor(center) - radius), end = Math.min(source - 1, Math.floor(center) + radius);
    const weights = new Float64Array(end - first + 1);
    let total = 0;
    for (let n = 0; n < weights.length; n++) {
      const x = Math.abs((first + n - center) * scale), p = Math.PI * x;
      const value = x < 1e-8 ? 1 : x >= 3 ? 0 : Math.sin(p) * Math.sin(p / 3) / (p * p / 3);
      weights[n] = value; total += value;
    }
    for (let n = 0; n < weights.length; n++) weights[n] /= total;
    return { first, weights };
  });
}
