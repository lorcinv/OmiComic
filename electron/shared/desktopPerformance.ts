export type DesktopPerformanceProfile = 'auto' | 'balanced' | 'high' | 'custom';

/** Desktop budgets use actual host RAM and CPU capacity. They bound decoded
 * image memory, not total process RSS, and leave a request lane for navigation. */
export function desktopPerformance(profile: Exclude<DesktopPerformanceProfile, 'custom'>, memoryBytes: number, threads: number) {
  const ramGb = memoryBytes / 1024 ** 3;
  const high = profile === 'high';
  const balanced = profile === 'balanced';
  // Browser decode buffers, GPU textures and archive bytes live outside this
  // cache. A multi-GB cache plus dozens of concurrent PNGs can stall the desktop.
  const readerMemoryCacheSizeMb = balanced ? 256 : Math.min(high ? 2048 : 1024,
    Math.max(256, Math.round(ramGb * (high ? 64 : 32) / 256) * 256));
  return {
    readerMemoryCacheSizeMb,
    readerPreloadPages: balanced ? 4 : high ? 24 : 12,
    readerImageLoadConcurrency: balanced ? 2 : Math.min(high ? 6 : 4, Math.max(2, threads - 2)),
  };
}
