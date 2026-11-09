import { directoryOrder } from '../library/directoryOrder';
import type { AppSettings, OmiComicApi, 阅读资源结果, 阅读打开上下文, 阅读相邻资源项 } from '../types';

export function parentDirectory(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, '');
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (index < 0 || /^[A-Za-z]:$/.test(trimmed)) return null;
  if (index === 0 || index === 2 && /^[A-Za-z]:/.test(trimmed)) return trimmed.slice(0, index + 1);
  return trimmed.slice(0, index);
}

// Resolve beside the original book, never through the recent-reading order.
// listDirectory does not show a permission picker for a single-file Android grant.
export async function originalDirectoryContext(
  resource: Pick<阅读资源结果, 'resourceKey' | 'sourcePath' | 'sourceType'>,
  api: Pick<OmiComicApi, 'listDirectory'>,
  settings: Pick<AppSettings, 'sortMode' | 'folderFirst'> = { sortMode: 'name-asc', folderFirst: true },
): Promise<阅读打开上下文 | null> {
  const bookPath = resource.sourceType === 'image' ? parentDirectory(resource.sourcePath) : resource.sourcePath;
  const parent = bookPath ? parentDirectory(bookPath) : null;
  if (!parent) return null;
  const result = await api.listDirectory(parent, { background: true });
  if (!result.ok) return null;
  const order = directoryOrder(settings);
  const seen = new Set<string>();
  const items: 阅读相邻资源项[] = [];
  for (const item of [...result.data.items].sort(order)) {
    if (seen.has(item.path) || item.hasError || item.type === 'unknown' || item.type === 'image') continue;
    if (item.type === 'folder' && item.containsImages === false) continue;
    // A recursive or stale provider response must not introduce another directory.
    if (parentDirectory(item.path) !== parent) continue;
    seen.add(item.path);
    items.push({ key: item.path === bookPath ? resource.resourceKey : `${item.type}:${item.path}`, path: item.path, type: item.type, title: item.name });
  }
  if (!items.some(item => item.key === resource.resourceKey)) return null;
  return { source: 'directory', currentKey: resource.resourceKey, items };
}

function pathIdentity(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-z]:/i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized;
}

export function resourcePosition(resource: Pick<阅读资源结果, 'resourceKey' | 'sourcePath' | 'sourceType'>, context: 阅读打开上下文): number {
  if (context.source === 'bookmarks') return context.items.findIndex(item => item.key === context.currentKey);
  const source = pathIdentity(resource.sourcePath);
  const exact = context.items.findIndex(item => pathIdentity(item.path) === source);
  if (exact >= 0) return exact;
  const book = resource.sourceType === 'image' ? parentDirectory(resource.sourcePath) : resource.sourcePath;
  if (book) {
    const index = context.items.findIndex(item => pathIdentity(item.type === 'image' ? parentDirectory(item.path) ?? item.path : item.path) === pathIdentity(book));
    if (index >= 0) return index;
  }
  return context.items.findIndex(item => item.key === resource.resourceKey);
}
