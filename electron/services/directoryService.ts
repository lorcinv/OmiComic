import { promises as fs, type Dirent, type Stats } from "node:fs";
import path from "node:path";

export type DirectoryResourceType = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";
export interface DirectoryEntry {
  id: string; name: string; path: string; type: DirectoryResourceType; extension: string;
  size?: number; modifiedAt?: number; hasError?: boolean; errorMessage?: string;
}
export interface DirectoryScanOptions {
  authorizedRoot: string;
  signal?: AbortSignal;
  concurrency?: number;
  /** Optional instrumentation/fault injection; production uses fs.stat. */
  stat?: (filePath: string) => Promise<Stats>;
}
const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "bmp", "gif"]);
const archiveExtensions = new Set(["zip", "cbz", "rar", "cbr", "7z", "cb7"]);
export const DIRECTORY_STAT_CONCURRENCY = 24;
let activeStats = 0;
const waiting: Array<() => void> = [];

function abortError(): Error { const error = new Error("Directory scan cancelled"); error.name = "AbortError"; return error; }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// Shared across overlapping scans: a burst of navigation cannot multiply the
// number of outstanding stat syscalls. Cancelled waiters are removed immediately.
async function acquireStat(signal?: AbortSignal): Promise<() => void> {
  checkAbort(signal);
  if (activeStats >= DIRECTORY_STAT_CONCURRENCY) {
    await new Promise<void>((resolve, reject) => {
      const resume = () => { signal?.removeEventListener("abort", cancel); resolve(); };
      const cancel = () => {
        const index = waiting.indexOf(resume);
        if (index >= 0) waiting.splice(index, 1);
        signal?.removeEventListener("abort", cancel);
        reject(abortError());
      };
      waiting.push(resume);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  } else {
    activeStats++;
  }
  // A resumed waiter owns the released slot, including when aborted between
  // resolution and this microtask. Its caller must release it in finally.
  return () => {
    const next = waiting.shift();
    if (next) next();
    else activeStats--;
  };
}

async function authorizedDirectory(directory: string, options: DirectoryScanOptions): Promise<{ target: string; realRoot: string }> {
  checkAbort(options.signal);
  const target = path.resolve(directory);
  const root = path.resolve(options.authorizedRoot);
  if (!isWithin(root, target)) throw Object.assign(new Error("Directory is outside authorized root"), { code: "PATH_NOT_ALLOWED" });
  const [realTarget, realRoot] = await Promise.all([fs.realpath(target), fs.realpath(root)]);
  checkAbort(options.signal);
  if (!isWithin(realRoot, realTarget)) throw Object.assign(new Error("Directory link escapes authorized root"), { code: "PATH_NOT_ALLOWED" });
  return { target, realRoot };
}

function classify(entry: Dirent): DirectoryResourceType {
  if (entry.isDirectory()) return "folder";
  const extension = path.extname(entry.name).slice(1).toLowerCase();
  if (imageExtensions.has(extension)) return "image";
  if (archiveExtensions.has(extension)) return "archive";
  if (extension === "pdf" || extension === "epub") return extension;
  return "unknown";
}

export async function scanDirectory(directory: string, options: DirectoryScanOptions): Promise<DirectoryEntry[]> {
  const { target, realRoot } = await authorizedDirectory(directory, options);
  const entries = await fs.readdir(target, { withFileTypes: true });
  checkAbort(options.signal);
  const results = new Array<DirectoryEntry>(entries.length);
  let cursor = 0;
  const requestedConcurrency = Number.isFinite(options.concurrency) ? Math.floor(options.concurrency!) : DIRECTORY_STAT_CONCURRENCY;
  const workers = Math.min(entries.length, Math.max(1, Math.min(DIRECTORY_STAT_CONCURRENCY, requestedConcurrency)));
  await Promise.all(Array.from({ length: workers }, async () => {
    while (true) {
      checkAbort(options.signal);
      const index = cursor++;
      if (index >= entries.length) return;
      const entry = entries[index];
      const filePath = path.join(target, entry.name);
      const item: DirectoryEntry = { id: filePath, name: entry.name, path: filePath, type: classify(entry), extension: entry.isDirectory() ? "" : path.extname(entry.name).slice(1).toLowerCase() };
      const release = await acquireStat(options.signal);
      try {
        checkAbort(options.signal);
        // Do not follow a symlink into an unapproved tree to retrieve metadata.
        if (entry.isSymbolicLink() && !isWithin(realRoot, await fs.realpath(filePath))) throw new Error("Link escapes authorized root");
        const stat = await (options.stat ?? fs.stat)(filePath);
        item.size = stat.size;
        item.modifiedAt = stat.mtimeMs;
      } catch (error) {
        checkAbort(options.signal);
        item.hasError = true;
        item.errorMessage = "无法读取该项目的详细信息。";
      } finally { release(); }
      results[index] = item;
    }
  }));
  checkAbort(options.signal);
  results.sort((left, right) => Number(right.type === "folder") - Number(left.type === "folder") || collator.compare(left.name, right.name));
  checkAbort(options.signal);
  return results;
}

export async function listDirectoryImages(directory: string, options: DirectoryScanOptions): Promise<string[]> {
  const { target } = await authorizedDirectory(directory, options);
  const entries = await fs.readdir(target, { withFileTypes: true });
  checkAbort(options.signal);
  const names = entries.filter(entry => entry.isFile() && imageExtensions.has(path.extname(entry.name).slice(1).toLowerCase())).map(entry => entry.name);
  names.sort(collator.compare);
  checkAbort(options.signal);
  return names;
}
