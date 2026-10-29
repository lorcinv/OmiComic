import { nativeImage } from "electron";
import { safeRasterImage } from "./documentImageSafety";
import { promises as 文件系统 } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { EPUBDocumentSource } from "./epubService";
import { readThumbnailDisk, writeThumbnailDisk, clearThumbnailDiskCache } from './thumbnailDiskCache';
import {
  读取压缩包单张图片,
  读取压缩包封面列表,
  是压缩包服务错误,
  type 压缩包图片条目,
} from "./archiveService";

const 图片扩展名 = new Set(["jpg", "jpeg", "png", "webp", "bmp", "gif"]);
const 压缩包扩展名 = new Set(["zip", "cbz", "rar", "cbr", "7z", "cb7"]);
const 自然排序器 = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
// A compressed scan can exceed 12 MiB without being an unsafe raster surface.
// Decode one candidate at a time; native thumbnails remain <=360px.
const 缩略图最大字节数 = 64 * 1024 * 1024;
const 缩略图最大像素数 = 40_000_000;
const 缩略图优先字节数 = 4 * 1024 * 1024;
const 缩略图最大边长 = 360;
const 缩略图缓存上限 = 240;
const 缩略图候选最大数量 = 8;
const 封面关键词 = ["cover", "folder", "front"] as const;

export type 缩略图资源类型 = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";

export interface 缩略图输入 {
  path: string;
  type: 缩略图资源类型;
}

export interface 缩略图结果 {
  url: string | null;
  itemCount?: number;
  childFolderCount?: number;
  folderSummary?: { folders: number; books: number; images: number; unsupported: number };
  pdfPath?: string;
  sourceVersion?: string;
  retryable?: boolean;
}

export type 缩略图错误代码 =
  | "THUMBNAIL_NOT_AVAILABLE"
  | "THUMBNAIL_READ_FAILED"
  | "THUMBNAIL_TOO_LARGE";

export class 缩略图服务错误 extends Error {
  constructor(
    public readonly code: 缩略图错误代码,
    message: string,
  ) {
    super(message);
    this.name = "缩略图服务错误";
  }
}

interface 缩略图缓存项 {
  signature: string;
  result: 缩略图结果;
}

const 缩略图缓存 = new Map<string, 缩略图缓存项>();
const 进行中缩略图 = new Map<string, { signature: string; task: Promise<缩略图结果> }>();
let thumbnailGeneration = 0;
export const thumbnailMetrics = { memoryHits: 0, loads: 0, decodes: 0 };
export async function clearThumbnailCache() {
  thumbnailGeneration++; 缩略图缓存.clear(); 进行中缩略图.clear();
  await clearThumbnailDiskCache();
}

function 写入缩略图缓存(key: string, value: 缩略图缓存项): void {
  if (缩略图缓存.has(key)) 缩略图缓存.delete(key);
  缩略图缓存.set(key, value);
  while (缩略图缓存.size > 缩略图缓存上限) {
    const 首项 = 缩略图缓存.keys().next().value;
    if (!首项) break;
    缩略图缓存.delete(首项);
  }
}

async function 获取路径签名(目标路径: string): Promise<string> {
  const 状态 = await 文件系统.stat(目标路径);
  return `${状态.mtimeMs}:${状态.ctimeMs}:${状态.size}:${状态.isDirectory() ? "d" : "f"}`;
}

async function 使用缩略图缓存(
  key: string,
  路径: string,
  loader: () => Promise<缩略图结果>,
): Promise<缩略图结果> {
  let signature: string;
  try {
    signature = await 获取路径签名(路径);
  } catch {
    return loader();
  }
  const 已缓存 = 缩略图缓存.get(key);
  if (已缓存?.signature === signature) {
    thumbnailMetrics.memoryHits++;
    缩略图缓存.delete(key);
    缩略图缓存.set(key, 已缓存);
    return 已缓存.result;
  }
  const 进行中 = 进行中缩略图.get(key);
  if (进行中?.signature === signature) return 进行中.task;
  const generation = thumbnailGeneration;
  const task = (async () => {
    const disk = await readThumbnailDisk(key, signature);
    if (disk) return disk;
    thumbnailMetrics.loads++; return loader();
  })();
  进行中缩略图.set(key, { signature, task });
  try {
    const result = await task;
    // A transient read failure must not become a permanent empty cover. Also avoid
    // caching a cover under the wrong version if the archive changed during a read.
    if (result.url && generation === thumbnailGeneration && await 获取路径签名(路径).catch(() => "") === signature) {
      写入缩略图缓存(key, { signature, result });
      void writeThumbnailDisk(key, signature, result);
    }
    return result;
  } finally {
    if (进行中缩略图.get(key)?.task === task) 进行中缩略图.delete(key);
  }
}

