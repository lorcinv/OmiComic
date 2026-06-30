import { app } from "electron";
import { promises as 文件系统 } from "node:fs";
import path from "node:path";

export type 阅读资源类型 = "folder" | "image" | "archive";
export type 资源类型 = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";
export type 卡片尺寸 = "small" | "medium" | "large";
export type 每页数量 = 60 | 100 | 150 | 200;
export type 排序方式 = "name-asc" | "name-desc" | "time-asc" | "time-desc" | "type";
export type 排序方向 = "asc" | "desc";
export type 进度文本模式 = "page" | "percent";
export type 进度条粗细 = "thin" | "normal" | "thick";
export type 阅读器缩放模式 = "fit-width" | "fit-height" | "original";
export type 阅读器页模式 = "single" | "double";
export type 双页阅读方向 = "left-to-right" | "right-to-left";
export type 沉浸自动隐藏延迟 = 500 | 1000 | 1500 | 2000 | 2500 | 3000;
export type 图书切换按钮透明度 = 20 | 30 | 40 | 50 | 60 | 70 | 80;
export type 整理侧边栏透明度 = 70 | 80 | 90 | 100;
export type 书架备注悬停延迟 = 0 | 500 | 1000 | 1500 | 2000;
export type 批量删除确认类型 = "favorites" | "bookmarks" | "recent";
export type 标签搜索模式 = "fuzzy" | "exact";

export type 批量删除确认设置 = Record<批量删除确认类型, boolean>;

export interface LibraryRoot {
  path: string;
  name: string;
  addedAt: number;
  lastOpenedAt: number;
}

export interface AppSettings {
  cardSize: 卡片尺寸;
  pageSize: 每页数量;
  sortMode: 排序方式;
  sortDirection: 排序方向;
  folderFirst: boolean;
  hideBookshelfItemsInLibrary: boolean;
  showProgressBar: boolean;
  showProgressText: boolean;
  progressTextMode: 进度文本模式;
  progressBarThickness: 进度条粗细;
  readerDefaultFitMode: 阅读器缩放模式;
  readerPageMode: 阅读器页模式;
  doublePageFirstSingle: boolean;
  doublePageDirection: 双页阅读方向;
  smartDetectSpreadPage: boolean;
  wheelPageTurn: boolean;
  immersiveAutoHide: boolean;
  immersiveAutoHideDelay: 沉浸自动隐藏延迟;
  bookSwitchButtonOpacity: 图书切换按钮透明度;
  organizeDrawerOpacity: 整理侧边栏透明度;
  bookshelfNoteHoverDelayMs: 书架备注悬停延迟;
  tagSearchMode: 标签搜索模式;
  confirmBeforeDeleteTags: boolean;
  confirmBeforeBatchDelete: 批量删除确认设置;
}

export interface ReadingProgress {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  currentPageIndex: number;
  totalPages: number;
  currentPageName?: string;
  percent: number;
  completed: boolean;
  hasStartedReading: boolean;
  firstReadAt: number;
  updatedAt: number;
}

export interface RecentOpenedItem {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  currentPageIndex: number;
  totalPages: number;
  updatedAt: number;
}

export interface FavoriteItem {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  note?: string;
  tags?: string[];
  addedAt: number;
  updatedAt: number;
}

