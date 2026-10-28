import { useEffect, useMemo, useRef, useState } from 'react';
import { createProgressiveSearch, updateProgressiveSearch, type ProgressiveOrder, type ProgressiveSearch } from '../library/progressiveSearch';
type StableSearch<T> = ProgressiveOrder<T>;
let composing = false, listening = false;
export const queryMetrics = { slices: 0, cancelled: 0, maximumSliceMs: 0 };
// Filtering and merge sorting yield between small pieces. A new generation
// cancels the old job, including composition input and pending sort merges.
export function useLibraryQuery<T>(items: T[], predicate: (item: T) => boolean, compare: (a: T, b: T) => number, signature: string, stable?: StableSearch<T>) {
  type Result = { signature: string; items: T[] };
  const [state, setState] = useState<Result | null>(null);
  // Keep the pinned search snapshot while random mode uses the ordinary query.
  const committed = useRef<ProgressiveSearch<T> | null>(null);
  const small = items.length <= 512 && !stable;
  const immediate = useMemo(() => small ? items.filter(predicate).sort(compare) : [], [small, items, predicate, compare]);
  useEffect(() => {
    if (!listening) { listening = true; window.addEventListener('compositionstart', () => { composing = true; }); window.addEventListener('compositionend', () => { composing = false; }); }
    if (small) return;
    let live = true;
    const pause = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));
    void (async () => {
      while (composing && live && items.length > 512) await new Promise(resolve => window.setTimeout(resolve, 25));
      if (!live) return;
      if (stable) {
        if (committed.current?.signature !== signature) committed.current = createProgressiveSearch<T>(signature);
        const current = committed.current;
        await updateProgressiveSearch(current, items, predicate, compare, stable,
          () => live, matches => { if (live) setState({ signature, items: matches }); });
        return;
      }
      const matches: T[] = []; let start = performance.now(), published = false;
      for (let index = 0; index < items.length && live; index++) {
        if (predicate(items[index])) matches.push(items[index]);
        if ((index & 63) === 0 && performance.now() - start >= 5) {
          queryMetrics.slices++; queryMetrics.maximumSliceMs = Math.max(queryMetrics.maximumSliceMs, performance.now() - start);
          if (!published && matches.length) { setState({ signature, items: matches.slice().sort(compare) }); published = true; }
          await pause(); start = performance.now();
        }
      }
      let source = matches, target = new Array<T>(source.length);
      for (let width = 1; width < source.length && live; width *= 2) {
        for (let left = 0; left < source.length && live; left += width * 2) {
          const middle = Math.min(left + width, source.length), end = Math.min(left + width * 2, source.length);
          let a = left, b = middle;
          for (let out = left; out < end; out++) {
            target[out] = a < middle && (b >= end || compare(source[a], source[b]) <= 0) ? source[a++] : source[b++];
            if ((out & 255) === 0 && performance.now() - start >= 5) { queryMetrics.slices++; await pause(); start = performance.now(); if (!live) return; }
          }
        }
        [source, target] = [target, source];
      }
      if (live) setState({ signature, items: source });
    })();
    return () => { live = false; queryMetrics.cancelled++; };
  }, [items, predicate, compare, signature, small, stable]);
  if (small) return immediate;
  if (state?.signature === signature) return state.items;
  return stable && committed.current?.signature === signature ? committed.current.items : [];
}
