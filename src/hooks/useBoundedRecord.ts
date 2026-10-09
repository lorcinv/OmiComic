import { useCallback, useState, type SetStateAction } from "react";

/** Bounded per-view metadata cache; no image data survives unbounded library navigation. */
export function useBoundedRecord<T>(limit: number) {
  const [record, setRecord] = useState<Record<string, T>>({});
  const update = useCallback((action: SetStateAction<Record<string, T>>) => {
    setRecord(previous => {
      const next = typeof action === "function" ? action(previous) : action;
      const keys = Object.keys(next);
      if (keys.length <= limit) return next;
      return Object.fromEntries(keys.slice(-limit).map(key => [key, next[key]]));
    });
  }, [limit]);
  return [record, update] as const;
}
