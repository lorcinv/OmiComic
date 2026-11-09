import { useEffect, useState } from 'react';
import type { OmiComicApi, 阅读打开上下文, 阅读相邻资源项 } from '../types';

export async function findReadableNeighbour(context: 阅读打开上下文, index: number, step: -1 | 1,
  api: Pick<OmiComicApi, 'listDirectory'>, cancelled = () => false): Promise<阅读相邻资源项 | null> {
  if (index < 0) return null;
  for (let i = index + step; i >= 0 && i < context.items.length && !cancelled(); i += step) {
    const item = context.items[i];
    // Bookmark entries represent specific pages; retain their existing navigation.
    if (item.type !== 'folder' || context.source === 'bookmarks') return item;
    try {
      const result = await api.listDirectory(item.path, { background: true });
      if (cancelled()) return null;
      // Only direct images make a folder readable. Do not descend into an
      // organising folder, or let it block the next book in the current order.
      if (result.ok && result.data.items.some(child => child.type === 'image' && !child.hasError)) return item;
    } catch { /* An inaccessible folder is not a readable neighbour. */ }
  }
  return null;
}

export function useReadableNeighbours(context: 阅读打开上下文 | null, index: number, active: boolean) {
  const [resolved, setResolved] = useState<{ context: 阅读打开上下文; index: number; previous: 阅读相邻资源项 | null; next: 阅读相邻资源项 | null }>();
  useEffect(() => {
    if (!context || index < 0 || !active) return;
    let cancelled = false;
    void Promise.all([
      findReadableNeighbour(context, index, -1, window.omicomic, () => cancelled),
      findReadableNeighbour(context, index, 1, window.omicomic, () => cancelled),
    ]).then(([previous, next]) => { if (!cancelled) setResolved({ context, index, previous, next }); });
    return () => { cancelled = true; };
  }, [context, index, active]);
  const current = active && resolved?.context === context && resolved?.index === index ? resolved : undefined;
  const immediate = (step: -1 | 1) => {
    const item = active && index >= 0 ? context?.items[index + step] : undefined;
    return item && (item.type !== 'folder' || context?.source === 'bookmarks') ? item : null;
  };
  return { previous: current ? current.previous : immediate(-1), next: current ? current.next : immediate(1) };
}