function 是支持的图片(名称: string): boolean {
  return 图片扩展名.has(path.extname(名称).slice(1).toLowerCase());
}

function 是支持的压缩包(名称: string): boolean {
  return 压缩包扩展名.has(path.extname(名称).slice(1).toLowerCase());
}

interface GifStaticFrame {
  width: number;
  height: number;
  rgba: Buffer;
}

function readGifSubBlocks(data: Buffer, start: number): { bytes: Buffer; next: number } | null {
  const blocks: Buffer[] = [];
  let offset = start;
  while (offset < data.length) {
    const size = data[offset];
    offset += 1;
    if (size === 0) return { bytes: Buffer.concat(blocks), next: offset };
    if (offset + size > data.length) return null;
    blocks.push(data.subarray(offset, offset + size));
    offset += size;
  }
  return null;
}

function decodeGifLzw(minCodeSize: number, data: Buffer, expectedLength: number): Uint8Array | null {
  if (minCodeSize < 2 || minCodeSize > 8 || expectedLength <= 0) return null;

  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  const output = new Uint8Array(expectedLength);
  for (let index = 0; index < clearCode; index += 1) suffix[index] = index;

  let available = clearCode + 2;
  let codeSize = minCodeSize + 1;
  let codeMask = (1 << codeSize) - 1;
  let datum = 0;
  let bits = 0;
  let dataIndex = 0;
  let outputIndex = 0;
  let oldCode = -1;
  let first = 0;
  let stackTop = 0;

  while (outputIndex < expectedLength) {
    while (bits < codeSize) {
      if (dataIndex >= data.length) return null;
      datum |= data[dataIndex] << bits;
      bits += 8;
      dataIndex += 1;
    }

    let code = datum & codeMask;
    datum >>>= codeSize;
    bits -= codeSize;

    if (code === clearCode) {
      available = clearCode + 2;
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
      oldCode = -1;
      continue;
    }
    if (code === endCode) break;

    if (oldCode < 0) {
      if (code >= clearCode) return null;
      output[outputIndex] = suffix[code];
      outputIndex += 1;
      first = code;
      oldCode = code;
      continue;
    }

    const inputCode = code;
    if (code >= available) {
      if (code !== available || stackTop >= stack.length) return null;
      stack[stackTop] = first;
      stackTop += 1;
      code = oldCode;
    }

    while (code >= clearCode) {
      if (code >= available || stackTop >= stack.length) return null;
      stack[stackTop] = suffix[code];
      stackTop += 1;
      code = prefix[code];
    }

    first = suffix[code];
    if (stackTop >= stack.length) return null;
    stack[stackTop] = first;
    stackTop += 1;

    while (stackTop > 0 && outputIndex < expectedLength) {
      stackTop -= 1;
      output[outputIndex] = stack[stackTop];
      outputIndex += 1;
    }

    if (available < 4096) {
      prefix[available] = oldCode;
      suffix[available] = first;
      available += 1;
      if (available === 1 << codeSize && codeSize < 12) {
        codeSize += 1;
        codeMask = (1 << codeSize) - 1;
      }
    }
    oldCode = inputCode;
  }

  return outputIndex === expectedLength ? output : null;
}

