import { promises as 文件系统 } from "node:fs";
import path from "node:path";
import {
  读取压缩包单张图片,
  读取压缩包图片列表,
  是压缩包服务错误,
  type 压缩包图片条目,
} from "./archiveService";

const 图片扩展名 = new Set(["jpg", "jpeg", "png", "webp", "bmp", "gif"]);
const 压缩包扩展名 = new Set(["zip", "cbz"]);
const 自然排序器 = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const 缩略图最大字节数 = 32 * 1024 * 1024;
const 封面关键词 = ["cover", "folder", "front"] as const;

export type 缩略图资源类型 = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";

export interface 缩略图输入 {
  path: string;
  type: 缩略图资源类型;
}

export interface 缩略图结果 {
  url: string | null;
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

function 是支持的图片(名称: string): boolean {
  return 图片扩展名.has(path.extname(名称).slice(1).toLowerCase());
}

function 是支持的压缩包(名称: string): boolean {
  return 压缩包扩展名.has(path.extname(名称).slice(1).toLowerCase());
}

function 获取图片媒体类型(名称: string): string {
  const 扩展名 = path.extname(名称).slice(1).toLowerCase();
  if (扩展名 === "jpg" || 扩展名 === "jpeg") return "image/jpeg";
  if (扩展名 === "png") return "image/png";
  if (扩展名 === "webp") return "image/webp";
  if (扩展名 === "bmp") return "image/bmp";
  if (扩展名 === "gif") return "image/gif";
  return "application/octet-stream";
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

async function 读取图片为DataUrl(图片路径: string, 显示名称 = 图片路径): Promise<string> {
  const 状态 = await 文件系统.stat(图片路径);
  if (!状态.isFile() || 状态.size > 缩略图最大字节数) {
    throw new 缩略图服务错误("THUMBNAIL_TOO_LARGE", "缩略图图片过大。");
  }

  const 图片数据 = await 文件系统.readFile(图片路径);
  const 媒体类型 = 获取图片媒体类型(显示名称);
  return `data:${媒体类型};base64,${图片数据.toString("base64")}`;
}

export async function 获取图片缩略图(图片路径: string): Promise<缩略图结果> {
  if (!是支持的图片(图片路径)) return { url: null };

  try {
    return { url: await 读取图片为DataUrl(图片路径) };
  } catch {
    return { url: null };
  }
}

export async function 获取文件夹封面缩略图(文件夹路径: string): Promise<缩略图结果> {
  try {
    const 目录项 = await 文件系统.readdir(文件夹路径, { withFileTypes: true });
    const 图片列表 = 目录项
      .filter((项目) => 项目.isFile() && 是支持的图片(项目.name))
      .map((项目) => ({ name: 项目.name, path: path.join(文件夹路径, 项目.name) }))
      .sort((左侧, 右侧) => 自然排序器.compare(左侧.name, 右侧.name));

    for (const 封面 of 生成封面候选(图片列表)) {
      try {
        return { url: await 读取图片为DataUrl(封面.path, 封面.name) };
      } catch {
        continue;
      }
    }
    return { url: null };
  } catch {
    return { url: null };
  }
}

export async function 获取压缩包封面缩略图(压缩包路径: string): Promise<缩略图结果> {
  if (!是支持的压缩包(压缩包路径)) return { url: null };

  try {
    const 图片列表 = await 读取压缩包图片列表(压缩包路径);
    for (const 封面 of 生成压缩包封面候选(图片列表)) {
      if (封面.size > 缩略图最大字节数) continue;

      try {
        const 图片数据 = await 读取压缩包单张图片(
          压缩包路径,
          封面.virtualPath,
          缩略图最大字节数,
        );
        const 媒体类型 = 获取图片媒体类型(封面.virtualPath);
        return { url: `data:${媒体类型};base64,${图片数据.toString("base64")}` };
      } catch (错误) {
        if (是压缩包服务错误(错误) && 错误.code === "ARCHIVE_ENCRYPTED") return { url: null };
        continue;
      }
    }
    return { url: null };
  } catch (错误) {
    if (是压缩包服务错误(错误)) return { url: null };
    return { url: null };
  }
}

export async function 获取缩略图(输入: 缩略图输入): Promise<缩略图结果> {
  if (输入.type === "image") return 获取图片缩略图(输入.path);
  if (输入.type === "folder") return 获取文件夹封面缩略图(输入.path);
  if (输入.type === "archive") return 获取压缩包封面缩略图(输入.path);
  return { url: null };
}
