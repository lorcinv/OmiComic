import { catalogDelta, catalogSnapshotId } from './catalogSnapshot';
export type ProgressiveOrder<T> = { key: (item: T) => string; first: (item: T) => boolean };
type Evaluated<T> = { item: T; predicate: (item: T) => boolean; matches: boolean; run: number };
export type ProgressiveSearch<T> = {
  signature: string; run: number; items: T[]; visible: Set<string>; evaluated: Map<string, Evaluated<T>>;
  source?: readonly T[]; predicate?: (item: T) => boolean;
};
export const progressiveSearchMetrics = { evaluated: 0, cacheHits: 0, publications: 0, maximumSliceMs: 0 };
export function createProgressiveSearch<T>(signature: string): ProgressiveSearch<T> {
  return { signature, run: 0, items: [], visible: new Set(), evaluated: new Map() };
}

// The catalog owns discovery and caching; a query owns only its matching and
// publication cursor. New hits never require a complete catalog or move old hits.
export async function updateProgressiveSearch<T>(state: ProgressiveSearch<T>, source: readonly T[],
  predicate: (item: T) => boolean, compare: (a: T, b: T) => number, order: ProgressiveOrder<T>,
  active: () => boolean, publish: (items: T[]) => void) {
  if (state.source === source && state.predicate === predicate) return;
  const delta = catalogDelta(source);
  const incremental = !!delta && !!state.source && delta.previous === catalogSnapshotId(state.source) && state.predicate === predicate;
  const candidates = incremental ? delta!.changed : source;
  const removed = new Set(incremental ? delta!.removed : []);
  let reconcile = !incremental || removed.size > 0;
  const run = ++state.run;
  const live = () => active() && state.run === run;
  let slice = performance.now(), lastPublished = slice;
  const checkpoint = async () => {
    const elapsed = performance.now() - slice;
    if (elapsed >= 5) {
      progressiveSearchMetrics.maximumSliceMs = Math.max(progressiveSearchMetrics.maximumSliceMs, elapsed);
      await new Promise<void>(resolve => setTimeout(resolve, 0)); slice = performance.now();
    }
    return live();
  };
  const compareNew = (a: T, b: T) => Number(!order.first(a)) - Number(!order.first(b)) || compare(a, b);
  const sorted = async (items: T[]) => {
    let from = items, into = new Array<T>(items.length);
    for (let width = 1; width < items.length && live(); width *= 2) {
      for (let left = 0; left < items.length && live(); left += width * 2) {
        const middle = Math.min(left + width, items.length), end = Math.min(left + width * 2, items.length);
        let a = left, b = middle;
        for (let index = left; index < end; index++) {
          into[index] = a < middle && (b >= end || compareNew(from[a], from[b]) <= 0) ? from[a++] : from[b++];
          if ((index & 255) === 0 && !await checkpoint()) return from;
        }
      }
      [from, into] = [into, from];
    }
    return from;
  };
  let pending: T[] = [];
  const queued = new Set<string>();
  const flush = async () => {
    if (!pending.length || !live()) return;
    const batch = await sorted(pending);
    if (!live()) return;
    for (const item of batch) state.visible.add(order.key(item));
    state.items = state.items.concat(batch); pending = []; queued.clear();
    progressiveSearchMetrics.publications++; publish(state.items); lastPublished = performance.now();
  };
  for (let index = 0; index < candidates.length && live(); index++) {
    const item = candidates[index], id = order.key(item), known = state.evaluated.get(id);
    if (incremental && state.visible.has(id) && known?.item !== item) reconcile = true;
    let entry: Evaluated<T>;
    if (known?.item === item && known.predicate === predicate) {
      entry = known; entry.run = run; progressiveSearchMetrics.cacheHits++;
    } else {
      entry = { item, predicate, matches: predicate(item), run };
      state.evaluated.set(id, entry); progressiveSearchMetrics.evaluated++;
    }
    if (entry.matches && !state.visible.has(id) && !queued.has(id)) { pending.push(item); queued.add(id); }
    if ((index & 63) === 0) {
      const elapsed = performance.now() - lastPublished;
      // Bound both first-result latency and copying/sorting during a warm query.
      // Ordinary native catalog batches are smaller; large cached queries yield
      // a first chunk, followed by bounded additions rather than a full-list sort.
      if (pending.length >= 4096 || pending.length >= 128 && (!state.items.length || elapsed >= 32)
        || pending.length > 0 && elapsed >= (state.items.length ? 32 : 16)) await flush();
      if (!await checkpoint()) return;
    }
  }
  if (!live()) return;
  await flush();
  if (!live()) return;

  // Reconcile actual deletions and metadata edits only after this snapshot has
  // been evaluated. A partially processed snapshot must not clear visible hits.
  let updated: T[] | undefined;
  const missing: string[] = [];
  for (let index = 0; reconcile && index < state.items.length && live(); index++) {
    const old = state.items[index], id = order.key(old), entry = state.evaluated.get(id);
    const item = entry && (incremental ? !removed.has(id) : entry.run === run) && entry.matches ? entry.item : undefined;
    if (item !== old && !updated) updated = state.items.slice(0, index);
    if (updated && item !== undefined) updated.push(item);
    if (item === undefined) missing.push(id);
    if ((index & 255) === 0 && !await checkpoint()) return;
  }
  if (!live()) return;
  if (updated) {
    state.items = updated; for (const id of missing) state.visible.delete(id);
    progressiveSearchMetrics.publications++; publish(state.items);
  }
  if (incremental) for (const id of removed) state.evaluated.delete(id);
  else {
    let index = 0;
    for (const [id, entry] of state.evaluated) {
      if (!live()) return;
      if (entry.run !== run) state.evaluated.delete(id);
      if ((index++ & 255) === 0 && !await checkpoint()) return;
    }
  }
  state.source = source; state.predicate = predicate;
}