function decodeGifFirstFrame(data: Buffer): GifStaticFrame | null {
  if (data.length < 13 || (data.toString("ascii", 0, 6) !== "GIF87a" && data.toString("ascii", 0, 6) !== "GIF89a")) {
    return null;
  }

  const canvasWidth = data.readUInt16LE(6);
  const canvasHeight = data.readUInt16LE(8);
  if (canvasWidth <= 0 || canvasHeight <= 0 || canvasWidth * canvasHeight > 40_000_000) return null;

  const screenPacked = data[10];
  let offset = 13;
  let globalPalette: Buffer | null = null;
  if ((screenPacked & 0x80) !== 0) {
    const paletteLength = 3 * (1 << ((screenPacked & 0x07) + 1));
    if (offset + paletteLength > data.length) return null;
    globalPalette = data.subarray(offset, offset + paletteLength);
    offset += paletteLength;
  }

  let transparentIndex = -1;
  while (offset < data.length) {
    const marker = data[offset];
    offset += 1;

    if (marker === 0x3b) break;
    if (marker === 0x21) {
      if (offset >= data.length) return null;
      const extensionLabel = data[offset];
      offset += 1;
      if (extensionLabel === 0xf9) {
        if (offset + 6 > data.length || data[offset] !== 4) return null;
        const packed = data[offset + 1];
        transparentIndex = (packed & 0x01) !== 0 ? data[offset + 4] : -1;
        offset += 6;
      } else {
        const blocks = readGifSubBlocks(data, offset);
        if (!blocks) return null;
        offset = blocks.next;
      }
      continue;
    }
    if (marker !== 0x2c || offset + 9 > data.length) return null;

    const left = data.readUInt16LE(offset);
    const top = data.readUInt16LE(offset + 2);
    const width = data.readUInt16LE(offset + 4);
    const height = data.readUInt16LE(offset + 6);
    const imagePacked = data[offset + 8];
    offset += 9;
    if (width <= 0 || height <= 0 || left + width > canvasWidth || top + height > canvasHeight) return null;

    let palette = globalPalette;
    if ((imagePacked & 0x80) !== 0) {
      const paletteLength = 3 * (1 << ((imagePacked & 0x07) + 1));
      if (offset + paletteLength > data.length) return null;
      palette = data.subarray(offset, offset + paletteLength);
      offset += paletteLength;
    }
    if (!palette || offset >= data.length) return null;

    const minCodeSize = data[offset];
    offset += 1;
    const blocks = readGifSubBlocks(data, offset);
    if (!blocks) return null;
    const indices = decodeGifLzw(minCodeSize, blocks.bytes, width * height);
    if (!indices) return null;

    const rgba = Buffer.alloc(canvasWidth * canvasHeight * 4, 0);
    const interlaced = (imagePacked & 0x40) !== 0;
    const rowOrder: number[] = [];
    if (interlaced) {
      const starts = [0, 4, 2, 1];
      const steps = [8, 8, 4, 2];
      for (let pass = 0; pass < starts.length; pass += 1) {
        for (let row = starts[pass]; row < height; row += steps[pass]) rowOrder.push(row);
      }
    } else {
      for (let row = 0; row < height; row += 1) rowOrder.push(row);
    }

    let sourceIndex = 0;
    for (const row of rowOrder) {
      for (let column = 0; column < width; column += 1) {
        const colorIndex = indices[sourceIndex];
        sourceIndex += 1;
        if (colorIndex === transparentIndex) continue;
        const paletteOffset = colorIndex * 3;
        if (paletteOffset + 2 >= palette.length) continue;
        const targetOffset = ((top + row) * canvasWidth + left + column) * 4;
        rgba[targetOffset] = palette[paletteOffset];
        rgba[targetOffset + 1] = palette[paletteOffset + 1];
        rgba[targetOffset + 2] = palette[paletteOffset + 2];
        rgba[targetOffset + 3] = 255;
      }
    }
    return { width: canvasWidth, height: canvasHeight, rgba };
  }
  return null;
}

let pngCrcTable: Uint32Array | null = null;

function getPngCrcTable(): Uint32Array {
  if (pngCrcTable) return pngCrcTable;
  pngCrcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    pngCrcTable[index] = value >>> 0;
  }
  return pngCrcTable;
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeData = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeData, data]);
  const table = getPngCrcTable();
  let crc = 0xffffffff;
  for (const byte of crcInput) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeData.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + data.length);
  return chunk;
}

