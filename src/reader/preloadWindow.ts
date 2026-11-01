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
export function desktopPreloadWindow(group: readonly number[], total: number, direction: number, preload: number, memoryBytes: number, pageBytes: number, adjacent?: { next: readonly number[]; previous: readonly number[] }): number[] {
  if (!group.length || preload <= 0 || memoryBytes <= 0) return [];
  // Read-ahead must leave room for in-flight decoding and the visible GPU copy.
  // Large pages use a short window even with an explicitly generous cache.
  const windowBytes = Math.min(memoryBytes * .6, 256 * 1024 * 1024);
  const capacity = Math.max(0, Math.floor(windowBytes / Math.max(1,pageBytes)) - group.length);
  const first = Math.min(...group), last = Math.max(...group), forward = direction >= 0;
  const result: number[] = [];
  const addIndex = (index: number) => {
    if (index >= 0 && index < total && !group.includes(index) && !result.includes(index) && result.length < capacity) result.push(index);
  };
  const add = (distance: number, along: boolean) => addIndex(along === forward ? last + distance : first - distance);
  // A spread is one navigation unit. Reserving only the nearest page on each
  // side lets distant look-ahead evict half of the previous spread, destroying
  // its prepared surface on every reverse turn. Prioritize both full adjacent
  // groups within the same byte cap; mixed landscape/portrait groups come from
  // the reader's existing pagination rather than guessing their widths here.
  const next = adjacent?.next ?? Array.from({length:Math.min(group.length,preload)},(_,i)=>last+i+1);
  const previous = adjacent?.previous ?? Array.from({length:Math.min(group.length,preload)},(_,i)=>first-i-1);
  for (const indices of forward ? [next,previous] : [previous,next]) for (const index of indices) addIndex(index);
  for (let n=2;n<=preload;n++) add(n,true);
  for (let n=2;n<=Math.max(2,Math.ceil(preload/3));n++) add(n,false);
  return result;
}
