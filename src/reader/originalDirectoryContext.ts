import type { OmiComicApi, 阅读资源结果, 阅读打开上下文, 阅读相邻资源项 } from '../types';

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
): Promise<阅读打开上下文 | null> {
  const bookPath = resource.sourceType === 'image' ? parentDirectory(resource.sourcePath) : resource.sourcePath;
  const parent = bookPath ? parentDirectory(bookPath) : null;
  if (!parent) return null;
  const result = await api.listDirectory(parent, { background: true });
  if (!result.ok) return null;
  const order = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
  const seen = new Set<string>();
  const items: 阅读相邻资源项[] = [];
  for (const item of [...result.data.items].sort((a, b) => order.compare(a.name, b.name) || order.compare(a.path, b.path))) {
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
