import type { OmiComicAppData as StoredAppData, AppSettings } from '../services/appDataService';
type OmiComicAppData = Omit<StoredAppData, 'externalReadGrants'>;

export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;
export interface DataBackup { format: 'OmiComic.Data'; formatVersion: 1; appVersion: string; platform: string; exportedAt: string; data: OmiComicAppData }
export interface DataImportOptions { mappings: Array<{ from: string; to: string }>; mode: 'merge' | 'replace'; prefer: 'local' | 'imported'; includeSettings: boolean }
export interface BackupLocationMatch { from: string; to: string; reason: 'original' | 'relative' }
export interface DataImportPreview { token: string; backup: DataBackup; matches?: BackupLocationMatch[] }
export interface BackupLocation { path: string; name: string; external: boolean }
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !v.includes('\0');
function fail(): never { throw new Error('备份文件内容不完整或格式无效。'); }
export const backupPlatform = (platform: string) => platform === 'win32' ? 'win' : platform;
export function backupFilename(platform: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `OmiComic-Data-${backupPlatform(platform)}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
}
export function createDataBackup(data: OmiComicAppData, platform: string, appVersion: string, now = new Date()): DataBackup {
  const copy = structuredClone(data) as OmiComicAppData & { externalReadGrants?: unknown };
  delete copy.externalReadGrants;
  for (const mark of copy.bookmarks) delete mark.thumbnailUrl;
  return { format: 'OmiComic.Data', formatVersion: 1, platform: backupPlatform(platform), appVersion, exportedAt: now.toISOString(), data: copy };
}
export function parseDataBackup(raw: string): DataBackup {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) throw new Error('备份文件超过 64 MB，无法导入。');
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, ''), (key, item) => { if (['__proto__', 'prototype', 'constructor'].includes(key)) fail(); return item; }); }
  catch { throw new Error('无法读取备份文件，请选择有效的 OmiComic 数据备份。'); }
  if (!object(value) || value.format !== 'OmiComic.Data') throw new Error('这不是 OmiComic 数据备份文件。');
  if (value.formatVersion !== 1) throw new Error('此备份格式版本暂不支持，请更新 OmiComic 后重试。');
  if (!text(value.platform) || !text(value.appVersion) || !text(value.exportedAt) || !Number.isFinite(Date.parse(value.exportedAt))) fail();
  const d = value.data;
  if (!object(d) || d.version !== 1 || !object(d.settings) || !object(d.library) || !Array.isArray(d.library.roots)) fail();
  for (const root of d.library.roots) if (!object(root) || !text(root.path) || !root.path || !text(root.name) || !Number.isFinite(root.addedAt) || !Number.isFinite(root.lastOpenedAt)) fail();
  const record = (r: unknown) => {
    if (!object(r) || !text(r.resourceKey) || !r.resourceKey || !text(r.sourcePath) || !r.sourcePath || !text(r.title)
      || !['folder', 'image', 'archive', 'pdf', 'epub', 'mobi', 'unknown'].includes(String(r.sourceType))) fail();
    if (r.tags !== undefined && (!Array.isArray(r.tags) || !r.tags.every(text))) fail();
    if (r.note !== undefined && !text(r.note)) fail();
  };
  for (const field of ['readingProgress', 'resourceMeta']) {
    const table = d[field]; if (!object(table)) fail();
    for (const [key, r] of Object.entries(table)) { record(r); if ((r as Record<string, unknown>).resourceKey !== key) fail(); }
  }
  for (const field of ['favorites', 'bookmarks', 'recentOpened', 'temporaryOpened']) { const list = d[field]; if (!Array.isArray(list)) fail(); for (const r of list) record(r); }
  for (const r of Object.values(d.readingProgress as Record<string, Record<string, unknown>>)) {
    if (!Number.isInteger(r.currentPageIndex) || Number(r.currentPageIndex) < 0 || !Number.isInteger(r.totalPages) || Number(r.totalPages) < 1 || Number(r.currentPageIndex) >= Number(r.totalPages)) fail();
  }
  for (const mark of d.bookmarks as Record<string, unknown>[]) if (!text(mark.id) || !mark.id || !Number.isInteger(mark.pageIndex) || Number(mark.pageIndex) < 0 || !Number.isInteger(mark.totalPages) || Number(mark.totalPages) < 1 || Number(mark.pageIndex) >= Number(mark.totalPages)) fail();
  for (const field of ['tagOrder', 'removedRecentResourceKeys']) { const list = d[field]; if (!Array.isArray(list) || !list.every(text)) fail(); }
  if (d.excludedResourcePaths !== undefined && (!Array.isArray(d.excludedResourcePaths) || !d.excludedResourcePaths.every(text))) fail();
  if (!Array.isArray(d.bookshelves) || !Array.isArray(d.virtualFolders)) fail();
  const ids = new Set<string>();
  for (const shelf of d.bookshelves) { if (!object(shelf) || !text(shelf.id) || !shelf.id || ids.has(shelf.id) || !text(shelf.name)) fail(); ids.add(shelf.id); }
  ids.clear();
  for (const folder of d.virtualFolders) {
    if (!object(folder) || !text(folder.id) || !folder.id || ids.has(folder.id) || !text(folder.bookshelfId) || !text(folder.name) || !Array.isArray(folder.items) || !Array.isArray(folder.tags) || !folder.tags.every(text) || !text(folder.note)) fail();
    ids.add(folder.id); for (const item of folder.items) record(item);
  }
  const settings = d.settings;
  if (!['mist', 'nord', 'sand', 'night'].includes(String(settings.colorTheme)) || !object(settings.confirmBeforeBatchDelete)) fail();
  const copy = createDataBackup(d as unknown as OmiComicAppData, value.platform, value.appVersion, new Date(value.exportedAt));
  return copy;
}
function normalized(path: string) { const p = path.replace(/\\/g, '/').replace(/\/$/, ''); return /^[a-z]:/i.test(p) || p.startsWith('//') ? p.toLowerCase() : p; }
function relative(value: string, root: string): string | null {
  const v = normalized(value), r = normalized(root);
  return v === r ? '' : v.startsWith(`${r}/`) ? value.replace(/\\/g, '/').replace(/\/$/, '').slice(r.length + 1) : null;
}
function records(data: OmiComicAppData) { return [...Object.values(data.readingProgress), ...Object.values(data.resourceMeta), ...data.favorites, ...data.bookmarks, ...data.recentOpened, ...data.temporaryOpened, ...data.virtualFolders.flatMap(folder => folder.items)]; }
export function backupLocations(data: OmiComicAppData): BackupLocation[] {
  const locations: BackupLocation[] = data.library.roots.map(root => ({ path: root.path, name: root.name, external: false }));
  for (const record of records(data)) {
    if (locations.some(root => relative(record.sourcePath, root.path) !== null)) continue;
    const p = record.sourcePath, parent = record.sourceType === 'folder' ? p : p.slice(0, Math.max(p.lastIndexOf('/'),p.lastIndexOf('\\')));
    if (parent && !locations.some(root => normalized(root.path) === normalized(parent))) locations.push({ path: parent, name: parent.replace(/\\/g, '/').split('/').at(-1) || parent, external: true });
  }
  return locations;
}
/** Probe existing paths only. This never enumerates a directory or hashes comic contents. */
export async function autoMatchBackupLocations(backup: DataBackup, local: OmiComicAppData, platform: string, exists: (path: string, directory: boolean) => Promise<boolean>): Promise<BackupLocationMatch[]> {
  const result: BackupLocationMatch[] = [], localRoots = local.library.roots;
  for (const location of backupLocations(backup.data)) {
    if (backup.platform === backupPlatform(platform) && await exists(location.path, true)) { result.push({ from: location.path, to: location.path, reason: 'original' }); continue; }
    const references = [...new Map(records(backup.data).flatMap(item => {
      const tail = relative(item.sourcePath, location.path);
      return tail ? [[tail, { tail, directory: item.sourceType === 'folder' }] as const] : [];
    })).values()];
    // A few representative exact paths identify a root without scanning a large library.
    const probes = references.length <= 3 ? references : [references[0], references[Math.floor(references.length / 2)], references.at(-1)!];
    const candidates: string[] = [];
    for (const root of localRoots) {
      if (probes.length) {
        const separator = /^(?:[a-z]:|\\\\)/i.test(root.path) ? '\\' : '/';
        let matched = true;
        for (const probe of probes) if (!await exists(root.path.replace(/[\\/]$/, '') + separator + probe.tail.replace(/\//g, separator), probe.directory)) { matched = false; break; }
        if (matched) candidates.push(root.path);
      } else if (root.name.normalize('NFKC').toLocaleLowerCase() === location.name.normalize('NFKC').toLocaleLowerCase()) candidates.push(root.path);
    }
    if (candidates.length === 1) result.push({ from: location.path, to: candidates[0], reason: 'relative' });
  }
  return result;
}
export function remapBackup(backup: DataBackup, options: DataImportOptions, platform: string): OmiComicAppData {
  if (!object(options) || !Array.isArray(options.mappings) || !['merge', 'replace'].includes(options.mode) || !['local', 'imported'].includes(options.prefer) || typeof options.includeSettings !== 'boolean') throw new Error('导入选项无效。');
  const locations = backupLocations(backup.data), allowed = new Set(locations.map(root => root.path));
  const mappings = options.mappings.map(mapping => {
    if (!object(mapping) || !text(mapping.from) || !allowed.has(mapping.from) || !text(mapping.to) || !mapping.to || mapping.to.replace(/\\/g, '/').split('/').some(part => part === '..' || part === '.') || !(/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(mapping.to))) throw new Error('目录配对无效，请重新选择目标目录。');
    return mapping;
  }).sort((a, b) => b.from.length - a.from.length);
  if (new Set(mappings.map(m => m.from)).size !== mappings.length) throw new Error('同一来源目录不能重复配对。');
  const mapPath = (value: string) => {
    for (const mapping of mappings) {
      const tail = relative(value, mapping.from);
      if (tail !== null) { if (tail.split('/').some(part => part === '..' || part === '.')) throw new Error('备份中包含无效的相对路径。'); const separator = /^(?:[a-z]:|\\\\)/i.test(mapping.to) ? '\\' : '/'; const base = separator === '\\' ? mapping.to.replace(/\//g,'\\') : mapping.to; return base.replace(/[\\/]$/, '') + (tail ? separator + tail.replace(/\//g, separator) : ''); }
    }
    return value;
  };
  const mapKey = (key: string) => { const colon = key.indexOf(':'); return colon < 0 ? key : key.slice(0, colon + 1) + mapPath(key.slice(colon + 1)); };
  const data = structuredClone(backup.data);
  const identities = new Map<string, string>();
  for (const item of records(data)) {
    const mapped = mapKey(item.resourceKey), previous = identities.get(mapped);
    if (previous && previous !== item.resourceKey) throw new Error('目录配对使不同漫画对应到同一路径，请调整配对。');
    identities.set(mapped, item.resourceKey);
  }
  const change = <T extends { sourcePath: string; resourceKey: string }>(item: T): T => {
    item = { ...item };
    const oldKey = item.resourceKey;
    item.sourcePath = mapPath(item.sourcePath); item.resourceKey = mapKey(oldKey);
    const withId = item as T & { id?: string; thumbnailUrl?: string };
    if (withId.id?.includes(oldKey)) withId.id = withId.id.replace(oldKey, item.resourceKey);
    delete withId.thumbnailUrl; return item;
  };
  data.favorites = data.favorites.map(change); data.bookmarks = data.bookmarks.map(change);
  data.recentOpened = data.recentOpened.map(change); data.temporaryOpened = data.temporaryOpened.map(change);
  const mapTable = <T extends { resourceKey: string; sourcePath: string }>(table: Record<string, T>): Record<string, T> => {
    const entries = Object.values(table).map(change);
    if (new Set(entries.map(item => item.resourceKey)).size !== entries.length) throw new Error('目录配对使不同漫画对应到同一路径，请调整配对。');
    return Object.fromEntries(entries.map(item => [item.resourceKey, item]));
  };
  data.readingProgress = mapTable(data.readingProgress); data.resourceMeta = mapTable(data.resourceMeta);
  for (const folder of data.virtualFolders) { folder.items = folder.items.map(change); if (folder.coverResourceKey) folder.coverResourceKey = mapKey(folder.coverResourceKey); }
  data.removedRecentResourceKeys = data.removedRecentResourceKeys.map(mapKey);
  data.excludedResourcePaths = (data.excludedResourcePaths ?? []).map(mapPath);
  const samePlatform = backupPlatform(platform) === backup.platform;
  data.library.roots = data.library.roots.filter(root => samePlatform || mappings.some(m => relative(root.path, m.from) !== null)).map(root => ({ ...root, path: mapPath(root.path) }));
  data.library.roots = [...new Map(data.library.roots.map(root => [normalized(root.path), root])).values()];
  data.library.lastActiveRootPath = data.library.lastActiveRootPath ? mapPath(data.library.lastActiveRootPath) : data.library.roots[0]?.path;
  data.library.lastCurrentPath = data.library.lastCurrentPath ? mapPath(data.library.lastCurrentPath) : data.library.lastActiveRootPath;
  if (!samePlatform && !data.library.roots.some(root => root.path === data.library.lastActiveRootPath)) { data.library.lastActiveRootPath = data.library.roots[0]?.path; data.library.lastCurrentPath = data.library.lastActiveRootPath; }
  return data;
}
function union<T>(first: T[], second: T[], key: (value: T) => string): T[] { const entries = new Map<string, T>(); for (const value of [...first, ...second]) if (!entries.has(key(value))) entries.set(key(value), value); return [...entries.values()]; }
const indexed = <T>(list: T[]) => list.map((value, sortIndex) => ({ ...value, sortIndex }));
export function mergeBackup(local: OmiComicAppData, backup: DataBackup, options: DataImportOptions, platform: string): OmiComicAppData {
  const incoming = remapBackup(backup, options, platform), replace = options.mode === 'replace';
  const settings: AppSettings = structuredClone(local.settings);
  if (options.includeSettings) {
    if (backup.platform === backupPlatform(platform)) Object.assign(settings, incoming.settings);
    else for (const key of ['language', 'colorTheme', 'showHomePage', 'readerPageMode', 'readerDefaultFlow', 'readerDefaultPanorama', 'readerDefaultImmersive', 'doublePageFirstSingle', 'doublePageDirection', 'smartDetectSpreadPage', 'tagSearchMode', 'searchSplitSpaces'] as const) if (incoming.settings[key] !== undefined) Object.assign(settings, { [key]: incoming.settings[key] });
  }
  if (replace) return { ...incoming, settings };
  const first = options.prefer === 'imported' ? incoming : local, second = first === incoming ? local : incoming;
  const key = (item: { resourceKey: string }) => item.resourceKey;
  const markKey = (mark: OmiComicAppData['bookmarks'][number]) => JSON.stringify([mark.resourceKey, mark.pageId ?? (mark.sourceType === 'pdf' || mark.sourceType === 'epub' || mark.sourceType === 'mobi' ? mark.pageIndex : mark.archiveInnerPath ?? mark.pageName ?? mark.pageIndex)]);
  const virtualFolders = union(first.virtualFolders, second.virtualFolders, item => item.id).map(folder => {
    const a = first.virtualFolders.find(f => f.id === folder.id), b = second.virtualFolders.find(f => f.id === folder.id);
    return { ...folder, items: indexed(union(a?.items ?? [], b?.items ?? [], key)) };
  });
  const removed = [...new Set([...first.removedRecentResourceKeys, ...second.removedRecentResourceKeys])];
  return {
    version: 1, settings,
    library: { ...local.library, roots: union(local.library.roots, incoming.library.roots, root => normalized(root.path)) },
    readingProgress: { ...second.readingProgress, ...first.readingProgress }, resourceMeta: { ...second.resourceMeta, ...first.resourceMeta },
    favorites: indexed(union(first.favorites, second.favorites, key)), bookmarks: indexed(union(first.bookmarks, second.bookmarks, markKey)),
    recentOpened: union(first.recentOpened, second.recentOpened, key).filter(item => !removed.includes(item.resourceKey)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, settings.recentOpenedLimit),
    temporaryOpened: union(first.temporaryOpened, second.temporaryOpened, key), removedRecentResourceKeys: removed,
    excludedResourcePaths: [...new Set([...(first.excludedResourcePaths ?? []), ...(second.excludedResourcePaths ?? [])])],
    tagOrder: [...new Set([...first.tagOrder, ...second.tagOrder])], bookshelves: indexed(union(first.bookshelves, second.bookshelves, item => item.id)), virtualFolders: indexed(virtualFolders),
  };
}
