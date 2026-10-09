/** Shared limits apply to metadata AND actual streamed output. No archive is extracted to disk. */
export const ARCHIVE_LIMITS = {
  entries: 20_000,
  imageBytes: 256 * 1024 * 1024,
  totalBytes: 8 * 1024 * 1024 * 1024,
  ratio: 1_000,
  listingBytes: 8 * 1024 * 1024,
  timeoutMs: 30_000,
} as const;

export type 压缩包错误代码 = "ARCHIVE_READ_FAILED" | "ARCHIVE_ENCRYPTED" | "ARCHIVE_ENTRY_NOT_FOUND" | "ARCHIVE_IMAGE_TOO_LARGE" | "ARCHIVE_LIMIT_EXCEEDED" | "ARCHIVE_UNSAFE_ENTRY";
export class 压缩包服务错误 extends Error {
  constructor(public readonly code: 压缩包错误代码, message: string) {
    super(message);
    this.name = "压缩包服务错误";
  }
}
export interface ArchiveEntry { virtualPath: string; size: number }
export function failLimit(): never {
  throw new 压缩包服务错误("ARCHIVE_LIMIT_EXCEEDED", "压缩包超过安全读取限制，请拆分后再打开。");
}
export function validateEntryName(name: string): void {
  // Reject absolute paths, traversal, drive/ADS names, control characters and ambiguous CLI/list syntax.
  if (!name || name.length > 4096 || /[\x00-\x1f\x7f:]/.test(name) || /^[\\/]/.test(name) || name.split(/[\\/]/).some(part => part === "." || part === "..")) {
    throw new 压缩包服务错误("ARCHIVE_UNSAFE_ENTRY", "压缩包包含不安全的文件路径。");
  }
}
export function validateReadLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ARCHIVE_LIMITS.imageBytes) failLimit();
  return limit;
}
export function validateSize(size: number, packed?: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > ARCHIVE_LIMITS.totalBytes) failLimit();
  if (packed !== undefined && (!Number.isSafeInteger(packed) || packed < 0 || (size > 1024 * 1024 && size > Math.max(packed, 1) * ARCHIVE_LIMITS.ratio))) failLimit();
}
export function createEntryGuard(totalLimit: number = ARCHIVE_LIMITS.totalBytes) {
  let count = 0;
  let total = 0;
  let nameBytes = 0;
  const seen = new Set<string>();
  return (entry: ArchiveEntry, packed?: number) => {
    validateEntryName(entry.virtualPath);
    validateSize(entry.size, packed);
    total += entry.size;
    nameBytes += Buffer.byteLength(entry.virtualPath, "utf8");
    if (nameBytes > ARCHIVE_LIMITS.listingBytes) failLimit();
    if (++count > ARCHIVE_LIMITS.entries || total > totalLimit) failLimit();
    if (seen.has(entry.virtualPath)) throw new 压缩包服务错误("ARCHIVE_UNSAFE_ENTRY", "压缩包包含重复的文件路径。");
    seen.add(entry.virtualPath);
  };
}
export function isImage(name: string): boolean { return /\.(?:jpe?g|png|webp|bmp|gif)$/i.test(name); }
export function normalizeArchiveError(error: unknown): 压缩包服务错误 {
  if (error instanceof 压缩包服务错误) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt(?:ed|ion)|ERAR_MISSING_PASSWORD|ERAR_BAD_PASSWORD/i.test(message)) return new 压缩包服务错误("ARCHIVE_ENCRYPTED", "暂不支持加密压缩包。");
  return new 压缩包服务错误("ARCHIVE_READ_FAILED", "压缩包读取失败，文件可能已损坏或格式不受支持。");
}
