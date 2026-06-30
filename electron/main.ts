import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { promises as 文件系统 } from "node:fs";
import path from "node:path";
import {
  读取压缩包单张图片,
  读取压缩包图片列表,
  是压缩包服务错误,
} from "./services/archiveService";
import {
  添加或更新根目录,
  添加虚拟文件夹项目,
  添加收藏,
  保存阅读进度,
  当前页已书签,
  切换书签,
  创建虚拟文件夹,
  删除虚拟文件夹,
  移除书签,
  移除根目录,
  移除虚拟文件夹项目,
  移除收藏,
  移除最近打开,
  删除标签,
  获取书签列表,
  获取收藏列表,
  获取阅读进度,
  获取最近打开,
  读取应用数据,
  更新收藏整理信息,
  更新标签顺序,
  更新虚拟文件夹,
  更新资源整理信息,
  更新书签整理信息,
  更新设置,
  更新资源库状态,
  type AppSettings,
  type BookmarkItem,
  type FavoriteItem,
  type ReadingProgress,
} from "./services/appDataService";
import { 获取缩略图 } from "./services/thumbnailService";

const 开发服务地址 = process.env.VITE_DEV_SERVER_URL;
const 已授权根目录 = new Set<string>();
const 图片扩展名 = new Set(["jpg", "jpeg", "png", "webp", "bmp", "gif"]);
const 压缩包扩展名 = new Set(["zip", "cbz"]);
const EPUB扩展名 = new Set(["epub"]);
const 自然排序器 = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
let 当前阅读器会话Id = 0;

type 资源类型 = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";

interface 文件条目 {
  id: string;
  name: string;
  path: string;
  type: 资源类型;
  extension: string;
  size?: number;
  modifiedAt?: number;
  hasError?: boolean;
  errorMessage?: string;
}

interface 可阅读页数输入 {
  path: string;
  type: 资源类型;
}

interface 书签页预览输入 {
  sourcePath: string;
  sourceType: "folder" | "image" | "archive";
  pageIndex: number;
  pageName?: string;
  archiveInnerPath?: string;
}

function 规范化路径(目标路径: string): string {
  return path.resolve(目标路径);
}

function 查找所属根目录(目标路径: string): string | null {
  const 规范路径 = 规范化路径(目标路径);

  for (const 根目录 of 已授权根目录) {
    const 相对路径 = path.relative(根目录, 规范路径);
    if (相对路径 === "" || (!相对路径.startsWith("..") && !path.isAbsolute(相对路径))) {
      return 根目录;
    }
  }

  return null;
}

function 授权根目录列表(根目录列表: Array<{ path: string }>): void {
  for (const 根目录 of 根目录列表) {
    if (typeof 根目录.path === "string" && 根目录.path.trim() !== "") {
      已授权根目录.add(规范化路径(根目录.path));
    }
  }
}

function 识别资源类型(名称: string, 是否目录: boolean): 资源类型 {
  if (是否目录) {
    return "folder";
  }

  const 扩展名 = path.extname(名称).slice(1).toLowerCase();
  if (图片扩展名.has(扩展名)) {
    return "image";
  }
  if (压缩包扩展名.has(扩展名)) {
    return "archive";
  }
  if (扩展名 === "pdf") {
    return "pdf";
  }
  if (EPUB扩展名.has(扩展名)) {
    return "epub";
  }
  return "unknown";
}

