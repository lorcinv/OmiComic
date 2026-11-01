// Encoded size alone misses highly compressible scans and very long strips.
// Keep those on the browser's image path instead of copying the whole source
// into a second ImageBitmap and then running our display filter over it.
export function preferNativeImageDisplay(width = 0, height = 0, encodedBytes = 0): boolean {
  return Number.isFinite(encodedBytes) && encodedBytes >= 5 * 1024 * 1024
    || Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      && (width * height > 16_000_000 || Math.max(width, height) > 8192);
}
