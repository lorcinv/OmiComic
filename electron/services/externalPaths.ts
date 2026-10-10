import path from "node:path";
import { promises as fs } from "node:fs";
import type { 阅读资源类型 } from "./appDataService";

/** 按目录边界比较，避免把 Comics-Other 误当作 Comics 的子目录。 */
export function 路径位于目录(目标: string, 目录: string): boolean {
  const 相对路径 = path.relative(path.resolve(目录), path.resolve(目标));
  return 相对路径 === "" || (相对路径 !== ".." && !相对路径.startsWith(`..${path.sep}`) && !path.isAbsolute(相对路径));
}

export function 资源所在目录(项目: { sourcePath: string; sourceType: 阅读资源类型 }): string {
  return 项目.sourceType === "folder" ? 项目.sourcePath : path.dirname(项目.sourcePath);
}

export function 外部资源授权路径(项目: { sourcePath: string; sourceType: 阅读资源类型 }): string {
  // 图片以同目录的图片组阅读；压缩包、文档只授权这个文件。
  return 项目.sourceType === "image" ? path.dirname(项目.sourcePath) : 项目.sourcePath;
}

export async function 识别外部资源(输入: string): Promise<{ path: string; type: 阅读资源类型 }> {
  const 目标路径 = await fs.realpath(path.resolve(输入));
  const 状态 = await fs.stat(目标路径);
  if (状态.isDirectory()) return { path: 目标路径, type: "folder" };
  if (!状态.isFile()) throw new Error("无法打开此资源。");
  const 扩展名 = path.extname(目标路径).slice(1).toLowerCase();
  const type = ["jpg", "jpeg", "png", "webp", "bmp", "gif"].includes(扩展名) ? "image"
    : ["zip", "cbz", "rar", "cbr", "7z", "cb7"].includes(扩展名) ? "archive"
      : 扩展名 === "pdf" || 扩展名 === "epub" ? 扩展名 : null;
  if (!type) throw new Error("该文件格式暂不支持，支持图片、漫画压缩包、PDF 和 EPUB。");
  return { path: 目标路径, type };
}