function 是支持的图片(名称: string): boolean {
  return 图片扩展名.has(path.extname(名称).slice(1).toLowerCase());
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

function 是整理信息输入(输入: unknown): 输入 is { note?: string; tags?: string[] } {
  return typeof 输入 === "object"
    && 输入 !== null
    && (!("note" in 输入) || typeof 输入.note === "string")
    && (!("tags" in 输入) || (
      Array.isArray(输入.tags)
      && 输入.tags.every((标签) => typeof 标签 === "string")
    ));
}

function 是资源整理信息输入(输入: unknown): 输入 is {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
  note?: string;
  tags?: string[];
} {
  return 是整理信息输入(输入)
    && "resourceKey" in 输入
    && "sourcePath" in 输入
    && "sourceType" in 输入
    && "title" in 输入
    && typeof 输入.resourceKey === "string"
    && typeof 输入.sourcePath === "string"
    && typeof 输入.title === "string"
    && (
      输入.sourceType === "folder"
      || 输入.sourceType === "image"
      || 输入.sourceType === "archive"
      || 输入.sourceType === "pdf"
      || 输入.sourceType === "epub"
      || 输入.sourceType === "unknown"
    );
}

function 是支持的压缩包(名称: string): boolean {
  return 压缩包扩展名.has(path.extname(名称).slice(1).toLowerCase());
}

async function 统计文件夹第一层图片数量(文件夹路径: string): Promise<number> {
  const 目录项 = await 文件系统.readdir(文件夹路径, { withFileTypes: true });
  return 目录项.filter((项目) => 项目.isFile() && 是支持的图片(项目.name)).length;
}

async function 获取可阅读页数(输入: 可阅读页数输入): Promise<number | null> {
  if (输入.type === "folder") {
    return 统计文件夹第一层图片数量(输入.path);
  }

  if (输入.type === "image") {
    return 统计文件夹第一层图片数量(path.dirname(输入.path));
  }

  if (输入.type === "archive") {
    if (!是支持的压缩包(输入.path)) return null;
    const 图片列表 = await 读取压缩包图片列表(输入.path);
    return 图片列表.length;
  }

  return null;
}

function 创建页面DataUrl(图片数据: Buffer, 显示名称: string): string {
  const 媒体类型 = 获取图片媒体类型(显示名称);
  return `data:${媒体类型};base64,${图片数据.toString("base64")}`;
}

async function 读取文件夹书签页预览(输入: 书签页预览输入, 来源路径: string): Promise<string> {
  const 图片目录 = 输入.sourceType === "folder" ? 来源路径 : path.dirname(来源路径);
  if (!查找所属根目录(图片目录)) {
    throw new Error("PATH_NOT_ALLOWED");
  }

  const 目录项 = await 文件系统.readdir(图片目录, { withFileTypes: true });
  const 图片名称 = 目录项
    .filter((项目) => 项目.isFile() && 是支持的图片(项目.name))
    .map((项目) => 项目.name)
    .sort((左侧, 右侧) => 自然排序器.compare(左侧, 右侧));

  if (图片名称.length === 0) {
    throw new Error("NO_BOOKMARK_IMAGES");
  }

  const 按名称匹配索引 = 输入.pageName
    ? 图片名称.findIndex((名称) => 名称 === 输入.pageName)
    : -1;
  const 目标索引 = 按名称匹配索引 >= 0
    ? 按名称匹配索引
    : Math.floor(输入.pageIndex);
  if (!Number.isFinite(目标索引) || 目标索引 < 0 || 目标索引 >= 图片名称.length) {
    throw new Error("BOOKMARK_PAGE_OUT_OF_RANGE");
  }

  const 目标名称 = 图片名称[目标索引];
  const 目标路径 = path.join(图片目录, 目标名称);
  const 图片数据 = await 文件系统.readFile(目标路径);
  return 创建页面DataUrl(图片数据, 目标名称);
}

async function 读取压缩包书签页预览(输入: 书签页预览输入, 来源路径: string): Promise<string> {
  if (!是支持的压缩包(来源路径)) {
    throw new Error("UNSUPPORTED_ARCHIVE");
  }

  let 内部路径 = typeof 输入.archiveInnerPath === "string" && 输入.archiveInnerPath.trim() !== ""
    ? 输入.archiveInnerPath
    : "";

  if (!内部路径) {
    const 图片列表 = await 读取压缩包图片列表(来源路径);
    const 按名称匹配索引 = 输入.pageName
      ? 图片列表.findIndex((图片) => 图片.virtualPath === 输入.pageName)
      : -1;
    const 目标索引 = 按名称匹配索引 >= 0
      ? 按名称匹配索引
      : Math.floor(输入.pageIndex);
    if (!Number.isFinite(目标索引) || 目标索引 < 0 || 目标索引 >= 图片列表.length) {
      throw new Error("BOOKMARK_PAGE_OUT_OF_RANGE");
    }
    内部路径 = 图片列表[目标索引].virtualPath;
  }

  if (!是支持的图片(内部路径)) {
    throw new Error("INVALID_ARCHIVE_PAGE");
  }

  const 图片数据 = await 读取压缩包单张图片(来源路径, 内部路径);
  return 创建页面DataUrl(图片数据, 内部路径);
}

async function 读取文件条目(父目录: string, 名称: string, 是否目录: boolean): Promise<文件条目> {
  const 完整路径 = path.join(父目录, 名称);
  const 扩展名 = 是否目录 ? "" : path.extname(名称).slice(1).toLowerCase();
  const 基础条目: 文件条目 = {
    id: 完整路径,
    name: 名称,
    path: 完整路径,
    type: 识别资源类型(名称, 是否目录),
    extension: 扩展名,
  };

  try {
    const 状态 = await 文件系统.stat(完整路径);
    return {
      ...基础条目,
      size: 状态.size,
      modifiedAt: 状态.mtimeMs,
    };
  } catch {
    return {
      ...基础条目,
      hasError: true,
      errorMessage: "无法读取该项目的详细信息。",
    };
  }
}

function 注册安全通道(): void {
  ipcMain.handle("应用:获取信息", () => ({
    name: "OmiComic",
    version: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.handle("窗口:设置全屏", (事件, enabled: unknown) => {
    if (typeof enabled !== "boolean") {
      return {
        ok: false,
        error: { code: "INVALID_FULLSCREEN_STATE", message: "全屏状态无效。" },
      };
    }

    const 窗口 = BrowserWindow.fromWebContents(事件.sender);
    if (!窗口) {
      return {
        ok: false,
        error: { code: "WINDOW_NOT_FOUND", message: "无法找到当前窗口。" },
      };
    }

    窗口.setFullScreen(enabled);
    return { ok: true, data: 窗口.isFullScreen() };
  });

  ipcMain.handle("窗口:是否全屏", (事件) => {
    const 窗口 = BrowserWindow.fromWebContents(事件.sender);
    if (!窗口) {
      return {
        ok: false,
        error: { code: "WINDOW_NOT_FOUND", message: "无法找到当前窗口。" },
      };
    }

    return { ok: true, data: 窗口.isFullScreen() };
  });

  ipcMain.handle("数据:获取应用数据", async () => {
    try {
      const 数据 = await 读取应用数据();
      授权根目录列表(数据.library.roots);
      return { ok: true, data: 数据 };
    } catch {
      return {
        ok: false,
        error: { code: "APP_DATA_READ_FAILED", message: "本地数据读取失败，已使用默认数据启动。" },
      };
    }
  });

  ipcMain.handle("数据:更新设置", async (_事件, 输入: unknown) => {
    if (typeof 输入 !== "object" || 输入 === null || Array.isArray(输入)) {
      return {
        ok: false,
        error: { code: "INVALID_SETTINGS", message: "设置数据无效。" },
      };
    }

    try {
      const 设置 = await 更新设置(输入 as Partial<AppSettings>);
      return { ok: true, data: 设置 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_SETTINGS_FAILED", message: "设置保存失败，但不影响继续使用。" },
      };
    }
  });

  ipcMain.handle("数据:添加根目录", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("path" in 输入)
      || typeof 输入.path !== "string"
    ) {
      return {
        ok: false,
        error: { code: "INVALID_ROOT", message: "根目录数据无效。" },
      };
    }

    try {
      const 根路径 = 规范化路径(输入.path);
      const 名称 = "name" in 输入 && typeof 输入.name === "string"
        ? 输入.name
        : path.basename(根路径) || 根路径;
      const 根目录 = await 添加或更新根目录(根路径, 名称);
      已授权根目录.add(根目录.path);
      return { ok: true, data: 根目录 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_ROOT_FAILED", message: "根目录保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:移除根目录", async (_事件, 根路径输入: unknown) => {
    if (typeof 根路径输入 !== "string" || 根路径输入.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_ROOT", message: "根目录路径无效。" },
      };
    }

    try {
      const 根路径 = 规范化路径(根路径输入);
      const 根目录列表 = await 移除根目录(根路径);
      已授权根目录.delete(根路径);
      return { ok: true, data: 根目录列表 };
    } catch {
      return {
        ok: false,
        error: { code: "REMOVE_ROOT_FAILED", message: "根目录移除失败。" },
      };
    }
  });

  ipcMain.handle("数据:更新资源库状态", async (_事件, 输入: unknown) => {
    if (typeof 输入 !== "object" || 输入 === null || Array.isArray(输入)) {
      return {
        ok: false,
        error: { code: "INVALID_LIBRARY_STATE", message: "资源库状态无效。" },
      };
    }

    const 状态 = 输入 as { lastActiveRootPath?: unknown; lastCurrentPath?: unknown };
    try {
      await 更新资源库状态({
        lastActiveRootPath: typeof 状态.lastActiveRootPath === "string"
          ? 规范化路径(状态.lastActiveRootPath)
          : undefined,
        lastCurrentPath: typeof 状态.lastCurrentPath === "string"
          ? 规范化路径(状态.lastCurrentPath)
          : undefined,
      });
      return { ok: true, data: null };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_LIBRARY_STATE_FAILED", message: "资源库状态保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:获取阅读进度", async (_事件, resourceKey: unknown) => {
    if (typeof resourceKey !== "string" || resourceKey.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_PROGRESS_KEY", message: "阅读进度标识无效。" },
      };
    }

    try {
      return { ok: true, data: await 获取阅读进度(resourceKey) };
    } catch {
      return {
        ok: false,
        error: { code: "READ_PROGRESS_FAILED", message: "阅读进度读取失败。" },
      };
    }
  });

  ipcMain.handle("数据:保存阅读进度", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("resourceKey" in 输入)
      || !("sourcePath" in 输入)
      || !("sourceType" in 输入)
      || typeof 输入.resourceKey !== "string"
      || typeof 输入.sourcePath !== "string"
      || (
        输入.sourceType !== "folder"
        && 输入.sourceType !== "image"
        && 输入.sourceType !== "archive"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_PROGRESS", message: "阅读进度数据无效。" },
      };
    }

    try {
      const 进度 = await 保存阅读进度(输入 as ReadingProgress);
      return { ok: true, data: 进度 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_PROGRESS_FAILED", message: "阅读进度保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:获取最近打开", async () => {
    try {
      return { ok: true, data: await 获取最近打开() };
    } catch {
      return {
        ok: false,
        error: { code: "READ_RECENT_FAILED", message: "最近打开读取失败。" },
      };
    }
  });

  ipcMain.handle("数据:移除最近打开", async (_事件, resourceKey: unknown) => {
    if (typeof resourceKey !== "string" || resourceKey.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_RECENT_KEY", message: "最近打开记录标识无效。" },
      };
    }

    try {
      await 移除最近打开(resourceKey);
      return { ok: true, data: null };
    } catch {
      return {
        ok: false,
        error: { code: "REMOVE_RECENT_FAILED", message: "最近打开记录删除失败。" },
      };
    }
  });

  ipcMain.handle("数据:获取收藏", async () => {
    try {
      return { ok: true, data: await 获取收藏列表() };
    } catch {
      return {
        ok: false,
        error: { code: "READ_FAVORITES_FAILED", message: "收藏列表读取失败。" },
      };
    }
  });

  ipcMain.handle("数据:添加收藏", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("resourceKey" in 输入)
      || !("sourcePath" in 输入)
      || !("sourceType" in 输入)
      || !("title" in 输入)
      || typeof 输入.resourceKey !== "string"
      || typeof 输入.sourcePath !== "string"
      || typeof 输入.title !== "string"
      || (
        输入.sourceType !== "folder"
        && 输入.sourceType !== "image"
        && 输入.sourceType !== "archive"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_FAVORITE", message: "收藏数据无效。" },
      };
    }

    const 资源路径 = 规范化路径(输入.sourcePath);
    if (!查找所属根目录(资源路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前资源不在已授权的漫画目录内。" },
      };
    }

    try {
      const 收藏 = await 添加收藏({
        resourceKey: 输入.resourceKey,
        sourcePath: 资源路径,
        sourceType: 输入.sourceType,
        title: 输入.title,
      } satisfies Omit<FavoriteItem, "addedAt" | "updatedAt">);
      return { ok: true, data: 收藏 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_FAVORITE_FAILED", message: "收藏保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:移除收藏", async (_事件, resourceKey: unknown) => {
    if (typeof resourceKey !== "string" || resourceKey.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_FAVORITE_KEY", message: "收藏记录标识无效。" },
      };
    }

    try {
      await 移除收藏(resourceKey);
      return { ok: true, data: null };
    } catch {
      return {
        ok: false,
        error: { code: "REMOVE_FAVORITE_FAILED", message: "收藏移除失败。" },
      };
    }
  });

  ipcMain.handle("数据:更新收藏整理信息", async (_事件, resourceKey: unknown, 输入: unknown) => {
    if (typeof resourceKey !== "string" || resourceKey.trim() === "" || !是整理信息输入(输入)) {
      return {
        ok: false,
        error: { code: "INVALID_FAVORITE_META", message: "收藏备注和标签数据无效。" },
      };
    }

    try {
      const 收藏 = await 更新收藏整理信息(resourceKey, 输入);
      return { ok: true, data: 收藏 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_FAVORITE_META_FAILED", message: "收藏备注和标签保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:更新资源整理信息", async (_事件, 输入: unknown) => {
    if (!是资源整理信息输入(输入) || 输入.resourceKey.trim() === "" || 输入.sourcePath.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_RESOURCE_META", message: "资源备注和标签数据无效。" },
      };
    }

    const 资源路径 = 规范化路径(输入.sourcePath);
    if (!查找所属根目录(资源路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前资源不在已授权的漫画目录内。" },
      };
    }

    try {
      const 元数据 = await 更新资源整理信息({
        resourceKey: 输入.resourceKey,
        sourcePath: 资源路径,
        sourceType: 输入.sourceType,
        title: 输入.title,
        note: 输入.note,
        tags: 输入.tags,
      });
      return { ok: true, data: 元数据 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_RESOURCE_META_FAILED", message: "资源备注和标签保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:更新标签顺序", async (_事件, 输入: unknown) => {
    if (!Array.isArray(输入) || !输入.every((标签) => typeof 标签 === "string")) {
      return {
        ok: false,
        error: { code: "INVALID_TAG_ORDER", message: "标签顺序数据无效。" },
      };
    }

    try {
      const 标签顺序 = await 更新标签顺序(输入);
      return { ok: true, data: 标签顺序 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_TAG_ORDER_FAILED", message: "标签顺序保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:删除标签", async (_事件, 输入: unknown) => {
    if (!Array.isArray(输入) || !输入.every((标签) => typeof 标签 === "string")) {
      return {
        ok: false,
        error: { code: "INVALID_TAGS", message: "标签数据无效。" },
      };
    }

    try {
      const 数据 = await 删除标签(输入);
      return { ok: true, data: 数据 };
    } catch {
      return {
        ok: false,
        error: { code: "DELETE_TAGS_FAILED", message: "标签删除失败。" },
      };
    }
  });

  ipcMain.handle("数据:创建虚拟文件夹", async (_事件, 输入: unknown) => {
    if (typeof 输入 !== "object" || 输入 === null || !("name" in 输入) || typeof 输入.name !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_VIRTUAL_FOLDER_NAME", message: "自定义文件夹名称不能为空。" },
      };
    }

    try {
      const 文件夹 = await 创建虚拟文件夹({
        name: 输入.name,
        note: "note" in 输入 && typeof 输入.note === "string" ? 输入.note : undefined,
      });
      return { ok: true, data: 文件夹 };
    } catch (错误) {
      const code = 错误 instanceof Error ? 错误.message : "CREATE_VIRTUAL_FOLDER_FAILED";
      return {
        ok: false,
        error: {
          code,
          message: code === "VIRTUAL_FOLDER_NAME_EXISTS" ? "已存在同名自定义文件夹。" : "自定义文件夹创建失败。",
        },
      };
    }
  });

  ipcMain.handle("数据:更新虚拟文件夹", async (_事件, 输入: unknown) => {
    if (typeof 输入 !== "object" || 输入 === null || !("id" in 输入) || typeof 输入.id !== "string") {
      return {
        ok: false,
        error: { code: "INVALID_VIRTUAL_FOLDER", message: "自定义文件夹数据无效。" },
      };
    }

    try {
      const 文件夹 = await 更新虚拟文件夹({
        id: 输入.id,
        name: "name" in 输入 && typeof 输入.name === "string" ? 输入.name : undefined,
        note: "note" in 输入 && typeof 输入.note === "string" ? 输入.note : undefined,
      });
      return { ok: true, data: 文件夹 };
    } catch (错误) {
      const code = 错误 instanceof Error ? 错误.message : "UPDATE_VIRTUAL_FOLDER_FAILED";
      return {
        ok: false,
        error: {
          code,
          message: code === "VIRTUAL_FOLDER_NAME_EXISTS"
            ? "已存在同名自定义文件夹。"
            : code === "INVALID_VIRTUAL_FOLDER_NAME"
              ? "自定义文件夹名称不能为空。"
              : "自定义文件夹保存失败。",
        },
      };
    }
  });

  ipcMain.handle("数据:删除虚拟文件夹", async (_事件, id: unknown) => {
    if (typeof id !== "string" || id.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_VIRTUAL_FOLDER", message: "自定义文件夹数据无效。" },
      };
    }

    try {
      return { ok: true, data: await 删除虚拟文件夹(id) };
    } catch {
      return {
        ok: false,
        error: {
          code: "DELETE_VIRTUAL_FOLDER_FAILED",
          message: "自定义文件夹删除失败。此操作不会删除任何真实漫画文件。",
        },
      };
    }
  });

  ipcMain.handle("数据:加入虚拟文件夹", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("folderId" in 输入)
      || !("items" in 输入)
      || typeof 输入.folderId !== "string"
      || !Array.isArray(输入.items)
    ) {
      return {
        ok: false,
        error: { code: "INVALID_VIRTUAL_FOLDER_ITEMS", message: "加入自定义文件夹的数据无效。" },
      };
    }

    const 项目列表 = 输入.items.filter((项目): 项目 is {
      resourceKey: string;
      sourcePath: string;
      sourceType: 资源类型;
      title: string;
    } => (
      typeof 项目 === "object"
      && 项目 !== null
      && "resourceKey" in 项目
      && "sourcePath" in 项目
      && "sourceType" in 项目
      && "title" in 项目
      && typeof 项目.resourceKey === "string"
      && typeof 项目.sourcePath === "string"
      && typeof 项目.title === "string"
      && (
        项目.sourceType === "folder"
        || 项目.sourceType === "image"
        || 项目.sourceType === "archive"
        || 项目.sourceType === "pdf"
        || 项目.sourceType === "epub"
        || 项目.sourceType === "unknown"
      )
    ));

    try {
      return { ok: true, data: await 添加虚拟文件夹项目(输入.folderId, 项目列表) };
    } catch (错误) {
      const code = 错误 instanceof Error ? 错误.message : "ADD_VIRTUAL_FOLDER_ITEMS_FAILED";
      return {
        ok: false,
        error: {
          code,
          message: code === "VIRTUAL_FOLDER_NOT_FOUND" ? "未找到目标自定义文件夹。" : "加入自定义文件夹失败。",
        },
      };
    }
  });

  ipcMain.handle("数据:移除虚拟文件夹项目", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("folderId" in 输入)
      || !("resourceKey" in 输入)
      || typeof 输入.folderId !== "string"
      || typeof 输入.resourceKey !== "string"
    ) {
      return {
        ok: false,
        error: { code: "INVALID_VIRTUAL_FOLDER_ITEM", message: "自定义文件夹项目数据无效。" },
      };
    }

    try {
      return { ok: true, data: await 移除虚拟文件夹项目(输入.folderId, 输入.resourceKey) };
    } catch (错误) {
      const code = 错误 instanceof Error ? 错误.message : "REMOVE_VIRTUAL_FOLDER_ITEM_FAILED";
      return {
        ok: false,
        error: {
          code,
          message: code === "VIRTUAL_FOLDER_NOT_FOUND"
            ? "未找到目标自定义文件夹。"
            : "从自定义文件夹移除失败。此操作不会删除真实漫画文件。",
        },
      };
    }
  });

  ipcMain.handle("数据:获取书签", async () => {
    try {
      return { ok: true, data: await 获取书签列表() };
    } catch {
      return {
        ok: false,
        error: { code: "READ_BOOKMARKS_FAILED", message: "书签列表读取失败。" },
      };
    }
  });

  ipcMain.handle("数据:切换书签", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("resourceKey" in 输入)
      || !("sourcePath" in 输入)
      || !("sourceType" in 输入)
      || !("title" in 输入)
      || !("pageIndex" in 输入)
      || !("totalPages" in 输入)
      || typeof 输入.resourceKey !== "string"
      || typeof 输入.sourcePath !== "string"
      || typeof 输入.title !== "string"
      || typeof 输入.pageIndex !== "number"
      || typeof 输入.totalPages !== "number"
      || !Number.isFinite(输入.pageIndex)
      || !Number.isFinite(输入.totalPages)
      || (
        输入.sourceType !== "folder"
        && 输入.sourceType !== "image"
        && 输入.sourceType !== "archive"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_BOOKMARK", message: "书签数据无效。" },
      };
    }

    const 资源路径 = 规范化路径(输入.sourcePath);
    if (!查找所属根目录(资源路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前资源不在已授权的漫画目录内。" },
      };
    }

    try {
      const 结果 = await 切换书签({
        resourceKey: 输入.resourceKey,
        sourcePath: 资源路径,
        sourceType: 输入.sourceType,
        title: 输入.title,
        pageIndex: 输入.pageIndex,
        totalPages: 输入.totalPages,
        pageName: "pageName" in 输入 && typeof 输入.pageName === "string"
          ? 输入.pageName
          : undefined,
        archiveInnerPath: "archiveInnerPath" in 输入 && typeof 输入.archiveInnerPath === "string"
          ? 输入.archiveInnerPath
          : undefined,
        thumbnailUrl: "thumbnailUrl" in 输入 && typeof 输入.thumbnailUrl === "string"
          ? 输入.thumbnailUrl
          : undefined,
      } satisfies Omit<BookmarkItem, "id" | "createdAt" | "updatedAt">);
      return { ok: true, data: 结果 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_BOOKMARK_FAILED", message: "书签保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:移除书签", async (_事件, id: unknown) => {
    if (typeof id !== "string" || id.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_BOOKMARK_ID", message: "书签标识无效。" },
      };
    }

    try {
      await 移除书签(id);
      return { ok: true, data: null };
    } catch {
      return {
        ok: false,
        error: { code: "REMOVE_BOOKMARK_FAILED", message: "书签删除失败。" },
      };
    }
  });

  ipcMain.handle("数据:更新书签整理信息", async (_事件, id: unknown, 输入: unknown) => {
    if (typeof id !== "string" || id.trim() === "" || !是整理信息输入(输入)) {
      return {
        ok: false,
        error: { code: "INVALID_BOOKMARK_META", message: "书签备注和标签数据无效。" },
      };
    }

    try {
      const 书签 = await 更新书签整理信息(id, 输入);
      return { ok: true, data: 书签 };
    } catch {
      return {
        ok: false,
        error: { code: "SAVE_BOOKMARK_META_FAILED", message: "书签备注和标签保存失败。" },
      };
    }
  });

  ipcMain.handle("数据:当前页是否书签", async (_事件, resourceKey: unknown, pageIndex: unknown) => {
    if (
      typeof resourceKey !== "string"
      || resourceKey.trim() === ""
      || typeof pageIndex !== "number"
      || !Number.isFinite(pageIndex)
    ) {
      return {
        ok: false,
        error: { code: "INVALID_BOOKMARK_QUERY", message: "书签状态查询无效。" },
      };
    }

    try {
      return { ok: true, data: await 当前页已书签(resourceKey, pageIndex) };
    } catch {
      return {
        ok: false,
        error: { code: "READ_BOOKMARK_STATE_FAILED", message: "书签状态读取失败。" },
      };
    }
  });

  ipcMain.handle("书签:获取页面预览", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("sourcePath" in 输入)
      || !("sourceType" in 输入)
      || !("pageIndex" in 输入)
      || typeof 输入.sourcePath !== "string"
      || typeof 输入.pageIndex !== "number"
      || !Number.isFinite(输入.pageIndex)
      || (
        输入.sourceType !== "folder"
        && 输入.sourceType !== "image"
        && 输入.sourceType !== "archive"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_BOOKMARK_PREVIEW", message: "书签页预览请求无效。" },
      };
    }

    const 来源路径 = 规范化路径(输入.sourcePath);
    if (!查找所属根目录(来源路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前书签资源不在已授权的漫画目录内。" },
      };
    }

    const 预览输入: 书签页预览输入 = {
      sourcePath: 来源路径,
      sourceType: 输入.sourceType,
      pageIndex: 输入.pageIndex,
      pageName: "pageName" in 输入 && typeof 输入.pageName === "string"
        ? 输入.pageName
        : undefined,
      archiveInnerPath: "archiveInnerPath" in 输入 && typeof 输入.archiveInnerPath === "string"
        ? 输入.archiveInnerPath
        : undefined,
    };

    try {
      const dataUrl = 预览输入.sourceType === "archive"
        ? await 读取压缩包书签页预览(预览输入, 来源路径)
        : await 读取文件夹书签页预览(预览输入, 来源路径);
      return { ok: true, data: { dataUrl } };
    } catch (错误) {
      const 错误代码 = 是压缩包服务错误(错误)
        ? 错误.code
        : (错误 as Error)?.message ?? "BOOKMARK_PREVIEW_FAILED";
      const 错误信息 = 错误代码 === "ARCHIVE_ENCRYPTED"
        ? "暂不支持加密压缩包书签预览。"
        : 错误代码 === "ARCHIVE_IMAGE_TOO_LARGE"
          ? "书签页图片过大，暂时无法安全预览。"
          : 错误代码 === "BOOKMARK_PAGE_OUT_OF_RANGE"
            ? "书签页码已超出当前资源页数。"
            : "书签页预览生成失败，资源可能已移动、删除或损坏。";
      return {
        ok: false,
        error: { code: 错误代码, message: 错误信息 },
      };
    }
  });

  ipcMain.handle("目录:选择根目录", async (事件) => {
    try {
      const 所属窗口 = BrowserWindow.fromWebContents(事件.sender) ?? undefined;
      const 选择结果 = 所属窗口
        ? await dialog.showOpenDialog(所属窗口, {
            title: "选择本地漫画根目录",
            buttonLabel: "添加此目录",
            properties: ["openDirectory"],
          })
        : await dialog.showOpenDialog({
            title: "选择本地漫画根目录",
            buttonLabel: "添加此目录",
            properties: ["openDirectory"],
          });

      if (选择结果.canceled || 选择结果.filePaths.length === 0) {
        return { ok: true, data: null };
      }

      const 根目录 = 规范化路径(选择结果.filePaths[0]);
      已授权根目录.add(根目录);
      return { ok: true, data: 根目录 };
    } catch {
      return {
        ok: false,
        error: {
          code: "SELECT_FOLDER_FAILED",
          message: "无法打开文件夹选择框，请稍后重试。",
        },
      };
    }
  });

  ipcMain.handle("目录:读取", async (_事件, 输入路径: unknown) => {
    if (typeof 输入路径 !== "string" || 输入路径.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_PATH", message: "目录路径无效。" },
      };
    }

    const 目标路径 = 规范化路径(输入路径);
    const 所属根目录 = 查找所属根目录(目标路径);
    if (!所属根目录) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "无法读取未添加的目录。" },
      };
    }

    try {
      const 目录项 = await 文件系统.readdir(目标路径, { withFileTypes: true });
      const 文件列表 = await Promise.all(
        目录项.map((目录项信息) =>
          读取文件条目(目标路径, 目录项信息.name, 目录项信息.isDirectory()),
        ),
      );

      文件列表.sort((左侧, 右侧) => {
        if (左侧.type === "folder" && 右侧.type !== "folder") return -1;
        if (左侧.type !== "folder" && 右侧.type === "folder") return 1;
        return 自然排序器.compare(左侧.name, 右侧.name);
      });

      const 是否位于根目录 = path.relative(所属根目录, 目标路径) === "";
      return {
        ok: true,
        data: {
          path: 目标路径,
          parentPath: 是否位于根目录 ? null : path.dirname(目标路径),
          items: 文件列表,
          total: 文件列表.length,
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "READ_DIRECTORY_FAILED",
          message: "无法读取该文件夹，请检查权限或路径是否存在。",
        },
      };
    }
  });

  ipcMain.handle("阅读:获取图片列表", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("path" in 输入)
      || !("type" in 输入)
      || typeof 输入.path !== "string"
      || (
        输入.type !== "folder"
        && 输入.type !== "image"
        && 输入.type !== "archive"
        && 输入.type !== "pdf"
        && 输入.type !== "epub"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_RESOURCE", message: "无法打开该阅读资源。" },
      };
    }

    const 资源路径 = 规范化路径(输入.path);
    if (!查找所属根目录(资源路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前文件不在已授权的漫画目录内。" },
      };
    }

    if (输入.type === "pdf") {
      return {
        ok: false,
        error: {
          code: "PDF_READING_DISABLED",
          message: "PDF 阅读支持已暂时关闭，将在后续版本重新评估。",
        },
      };
    }

    if (输入.type === "epub") {
      return {
        ok: false,
        error: {
          code: "EPUB_READING_DISABLED",
          message: "当前版本暂不支持 EPUB 阅读。",
        },
      };
    }

    if (输入.type === "archive") {
      if (!是支持的压缩包(资源路径)) {
        return {
          ok: false,
          error: { code: "UNSUPPORTED_ARCHIVE", message: "压缩包格式不受支持。" },
        };
      }

      try {
        const 压缩包图片 = await 读取压缩包图片列表(资源路径);
        if (压缩包图片.length === 0) {
          return {
            ok: false,
            error: { code: "NO_ARCHIVE_IMAGES", message: "压缩包内未找到可阅读图片。" },
          };
        }

        const 页面 = 压缩包图片.map((图片, 索引) => ({
          index: 索引,
          name: 图片.virtualPath,
          sourcePath: 资源路径,
          virtualPath: 图片.virtualPath,
          archiveInnerPath: 图片.virtualPath,
          type: "archive-image" as const,
        }));

        return {
          ok: true,
          data: {
            key: `archive:${资源路径}`,
            resourceKey: `archive:${资源路径}`,
            title: path.basename(资源路径),
            sourcePath: 资源路径,
            sourceType: "archive" as const,
            pages: 页面,
            total: 页面.length,
          },
        };
      } catch (错误) {
        const 是加密压缩包 = 是压缩包服务错误(错误) && 错误.code === "ARCHIVE_ENCRYPTED";
        return {
          ok: false,
          error: {
            code: 是加密压缩包 ? "ARCHIVE_ENCRYPTED" : "ARCHIVE_READ_FAILED",
            message: 是加密压缩包
              ? "暂不支持加密压缩包。"
              : "压缩包读取失败，文件可能已损坏或格式不受支持。",
          },
        };
      }
    }

    if (输入.type === "image" && !是支持的图片(资源路径)) {
      return {
        ok: false,
        error: { code: "UNSUPPORTED_IMAGE", message: "该图片格式暂不受支持。" },
      };
    }

    const 图片目录 = 输入.type === "folder" ? 资源路径 : path.dirname(资源路径);
    const 图片资源Key = `folder:${图片目录}`;
    if (!查找所属根目录(图片目录)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "无法读取未添加目录中的图片。" },
      };
    }

    try {
      const 目录项 = await 文件系统.readdir(图片目录, { withFileTypes: true });
      const 图片名称 = 目录项
        .filter((项目) => 项目.isFile() && 是支持的图片(项目.name))
        .map((项目) => 项目.name)
        .sort((左侧, 右侧) => 自然排序器.compare(左侧, 右侧));

      if (图片名称.length === 0) {
        return {
          ok: false,
          error: { code: "NO_IMAGES", message: "未在该文件夹中找到可阅读图片。" },
        };
      }

      const 页面 = 图片名称.map((名称, 索引) => ({
        index: 索引,
        name: 名称,
        sourcePath: path.join(图片目录, 名称),
        type: "folder-image" as const,
      }));

      if (输入.type === "image") {
        const 规范资源路径 = process.platform === "win32"
          ? 资源路径.toLocaleLowerCase()
          : 资源路径;
        const 选中图片仍然存在 = 页面.some((项目) => {
          const 页面路径 = process.platform === "win32"
            ? 项目.sourcePath.toLocaleLowerCase()
            : 项目.sourcePath;
          return 页面路径 === 规范资源路径;
        });

        if (!选中图片仍然存在) {
          return {
            ok: false,
            error: { code: "IMAGE_NOT_FOUND", message: "无法打开该图片，文件可能已被移动或删除。" },
          };
        }
      }

      return {
        ok: true,
        data: {
          key: 图片资源Key,
          resourceKey: 图片资源Key,
          title: path.basename(图片目录) || 图片目录,
          sourcePath: 资源路径,
          sourceType: 输入.type,
          pages: 页面,
          total: 页面.length,
        },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "READ_IMAGES_FAILED",
          message: "无法读取该文件夹中的图片，请检查权限或路径是否存在。",
        },
      };
    }
  });

  ipcMain.handle("阅读:设置会话", async (_事件, 输入: unknown) => {
    const 会话Id = typeof 输入 === "number" && Number.isFinite(输入) ? Math.floor(输入) : 0;
    当前阅读器会话Id = Math.max(当前阅读器会话Id, 会话Id);
    return { ok: true, data: null };
  });

  ipcMain.handle("阅读:获取页面图片", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("sourcePath" in 输入)
      || !("type" in 输入)
      || typeof 输入.sourcePath !== "string"
      || (
        输入.type !== "folder-image"
        && 输入.type !== "archive-image"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_IMAGE_PATH", message: "图片路径无效。" },
      };
    }

    const 请求会话Id = "readerSessionId" in 输入
      && typeof 输入.readerSessionId === "number"
      && Number.isFinite(输入.readerSessionId)
      ? Math.floor(输入.readerSessionId)
      : null;
    if (请求会话Id !== null && 请求会话Id > 当前阅读器会话Id) {
      当前阅读器会话Id = 请求会话Id;
    }
    const 会话已过期 = (): boolean => 请求会话Id !== null && 请求会话Id < 当前阅读器会话Id;
    const 创建过期会话结果 = () => ({
      ok: false,
      error: { code: "STALE_READER_SESSION", message: "旧阅读请求已被忽略。" },
    });
    if (会话已过期()) return 创建过期会话结果();

    const 来源路径 = 规范化路径(输入.sourcePath);
    if (!查找所属根目录(来源路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前文件不在已授权的漫画目录内。" },
      };
    }

    if (输入.type === "archive-image") {
      const 内部路径 = "archiveInnerPath" in 输入 && typeof 输入.archiveInnerPath === "string"
        ? 输入.archiveInnerPath
        : "virtualPath" in 输入 && typeof 输入.virtualPath === "string"
          ? 输入.virtualPath
          : "";
      if (
        内部路径.trim() === ""
        || !是支持的压缩包(来源路径)
        || !是支持的图片(内部路径)
      ) {
        return {
          ok: false,
          error: { code: "INVALID_ARCHIVE_PAGE", message: "当前图片读取失败，请尝试重新打开。" },
        };
      }

      try {
        const 图片数据 = await 读取压缩包单张图片(来源路径, 内部路径);
        if (会话已过期()) return 创建过期会话结果();
        const 媒体类型 = 获取图片媒体类型(内部路径);
        return {
          ok: true,
          data: { url: `data:${媒体类型};base64,${图片数据.toString("base64")}` },
        };
      } catch (错误) {
        const 错误代码 = 是压缩包服务错误(错误) ? 错误.code : "ARCHIVE_PAGE_READ_FAILED";
        const 错误信息 = 错误代码 === "ARCHIVE_ENCRYPTED"
          ? "暂不支持加密压缩包。"
          : 错误代码 === "ARCHIVE_IMAGE_TOO_LARGE"
            ? "当前图片过大，暂时无法安全读取。"
            : "当前图片读取失败，请尝试重新打开。";
        return {
          ok: false,
          error: {
            code: 错误代码,
            message: 错误信息,
          },
        };
      }
    }

    if (!是支持的图片(来源路径)) {
      return {
        ok: false,
        error: { code: "UNSUPPORTED_IMAGE", message: "该图片格式暂不受支持。" },
      };
    }

    try {
      const 图片数据 = await 文件系统.readFile(来源路径);
      if (会话已过期()) return 创建过期会话结果();
      const 媒体类型 = 获取图片媒体类型(来源路径);
      return {
        ok: true,
        data: { url: `data:${媒体类型};base64,${图片数据.toString("base64")}` },
      };
    } catch {
      return {
        ok: false,
        error: {
          code: "READ_IMAGE_FAILED",
          message: "无法读取该图片，文件可能不存在或没有访问权限。",
        },
      };
    }
  });

  ipcMain.handle("缩略图:获取", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("path" in 输入)
      || !("type" in 输入)
      || typeof 输入.path !== "string"
      || (
        输入.type !== "folder"
        && 输入.type !== "image"
        && 输入.type !== "archive"
        && 输入.type !== "pdf"
        && 输入.type !== "epub"
        && 输入.type !== "unknown"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_THUMBNAIL_INPUT", message: "缩略图请求无效。" },
      };
    }

    const 目标路径 = 规范化路径(输入.path);
    if (!查找所属根目录(目标路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前文件不在已授权的漫画目录内。" },
      };
    }

    try {
      const 结果 = await 获取缩略图({
        path: 目标路径,
        type: 输入.type,
      });
      return { ok: true, data: 结果 };
    } catch {
      return {
        ok: false,
        error: { code: "THUMBNAIL_READ_FAILED", message: "缩略图读取失败。" },
      };
    }
  });

  ipcMain.handle("资源:获取可阅读页数", async (_事件, 输入: unknown) => {
    if (
      typeof 输入 !== "object"
      || 输入 === null
      || !("path" in 输入)
      || !("type" in 输入)
      || typeof 输入.path !== "string"
      || (
        输入.type !== "folder"
        && 输入.type !== "image"
        && 输入.type !== "archive"
        && 输入.type !== "pdf"
        && 输入.type !== "epub"
        && 输入.type !== "unknown"
      )
    ) {
      return {
        ok: false,
        error: { code: "INVALID_PAGE_COUNT_INPUT", message: "页数统计请求无效。" },
      };
    }

    const 目标路径 = 规范化路径(输入.path);
    if (!查找所属根目录(目标路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前文件不在已授权的漫画目录内。" },
      };
    }

    if (输入.type === "pdf" || 输入.type === "epub" || 输入.type === "unknown") {
      return { ok: true, data: null };
    }

    try {
      const 页数 = await 获取可阅读页数({
        path: 目标路径,
        type: 输入.type,
      });
      return { ok: true, data: 页数 !== null && 页数 > 0 ? 页数 : null };
    } catch {
      return {
        ok: false,
        error: { code: "PAGE_COUNT_READ_FAILED", message: "页数统计失败。" },
      };
    }
  });

  ipcMain.handle("阅读:释放资源", async (_事件, 输入路径: unknown) => {
    if (typeof 输入路径 !== "string" || 输入路径.trim() === "") {
      return {
        ok: false,
        error: { code: "INVALID_RESOURCE_PATH", message: "阅读资源路径无效。" },
      };
    }

    const 目标路径 = 规范化路径(输入路径);
    if (!查找所属根目录(目标路径)) {
      return {
        ok: false,
        error: { code: "PATH_NOT_ALLOWED", message: "当前文件不在已授权的漫画目录内。" },
      };
    }

    return { ok: true, data: null };
  });
}

function 创建主窗口(): void {
  const 主窗口 = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "OmiComic 本地漫画阅读器",
    backgroundColor: "#f5f2eb",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  主窗口.once("ready-to-show", () => 主窗口.show());

  主窗口.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  主窗口.webContents.on("will-navigate", (事件, url) => {
    const 当前地址 = 主窗口.webContents.getURL();
    if (url !== 当前地址) {
      事件.preventDefault();
    }
  });

  if (开发服务地址) {
    void 主窗口.loadURL(开发服务地址);
  } else {
    void 主窗口.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  注册安全通道();
  创建主窗口();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      创建主窗口();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
