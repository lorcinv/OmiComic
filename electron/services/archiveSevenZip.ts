import { spawn } from "node:child_process";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ARCHIVE_LIMITS, createEntryGuard, failLimit, isImage, 压缩包服务错误, type ArchiveEntry } from "./archiveSafety";

declare const __OMICOMIC_BUNDLED__: boolean | undefined;
const path7z: string = typeof __OMICOMIC_BUNDLED__ !== "undefined" && __OMICOMIC_BUNDLED__
  ? path.join(process.resourcesPath, "7zip", "7z.exe")
  : require("7zip-bin-full").path7z;

// Only the bundled executable is used. No shell, user-supplied options, disk extraction or prompts.
function run(args: string[], maxBytes: number): Promise<Buffer> {
  if (!path.isAbsolute(path7z)) return Promise.reject(new Error("Bundled 7-Zip is required"));
  return new Promise((resolve, reject) => {
    const executable = path7z.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
    const child = spawn(executable, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let length = 0;
    let stderr = "";
    let failure: Error | undefined;
    const kill = (error: Error) => { failure ??= error; child.kill("SIGKILL"); };
    const timeout = setTimeout(() => kill(new 压缩包服务错误("ARCHIVE_LIMIT_EXCEEDED", "压缩包处理超时，请拆分后再打开。")), ARCHIVE_LIMITS.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > maxBytes) kill(new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "压缩包输出超过安全读取限制。"));
      else if (!failure) chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8192) stderr += chunk.toString("utf8").slice(0, 8192 - stderr.length); });
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", code => {
      clearTimeout(timeout);
      if (failure) reject(failure);
      else if (code !== 0) reject(/password|encrypted/i.test(stderr) ? new 压缩包服务错误("ARCHIVE_ENCRYPTED", "暂不支持加密压缩包。") : new Error(stderr || "7z failed"));
      else resolve(Buffer.concat(chunks, length));
    });
  });
}

export async function listSevenZip(archivePath: string): Promise<ArchiveEntry[]> {
  const output = await run(["l", "-slt", "-ba", "-sccUTF-8", "-p", "--", path.resolve(archivePath)], ARCHIVE_LIMITS.listingBytes);
  const guard = createEntryGuard();
  const entries: ArchiveEntry[] = [];
  let totalSize = 0;
  for (const block of output.toString("utf8").replace(/^[\r\n]+|[\r\n]+$/g, "").split(/\r?\n\r?\n/)) {
    if (!block) continue;
    const fields = new Map<string, string>();
    for (const line of block.split(/\r?\n/)) {
      const divider = line.indexOf(" = ");
      if (divider < 1 || fields.has(line.slice(0, divider))) throw new Error("Malformed 7z listing");
      fields.set(line.slice(0, divider), line.slice(divider + 3));
    }
    const name = fields.get("Path");
    const sizeField = fields.get("Size");
    if (!name || sizeField === undefined || !/^\d+$/.test(sizeField)) throw new Error("Malformed 7z entry");
    const size = Number(sizeField);
    guard({ virtualPath: name, size });
    totalSize += size;
    // Refuse unusually large decoder dictionaries before extracting page data.
    const method = fields.get("Method") ?? "";
    for (const match of method.matchAll(/(?:LZMA2?|PPMd):([0-9]+)([bkm])?/gi)) {
      const value = Number(match[1]);
      const unit = match[2]?.toLowerCase();
      const bytes = unit === "m" ? value * 1024 * 1024 : unit === "k" ? value * 1024 : unit === "b" ? value : 2 ** value;
      if (bytes > 128 * 1024 * 1024) failLimit();
    }
    if (fields.get("Split Before") === "+" || fields.get("Split After") === "+") throw new Error("Multipart archives are unsupported");
    if (fields.get("Encrypted") === "+") throw new 压缩包服务错误("ARCHIVE_ENCRYPTED", "暂不支持加密压缩包。");
    if (fields.has("Symbolic Link") || fields.has("Hard Link")) throw new 压缩包服务错误("ARCHIVE_UNSAFE_ENTRY", "压缩包包含不支持的链接。");
    if (fields.get("Folder") !== "+" && !fields.get("Attributes")?.startsWith("D") && isImage(name)) entries.push({ virtualPath: name, size });
  }
  const stat = await fs.stat(archivePath);
  if (totalSize > 1024 * 1024 && totalSize > Math.max(stat.size, 1) * ARCHIVE_LIMITS.ratio) failLimit();
  return entries;
}
export async function readSevenZip(archivePath: string, entry: ArchiveEntry, maxBytes: number): Promise<Buffer> {
  if (entry.size > maxBytes) throw new 压缩包服务错误("ARCHIVE_IMAGE_TOO_LARGE", "当前图片过大，暂时无法安全读取。");
  // -spd disables wildcard expansion, -- ends option parsing, absolute archive paths avoid @listfile syntax.
  // Names beginning @ cannot safely be passed as literal 7z selectors; fail closed instead.
  if (entry.virtualPath.startsWith("@")) failLimit();
  const data = await run(["x", "-so", "-y", "-spd", "-mmt=1", "-mmemuse=256m", "-p", "--", path.resolve(archivePath), entry.virtualPath], maxBytes);
  if (data.length !== entry.size) throw new Error("7z output size mismatch");
  return data;
}
