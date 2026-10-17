export type DesktopPerformanceProfile = 'auto' | 'balanced' | 'high' | 'custom';

/** Desktop budgets use actual host RAM and CPU capacity. They bound decoded
 * image memory, not total process RSS, and leave a request lane for navigation. */
export function desktopPerformance(profile: Exclude<DesktopPerformanceProfile, 'custom'>, memoryBytes: number, threads: number) {
  const ramGb = memoryBytes / 1024 ** 3;
  const high = profile === 'high';
  const balanced = profile === 'balanced';
  const readerMemoryCacheSizeMb = balanced ? 256 : Math.min(high ? 16384 : 8192,
    Math.max(512, Math.round(ramGb * (high ? 256 : 128) / 256) * 256));
  return {
    readerMemoryCacheSizeMb,
    readerPreloadPages: balanced ? 8 : readerMemoryCacheSizeMb >= 4096 ? (high ? 96 : 48) : readerMemoryCacheSizeMb >= 2048 ? 32 : 20,
    readerImageLoadConcurrency: balanced ? 4 : Math.min(high ? 24 : 12, Math.max(2, threads - (high ? 0 : 2))),
  };
}
