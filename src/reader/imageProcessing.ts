// A small bilateral neighborhood protects high-contrast text/halftone edges.
// Sharpening uses a thresholded, clamped unsharp mask to avoid strong halos.
export function processPixels(data: Uint8ClampedArray, width: number, height: number, denoise: number, sharpen: number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  const noise = denoise / 100, sharp = sharpen / 100 * .7;
  const range = new Float32Array(256), sigma = 5 + noise * 14;
  for (let i = 0; i < 256; i++) range[i] = Math.exp(-i * i / (2 * sigma * sigma));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    let weight = 0, red = 0, green = 0, blue = 0, blurR = 0, blurG = 0, blurB = 0, blurW = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = (Math.min(height - 1, Math.max(0, y + dy)) * width + Math.min(width - 1, Math.max(0, x + dx))) * 4;
      const spatial = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
      const difference = Math.max(Math.abs(data[j] - data[i]), Math.abs(data[j + 1] - data[i + 1]), Math.abs(data[j + 2] - data[i + 2]));
      const w = spatial * range[difference];
      weight += w; red += data[j] * w; green += data[j + 1] * w; blue += data[j + 2] * w;
      blurW += spatial; blurR += data[j] * spatial; blurG += data[j + 1] * spatial; blurB += data[j + 2] * spatial;
    }
    for (let c = 0; c < 3; c++) {
      const bilateral = (c === 0 ? red : c === 1 ? green : blue) / weight;
      const blurred = (c === 0 ? blurR : c === 1 ? blurG : blurB) / blurW;
      const base = data[i + c] + (bilateral - data[i + c]) * noise;
      const detail = base - blurred;
      output[i + c] = base + (Math.abs(detail) < 3 ? 0 : Math.max(-24, Math.min(24, detail)) * sharp);
    }
    output[i + 3] = data[i + 3];
  }
  return output;
}
