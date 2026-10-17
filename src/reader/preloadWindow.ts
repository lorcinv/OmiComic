/** A moving, byte-bounded window. The nearest page on either side comes first;
 * extra capacity follows the user's actual reading direction. */
export function nativePreloadWindow(group: readonly number[], total: number, direction: number, preload: number, memoryBytes: number, pageBytes: number): number[] {
  if (!group.length || preload <= 0 || memoryBytes <= 0) return [];
  const capacity = Math.max(0, Math.floor(memoryBytes / Math.max(1, pageBytes)) - group.length);
  const ahead = Math.min(30, Math.max(1, Math.ceil(preload * 1.5)));
  const behind = Math.min(10, Math.max(1, Math.floor(preload / 2)));
  const first = Math.min(...group), last = Math.max(...group), forward = direction >= 0;
  const result: number[] = [];
  const add = (distance: number, along: boolean) => {
    const next = (along === forward) ? last + distance : first - distance;
    if (next >= 0 && next < total && result.length < capacity) result.push(next);
  };
  add(1, true); add(1, false);
  for (let distance = 2; distance <= ahead; distance++) add(distance, true);
  for (let distance = 2; distance <= behind; distance++) add(distance, false);
  return result;
}

/** PC images keep their original resolution. Estimate both encoded and decoded
 * bytes, retaining a shorter trail and a longer lead in the reading direction. */
export function desktopPreloadWindow(group: readonly number[], total: number, direction: number, preload: number, memoryBytes: number, pageBytes: number): number[] {
  if (!group.length || preload <= 0 || memoryBytes <= 0) return [];
  const capacity = Math.max(0, Math.floor(memoryBytes / Math.max(1,pageBytes)) - group.length);
  const first = Math.min(...group), last = Math.max(...group), forward = direction >= 0;
  const result: number[] = [];
  const add = (distance: number, along: boolean) => {
    const index = along === forward ? last + distance : first - distance;
    if (index >= 0 && index < total && result.length < capacity) result.push(index);
  };
  add(1,true); add(1,false);
  for (let n=2;n<=preload;n++) add(n,true);
  for (let n=2;n<=Math.max(2,Math.ceil(preload/3));n++) add(n,false);
  return result;
}
