import yauzl from "yauzl";
import path from "node:path";
import { promises as fs } from "node:fs";
import os from 'node:os';
import { crc32 } from 'node:zlib';
import { ARCHIVE_LIMITS, createEntryGuard, failLimit, isImage, normalizeArchiveError, validateEntryName, validateReadLimit, 压缩包服务错误, type ArchiveEntry, type 压缩包错误代码 } from "./archiveSafety";
import { listSevenZip, readSevenZip } from "./archiveSevenZip";
import { isNestedArchive, nestedVirtualPath, withNestedArchive } from './nestedArchiveCache';
import { foregroundWork } from './foregroundWork';
export { 压缩包服务错误, type 压缩包错误代码 } from "./archiveSafety";
export type 压缩包图片条目 = ArchiveEntry;
export const 压缩包单张图片最大字节数 = ARCHIVE_LIMITS.imageBytes;
const sorter = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

// Desktop ZIP work scales to the host. Keep two lanes available for a requested
// page even while thumbnails and read-ahead fill their background allowance.
const concurrency = Math.max(3, Math.min(12, os.availableParallelism(), Math.floor(os.totalmem() / 1024 ** 3 / 2)));
let active = 0, activeSeven = 0;
type Priority = 'foreground' | 'background';
const waiting: Array<{ priority: Priority; seven: boolean; run: () => void }> = [];
export const archiveMetrics = { zipIndexes: 0, zipReads: 0, sevenIndexes: 0, sevenReads: 0, queued: 0, foregroundWaitMs: 0, backgroundWaitMs: 0 };
function drain() {
  waiting.sort((a, b) => Number(a.priority === 'background') - Number(b.priority === 'background'));
  for (;;) {
    const index = waiting.findIndex(job => active < (job.priority === 'foreground' ? concurrency : concurrency - 2) && (!job.seven || activeSeven < 2));
    if (index < 0) return;
    const [job] = waiting.splice(index, 1); active++; if (job.seven) activeSeven++; job.run();
  }
}
async function bounded<T>(action: () => Promise<T>, priority: Priority = 'background', seven = false): Promise<T> {
  if (waiting.length >= 128) failLimit();
  const queued = Date.now(); archiveMetrics.queued++;
  await new Promise<void>(resolve => { waiting.push({ priority, seven, run: resolve }); drain(); });
  archiveMetrics[priority === 'foreground' ? 'foregroundWaitMs' : 'backgroundWaitMs'] += Date.now() - queued;
  try { return await foregroundWork(action); }
  finally { active--; if (seven) activeSeven--; drain(); }
}
function format(file: string): "zip" | "rar" | "7z" {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".rar" || ext === ".cbr") return "rar";
  if (ext === ".7z" || ext === ".cb7") return "7z";
  if (ext === ".zip" || ext === ".cbz" || ext === ".epub") return "zip";
  throw new Error("Unsupported archive format");
}
async function openZip(file: string) {
  return yauzl.openPromise(file, { autoClose: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false });
}
function checkZip(entry: yauzl.Entry, guard: ReturnType<typeof createEntryGuard>) {
  guard({ virtualPath: entry.fileName, size: entry.uncompressedSize }, entry.compressedSize);
  if (entry.isEncrypted()) throw new 压缩包服务错误("ARCHIVE_ENCRYPTED", "暂不支持加密压缩包。");
  if (!entry.canDecodeFileData()) throw new Error("Unsupported ZIP compression");
  if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new 压缩包服务错误("ARCHIVE_UNSAFE_ENTRY", "压缩包包含不支持的链接。");
}
const zipDirectories = new Map<string, { signature: string; entries: Map<string, yauzl.Entry> }>();
const statSignature = (stat: { size: number; mtimeMs: number; ctimeMs: number }) => `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
async function listZip(file: string): Promise<ArchiveEntry[]> {
  archiveMetrics.zipIndexes++;
  const signature = statSignature(await fs.stat(file));
  const zip = await openZip(file);
  try {
    if (zip.entryCount > ARCHIVE_LIMITS.entries) failLimit();
    const result: ArchiveEntry[] = [];
    const directory = new Map<string, yauzl.Entry>();
    const deadline = Date.now() + ARCHIVE_LIMITS.timeoutMs;
    const guard = createEntryGuard();
    for await (const entry of zip.eachEntry()) {
      if (Date.now() > deadline) failLimit();
      checkZip(entry, guard);
      if (!entry.fileName.endsWith("/") && (isImage(entry.fileName) || isNestedArchive(entry.fileName))) {
        const modifiedAt = entry.getLastModDate().getTime();
        result.push({ virtualPath: entry.fileName, size: entry.uncompressedSize, modifiedAt: Number.isFinite(modifiedAt) ? modifiedAt : undefined });
        // ZIP64 offsets are already resolved; drop optional raw fields/comments so
        // malicious 64 KiB extra fields per entry cannot inflate the cache.
        entry.extraFields = [];
        entry.fileComment = "";
        entry.fileNameRaw = Buffer.alloc(0);
        entry.extraFieldRaw = Buffer.alloc(0);
        entry.fileCommentRaw = Buffer.alloc(0);
        directory.set(entry.fileName, entry);
      }
    }
    if (signature !== statSignature(await fs.stat(file))) throw new Error("Archive changed while indexing");
    zipDirectories.delete(file);
    zipDirectories.set(file, { signature, entries: directory });
    while (zipDirectories.size > 16) zipDirectories.delete(zipDirectories.keys().next().value!);
    return result;
  } finally { zip.close(); }
}
// yauzl validates sizes, but intentionally does not validate CRC32. Do it incrementally.
async function readZip(file: string, name: string, limit: number): Promise<Buffer> {
  const cachedDirectory = zipDirectories.get(file);
  const cachedEntry = cachedDirectory?.signature === statSignature(await fs.stat(file)) ? cachedDirectory.entries.get(name) : undefined;
  const zip = await openZip(file);
  try {
    if (zip.entryCount > ARCHIVE_LIMITS.entries) failLimit();
    const guard = createEntryGuard();
    // A validated central directory entry can be read directly on a fresh file handle.
    // This avoids O(page count) directory scans every time the reader changes a page.
    const entries = cachedEntry ? [cachedEntry] : zip.eachEntry();
    for await (const entry of entries) {
      checkZip(entry, guard);
      if (entry.fileName !== name || !(isImage(name) || isNestedArchive(name))) continue;
      if (entry.uncompressedSize > limit) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      let crc = 0;
      const timer = setTimeout(() => stream.destroy(new Error("Archive read timed out")), ARCHIVE_LIMITS.timeoutMs);
      try {
        for await (const raw of stream) {
          const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          size += chunk.length;
          if (size > limit) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
          crc = crc32(chunk, crc);
          chunks.push(chunk);
        }
        if (size !== entry.uncompressedSize || crc !== entry.crc32) throw new Error("ZIP CRC mismatch");
        return Buffer.concat(chunks, size);
      } finally { clearTimeout(timer); stream.destroy(); }
    }
    throw new 压缩包服务错误("ARCHIVE_ENTRY_NOT_FOUND", "压缩包中没有找到当前图片。");
  } finally { zip.close(); }
}
const cache = new Map<string, { signature: string; entries: ArchiveEntry[] }>();
const indexing = new Map<string, Promise<ArchiveEntry[]>>();
const rawDirectories = new Map<string, { signature: string; entries: ArchiveEntry[] }>();
const rawIndexing = new Map<string, Promise<ArchiveEntry[]>>();
const metadataWeights = new WeakMap<object, number>();
function trimMetadata() {
  const maps = [zipDirectories, rawDirectories, cache] as Array<Map<string, { entries: Map<string, yauzl.Entry> | ArchiveEntry[] }>>;
  const weight = (value: { entries: Map<string, yauzl.Entry> | ArchiveEntry[] }) => {
    let bytes = metadataWeights.get(value);
    if (bytes === undefined) {
      bytes = 128;
      if (Array.isArray(value.entries)) for (const item of value.entries) bytes += 160 + item.virtualPath.length * 2 + (item.archiveChain?.join('/').length ?? 0) * 2;
      else for (const name of value.entries.keys()) bytes += 320 + name.length * 2;
      metadataWeights.set(value, bytes);
    }
    return bytes;
  };
  let total = maps.reduce((sum, map) => sum + [...map.values()].reduce((n, value) => n + weight(value), 0), 0);
  while (total > 32 * 1024 * 1024) {
    const largest = maps.reduce((a, b) => a.size >= b.size ? a : b);
    const first = largest.keys().next().value; if (first === undefined) break;
    total -= weight(largest.get(first)!); largest.delete(first);
  }
}
async function rawList(file: string): Promise<ArchiveEntry[]> {
  const signature = statSignature(await fs.stat(file)), saved = rawDirectories.get(file);
  if (saved?.signature === signature) return saved.entries;
  const key = JSON.stringify([file,signature]);
  let task = rawIndexing.get(key);
  if (!task) {
    task = (format(file) === 'zip' ? listZip(file) : listSevenZip(file)).finally(() => rawIndexing.delete(key));
    rawIndexing.set(key,task);
  }
  const entries = await task;
  rawDirectories.delete(file); rawDirectories.set(file, { signature, entries });
  while (rawDirectories.size > 32) rawDirectories.delete(rawDirectories.keys().next().value!);
  trimMetadata();
  return entries;
}
async function rawRead(file: string, entry: ArchiveEntry, limit: number): Promise<Buffer> {
  archiveMetrics[format(file) === 'zip' ? 'zipReads' : 'sevenReads']++;
  return format(file) === 'zip' ? readZip(file, entry.virtualPath, limit) : readSevenZip(file, entry, limit);
}
async function list(file: string, depth = 0, priority: Priority = 'background'): Promise<ArchiveEntry[]> {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error("Not a regular archive");
  const signature = statSignature(stat);
  const cached = cache.get(file);
  if (cached?.signature === signature) return cached.entries.map(entry => ({ ...entry }));
  const key = JSON.stringify([file, signature]);
  let pending = indexing.get(key);
  if (!pending) {
    pending = (async () => {
      const raw = await rawList(file), result = raw.filter(entry => isImage(entry.virtualPath));
      for (const entry of raw.filter(entry => isNestedArchive(entry.virtualPath))) {
        if (depth >= 3) throw new 压缩包服务错误('ARCHIVE_LIMIT_EXCEEDED', '压缩包嵌套超过 3 层，请解压一层后打开。');
        const inner = await withNestedArchive(file, entry, () => rawRead(file, entry, ARCHIVE_LIMITS.imageBytes), child => list(child, depth + 1, priority), priority);
        for (const page of inner) {
          const chain = [entry.virtualPath, ...(page.archiveChain ?? [page.virtualPath])];
          result.push({ ...page, virtualPath: nestedVirtualPath(chain), archiveChain: chain });
        }
      }
      const guard = createEntryGuard(); for (const entry of result) guard(entry);
      return result;
    })().finally(() => indexing.delete(key));
    indexing.set(key, pending);
  }
  const entries = await pending;
  entries.sort((a, b) => sorter.compare(a.virtualPath, b.virtualPath));
  cache.delete(file);
  cache.set(file, { signature, entries });
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
  trimMetadata();
  return entries.map(entry => ({ ...entry }));
}
export async function 读取压缩包图片列表(file: string): Promise<ArchiveEntry[]> {
  try { return await bounded(() => list(file, 0, 'foreground'), 'foreground', format(file) !== 'zip'); } catch (error) { throw normalizeArchiveError(error); }
}
async function coverCandidates(file: string, depth = 0): Promise<ArchiveEntry[]> {
  const raw = await rawList(file), direct = raw.filter(entry => isImage(entry.virtualPath)).sort((a,b) => sorter.compare(a.virtualPath,b.virtualPath));
  if (direct.length) return direct;
  if (depth >= 3) return [];
  let failures = 0, attempts = 0;
  for (const entry of raw.filter(entry => isNestedArchive(entry.virtualPath)).sort((a,b) => sorter.compare(a.virtualPath,b.virtualPath))) {
    if (++attempts > 4) break;
    try {
      const inner = await withNestedArchive(file, entry, () => rawRead(file, entry, ARCHIVE_LIMITS.imageBytes), child => coverCandidates(child, depth + 1), 'background');
      if (inner.length) return inner.map(page => {
        const chain = [entry.virtualPath, ...(page.archiveChain ?? [page.virtualPath])];
        return { ...page, virtualPath: nestedVirtualPath(chain), archiveChain: chain };
      });
    } catch (error) { if (++failures >= 4) throw error; }
  }
  return [];
}
export async function 读取压缩包封面列表(file: string): Promise<ArchiveEntry[]> {
  try { return await bounded(() => coverCandidates(file), 'background', format(file) !== 'zip'); } catch (error) { throw normalizeArchiveError(error); }
}
/** Metadata work must never decompress containers ahead of visible covers. */
export async function 读取压缩包快速页数(file: string): Promise<number | null> {
  try { return await bounded(async () => {
    const saved = cache.get(file);
    if (saved?.signature === statSignature(await fs.stat(file))) return saved.entries.length;
    const entries = await rawList(file);
    return entries.some(entry => isNestedArchive(entry.virtualPath)) ? null : entries.filter(entry => isImage(entry.virtualPath)).length;
  }, 'background', format(file) !== 'zip'); } catch (error) { throw normalizeArchiveError(error); }
}
export async function 读取压缩包单张图片(file: string, name: string, maxBytes: number = ARCHIVE_LIMITS.imageBytes, priority: Priority = 'background', coverOnly = false): Promise<Buffer> {
  try {
    validateEntryName(name);
    validateReadLimit(maxBytes);
    return await bounded(async () => {
      // Validate the entire directory first, including entries after the requested page.
      const entries = coverOnly ? await coverCandidates(file) : await list(file, 0, priority);
      const entry = entries.find(item => item.virtualPath === name);
      if (!entry) throw new 压缩包服务错误("ARCHIVE_ENTRY_NOT_FOUND", "压缩包中没有找到当前图片。");
      if (entry.size > maxBytes) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
      async function readChain(current: string, parts: string[], depth: number): Promise<Buffer> {
        const entries = await rawList(current), selected = entries.find(item => item.virtualPath === parts[depth]);
        if (!selected) throw new 压缩包服务错误('ARCHIVE_ENTRY_NOT_FOUND', '内层压缩包中没有找到当前图片。');
        if (depth === parts.length - 1) return rawRead(current, selected, maxBytes);
        return withNestedArchive(current, selected, () => rawRead(current, selected, ARCHIVE_LIMITS.imageBytes), child => readChain(child, parts, depth + 1), priority);
      }
      return entry.archiveChain ? readChain(file, entry.archiveChain, 0) : rawRead(file, entry, maxBytes);
    }, priority, format(file) !== 'zip');
  } catch (error) { throw normalizeArchiveError(error); }
}
export function 是压缩包服务错误(error: unknown): error is 压缩包服务错误 { return error instanceof 压缩包服务错误; }