function encodeRgbaPng(frame: GifStaticFrame): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(frame.width, 0);
  header.writeUInt32BE(frame.height, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = frame.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * frame.height);
  for (let row = 0; row < frame.height; row += 1) {
    const scanlineOffset = row * (stride + 1);
    scanlines[scanlineOffset] = 0;
    frame.rgba.copy(scanlines, scanlineOffset + 1, row * stride, (row + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(scanlines, { level: 6 })),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function 生成封面候选<T extends { name: string }>(图片列表: T[]): T[] {
  const 候选列表: T[] = [];
  const 已加入 = new Set<T>();
  for (const 关键词 of 封面关键词) {
    for (const 图片 of 图片列表) {
      if (已加入.has(图片)) continue;
      if (图片.name.toLocaleLowerCase("en-US").includes(关键词)) {
        候选列表.push(图片);
        已加入.add(图片);
      }
    }
  }
  for (const 图片 of 图片列表) {
    if (!已加入.has(图片)) {
      候选列表.push(图片);
      已加入.add(图片);
    }
  }
  return 候选列表;
}

function 生成压缩包封面候选(图片列表: 压缩包图片条目[]): 压缩包图片条目[] {
  return 生成封面候选(图片列表.map((图片) => ({ ...图片, name: 图片.virtualPath })));
}

function 限制封面候选<T extends { size?: number }>(候选列表: T[]): T[] {
  // Keep the cover/first-page order: a smaller later image is not a better cover,
  // and broken small images must not exclude readable high-resolution candidates.
  return 候选列表.filter((项目) => 项目.size === undefined || 项目.size <= 缩略图最大字节数).slice(0, 缩略图候选最大数量);
}

async function 读取图片为DataUrl(图片路径: string, 显示名称 = 图片路径): Promise<string | null> {
  const 状态 = await 文件系统.stat(图片路径);
  if (!状态.isFile() || 状态.size > 缩略图最大字节数) {
    throw new 缩略图服务错误("THUMBNAIL_TOO_LARGE", "缩略图图片过大。");
  }

  const 图片数据 = await 文件系统.readFile(图片路径);
  return 图片数据转缩略图DataUrl(图片数据, 显示名称);
}

function 图片数据转缩略图DataUrl(图片数据: Buffer, 显示名称: string): string | null {
  if (图片数据.length > 缩略图最大字节数 || !safeRasterImage(图片数据, 缩略图最大像素数)) return null;
  thumbnailMetrics.decodes++;
  let 原图 = nativeImage.createFromBuffer(图片数据);
  if (原图.isEmpty() && path.extname(显示名称).slice(1).toLowerCase() === "gif") {
    const 静态首帧 = decodeGifFirstFrame(图片数据);
    if (静态首帧) 原图 = nativeImage.createFromBuffer(encodeRgbaPng(静态首帧));
  }
  if (!原图.isEmpty()) {
    const 尺寸 = 原图.getSize();
    const 最大边 = Math.max(尺寸.width, 尺寸.height);
    const 缩放比例 = 最大边 > 缩略图最大边长 ? 缩略图最大边长 / 最大边 : 1;
    const 输出图 = 缩放比例 < 1
      ? 原图.resize({
          width: Math.max(1, Math.round(尺寸.width * 缩放比例)),
          height: Math.max(1, Math.round(尺寸.height * 缩放比例)),
          quality: "good",
        })
      : 原图;
    return 输出图.toDataURL();
  }

  // Chromium can display BMP/static WebP variants that nativeImage cannot decode.
  // Preserve that existing fallback within the old byte/pixel budget; never send
  // a newly admitted large scan through IPC as its full-sized original.
  const 扩展名 = path.extname(显示名称).slice(1).toLowerCase();
  if (图片数据.length <= 12 * 1024 * 1024 && safeRasterImage(图片数据)
    && (扩展名 === "bmp" || (扩展名 === "webp" && 图片数据.indexOf(Buffer.from("ANIM", "ascii")) < 0))) {
    return `data:image/${扩展名};base64,${图片数据.toString("base64")}`;
  }
  return null;
}

export async function 获取图片缩略图(图片路径: string): Promise<缩略图结果> {
  if (!是支持的图片(图片路径)) return { url: null };

  try {
    return { url: await 读取图片为DataUrl(图片路径) };
  } catch {
    return { url: null };
  }
}

export async function 获取文件夹封面缩略图(文件夹路径: string, budget = { remaining: 32, deadline: Date.now() + 5000 }, depth = 0): Promise<缩略图结果> {
  try {
    if (depth > 6 || budget.remaining-- <= 0 || Date.now() > budget.deadline) return { url: null };
    const 目录项 = await 文件系统.readdir(文件夹路径, { withFileTypes: true });
    const 子目录数 = 目录项.filter(item => item.isDirectory() && !item.isSymbolicLink()).length;
    const 独立漫画数 = 目录项.filter(item => item.isFile() && (是支持的压缩包(item.name) || /\.(pdf|epub)$/i.test(item.name))).length;
    const 图片数 = 目录项.filter(item => item.isFile() && 是支持的图片(item.name)).length;
    const folderSummary = { folders: 子目录数, books: 独立漫画数, images: 图片数,
      unsupported: 目录项.filter(item => item.isFile()).length - 独立漫画数 - 图片数 };
    // Image pages belong to one comic, not separate books in a collection.
    const itemCount = 子目录数 > 0 || 独立漫画数 > 1 ? 子目录数 + 独立漫画数 : undefined;
    const 图片列表 = 目录项
      .filter((项目) => 项目.isFile() && 是支持的图片(项目.name))
      .map((项目) => ({ name: 项目.name, path: path.join(文件夹路径, 项目.name) }))
      .sort((左侧, 右侧) => 自然排序器.compare(左侧.name, 右侧.name));

    const 封面候选列表 = 生成封面候选(图片列表).slice(0, 缩略图候选最大数量 * 2);
    const 备用候选列表: typeof 图片列表 = [];
    for (const 封面 of 封面候选列表) {
      try {
        const 状态 = await 文件系统.stat(封面.path);
        if (!状态.isFile() || 状态.size > 缩略图最大字节数) continue;
        if (状态.size > 缩略图优先字节数) {
          备用候选列表.push(封面);
          continue;
        }
        const url = await 读取图片为DataUrl(封面.path, 封面.name);
        if (url) return { url, itemCount, childFolderCount: 子目录数, folderSummary };
      } catch {
        continue;
      }
    }
    for (const 封面 of 备用候选列表.slice(0, 缩略图候选最大数量)) {
      try {
        const url = await 读取图片为DataUrl(封面.path, 封面.name);
        if (url) return { url, itemCount, childFolderCount: 子目录数, folderSummary };
      } catch {
        continue;
      }
    }
    // A collection directory borrows its first readable child's cover. Do not
    // follow symlinks/junctions out of the selected directory or scan an entire tree.
    const children = 目录项.filter(item => !item.isSymbolicLink() && (item.isDirectory() || 是支持的压缩包(item.name) || /\.(pdf|epub)$/i.test(item.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || 自然排序器.compare(a.name, b.name));
    for (const child of children) {
      if (budget.remaining <= 0 || Date.now() > budget.deadline) break;
      const filePath = path.join(文件夹路径, child.name);
      const cover = child.isDirectory()
        ? await 获取文件夹封面缩略图(filePath, budget, depth + 1)
        : (budget.remaining--, await 获取缩略图({ path: filePath, type: path.extname(child.name).toLowerCase() === ".pdf" ? "pdf" : path.extname(child.name).toLowerCase() === ".epub" ? "epub" : "archive" }));
      if (cover.url || cover.pdfPath) return { ...cover, itemCount, childFolderCount: 子目录数, folderSummary };
    }
    return { url: null, itemCount, childFolderCount: 子目录数, folderSummary };
  } catch {
    return { url: null };
  }
}

export async function 获取压缩包封面缩略图(压缩包路径: string): Promise<缩略图结果> {
  if (!是支持的压缩包(压缩包路径)) return { url: null };

  try {
    const 图片列表 = await 读取压缩包封面列表(压缩包路径);
    let retryable = false;
    for (const 封面 of 限制封面候选(生成压缩包封面候选(图片列表))) {
      try {
        const 图片数据 = await 读取压缩包单张图片(
          压缩包路径,
          封面.virtualPath,
          缩略图最大字节数,
          'background', true,
        );
        const 缩略图 = 图片数据转缩略图DataUrl(图片数据, 封面.virtualPath);
        if (缩略图) return { url: 缩略图 };
      } catch (错误) {
        if (是压缩包服务错误(错误) && 错误.code === "ARCHIVE_ENCRYPTED") return { url: null };
        retryable ||= !是压缩包服务错误(错误) || 错误.code === "ARCHIVE_READ_FAILED";
        continue;
      }
    }
    return { url: null, retryable };
  } catch (错误) {
    return { url: null, retryable: !是压缩包服务错误(错误) || 错误.code === "ARCHIVE_READ_FAILED" };
  }
}

export async function 获取缩略图(输入: 缩略图输入): Promise<缩略图结果> {
  if (输入.type === "image") return 使用缩略图缓存(`image:${输入.path}`, 输入.path, () => 获取图片缩略图(输入.path));
  if (输入.type === "folder") return 获取文件夹封面缩略图(输入.path);
  if (输入.type === "archive") return 使用缩略图缓存(`archive:${输入.path}`, 输入.path, () => 获取压缩包封面缩略图(输入.path));
  if (输入.type === "pdf") return { url: null, pdfPath: 输入.path, sourceVersion: await 获取路径签名(输入.path) };
  if (输入.type === "epub") return 使用缩略图缓存(`epub:${输入.path}`, 输入.path, () => 读取EPUB封面(输入.path));
  return { url: null };
}

let 活动封面任务 = 0;
const 等待封面任务: Array<() => void> = [];
async function 读取EPUB封面(filePath: string): Promise<缩略图结果> {
  if (活动封面任务 >= 2) await new Promise<void>(resolve => 等待封面任务.push(resolve));
  else 活动封面任务++;
  let source: EPUBDocumentSource | undefined;
  try {
    source = new EPUBDocumentSource(filePath);
    const result = await source.request<{ bytes: Uint8Array; name: string } | null>("cover");
    return { url: result ? 图片数据转缩略图DataUrl(Buffer.from(result.bytes), result.name) : null };
  } catch { return { url: null }; }
  finally {
    await source?.close();
    const next = 等待封面任务.shift();
    if (next) next(); else 活动封面任务--;
  }
}
