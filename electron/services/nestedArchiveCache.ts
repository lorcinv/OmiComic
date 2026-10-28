import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { ARCHIVE_LIMITS, 压缩包服务错误, type ArchiveEntry } from './archiveSafety';

export const isNestedArchive = (name: string) => /\.(?:zip|cbz|rar|cbr|7z|cb7)$/i.test(name);
export const nestedVirtualPath = (parts: string[]) => '__omi_nested_v1__/' + parts.map(encodeURIComponent).join('/');
type Cached = { file: string; size: number; pins: number };
const cache = new Map<string, Cached>(), pending = new Map<string, Promise<Cached>>();
let directory: string | undefined, directoryTask: Promise<string> | undefined;
type Priority = 'foreground' | 'background';
const jobs: Array<{ priority: Priority; key: string; run: () => void }> = [];
let extracting = false;
export const nestedArchiveMetrics = { extractions: 0, bytes: 0, queued: 0, foregroundWaitMs: 0 };
async function extraction<T>(action: () => Promise<T>, priority: Priority, key: string): Promise<T> {
  const started = Date.now();
  await new Promise<void>(resolve => { jobs.push({ priority, key, run: resolve }); nestedArchiveMetrics.queued++; drain(); });
  if (priority === 'foreground') nestedArchiveMetrics.foregroundWaitMs += Date.now() - started;
  try { return await action(); } finally { extracting = false; drain(); }
}
function drain() {
  if (extracting || !jobs.length) return;
  const foreground = jobs.findIndex(job => job.priority === 'foreground');
  extracting = true; jobs.splice(foreground < 0 ? 0 : foreground, 1)[0].run();
}
async function root() {
  return directoryTask ??= fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-nested-')).then(value => directory = value);
}
process.once('exit', () => {
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('omicomic-nested-')) {
    try { rmSync(directory, { recursive: true, force: true }); } catch { /* OS releases remaining file handles on exit. */ }
  }
});

// Only archive containers enter this private scratch cache; image pages remain streamed.
// Serialize decompression so several cover requests cannot allocate many large ZIPs.
export async function withNestedArchive<T>(parent: string, entry: ArchiveEntry,
  read: () => Promise<Buffer>, action: (file: string) => Promise<T>, priority: Priority = 'background'): Promise<T> {
  if (entry.size > ARCHIVE_LIMITS.imageBytes) throw new 压缩包服务错误('ARCHIVE_IMAGE_TOO_LARGE', '内层压缩包超过 256 MB，请解压一层后打开。');
  const stat = await fs.stat(parent);
  const key = createHash('sha256').update(JSON.stringify([parent, stat.size, stat.mtimeMs, stat.ctimeMs, entry.virtualPath])).digest('hex');
  let item = cache.get(key);
  if (!item) {
    let task = pending.get(key);
    if (!task) {
      task = extraction(async () => {
        const file = path.join(await root(), key + path.extname(entry.virtualPath).toLowerCase());
        const data = await read(); nestedArchiveMetrics.extractions++; nestedArchiveMetrics.bytes += data.length;
        if (data.length !== entry.size) throw new Error('Nested archive size mismatch');
        await fs.writeFile(file, data, { flag: 'wx' });
        const result = { file, size: data.length, pins: 0 }; cache.set(key, result); return result;
      }, priority, key);
      pending.set(key, task);
    }
    if (priority === 'foreground') { const waiting = jobs.find(job => job.key === key); if (waiting) waiting.priority = 'foreground'; }
    try { item = await task; } finally { if (pending.get(key) === task) pending.delete(key); }
  }
  item.pins++; cache.delete(key); cache.set(key, item);
  try { return await action(item.file); }
  finally {
    item.pins--;
    let bytes = [...cache.values()].reduce((sum, value) => sum + value.size, 0);
    for (const [oldKey, old] of cache) {
      if (bytes <= 512 * 1024 * 1024 && cache.size <= 24) break;
      if (old.pins) continue;
      try { await fs.unlink(old.file); cache.delete(oldKey); bytes -= old.size; } catch { /* A concurrent reader still owns it. */ }
    }
  }
}
