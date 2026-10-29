import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { 缩略图结果 } from './thumbnailService';

let directory: string | undefined, generation = 0, writes = 0;
let pruning: Promise<void> | undefined;
const pendingWrites = new Set<Promise<void>>();
const limit = 128 * 1024 * 1024, entryLimit = 16 * 1024 * 1024;
const cacheName = /^[a-f0-9]{64}\.json$/;
export const thumbnailDiskMetrics = { hits: 0, writes: 0, bytes: 0 };
export function configureThumbnailDiskCache(folder: string) { directory = folder; generation++; }
const fileFor = (key: string, version: string) => path.join(directory!, createHash('sha256').update('cover-v1\n' + key + '\n' + version).digest('hex') + '.json');
export async function readThumbnailDisk(key: string, version: string): Promise<缩略图结果 | undefined> {
  if (!directory) return;
  try {
    const file = fileFor(key, version), stat = await fs.stat(file);
    if (stat.size > entryLimit) return;
    const saved = JSON.parse(await fs.readFile(file, 'utf8')) as 缩略图结果;
    if (typeof saved.url !== 'string' || !/^data:image\/(png|jpeg|gif|webp|bmp);base64,/.test(saved.url)) return;
    thumbnailDiskMetrics.hits++; return { url: saved.url };
  } catch { return; }
}
export function writeThumbnailDisk(key: string, version: string, result: 缩略图结果) {
  const task = write(key, version, result); pendingWrites.add(task);
  void task.then(() => pendingWrites.delete(task), () => pendingWrites.delete(task));
  return task;
}
async function write(key: string, version: string, result: 缩略图结果) {
  if (!directory || !result.url?.startsWith('data:image/')) return;
  const text = JSON.stringify({ url: result.url }), bytes = Buffer.byteLength(text);
  if (bytes > entryLimit) return;
  const epoch = generation, folder = directory, file = fileFor(key, version), temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(temporary, text);
    if (generation !== epoch) return;
    await fs.rename(temporary, file); thumbnailDiskMetrics.writes++; thumbnailDiskMetrics.bytes += bytes;
    if (++writes % 16 === 1) await prune(folder);
  } catch { /* Derived cache failure never prevents reading a comic. */ }
  finally { await fs.unlink(temporary).catch(() => {}); }
}
async function prune(folder: string) {
  if (pruning) return pruning;
  pruning = (async () => {
    const files = (await fs.readdir(folder)).filter(name => cacheName.test(name));
    const entries: { file: string; bytes: number; modified: number }[] = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
      while (cursor < files.length) {
        const file = path.join(folder, files[cursor++]);
        try { const stat = await fs.stat(file); entries.push({ file, bytes: stat.size, modified: stat.mtimeMs }); } catch {}
      }
    }));
    entries.sort((a,b) => b.modified-a.modified);
    let bytes = 0;
    for (let index=0;index<entries.length;index++) {
      const entry=entries[index]; bytes+=entry.bytes;
      if (index>=2048 || bytes>limit) await fs.unlink(entry.file).catch(()=>{});
    }
  })().finally(() => { pruning = undefined; });
  return pruning;
}
export async function clearThumbnailDiskCache() {
  generation++;
  await Promise.allSettled([...pendingWrites]);
  if (!directory) return;
  await pruning?.catch(()=>{});
  for (const name of await fs.readdir(directory).catch(()=>[])) {
    if (cacheName.test(name)) await fs.unlink(path.join(directory,name)).catch(()=>{});
  }
}
