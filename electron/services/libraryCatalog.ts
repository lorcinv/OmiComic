import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DirectoryEntry } from './directoryService';
import { foregroundBusy } from './foregroundWork';

export type CatalogEntry = DirectoryEntry & { containsImages?: boolean };
export interface LibraryCatalog {
  items: CatalogEntry[]; directories: number; skipped: number; scannedAt: number;
  complete?: boolean; removedPaths?: string[]; yielded?: boolean;
}
type Block = { path: string; saved: number; items: CatalogEntry[]; folder: CatalogEntry; status?: 'complete' | 'pending' | 'failed' };
type Job = { path: string; folder?: CatalogEntry; verify?: boolean };
type Session = { queue: Job[]; seen: Set<string>; out: CatalogEntry[]; offset: number;
  directories: number; skipped: number; removed: string[]; hidden: Set<string>; metadataBlocks: Set<Block> };
const sessions = new Map<string, Session>(), fullCache = new Map<string, LibraryCatalog>();
const locks = new Map<string, Promise<LibraryCatalog>>(), hot = new Map<string, Block>();
let storage: string | undefined, epoch = 0;
export const catalogMetrics = { readdir: 0, stat: 0, diskHits: 0, hotHits: 0, batches: 0,
  bytes: 0, cancelled: 0, yielded: 0, persistenceBytes: 0, errors: 0 };
