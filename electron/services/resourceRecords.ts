// Shared by desktop and Android. Paths use the platform's existing separator.
type RecordItem = { sourcePath: string; resourceKey?: string; title?: string; thumbnailUrl?: string };
export interface ResourceRecords {
  library: { roots: { path: string; name: string }[]; lastActiveRootPath?: string; lastCurrentPath?: string };
  readingProgress: Record<string, RecordItem>;
  resourceMeta: Record<string, RecordItem>;
  recentOpened: RecordItem[];
  temporaryOpened: RecordItem[];
  favorites: RecordItem[];
  bookmarks: RecordItem[];
  removedRecentResourceKeys: string[];
  excludedResourcePaths?: string[];
  externalReadGrants?: RecordItem[];
  virtualFolders: { items: RecordItem[]; coverResourceKey?: string }[];
}

export function withinPath(value: string, parent: string): boolean {
  const normalize = (p: string) => /^[a-z]:/i.test(p) || p.startsWith("\\\\")
    ? p.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase() : p.replace(/\/$/, "");
  const v = normalize(value), p = normalize(parent);
  return v === p || v.startsWith(`${p}/`);
}

/** A clone is committed only after the filesystem operation and disk write succeed. */
export function updateResourceRecords<T extends ResourceRecords>(data: T, oldPath: string, newPath?: string): T {
  const next = structuredClone(data);
  const mapPath = (value: string) => newPath && withinPath(value, oldPath) ? newPath + value.slice(oldPath.length) : value;
  const mapKey = (key: string) => {
    const colon = key.indexOf(":");
    return colon < 0 ? key : key.slice(0, colon + 1) + mapPath(key.slice(colon + 1));
  };
  const keep = (item: RecordItem) => !!newPath || !withinPath(item.sourcePath, oldPath);
  const change = <R extends RecordItem>(item: R): R => {
    if (newPath && withinPath(item.sourcePath, oldPath)) {
      if (withinPath(oldPath, item.sourcePath)) item.title = newPath.split(/[\\/]/).pop();
      item.sourcePath = mapPath(item.sourcePath);
      delete item.thumbnailUrl;
    }
    if (item.resourceKey) item.resourceKey = mapKey(item.resourceKey);
    return item;
  };
  for (const field of ["recentOpened", "temporaryOpened", "favorites", "bookmarks"] as const) {
    next[field] = next[field].filter(keep).map(change);
  }
  if (next.externalReadGrants) next.externalReadGrants = next.externalReadGrants.filter(keep).map(change);
  for (const field of ["readingProgress", "resourceMeta"] as const) {
    next[field] = Object.fromEntries(Object.entries(next[field]).filter(([, value]) => keep(value))
      .map(([key, value]) => [mapKey(key), change(value)]));
  }
  next.removedRecentResourceKeys = next.removedRecentResourceKeys
    .filter(key => !!newPath || !withinPath(key.slice(key.indexOf(":") + 1), oldPath)).map(mapKey);
  next.excludedResourcePaths = (next.excludedResourcePaths ?? []).filter(p => !!newPath || !withinPath(p, oldPath)).map(mapPath);
  for (const folder of next.virtualFolders) {
    folder.items = folder.items.filter(keep).map(change);
    if (folder.coverResourceKey) {
      folder.coverResourceKey = mapKey(folder.coverResourceKey);
      if (!folder.items.some(i => i.resourceKey === folder.coverResourceKey)) delete folder.coverResourceKey;
    }
  }
  next.library.roots = next.library.roots.filter(root => !!newPath || !withinPath(root.path, oldPath)).map(root => ({
    ...root, path: mapPath(root.path), name: root.path === oldPath && newPath ? newPath.split(/[\\/]/).pop()! : root.name,
  }));
  for (const field of ["lastActiveRootPath", "lastCurrentPath"] as const) {
    const p = next.library[field];
    if (p && withinPath(p, oldPath)) next.library[field] = newPath ? mapPath(p) : next.library.roots[0]?.path;
  }
  return next;
}
