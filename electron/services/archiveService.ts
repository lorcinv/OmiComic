import yauzl from "yauzl";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ARCHIVE_LIMITS, createEntryGuard, failLimit, isImage, normalizeArchiveError, validateEntryName, validateReadLimit, 压缩包服务错误, type ArchiveEntry, type 压缩包错误代码 } from "./archiveSafety";
import { listSevenZip, readSevenZip } from "./archiveSevenZip";
export { 压缩包服务错误, type 压缩包错误代码 } from "./archiveSafety";
export type 压缩包图片条目 = ArchiveEntry;
export const 压缩包单张图片最大字节数 = ARCHIVE_LIMITS.imageBytes;
const sorter = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

// Bound concurrent decoders, including parallel thumbnail requests. Jobs never retain decoded pages.
let active = 0;
const waiting: Array<() => void> = [];
async function bounded<T>(action: () => Promise<T>): Promise<T> {
  if (active >= 2) {
    if (waiting.length >= 128) failLimit();
    await new Promise<void>(resolve => waiting.push(resolve));
  } else active += 1;
  try { return await action(); }
  finally { const next = waiting.shift(); if (next) next(); else active -= 1; }
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
      if (!entry.fileName.endsWith("/") && isImage(entry.fileName)) {
        result.push({ virtualPath: entry.fileName, size: entry.uncompressedSize });
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
    while (zipDirectories.size > 4) zipDirectories.delete(zipDirectories.keys().next().value!);
    return result;
  } finally { zip.close(); }
}
// yauzl validates sizes, but intentionally does not validate CRC32. Do it incrementally.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
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
      if (entry.fileName !== name || !isImage(name)) continue;
      if (entry.uncompressedSize > limit) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      let crc = 0xffffffff;
      const timer = setTimeout(() => stream.destroy(new Error("Archive read timed out")), ARCHIVE_LIMITS.timeoutMs);
      try {
        for await (const raw of stream) {
          const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
          size += chunk.length;
          if (size > limit) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
          for (const byte of chunk) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
          chunks.push(chunk);
        }
        if (size !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw new Error("ZIP CRC mismatch");
        return Buffer.concat(chunks, size);
      } finally { clearTimeout(timer); stream.destroy(); }
    }
    throw new 压缩包服务错误("ARCHIVE_ENTRY_NOT_FOUND", "压缩包中没有找到当前图片。");
  } finally { zip.close(); }
}
const cache = new Map<string, { signature: string; entries: ArchiveEntry[] }>();
async function list(file: string): Promise<ArchiveEntry[]> {
  const stat = await fs.stat(file);
  if (!stat.isFile()) throw new Error("Not a regular archive");
  const signature = statSignature(stat);
  const cached = cache.get(file);
  if (cached?.signature === signature) return cached.entries.map(entry => ({ ...entry }));
  const kind = format(file);
  const entries = kind === "zip" ? await listZip(file) : await listSevenZip(file);
  entries.sort((a, b) => sorter.compare(a.virtualPath, b.virtualPath));
  cache.delete(file);
  cache.set(file, { signature, entries });
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
  return entries.map(entry => ({ ...entry }));
}
export async function 读取压缩包图片列表(file: string): Promise<ArchiveEntry[]> {
  try { return await bounded(() => list(file)); } catch (error) { throw normalizeArchiveError(error); }
}
export async function 读取压缩包单张图片(file: string, name: string, maxBytes: number = ARCHIVE_LIMITS.imageBytes): Promise<Buffer> {
  try {
    validateEntryName(name);
    validateReadLimit(maxBytes);
    return await bounded(async () => {
      // Validate the entire directory first, including entries after the requested page.
      const entries = await list(file);
      const entry = entries.find(item => item.virtualPath === name);
      if (!entry) throw new 压缩包服务错误("ARCHIVE_ENTRY_NOT_FOUND", "压缩包中没有找到当前图片。");
      if (entry.size > maxBytes) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
      const kind = format(file);
      if (kind === "zip") return readZip(file, name, maxBytes);
      return readSevenZip(file, entry, maxBytes);
    });
  } catch (error) { throw normalizeArchiveError(error); }
}
export function 是压缩包服务错误(error: unknown): error is 压缩包服务错误 { return error instanceof 压缩包服务错误; }