export function configureLibraryCatalog(directory: string) { storage = directory; }
const key = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const within = (root: string, target: string) => { const relative = path.relative(root, target); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); };
function excluded(target: string, hidden: Set<string>) {
  for (let value = key(target); ; value = path.dirname(value)) {
    if (hidden.has(value)) return true;
    if (path.dirname(value) === value) return false;
  }
}
function blockFile(directory: string) { return path.join(storage!, createHash('sha256').update(key(directory)).digest('hex') + '.json'); }
function retain(block: Block) {
  hot.delete(key(block.path)); hot.set(key(block.path), block);
  let count = 0; for (const value of hot.values()) count += value.items.length;
  while (hot.size > 1 && (hot.size > 64 || count > 32_000)) {
    const oldest = hot.keys().next().value!; count -= hot.get(oldest)!.items.length; hot.delete(oldest);
  }
}
async function savedBlock(directory: string): Promise<Block | undefined> {
  const cached = hot.get(key(directory));
  if (cached) { catalogMetrics.hotHits++; return cached; }
  if (!storage) return;
  try {
    const text = await fs.readFile(blockFile(directory), 'utf8'), block = JSON.parse(text) as Block;
    if (key(block.path) !== key(directory) || !Array.isArray(block.items) || !block.folder
      || block.items.some(item => key(path.dirname(item.path)) !== key(directory) || !['folder','archive','pdf','epub'].includes(item.type))) return;
    catalogMetrics.diskHits++; retain(block); return block;
  } catch { /* Missing or damaged derived blocks are rebuilt individually. */ }
}
const writes = new Map<string, Promise<void>>();
async function saveBlock(block: Block) {
  retain(block);
  if (!storage) return;
  const file = blockFile(block.path);
  const task = (writes.get(file) ?? Promise.resolve()).catch(() => {}).then(async () => {
    await fs.mkdir(storage!, { recursive: true });
    const temporary = file + '.tmp', handle = await fs.open(temporary, 'w');
    const write = async (text: string) => { await handle.write(text); catalogMetrics.persistenceBytes += Buffer.byteLength(text); };
    try {
      const { items, ...header } = block;
      await write(JSON.stringify(header).slice(0, -1) + ',"items":[');
      for (let offset = 0; offset < items.length; offset += 256) {
        await write((offset ? ',' : '') + items.slice(offset, offset + 256).map(item => JSON.stringify(item)).join(','));
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      await write(']}');
    } finally { await handle.close(); }
    await fs.rename(temporary, file);
  });
  writes.set(file, task);
  try { await task; } catch { catalogMetrics.errors++; }
  finally { if (writes.get(file) === task) writes.delete(file); }
}
// Normal directory reads also supply discovery. Image pages belong to one book.
export async function observeCatalogDirectory(directory: string, entries: DirectoryEntry[]) {
  const previous = hot.get(key(directory));
  const folder: CatalogEntry = { ...previous?.folder, id: directory, path: directory,
    name: path.basename(directory), extension: '', type: 'folder', containsImages: entries.some(item => item.type === 'image') };
  await saveBlock({ path: directory, saved: Date.now(), folder,
    items: entries.filter(item => ['folder','archive','pdf','epub'].includes(item.type)) });
}
export function cancelLibraryCatalogScans(root?: string) {
  // Completed blocks and queues survive cancellation.
  epoch++; catalogMetrics.cancelled++;
  if (root) fullCache.delete(key(root));
}
export async function invalidateCatalogDirectories(root: string, paths: string[]) {
  fullCache.delete(key(root));
  const session = sessions.get(key(root));
  for (const directory of new Set(paths.filter(value => within(root, value)))) {
    const block = await savedBlock(directory);
    if (block) { block.saved = 0; block.status = 'pending'; await saveBlock(block); }
    if (session) session.queue.unshift({ path: directory, verify: true });
  }
}
const extensions = new Map<string, DirectoryEntry['type']>([
  ...['zip','cbz','rar','cbr','7z','cb7'].map(extension => [extension, 'archive'] as const), ['pdf','pdf'], ['epub','epub'],
]);
async function discover(job: Job, metadata: boolean, root: string): Promise<Block> {
  if (!within(await fs.realpath(root), await fs.realpath(job.path))) throw new Error('资源库目录超出授权范围。');
  catalogMetrics.readdir++;
  const entries = await fs.readdir(job.path, { withFileTypes: true });
  const folder: CatalogEntry = job.folder ?? { id: job.path, path: job.path, name: path.basename(job.path), type: 'folder', extension: '' };
  const items: CatalogEntry[] = []; let containsImages = false;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const extension = path.extname(entry.name).slice(1).toLowerCase();
    if (entry.isFile() && /^(jpg|jpeg|png|webp|gif|bmp)$/.test(extension)) { containsImages = true; continue; }
    const type = entry.isDirectory() ? 'folder' : entry.isFile() ? extensions.get(extension) : undefined;
    if (!type) continue;
    const file = path.join(job.path, entry.name);
    items.push({ id: file, path: file, name: entry.name, type, extension: type === 'folder' ? '' : extension });
  }
  return { path: job.path, saved: Date.now(), folder: { ...folder, containsImages }, items, status: 'complete' };
}
async function fillMetadata(items: CatalogEntry[]) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]; if (item.modifiedAt !== undefined) continue;
      try { catalogMetrics.stat++; const stat = await fs.stat(item.path); item.size = stat.size; item.modifiedAt = stat.mtimeMs; }
      catch { item.hasError = true; }
    }
  }));
}
export type CatalogBatchOptions = { incremental?: boolean; restart?: boolean; metadata?: boolean; refresh?: boolean; excludedPaths?: string[]; invalidatePaths?: string[] };
export async function scanLibraryCatalogBatch(rootPath: string, authorizedRoot: string, options: CatalogBatchOptions = {}): Promise<LibraryCatalog> {
  const root = path.resolve(rootPath), identity = key(root);
  // Authorize every request, including persisted results.
  const [realRoot, realAllowed] = await Promise.all([fs.realpath(root), fs.realpath(authorizedRoot)]);
  if (!within(path.resolve(authorizedRoot), root) || !within(realAllowed, realRoot)) throw new Error('资源库目录超出授权范围。');
  const task = (locks.get(identity) ?? Promise.resolve()).catch(() => {}).then(() => batch(root, options)); locks.set(identity, task);
  try { return await task; } finally { if (locks.get(identity) === task) locks.delete(identity); }
}
async function batch(root: string, options: CatalogBatchOptions): Promise<LibraryCatalog> {
  const identity = key(root);
  if (options.invalidatePaths?.length) await invalidateCatalogDirectories(root, options.invalidatePaths);
  let session = sessions.get(identity);
  if (!session || options.restart) {
    session = { queue: [{ path: root }], seen: new Set(), out: [], offset: 0, directories: 0, skipped: 0,
      removed: [], hidden: new Set((options.excludedPaths ?? []).map(key)), metadataBlocks: new Set() };
    sessions.set(identity, session);
    while (sessions.size > 6) { const oldest = sessions.keys().next().value!; if (oldest === identity) break; sessions.delete(oldest); }
  }
  const started = Date.now(), requestEpoch = epoch;
  if (options.excludedPaths) session.hidden = new Set(options.excludedPaths.map(key));
  if (session.offset >= session.out.length) { session.out = []; session.offset = 0; }
  let processed = 0;
  while (session.out.length < 256 && session.queue.length && ++processed <= 4 && Date.now() - started < 24) {
    if (requestEpoch !== epoch) throw Object.assign(new Error('资源库扫描已取消。'), { name: 'AbortError' });
    const job = session.queue.shift()!;
    if (excluded(job.path, session.hidden) || !job.verify && session.seen.has(key(job.path))) continue;
    session.seen.add(key(job.path));
    let block = await savedBlock(job.path);
    // Replaying validated summaries needs no directory enumeration or decoding.
    // Keep warm searches responsive while visible covers own foreground I/O.
    if (foregroundBusy() && (!block || job.verify || options.refresh)) {
      session.seen.delete(key(job.path)); session.queue.unshift(job); catalogMetrics.yielded++; break;
    }
    try {
      if (!block || job.verify || options.refresh) {
        const old = block; block = await discover(job, !!options.metadata, root);
        if (old) {
          const live = new Set(block.items.map(item => key(item.path)));
          session.removed.push(...old.items.filter(item => !live.has(key(item.path))).map(item => item.path));
        }
        await saveBlock(block);
      } else if (Date.now() - block.saved > 120_000) session.queue.push({ ...job, verify: true });
    } catch (error) {
      session.skipped++; catalogMetrics.errors++;
      if (block) { block.saved = 0; block.status = 'failed'; await saveBlock(block); }
      if (!block) { if (job.path === root) throw error; continue; }
    }
    session.directories++;
    if (options.metadata) session.metadataBlocks.add(block);
    for (const item of block.items) if (item.type === 'folder' && !excluded(item.path, session.hidden) && !session.seen.has(key(item.path))) session.queue.push({ path: item.path, folder: item });
    for (const item of [block.folder, ...block.items]) if (!excluded(item.path, session.hidden)) session.out.push(item);
  }
  if (requestEpoch !== epoch) throw Object.assign(new Error('资源库扫描已取消。'), { name: 'AbortError' });
  const items = session.out.slice(session.offset, session.offset + 256); session.offset += items.length;
  if (options.metadata) {
    await fillMetadata(items);
    // Commit each directory once after its metadata batches, rather than writing
    // a growing 100,000-entry JSON block after every 256 stat results.
    if (session.offset >= session.out.length) {
      for (const block of session.metadataBlocks) await saveBlock(block);
      session.metadataBlocks.clear();
    }
  }
  const result: LibraryCatalog = { items, directories: session.directories, skipped: session.skipped, scannedAt: Date.now(),
    complete: !session.queue.length && session.offset >= session.out.length, removedPaths: session.removed.splice(0), yielded: !items.length && session.queue.length > 0 };
  catalogMetrics.batches++; catalogMetrics.bytes += Buffer.byteLength(JSON.stringify(result));
  if (result.complete) { session.out = []; session.offset = 0; }
  return result;
}
// Explicit complete-inventory compatibility; the UI uses bounded batches.
export async function scanLibraryCatalog(root: string, allowed: string, refresh = false): Promise<LibraryCatalog> {
  if (!refresh && fullCache.has(key(root))) {
    await fs.realpath(allowed); if (!within(allowed, root)) throw new Error('资源库目录超出授权范围。');
    return fullCache.get(key(root))!;
  }
  const startEpoch = epoch, items = new Map<string, CatalogEntry>(); let result: LibraryCatalog;
  let first = true;
  do {
    if (startEpoch !== epoch) throw Object.assign(new Error('资源库扫描已取消。'), { name: 'AbortError' });
    result = await scanLibraryCatalogBatch(root, allowed, { restart: first, refresh }); first = false;
    if (startEpoch !== epoch) throw Object.assign(new Error('资源库扫描已取消。'), { name: 'AbortError' });
    for (const item of result.items) if (key(item.path) !== key(root) || item.containsImages) items.set(key(item.path), item);
    for (const removed of result.removedPaths ?? []) items.delete(key(removed));
    if (result.yielded) await new Promise(resolve => setTimeout(resolve, 25));
  } while (!result.complete);
  const full = { ...result, items: [...items.values()] }; fullCache.set(key(root), full);
  while (fullCache.size > 4) fullCache.delete(fullCache.keys().next().value!);
  return full;
}