export interface BookmarkItem {
  id: string;
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  pageIndex: number;
  totalPages: number;
  pageName?: string;
  archiveInnerPath?: string;
  thumbnailUrl?: string;
  note?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface 整理信息输入 {
  note?: string;
  tags?: string[];
}

export interface ResourceMetaItem {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
  note: string;
  tags: string[];
  updatedAt: number;
}

export interface ResourceMetaInput extends 整理信息输入 {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
}

export interface VirtualFolderItem {
  id: string;
  folderId: string;
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
  addedAt: number;
  sortIndex: number;
}

export interface VirtualFolder {
  id: string;
  name: string;
  note: string;
  tags: string[];
  items: VirtualFolderItem[];
  createdAt: number;
  updatedAt: number;
  sortIndex: number;
}

export interface VirtualFolderItemInput {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
}

export interface OmiComicAppData {
  version: number;
  library: {
    roots: LibraryRoot[];
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  };
  settings: AppSettings;
  readingProgress: Record<string, ReadingProgress>;
  recentOpened: RecentOpenedItem[];
  favorites: FavoriteItem[];
  bookmarks: BookmarkItem[];
  resourceMeta: Record<string, ResourceMetaItem>;
  tagOrder: string[];
  virtualFolders: VirtualFolder[];
}

const 数据版本 = 1;
const 最近打开最大数量 = 50;
const 每页数量选项 = new Set<number>([60, 100, 150, 200]);
const 卡片尺寸选项 = new Set<string>(["small", "medium", "large"]);
const 排序方式选项 = new Set<string>(["name-asc", "name-desc", "time-asc", "time-desc", "type"]);
const 进度文本模式选项 = new Set<string>(["page", "percent"]);
const 进度条粗细选项 = new Set<string>(["thin", "normal", "thick"]);
const 阅读器缩放模式选项 = new Set<string>(["fit-width", "fit-height", "original"]);
const 阅读器页模式选项 = new Set<string>(["single", "double"]);
const 双页阅读方向选项 = new Set<string>(["left-to-right", "right-to-left"]);
const 沉浸自动隐藏延迟选项 = new Set<number>([500, 1000, 1500, 2000, 2500, 3000]);
const 图书切换按钮透明度选项 = new Set<number>([20, 30, 40, 50, 60, 70, 80]);
const 整理侧边栏透明度选项 = new Set<number>([70, 80, 90, 100]);
const 书架备注悬停延迟选项 = new Set<number>([0, 500, 1000, 1500, 2000]);
const 标签搜索模式选项 = new Set<string>(["fuzzy", "exact"]);
const 资源类型选项 = new Set<string>(["folder", "image", "archive", "pdf", "epub", "unknown"]);

const 默认设置: AppSettings = {
  cardSize: "medium",
  pageSize: 60,
  sortMode: "name-asc",
  sortDirection: "asc",
  folderFirst: true,
  hideBookshelfItemsInLibrary: true,
  showProgressBar: true,
  showProgressText: true,
  progressTextMode: "page",
  progressBarThickness: "normal",
  readerDefaultFitMode: "fit-height",
  readerPageMode: "single",
  doublePageFirstSingle: true,
  doublePageDirection: "right-to-left",
  smartDetectSpreadPage: true,
  wheelPageTurn: true,
  immersiveAutoHide: false,
  immersiveAutoHideDelay: 3000,
  bookSwitchButtonOpacity: 40,
  organizeDrawerOpacity: 90,
  bookshelfNoteHoverDelayMs: 1000,
  tagSearchMode: "fuzzy",
  confirmBeforeDeleteTags: true,
  confirmBeforeBatchDelete: {
    favorites: true,
    bookmarks: true,
    recent: true,
  },
};

let 数据缓存: OmiComicAppData | null = null;

function 获取数据文件路径(): string {
  return path.join(app.getPath("userData"), "omicomic-data.json");
}

function 创建默认数据(): OmiComicAppData {
  return {
    version: 数据版本,
    library: {
      roots: [],
    },
    settings: { ...默认设置 },
    readingProgress: {},
    recentOpened: [],
    favorites: [],
    bookmarks: [],
    resourceMeta: {},
    tagOrder: [],
    virtualFolders: [],
  };
}

function 是对象(值: unknown): 值 is Record<string, unknown> {
  return typeof 值 === "object" && 值 !== null && !Array.isArray(值);
}

function 读取字符串(值: unknown): string | undefined {
  return typeof 值 === "string" && 值.trim() !== "" ? 值 : undefined;
}

function 读取可空文本(值: unknown): string {
  return typeof 值 === "string" ? 值.trim() : "";
}

function 修正标签列表(输入: unknown): string[] {
  if (!Array.isArray(输入)) return [];
  const 已加入 = new Set<string>();
  const 标签列表: string[] = [];
  for (const 值 of 输入) {
    if (typeof 值 !== "string") continue;
    const 标签 = 值.trim();
    if (!标签 || 已加入.has(标签)) continue;
    标签列表.push(标签);
    已加入.add(标签);
  }
  return 标签列表;
}

function 修正整理信息(输入: 整理信息输入): Required<整理信息输入> {
  return {
    note: 读取可空文本(输入.note),
    tags: 修正标签列表(输入.tags),
  };
}

function 读取数字(值: unknown): number | undefined {
  return typeof 值 === "number" && Number.isFinite(值) ? 值 : undefined;
}

function 修正设置(输入: unknown): AppSettings {
  const 设置 = 是对象(输入) ? 输入 : {};
  const 删除前确认 = 是对象(设置.confirmBeforeBatchDelete) ? 设置.confirmBeforeBatchDelete : {};
  const 跳过批量删除确认 = 是对象(设置.skipBatchDeleteConfirm) ? 设置.skipBatchDeleteConfirm : {};
  const cardSize = 卡片尺寸选项.has(String(设置.cardSize))
    ? 设置.cardSize as 卡片尺寸
    : 默认设置.cardSize;
  const pageSize = 每页数量选项.has(Number(设置.pageSize))
    ? Number(设置.pageSize) as 每页数量
    : 默认设置.pageSize;
  const sortMode = 排序方式选项.has(String(设置.sortMode))
    ? 设置.sortMode as 排序方式
    : 默认设置.sortMode;
  const progressTextMode = 进度文本模式选项.has(String(设置.progressTextMode))
    ? 设置.progressTextMode as 进度文本模式
    : 默认设置.progressTextMode;
  const progressBarThickness = 进度条粗细选项.has(String(设置.progressBarThickness))
    ? 设置.progressBarThickness as 进度条粗细
    : 默认设置.progressBarThickness;
  const readerDefaultFitMode = 阅读器缩放模式选项.has(String(设置.readerDefaultFitMode))
    ? 设置.readerDefaultFitMode as 阅读器缩放模式
    : 默认设置.readerDefaultFitMode;
  const readerPageMode = 阅读器页模式选项.has(String(设置.readerPageMode))
    ? 设置.readerPageMode as 阅读器页模式
    : 默认设置.readerPageMode;
  const doublePageDirection = 双页阅读方向选项.has(String(设置.doublePageDirection))
    ? 设置.doublePageDirection as 双页阅读方向
    : 默认设置.doublePageDirection;
  const immersiveAutoHideDelay = 沉浸自动隐藏延迟选项.has(Number(设置.immersiveAutoHideDelay))
    ? Number(设置.immersiveAutoHideDelay) as 沉浸自动隐藏延迟
    : 默认设置.immersiveAutoHideDelay;
  const bookSwitchButtonOpacity = 图书切换按钮透明度选项.has(Number(设置.bookSwitchButtonOpacity))
    ? Number(设置.bookSwitchButtonOpacity) as 图书切换按钮透明度
    : 默认设置.bookSwitchButtonOpacity;
  const organizeDrawerOpacity = 整理侧边栏透明度选项.has(Number(设置.organizeDrawerOpacity))
    ? Number(设置.organizeDrawerOpacity) as 整理侧边栏透明度
    : 默认设置.organizeDrawerOpacity;
  const bookshelfNoteHoverDelayMs = 书架备注悬停延迟选项.has(Number(设置.bookshelfNoteHoverDelayMs))
    ? Number(设置.bookshelfNoteHoverDelayMs) as 书架备注悬停延迟
    : 默认设置.bookshelfNoteHoverDelayMs;
  const tagSearchMode = 标签搜索模式选项.has(String(设置.tagSearchMode))
    ? 设置.tagSearchMode as 标签搜索模式
    : 默认设置.tagSearchMode;

  return {
    cardSize,
    pageSize,
    sortMode,
    sortDirection: 设置.sortDirection === "desc" ? "desc" : "asc",
    folderFirst: typeof 设置.folderFirst === "boolean" ? 设置.folderFirst : 默认设置.folderFirst,
    hideBookshelfItemsInLibrary: typeof 设置.hideBookshelfItemsInLibrary === "boolean"
      ? 设置.hideBookshelfItemsInLibrary
      : 默认设置.hideBookshelfItemsInLibrary,
    showProgressBar: typeof 设置.showProgressBar === "boolean"
      ? 设置.showProgressBar
      : 默认设置.showProgressBar,
    showProgressText: typeof 设置.showProgressText === "boolean"
      ? 设置.showProgressText
      : 默认设置.showProgressText,
    progressTextMode,
    progressBarThickness,
    readerDefaultFitMode,
    readerPageMode,
    doublePageFirstSingle: typeof 设置.doublePageFirstSingle === "boolean"
      ? 设置.doublePageFirstSingle
      : 默认设置.doublePageFirstSingle,
    doublePageDirection,
    smartDetectSpreadPage: typeof 设置.smartDetectSpreadPage === "boolean"
      ? 设置.smartDetectSpreadPage
      : 默认设置.smartDetectSpreadPage,
    wheelPageTurn: typeof 设置.wheelPageTurn === "boolean" ? 设置.wheelPageTurn : 默认设置.wheelPageTurn,
    immersiveAutoHide: typeof 设置.immersiveAutoHide === "boolean"
      ? 设置.immersiveAutoHide
      : 默认设置.immersiveAutoHide,
    immersiveAutoHideDelay,
    bookSwitchButtonOpacity,
    organizeDrawerOpacity,
    bookshelfNoteHoverDelayMs,
    tagSearchMode,
    confirmBeforeDeleteTags: typeof 设置.confirmBeforeDeleteTags === "boolean"
      ? 设置.confirmBeforeDeleteTags
      : 默认设置.confirmBeforeDeleteTags,
    confirmBeforeBatchDelete: {
      favorites: typeof 删除前确认.favorites === "boolean"
        ? 删除前确认.favorites
        : typeof 跳过批量删除确认.favorites === "boolean"
          ? !跳过批量删除确认.favorites
          : 默认设置.confirmBeforeBatchDelete.favorites,
      bookmarks: typeof 删除前确认.bookmarks === "boolean"
        ? 删除前确认.bookmarks
        : typeof 跳过批量删除确认.bookmarks === "boolean"
          ? !跳过批量删除确认.bookmarks
          : 默认设置.confirmBeforeBatchDelete.bookmarks,
      recent: typeof 删除前确认.recent === "boolean"
        ? 删除前确认.recent
        : typeof 跳过批量删除确认.recent === "boolean"
          ? !跳过批量删除确认.recent
          : 默认设置.confirmBeforeBatchDelete.recent,
    },
  };
}

function 修正根目录列表(输入: unknown): LibraryRoot[] {
  if (!Array.isArray(输入)) return [];
  const 已加入 = new Set<string>();
  const 根目录列表: LibraryRoot[] = [];

  for (const 项目 of 输入) {
    if (!是对象(项目)) continue;
    const 根路径 = 读取字符串(项目.path);
    if (!根路径 || 已加入.has(根路径)) continue;
    const 当前时间 = Date.now();
    根目录列表.push({
      path: 根路径,
      name: 读取字符串(项目.name) ?? (path.basename(根路径) || 根路径),
      addedAt: 读取数字(项目.addedAt) ?? 当前时间,
      lastOpenedAt: 读取数字(项目.lastOpenedAt) ?? 当前时间,
    });
    已加入.add(根路径);
  }

  return 根目录列表;
}

function 修正阅读进度(输入: unknown): Record<string, ReadingProgress> {
  if (!是对象(输入)) return {};
  const 进度表: Record<string, ReadingProgress> = {};

  for (const [键, 值] of Object.entries(输入)) {
    if (!是对象(值)) continue;
    const resourceKey = 读取字符串(值.resourceKey) ?? 键;
    const sourcePath = 读取字符串(值.sourcePath);
    const sourceType = 值.sourceType;
    const title = 读取字符串(值.title);
    const totalPages = Math.max(0, Math.floor(读取数字(值.totalPages) ?? 0));
    if (
      !resourceKey
      || !sourcePath
      || !title
      || totalPages <= 0
      || (sourceType !== "folder" && sourceType !== "image" && sourceType !== "archive")
    ) {
      continue;
    }

    const currentPageIndex = Math.min(
      Math.max(0, Math.floor(读取数字(值.currentPageIndex) ?? 0)),
      totalPages - 1,
    );
    const percent = totalPages > 0 ? Math.round(((currentPageIndex + 1) / totalPages) * 100) : 0;
    const firstReadAt = 读取数字(值.firstReadAt) ?? Date.now();
    const updatedAt = 读取数字(值.updatedAt) ?? firstReadAt;
    const completed = currentPageIndex >= totalPages - 1;
    const hasStartedReading = typeof 值.hasStartedReading === "boolean"
      ? 值.hasStartedReading
      : currentPageIndex > 0 || completed || 值.completed === true;

    进度表[resourceKey] = {
      resourceKey,
      sourcePath,
      sourceType,
      title,
      currentPageIndex,
      totalPages,
      currentPageName: 读取字符串(值.currentPageName),
      percent,
      completed,
      hasStartedReading,
      firstReadAt,
      updatedAt,
    };
  }

  return 进度表;
}

function 修正最近打开(输入: unknown, 进度表: Record<string, ReadingProgress>): RecentOpenedItem[] {
  if (!Array.isArray(输入)) return [];
  const 已加入 = new Set<string>();
  const 最近列表: RecentOpenedItem[] = [];

  for (const 项目 of 输入) {
    if (!是对象(项目)) continue;
    const resourceKey = 读取字符串(项目.resourceKey);
    const sourcePath = 读取字符串(项目.sourcePath);
    const sourceType = 项目.sourceType;
    const title = 读取字符串(项目.title);
    const totalPages = Math.max(0, Math.floor(读取数字(项目.totalPages) ?? 0));
    if (
      !resourceKey
      || !sourcePath
      || !title
      || totalPages <= 0
      || 已加入.has(resourceKey)
      || (sourceType !== "folder" && sourceType !== "image" && sourceType !== "archive")
    ) {
      continue;
    }

    const 进度 = 进度表[resourceKey];
    const currentPageIndex = Math.min(
      Math.max(0, Math.floor(读取数字(项目.currentPageIndex) ?? 进度?.currentPageIndex ?? 0)),
      totalPages - 1,
    );

    最近列表.push({
      resourceKey,
      sourcePath,
      sourceType,
      title,
      currentPageIndex,
      totalPages,
      updatedAt: 读取数字(项目.updatedAt) ?? 进度?.updatedAt ?? Date.now(),
    });
    已加入.add(resourceKey);
  }

  return 最近列表
    .sort((左侧, 右侧) => 右侧.updatedAt - 左侧.updatedAt)
    .slice(0, 最近打开最大数量);
}

function 修正收藏列表(输入: unknown): FavoriteItem[] {
  if (!Array.isArray(输入)) return [];
  const 已加入 = new Set<string>();
  const 收藏列表: FavoriteItem[] = [];

  for (const 项目 of 输入) {
    if (!是对象(项目)) continue;
    const resourceKey = 读取字符串(项目.resourceKey);
    const sourcePath = 读取字符串(项目.sourcePath);
    const sourceType = 项目.sourceType;
    const title = 读取字符串(项目.title);
    if (
      !resourceKey
      || !sourcePath
      || !title
      || 已加入.has(resourceKey)
      || (sourceType !== "folder" && sourceType !== "image" && sourceType !== "archive")
    ) {
      continue;
    }

    const 当前时间 = Date.now();
    收藏列表.push({
      resourceKey,
      sourcePath,
      sourceType,
      title,
      note: 读取可空文本(项目.note),
      tags: 修正标签列表(项目.tags),
      addedAt: 读取数字(项目.addedAt) ?? 当前时间,
      updatedAt: 读取数字(项目.updatedAt) ?? 当前时间,
    });
    已加入.add(resourceKey);
  }

  return 收藏列表.sort((左侧, 右侧) => 右侧.updatedAt - 左侧.updatedAt);
}

function 创建书签ID(resourceKey: string, pageIndex: number): string {
  return `${resourceKey}#page:${pageIndex}`;
}

function 修正书签列表(输入: unknown): BookmarkItem[] {
  if (!Array.isArray(输入)) return [];
  const 已加入 = new Set<string>();
  const 书签列表: BookmarkItem[] = [];

  for (const 项目 of 输入) {
    if (!是对象(项目)) continue;
    const resourceKey = 读取字符串(项目.resourceKey);
    const sourcePath = 读取字符串(项目.sourcePath);
    const sourceType = 项目.sourceType;
    const title = 读取字符串(项目.title);
    const totalPages = Math.max(0, Math.floor(读取数字(项目.totalPages) ?? 0));
    const pageIndex = Math.min(
      Math.max(0, Math.floor(读取数字(项目.pageIndex) ?? 0)),
      Math.max(0, totalPages - 1),
    );
    if (
      !resourceKey
      || !sourcePath
      || !title
      || totalPages <= 0
      || 已加入.has(`${resourceKey}:${pageIndex}`)
      || (sourceType !== "folder" && sourceType !== "image" && sourceType !== "archive")
    ) {
      continue;
    }

    const 当前时间 = Date.now();
    const id = 读取字符串(项目.id) ?? 创建书签ID(resourceKey, pageIndex);
    书签列表.push({
      id,
      resourceKey,
      sourcePath,
      sourceType,
      title,
      pageIndex,
      totalPages,
      pageName: 读取字符串(项目.pageName),
      archiveInnerPath: 读取字符串(项目.archiveInnerPath),
      thumbnailUrl: 读取字符串(项目.thumbnailUrl),
      note: 读取可空文本(项目.note),
      tags: 修正标签列表(项目.tags),
      createdAt: 读取数字(项目.createdAt) ?? 当前时间,
      updatedAt: 读取数字(项目.updatedAt) ?? 当前时间,
    });
    已加入.add(`${resourceKey}:${pageIndex}`);
  }

  return 书签列表.sort((左侧, 右侧) => 右侧.updatedAt - 左侧.updatedAt);
}

function 修正资源元数据(输入: unknown): Record<string, ResourceMetaItem> {
  if (!是对象(输入)) return {};
  const 元数据表: Record<string, ResourceMetaItem> = {};
  for (const [键, 值] of Object.entries(输入)) {
    if (!是对象(值)) continue;
    const resourceKey = 读取字符串(值.resourceKey) ?? 键;
    const sourcePath = 读取字符串(值.sourcePath);
    const sourceType = 资源类型选项.has(String(值.sourceType))
      ? 值.sourceType as 资源类型
      : undefined;
    const title = 读取字符串(值.title);
    if (!resourceKey || !sourcePath || !sourceType || !title) continue;
    元数据表[resourceKey] = {
      resourceKey,
      sourcePath,
      sourceType,
      title,
      note: 读取可空文本(值.note),
      tags: 修正标签列表(值.tags),
      updatedAt: 读取数字(值.updatedAt) ?? Date.now(),
    };
  }
  return 元数据表;
}

function 创建虚拟文件夹ID(): string {
  return `vf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function 创建虚拟文件夹项目ID(folderId: string, resourceKey: string): string {
  return `${folderId}::${resourceKey}`;
}

function 读取资源类型(输入: unknown): 资源类型 | undefined {
  return 资源类型选项.has(String(输入)) ? 输入 as 资源类型 : undefined;
}

function 修正虚拟文件夹列表(输入: unknown): VirtualFolder[] {
  if (!Array.isArray(输入)) return [];
  const 已加入文件夹 = new Set<string>();
  const 文件夹列表: VirtualFolder[] = [];

  for (const 项目 of 输入) {
    if (!是对象(项目)) continue;
    const id = 读取字符串(项目.id) ?? 创建虚拟文件夹ID();
    if (已加入文件夹.has(id)) continue;
    const name = 读取字符串(项目.name);
    if (!name) continue;
    const 当前时间 = Date.now();
    const createdAt = 读取数字(项目.createdAt) ?? 当前时间;
    const updatedAt = 读取数字(项目.updatedAt) ?? createdAt;
    const 原始项目列表 = Array.isArray(项目.items)
      ? 项目.items
      : Array.isArray(项目.itemIds)
        ? []
        : [];
    const 已加入资源 = new Set<string>();
    const items: VirtualFolderItem[] = [];

    for (const 原始资源 of 原始项目列表) {
      if (!是对象(原始资源)) continue;
      const resourceKey = 读取字符串(原始资源.resourceKey);
      const sourcePath = 读取字符串(原始资源.sourcePath);
      const sourceType = 读取资源类型(原始资源.sourceType);
      const title = 读取字符串(原始资源.title);
      if (!resourceKey || !sourcePath || !sourceType || !title || 已加入资源.has(resourceKey)) continue;
      const addedAt = 读取数字(原始资源.addedAt) ?? updatedAt;
      items.push({
        id: 读取字符串(原始资源.id) ?? 创建虚拟文件夹项目ID(id, resourceKey),
        folderId: id,
        resourceKey,
        sourcePath,
        sourceType,
        title,
        addedAt,
        sortIndex: 读取数字(原始资源.sortIndex) ?? items.length,
      });
      已加入资源.add(resourceKey);
    }

    items.sort((左侧, 右侧) => 左侧.sortIndex - 右侧.sortIndex || 左侧.addedAt - 右侧.addedAt);
    文件夹列表.push({
      id,
      name,
      note: 读取可空文本(项目.note ?? 项目.description),
      tags: 修正标签列表(项目.tags),
      items,
      createdAt,
      updatedAt,
      sortIndex: 读取数字(项目.sortIndex) ?? 文件夹列表.length,
    });
    已加入文件夹.add(id);
  }

  return 文件夹列表.sort((左侧, 右侧) => 左侧.sortIndex - 右侧.sortIndex || 左侧.createdAt - 右侧.createdAt);
}

function 合并标签顺序(输入: unknown, 数据: {
  favorites: FavoriteItem[];
  bookmarks: BookmarkItem[];
  resourceMeta: Record<string, ResourceMetaItem>;
  virtualFolders: VirtualFolder[];
}): string[] {
  const 已加入 = new Set<string>();
  const 标签顺序: string[] = [];
  const 加入 = (标签: string): void => {
    const 修正标签 = 标签.trim();
    if (!修正标签 || 已加入.has(修正标签)) return;
    标签顺序.push(修正标签);
    已加入.add(修正标签);
  };

  for (const 标签 of 修正标签列表(输入)) 加入(标签);
  for (const 项目 of Object.values(数据.resourceMeta)) {
    for (const 标签 of 修正标签列表(项目.tags)) 加入(标签);
  }
  for (const 项目 of 数据.favorites) {
    for (const 标签 of 修正标签列表(项目.tags)) 加入(标签);
  }
  for (const 项目 of 数据.bookmarks) {
    for (const 标签 of 修正标签列表(项目.tags)) 加入(标签);
  }
  for (const 文件夹 of 数据.virtualFolders) {
    for (const 标签 of 修正标签列表(文件夹.tags)) 加入(标签);
  }

  return 标签顺序;
}

function 修正应用数据(输入: unknown): OmiComicAppData {
  if (!是对象(输入)) return 创建默认数据();
  const 进度表 = 修正阅读进度(输入.readingProgress);
  const library = 是对象(输入.library) ? 输入.library : {};
  const favorites = 修正收藏列表(输入.favorites);
  const bookmarks = 修正书签列表(输入.bookmarks);
  const resourceMeta = 修正资源元数据(输入.resourceMeta);
  const virtualFolders = 修正虚拟文件夹列表(输入.virtualFolders);

  return {
    version: 数据版本,
    library: {
      roots: 修正根目录列表(library.roots),
      lastActiveRootPath: 读取字符串(library.lastActiveRootPath),
      lastCurrentPath: 读取字符串(library.lastCurrentPath),
    },
    settings: 修正设置(输入.settings),
    readingProgress: 进度表,
    recentOpened: 修正最近打开(输入.recentOpened, 进度表),
    favorites,
    bookmarks,
    resourceMeta,
    tagOrder: 合并标签顺序(输入.tagOrder, { favorites, bookmarks, resourceMeta, virtualFolders }),
    virtualFolders,
  };
}

async function 安全写入JSON(文件路径: string, 数据: OmiComicAppData): Promise<void> {
  await 文件系统.mkdir(path.dirname(文件路径), { recursive: true });
  const 临时路径 = `${文件路径}.tmp`;
  await 文件系统.writeFile(临时路径, `${JSON.stringify(数据, null, 2)}\n`, "utf8");
  await 文件系统.rename(临时路径, 文件路径);
}

export async function 读取应用数据(): Promise<OmiComicAppData> {
  if (数据缓存) return 数据缓存;

  const 文件路径 = 获取数据文件路径();
  try {
    const 原始内容 = await 文件系统.readFile(文件路径, "utf8");
    数据缓存 = 修正应用数据(JSON.parse(原始内容));
    return 数据缓存;
  } catch (错误) {
    const 错误代码 = (错误 as NodeJS.ErrnoException)?.code;
    if (错误代码 !== "ENOENT") {
      const 备份路径 = `${文件路径}.${Date.now()}.broken.json`;
      await 文件系统.rename(文件路径, 备份路径).catch(() => undefined);
    }

    数据缓存 = 创建默认数据();
    await 保存应用数据(数据缓存).catch(() => undefined);
    return 数据缓存;
  }
}

export async function 保存应用数据(数据: OmiComicAppData): Promise<void> {
  数据缓存 = 修正应用数据(数据);
  await 安全写入JSON(获取数据文件路径(), 数据缓存);
}

export async function 更新设置(局部设置: Partial<AppSettings>): Promise<AppSettings> {
  const 数据 = await 读取应用数据();
  数据.settings = 修正设置({ ...数据.settings, ...局部设置 });
  await 保存应用数据(数据);
  return 数据.settings;
}

export async function 添加或更新根目录(根路径: string, 名称: string): Promise<LibraryRoot> {
  const 数据 = await 读取应用数据();
  const 当前时间 = Date.now();
  const 已有根目录 = 数据.library.roots.find((项目) => 项目.path === 根路径);
  const 根目录: LibraryRoot = 已有根目录
    ? {
        ...已有根目录,
        name: 名称 || 已有根目录.name,
        lastOpenedAt: 当前时间,
      }
    : {
        path: 根路径,
        name: 名称 || path.basename(根路径) || 根路径,
        addedAt: 当前时间,
        lastOpenedAt: 当前时间,
      };

  数据.library.roots = [
    根目录,
    ...数据.library.roots.filter((项目) => 项目.path !== 根路径),
  ];
  数据.library.lastActiveRootPath = 根路径;
  数据.library.lastCurrentPath = 根路径;
  await 保存应用数据(数据);
  return 根目录;
}

export async function 移除根目录(根路径: string): Promise<LibraryRoot[]> {
  const 数据 = await 读取应用数据();
  const 删除前数量 = 数据.library.roots.length;
  数据.library.roots = 数据.library.roots.filter((项目) => 项目.path !== 根路径);

  if (数据.library.lastActiveRootPath === 根路径 || 数据.library.lastCurrentPath === 根路径) {
    const 下一个根目录 = 数据.library.roots[0];
    if (下一个根目录) {
      数据.library.lastActiveRootPath = 下一个根目录.path;
      数据.library.lastCurrentPath = 下一个根目录.path;
    } else {
      delete 数据.library.lastActiveRootPath;
      delete 数据.library.lastCurrentPath;
    }
  }

  if (删除前数量 !== 数据.library.roots.length) {
    await 保存应用数据(数据);
  }
  return 数据.library.roots;
}

export async function 更新资源库状态(状态: {
  lastActiveRootPath?: string;
  lastCurrentPath?: string;
}): Promise<void> {
  const 数据 = await 读取应用数据();
  if (状态.lastActiveRootPath) 数据.library.lastActiveRootPath = 状态.lastActiveRootPath;
  if (状态.lastCurrentPath) 数据.library.lastCurrentPath = 状态.lastCurrentPath;
  if (状态.lastActiveRootPath) {
    const 根目录 = 数据.library.roots.find((项目) => 项目.path === 状态.lastActiveRootPath);
    if (根目录) 根目录.lastOpenedAt = Date.now();
  }
  await 保存应用数据(数据);
}

export async function 获取阅读进度(resourceKey: string): Promise<ReadingProgress | null> {
  const 数据 = await 读取应用数据();
  return 数据.readingProgress[resourceKey] ?? null;
}

export async function 保存阅读进度(进度: ReadingProgress): Promise<ReadingProgress> {
  const 数据 = await 读取应用数据();
  const 已有进度 = 数据.readingProgress[进度.resourceKey];
  const totalPages = Math.max(1, Math.floor(进度.totalPages));
  const currentPageIndex = Math.min(Math.max(0, Math.floor(进度.currentPageIndex)), totalPages - 1);
  const percent = Math.round(((currentPageIndex + 1) / totalPages) * 100);
  const updatedAt = Date.now();
  const completed = currentPageIndex >= totalPages - 1;
  const hasStartedReading = Boolean(已有进度?.hasStartedReading || 进度.hasStartedReading || currentPageIndex > 0 || completed);
  const 修正进度: ReadingProgress = {
    ...进度,
    currentPageIndex,
    totalPages,
    percent,
    completed,
    hasStartedReading,
    firstReadAt: 已有进度?.firstReadAt ?? 进度.firstReadAt ?? updatedAt,
    updatedAt,
  };

  数据.readingProgress[修正进度.resourceKey] = 修正进度;
  数据.recentOpened = [
    {
      resourceKey: 修正进度.resourceKey,
      sourcePath: 修正进度.sourcePath,
      sourceType: 修正进度.sourceType,
      title: 修正进度.title,
      currentPageIndex: 修正进度.currentPageIndex,
      totalPages: 修正进度.totalPages,
      updatedAt,
    },
    ...数据.recentOpened.filter((项目) => 项目.resourceKey !== 修正进度.resourceKey),
  ].slice(0, 最近打开最大数量);

  await 保存应用数据(数据);
  return 修正进度;
}

export async function 获取最近打开(): Promise<RecentOpenedItem[]> {
  const 数据 = await 读取应用数据();
  return 数据.recentOpened;
}

export async function 移除最近打开(resourceKey: string): Promise<void> {
  const 数据 = await 读取应用数据();
  数据.recentOpened = 数据.recentOpened.filter((项目) => 项目.resourceKey !== resourceKey);
  await 保存应用数据(数据);
}

export async function 获取收藏列表(): Promise<FavoriteItem[]> {
  const 数据 = await 读取应用数据();
  return 数据.favorites;
}

export async function 添加收藏(输入: Omit<FavoriteItem, "addedAt" | "updatedAt">): Promise<FavoriteItem> {
  const 数据 = await 读取应用数据();
  const 已有收藏 = 数据.favorites.find((项目) => 项目.resourceKey === 输入.resourceKey);
  const 当前时间 = Date.now();
  const 收藏: FavoriteItem = 已有收藏
    ? {
        ...已有收藏,
        sourcePath: 输入.sourcePath,
        sourceType: 输入.sourceType,
        title: 输入.title,
        note: 输入.note ?? 已有收藏.note ?? "",
        tags: 修正标签列表(输入.tags ?? 已有收藏.tags),
        updatedAt: 当前时间,
      }
    : {
        ...输入,
        note: 输入.note ?? "",
        tags: 修正标签列表(输入.tags),
        addedAt: 当前时间,
        updatedAt: 当前时间,
      };

  数据.favorites = [
    收藏,
    ...数据.favorites.filter((项目) => 项目.resourceKey !== 输入.resourceKey),
  ];
  await 保存应用数据(数据);
  return 收藏;
}

export async function 移除收藏(resourceKey: string): Promise<void> {
  const 数据 = await 读取应用数据();
  数据.favorites = 数据.favorites.filter((项目) => 项目.resourceKey !== resourceKey);
  await 保存应用数据(数据);
}

export async function 更新收藏整理信息(resourceKey: string, 输入: 整理信息输入): Promise<FavoriteItem> {
  const 数据 = await 读取应用数据();
  const 收藏 = 数据.favorites.find((项目) => 项目.resourceKey === resourceKey);
  if (!收藏) throw new Error("FAVORITE_NOT_FOUND");

  const 整理信息 = 修正整理信息(输入);
  const 更新后收藏: FavoriteItem = {
    ...收藏,
    note: 整理信息.note,
    tags: 整理信息.tags,
    updatedAt: Date.now(),
  };
  数据.resourceMeta[resourceKey] = {
    resourceKey,
    sourcePath: 收藏.sourcePath,
    sourceType: 收藏.sourceType,
    title: 收藏.title,
    note: 整理信息.note,
    tags: 整理信息.tags,
    updatedAt: 更新后收藏.updatedAt,
  };
  数据.favorites = [
    更新后收藏,
    ...数据.favorites.filter((项目) => 项目.resourceKey !== resourceKey),
  ];
  await 保存应用数据(数据);
  return 更新后收藏;
}

export async function 更新资源整理信息(输入: ResourceMetaInput): Promise<ResourceMetaItem> {
  const 数据 = await 读取应用数据();
  if (!资源类型选项.has(输入.sourceType)) throw new Error("INVALID_RESOURCE_META_TYPE");
  const 整理信息 = 修正整理信息(输入);
  const 当前时间 = Date.now();
  const 元数据: ResourceMetaItem = {
    resourceKey: 输入.resourceKey,
    sourcePath: 输入.sourcePath,
    sourceType: 输入.sourceType,
    title: 输入.title,
    note: 整理信息.note,
    tags: 整理信息.tags,
    updatedAt: 当前时间,
  };
  数据.resourceMeta[输入.resourceKey] = 元数据;

  const 收藏 = 数据.favorites.find((项目) => 项目.resourceKey === 输入.resourceKey);
  if (收藏) {
    数据.favorites = [
      {
        ...收藏,
        title: 输入.title || 收藏.title,
        sourcePath: 输入.sourcePath || 收藏.sourcePath,
        sourceType: 输入.sourceType === "folder" || 输入.sourceType === "archive"
          ? 输入.sourceType
          : 收藏.sourceType,
        note: 整理信息.note,
        tags: 整理信息.tags,
        updatedAt: 当前时间,
      },
      ...数据.favorites.filter((项目) => 项目.resourceKey !== 输入.resourceKey),
    ];
  }

  await 保存应用数据(数据);
  return 数据.resourceMeta[输入.resourceKey];
}

export async function 更新标签顺序(tags: string[]): Promise<string[]> {
  const 数据 = await 读取应用数据();
  数据.tagOrder = 合并标签顺序(tags, {
    favorites: 数据.favorites,
    bookmarks: 数据.bookmarks,
    resourceMeta: 数据.resourceMeta,
    virtualFolders: 数据.virtualFolders,
  });
  await 保存应用数据(数据);
  return 数据.tagOrder;
}

export async function 删除标签(tags: string[]): Promise<OmiComicAppData> {
  const 数据 = await 读取应用数据();
  const 删除集合 = new Set(修正标签列表(tags));
  if (删除集合.size === 0) return 数据;

  const 当前时间 = Date.now();
  const 移除标签 = (原标签: unknown): { tags: string[]; changed: boolean } => {
    const 标签列表 = 修正标签列表(原标签);
    const 更新后 = 标签列表.filter((标签) => !删除集合.has(标签));
    return { tags: 更新后, changed: 更新后.length !== 标签列表.length };
  };

  for (const [key, 元数据] of Object.entries(数据.resourceMeta)) {
    const 结果 = 移除标签(元数据.tags);
    if (结果.changed) {
      数据.resourceMeta[key] = {
        ...元数据,
        tags: 结果.tags,
        updatedAt: 当前时间,
      };
    }
  }

  数据.favorites = 数据.favorites.map((项目) => {
    const 结果 = 移除标签(项目.tags);
    return 结果.changed ? { ...项目, tags: 结果.tags, updatedAt: 当前时间 } : 项目;
  });

  数据.bookmarks = 数据.bookmarks.map((项目) => {
    const 结果 = 移除标签(项目.tags);
    return 结果.changed ? { ...项目, tags: 结果.tags, updatedAt: 当前时间 } : 项目;
  });

  数据.virtualFolders = 数据.virtualFolders.map((项目) => {
    const 结果 = 移除标签(项目.tags);
    return 结果.changed ? { ...项目, tags: 结果.tags, updatedAt: 当前时间 } : 项目;
  });

  数据.tagOrder = 数据.tagOrder.filter((标签) => !删除集合.has(标签));
  await 保存应用数据(数据);
  return 读取应用数据();
}

export async function 创建虚拟文件夹(输入: { name: string; note?: string }): Promise<VirtualFolder> {
  const 名称 = 输入.name.trim();
  if (!名称) throw new Error("INVALID_VIRTUAL_FOLDER_NAME");
  const 数据 = await 读取应用数据();
  if (数据.virtualFolders.some((项目) => 项目.name.trim() === 名称)) {
    throw new Error("VIRTUAL_FOLDER_NAME_EXISTS");
  }

  const 当前时间 = Date.now();
  const 文件夹: VirtualFolder = {
    id: 创建虚拟文件夹ID(),
    name: 名称,
    note: 读取可空文本(输入.note),
    tags: [],
    items: [],
    createdAt: 当前时间,
    updatedAt: 当前时间,
    sortIndex: 数据.virtualFolders.length,
  };
  数据.virtualFolders = [...数据.virtualFolders, 文件夹];
  await 保存应用数据(数据);
  return 文件夹;
}

export async function 更新虚拟文件夹(
  输入: { id: string; name?: string; note?: string },
): Promise<VirtualFolder> {
  const 数据 = await 读取应用数据();
  const 文件夹 = 数据.virtualFolders.find((项目) => 项目.id === 输入.id);
  if (!文件夹) throw new Error("VIRTUAL_FOLDER_NOT_FOUND");

  const 新名称 = 输入.name === undefined ? 文件夹.name : 输入.name.trim();
  if (!新名称) throw new Error("INVALID_VIRTUAL_FOLDER_NAME");
  if (数据.virtualFolders.some((项目) => 项目.id !== 输入.id && 项目.name.trim() === 新名称)) {
    throw new Error("VIRTUAL_FOLDER_NAME_EXISTS");
  }

  const 更新后文件夹: VirtualFolder = {
    ...文件夹,
    name: 新名称,
    note: 输入.note === undefined ? 文件夹.note : 读取可空文本(输入.note),
    updatedAt: Date.now(),
  };
  数据.virtualFolders = 数据.virtualFolders.map((项目) => 项目.id === 输入.id ? 更新后文件夹 : 项目);
  await 保存应用数据(数据);
  return 更新后文件夹;
}

export async function 删除虚拟文件夹(id: string): Promise<VirtualFolder[]> {
  const 数据 = await 读取应用数据();
  const 删除前数量 = 数据.virtualFolders.length;
  数据.virtualFolders = 数据.virtualFolders.filter((项目) => 项目.id !== id);
  if (数据.virtualFolders.length !== 删除前数量) await 保存应用数据(数据);
  return 数据.virtualFolders;
}

export async function 添加虚拟文件夹项目(
  folderId: string,
  items: VirtualFolderItemInput[],
): Promise<{ folder: VirtualFolder; addedCount: number; skippedCount: number }> {
  const 数据 = await 读取应用数据();
  const 文件夹 = 数据.virtualFolders.find((项目) => 项目.id === folderId);
  if (!文件夹) throw new Error("VIRTUAL_FOLDER_NOT_FOUND");

  const 已存在 = new Set(文件夹.items.map((项目) => 项目.resourceKey));
  const 当前时间 = Date.now();
  const 新项目列表: VirtualFolderItem[] = [];
  let skippedCount = 0;

  for (const 输入 of items) {
    const resourceKey = 读取字符串(输入.resourceKey);
    const sourcePath = 读取字符串(输入.sourcePath);
    const sourceType = 读取资源类型(输入.sourceType);
    const title = 读取字符串(输入.title);
    if (!resourceKey || !sourcePath || !sourceType || !title || 已存在.has(resourceKey)) {
      skippedCount += 1;
      continue;
    }
    const sortIndex = 文件夹.items.length + 新项目列表.length;
    新项目列表.push({
      id: 创建虚拟文件夹项目ID(folderId, resourceKey),
      folderId,
      resourceKey,
      sourcePath,
      sourceType,
      title,
      addedAt: 当前时间,
      sortIndex,
    });
    已存在.add(resourceKey);
  }

  const 更新后文件夹: VirtualFolder = {
    ...文件夹,
    items: [...文件夹.items, ...新项目列表],
    updatedAt: 新项目列表.length > 0 ? 当前时间 : 文件夹.updatedAt,
  };
  数据.virtualFolders = 数据.virtualFolders.map((项目) => 项目.id === folderId ? 更新后文件夹 : 项目);
  if (新项目列表.length > 0) await 保存应用数据(数据);
  return { folder: 更新后文件夹, addedCount: 新项目列表.length, skippedCount };
}

export async function 移除虚拟文件夹项目(folderId: string, resourceKey: string): Promise<VirtualFolder> {
  const 数据 = await 读取应用数据();
  const 文件夹 = 数据.virtualFolders.find((项目) => 项目.id === folderId);
  if (!文件夹) throw new Error("VIRTUAL_FOLDER_NOT_FOUND");

  const 更新后项目 = 文件夹.items.filter((项目) => 项目.resourceKey !== resourceKey);
  const 更新后文件夹: VirtualFolder = {
    ...文件夹,
    items: 更新后项目.map((项目, 索引) => ({ ...项目, sortIndex: 索引 })),
    updatedAt: 更新后项目.length === 文件夹.items.length ? 文件夹.updatedAt : Date.now(),
  };
  数据.virtualFolders = 数据.virtualFolders.map((项目) => 项目.id === folderId ? 更新后文件夹 : 项目);
  if (更新后项目.length !== 文件夹.items.length) await 保存应用数据(数据);
  return 更新后文件夹;
}

export async function 获取书签列表(): Promise<BookmarkItem[]> {
  const 数据 = await 读取应用数据();
  return 数据.bookmarks;
}

export async function 切换书签(
  输入: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt">,
): Promise<{ bookmarked: boolean; bookmark?: BookmarkItem }> {
  const 数据 = await 读取应用数据();
  const totalPages = Math.max(1, Math.floor(输入.totalPages));
  const pageIndex = Math.min(Math.max(0, Math.floor(输入.pageIndex)), totalPages - 1);
  const 已有书签 = 数据.bookmarks.find(
    (项目) => 项目.resourceKey === 输入.resourceKey && 项目.pageIndex === pageIndex,
  );

  if (已有书签) {
    数据.bookmarks = 数据.bookmarks.filter((项目) => 项目.id !== 已有书签.id);
    await 保存应用数据(数据);
    return { bookmarked: false };
  }

  const 当前时间 = Date.now();
  const 书签: BookmarkItem = {
    ...输入,
    id: 创建书签ID(输入.resourceKey, pageIndex),
    pageIndex,
    totalPages,
    note: 输入.note ?? "",
    tags: 修正标签列表(输入.tags),
    createdAt: 当前时间,
    updatedAt: 当前时间,
  };
  数据.bookmarks = [
    书签,
    ...数据.bookmarks.filter(
      (项目) => !(项目.resourceKey === 书签.resourceKey && 项目.pageIndex === 书签.pageIndex),
    ),
  ];
  await 保存应用数据(数据);
  return { bookmarked: true, bookmark: 书签 };
}

export async function 移除书签(id: string): Promise<void> {
  const 数据 = await 读取应用数据();
  数据.bookmarks = 数据.bookmarks.filter((项目) => 项目.id !== id);
  await 保存应用数据(数据);
}

export async function 更新书签整理信息(id: string, 输入: 整理信息输入): Promise<BookmarkItem> {
  const 数据 = await 读取应用数据();
  const 书签 = 数据.bookmarks.find((项目) => 项目.id === id);
  if (!书签) throw new Error("BOOKMARK_NOT_FOUND");

  const 整理信息 = 修正整理信息(输入);
  const 更新后书签: BookmarkItem = {
    ...书签,
    note: 整理信息.note,
    tags: 整理信息.tags,
    updatedAt: Date.now(),
  };
  数据.bookmarks = [
    更新后书签,
    ...数据.bookmarks.filter((项目) => 项目.id !== id),
  ];
  await 保存应用数据(数据);
  return 更新后书签;
}

export async function 当前页已书签(resourceKey: string, pageIndex: number): Promise<boolean> {
  const 数据 = await 读取应用数据();
  const 安全页码 = Math.max(0, Math.floor(pageIndex));
  return 数据.bookmarks.some((项目) => 项目.resourceKey === resourceKey && 项目.pageIndex === 安全页码);
}
