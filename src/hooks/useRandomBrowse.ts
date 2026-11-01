import { useEffect, useRef, useState } from 'react';
import { secureRandomIndex } from '../library/randomBrowse';
type Order = { keys: string[]; ids: Uint32Array; selected: number; drawn: Map<string, unknown> };
function newOrder<T>(items: T[], key: (item: T) => string): Order {
  const keys = [...new Set(items.map(key))];
  return { keys, ids: Uint32Array.from({ length: keys.length }, (_, index) => index), selected: 0, drawn: new Map() };
}
export function useRandomBrowse(scope: string | null, count: number, filter = '') {
  const [session, setSession] = useState<{ scope: string; revision: number } | null>(null);
  const order = useRef<{ signature: string; value: Order } | null>(null);
  const rejected = useRef(new Set<string>());
  const [selectionRevision, setSelectionRevision] = useState(0);
  const active = !!scope && session?.scope === scope;
  const signature = JSON.stringify([scope, session?.revision, filter]);
  function stop() { order.current = null; rejected.current.clear(); setSession(null); }
  function redraw() {
    if (!scope) return;
    order.current = null;
    rejected.current.clear();
    setSession(old => ({ scope, revision: (old?.revision ?? 0) + 1 }));
  }
  useEffect(() => { stop(); }, [scope]);
  function select<T>(items: T[], key: (item: T) => string, complete = true): T[] {
    if (!active) return items;
    if (!order.current || order.current.signature !== signature) {
      order.current = { signature, value: newOrder(items, key) };
    }
    const eligible = (item: T) => {
      const source = item as { path?: string; sourcePath?: string };
      return !rejected.current.has(source.path ?? source.sourcePath ?? key(item));
    };
    const value = order.current.value, available = new Map(items.filter(eligible).map(item => [key(item), item]));
    // Replacement queries also publish partial arrays, which may temporarily
    // omit every drawn book. Only a completed snapshot can remove a selection.
    if (!complete) for (const [id, item] of value.drawn) {
      if (!available.has(id) && eligible(item as T)) available.set(id, item as T);
    }
    value.selected = value.ids.slice(0, value.selected).filter(id => available.has(value.keys[id])).length;
    value.ids = value.ids.filter(id => available.has(value.keys[id]));
    // A cold catalog arrives in small batches. Keep the already drawn prefix,
    // then admit new candidates until the requested batch is full. Once full,
    // later scan batches cannot move or replace its cards.
    if (value.selected < Math.min(count, available.size)) {
      const remaining = new Set(Array.from(value.ids, id => value.keys[id]));
      const indices = new Map(value.keys.map((key, index) => [key, index]));
      const extra: number[] = [];
      for (const candidate of available.keys()) {
        if (remaining.has(candidate)) continue;
        let index = indices.get(candidate);
        if (index === undefined) { index = value.keys.length; value.keys.push(candidate); }
        extra.push(index);
      }
      if (extra.length) value.ids = Uint32Array.from([...value.ids, ...extra]);
    }
    const take = Math.min(count, value.ids.length);
    for (let index = value.selected; index < take; index++) {
      const selected = index + secureRandomIndex(value.ids.length - index);
      [value.ids[index], value.ids[selected]] = [value.ids[selected], value.ids[index]];
    }
    value.selected = Math.max(value.selected, take);
    value.drawn = new Map(Array.from(value.ids.subarray(0, value.selected), id => [value.keys[id], available.get(value.keys[id])]));
    return Array.from(value.ids.subarray(0, take), id => available.get(value.keys[id])!);
  }
  return { active, busy: false, scanned: 0, revision: active ? session!.revision : 0, selectionRevision,
    rejectPath: (path: string) => {
      if (!active || rejected.current.has(path) || rejected.current.size >= 4) return;
      rejected.current.add(path); setSelectionRevision(value => value + 1);
    },
    toggle: () => active ? stop() : redraw(), stop, redraw, select,
    capture: () => ({ session, order: order.current }),
    restore: (saved: { session: typeof session; order: typeof order.current }) => { order.current = saved.order; setSession(saved.session); } };
}
