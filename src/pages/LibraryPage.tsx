import { cardDropAtPoint } from "../utils/cardDrag";
import { FontSizeControl } from "../components/FontSizeControl";
import HomeArtworkSettings from '../components/HomeArtworkSettings';
import AboutOmiComic from '../components/AboutOmiComic';
import { uiOptions, setUiLanguage, normalizeLanguage } from '../i18n';
import AppIcon from '../components/AppIcon';
import { t, tr } from '../i18n';
import ModalOverlay from '../components/ModalOverlay';
import { cancelMobileNavigation, mobileNavigate, mobileNavigationEpoch, type MobileNavigationOrigin } from '../hooks/mobileNavigation';
import { useMobileDrawerGesture } from '../hooks/mobileDrawerGesture';
import { useContinuousLibrary } from '../hooks/useContinuousLibrary';
import { useCoverQueue } from '../hooks/useMobileCoverQueue';
import BookReaderSettings from '../components/BookReaderSettings';
import { pageIdentity, resolvePageIndex } from '../../electron/shared/readerPreferences';
import { getResourceThumbnail, clearResourceThumbnailCache } from "../reader/thumbnailClient";
import ResourcePlaceholder from "../components/ResourcePlaceholder";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import ArrowIcon from "../ArrowIcon";
import { isAndroid, singleTapNavigation } from "../platform";
import useMobileLayout from "../hooks/useMobileLayout";
import MobileLibraryBar from "../components/MobileLibraryBar";
import MobileIcon from "../components/MobileIcon";
import MobileSettings from "../components/MobileSettings";
import RenameBookmarkDialog from "../components/RenameBookmarkDialog";
import { consumeDismissGesture } from "../hooks/consumeDismissGesture";
import MobileLibraryDrawer, { clearMobileTreeCache } from "../components/MobileLibraryDrawer";
import MobileSheet, { dismissMobileSheet } from "../components/MobileSheet";
import MobileReorderList from "../components/MobileReorderList";
import MobileResourceCard from "../components/MobileResourceCard";
import MobileBookshelfCard from "../components/MobileBookshelfCard";
import MobileActionBar, { type MobileAction } from "../components/MobileActionBar";
import { useRandomBrowse } from '../hooks/useRandomBrowse';
import { useLibraryQuery } from '../hooks/useLibraryQuery';
import { useLibraryCatalog, observeLibraryDirectory, excludeLibraryCatalogPaths, invalidateLibraryCatalog } from '../library/libraryCatalog';
import LibraryPageIcon from '../components/LibraryPageIcon';
import { useResponsiveLibrary } from '../hooks/useResponsiveLibrary';
import RandomRefreshIcon from '../components/RandomRefreshIcon';
import RandomBrowseToggle from '../components/RandomBrowseToggle';
import { matchesMobileSearch } from "../library/mobileSearch";
import { getMobileDisplay, mobileDisplayScope, mobileDisplayLabels, patchMobileDisplay } from "../library/mobileDisplay";
import MobilePagePager, { MobileDetailPager } from "../components/MobilePagePager";
import MobileDetailMetadata from "../components/MobileDetailMetadata";
import LocalFileDialog, { type LocalFileTarget } from "../components/LocalFileDialog";
import 资源详情缩略图 from "../components/DetailPagePreview";
import { useBoundedRecord } from "../hooks/useBoundedRecord";
import { useDetailPreviewWheel } from "../hooks/useDetailPreviewWheel";
import { useCardScaleWheel } from "../hooks/useCardScaleWheel";
import CardScaleControl, { 规范卡片缩放, 相邻卡片缩放, 获取卡片列数, type CardScaleMotion } from "../components/CardScaleControl";
import GlassSelect from "../GlassSelect";
import type { GlassSelectOption } from "../GlassSelect";
import type { OmiBrandOriginGetter } from "../OmiBrandIcon";
import OmiPageBrand from "../components/OmiPageBrand";
import { 应用主题配色, 主题选项, applyDesktopTypography } from "../theme";
import type {
  AppSettings,
  Bookshelf,
  BookmarkItem,
  FavoriteItem,
  LibraryRoot,
  OmiComicAppData,
  RecentOpenedItem,
  ReadingProgress,
  ResourceMetaInput,
  ResourceMetaItem,
  VirtualFolder,
  VirtualFolderItem,
  VirtualFolderItemInput,
  文件条目,
  目录结果,
  进度条粗细,
  进度文本模式,
  主题配色,
  每页数量,
  双页阅读方向,
  沉浸自动隐藏延迟,
  整理侧边栏透明度,
  图书切换按钮透明度,
  书架备注悬停延迟,
  最近打开记录上限,
  排序方式,
  资源类型,
  阅读打开上下文,
  阅读相邻资源项,
  阅读器页模式,
  阅读器缩放模式,
  阅读流向,
  阅读页面项,
  阅读资源结果,
  资源路径状态,
  批量删除确认设置,
  整理信息输入,
} from "../types";

interface LibraryPageProps {
  initialData?: OmiComicAppData;
  onReady?: () => void;
  onOpenReader: (
    resource: 阅读资源结果,
    initialPageIndex: number,
    context?: 阅读打开上下文,
    transitionOrigin?: OmiBrandOriginGetter,
    motionEpoch?: number,
  ) => void | Promise<void>;
  onHome: () => void;
  refreshToken: number;
  isActive: boolean;
  backgroundPaused?: boolean;
}

interface 历史条目 {
  path: string;
  rootPath: string;
}

interface 历史状态 {
  entries: 历史条目[];
  index: number;
}

type 历史操作 = "push" | "none";
type 缩略图加载状态 = "idle" | "loading" | "loaded" | "error";
type 资源库视图 = "directory" | "bookshelf" | "recent" | "favorites" | "bookmarks" | "virtual-folder";
type ReadingDisplayState = "unread" | "started" | "completed";
type 管理视图 = "recent" | "favorites" | "bookmarks" | "virtual-folder";
type 整理空白菜单视图 = Exclude<管理视图, "virtual-folder">;
type 选择视图 = Exclude<资源库视图, "bookshelf">;
type 收藏输入 = Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex">;

type 右侧抽屉 = "settings" | "tag-filter" | null;
type 设置分类 = "appearance" | "library" | "progress" | "safety" | "reader-default" | "reader" | "performance" | "about";

const 设置分类选项: Array<{ id: 设置分类; label: string; description: string }> = [
  { id: "appearance", label: "外观与主题", description: "界面配色与主题预览" },
  { id: "library", label: "资源库", description: "卡片、排序、记录与标签检索" },
  { id: "progress", label: "进度显示", description: "卡片进度条与页数信息" },
  { id: "reader-default", label: "默认阅读", description: "新书首次打开时的阅读方式" },
  { id: "reader", label: "漫画阅读设置", description: "页面排序、自动阅读与工具栏" },
  { id: "performance", label: "性能与缓存", description: "内存缓存、预加载与并发" },
  { id: "safety", label: "安全与确认", description: "删除软件记录前的确认选项" },
  { id: "about", label: "关于 OmiComic", description: "版本、介绍与操作说明" },
];

type 资源信息目标 =
  | { kind: "resource"; input: ResourceMetaInput; fileType: 资源类型; localPath?: string; progressText?: string | null; thumbnailUrl?: string | null }
  | { kind: "bookmark"; item: BookmarkItem; fileType: 资源类型; thumbnailUrl?: string | null };

interface 手机资源操作目标 {
  view: 选择视图; key: string; input: ResourceMetaInput; info: 资源信息目标 | null;
}

interface 缩略图状态 {
  byteSize?: number;
  itemCount?: number;
  childFolderCount?: number;
  folderSummary?: { folders: number; books: number; images: number; unsupported: number };
  sourceVersion?: string;
  retryAfter?: number;
  status: 缩略图加载状态;
  url: string | null;
}

interface 可阅读页数状态 {
  status: "loading" | "loaded" | "error";
  count: number | null;
  sourceVersion?: string;
}

interface 卡片进度显示状态 {
  文本: string | null;
  进度百分比: number;
  显示胶囊: boolean;
  显示进度条: boolean;
  已完成: boolean;
  状态: ReadingDisplayState;
}

type 搜索匹配模式 = "fuzzy" | "exact";

interface PreviewTagRowProps {
  tags: string[];
  tagKey: string;
  onMoreClick: (事件: ReactMouseEvent<HTMLElement>, key: string, 标签列表: string[]) => void;
}

type 虚拟文件夹弹窗状态 =
  | { mode: "create"; items?: VirtualFolderItemInput[]; bookshelfId?: string }
  | { mode: "rename" | "note"; folder: VirtualFolder }
  | null;

type 移动到书架目标 = {
  action: "move" | "copy";
  fromFolderId: string;
  items: VirtualFolderItemInput[];
  resourceKeys: string[];
  title: string;
  anchor?: { x: number; y: number };
} | null;

type 清空书架确认状态 = { folder: VirtualFolder } | null;
type 清空无效资源确认状态 = { folder: VirtualFolder; resourceKeys: string[] } | null;
type 全局清空无效资源确认状态 = { sourcePaths: string[]; resourceKeys: string[]; count: number } | null;
type 框选状态 = {
  view: 选择视图;
  container: HTMLDivElement;
  scrollLeft: number;
  scrollTop: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseKeys: string[];
} | null;

type 侧栏浏览项 =
  | { key: string; kind: "bookshelf"; bookshelf: Bookshelf }
  | { key: "favorites"; kind: "favorites" }
  | { key: "bookmarks"; kind: "bookmarks" };

type 侧栏拖拽落点 = { key: string; position: "before" | "after" } | null;
type 卡片拖拽落点 = { key: string; position: "before" | "after" } | null;
type 中键拖拽悬浮卡片 =
  | {
      kind: "resource";
      title: string;
      subtitle: string;
      icon: ReturnType<typeof ResourcePlaceholder>;
      typeLabel: string;
      thumbnailUrl: string | null;
      x: number;
      y: number;
    }
  | {
      kind: "folder";
      title: string;
      subtitle: string;
      thumbnailUrl: string | null;
      x: number;
      y: number;
    }
  | null;

type 加入书架目标组 = {
  bookshelf: Bookshelf;
  folders: VirtualFolder[];
  total: number;
};

type 书架转存目标组 = 加入书架目标组;

type 侧栏图标名称 = "library" | "bookshelf" | "favorite" | "bookmark" | "recent" | "settings";

function SidebarIcon({name}:{name:侧栏图标名称}) {
  const names = {library:'library',bookshelf:'shelf',favorite:'heart',bookmark:'bookmark',recent:'history',settings:'settings'} as const;
  return <AppIcon name={names[name]} className="sidebar-nav-icon"/>;
}

interface 阅读返回定位快照 {
  view: 资源库视图;
  page: number;
  scrollTop: number;
  currentBookshelfId: string | null;
  currentVirtualFolderId: string | null;
}

function 获取书架转存目标列表(文件夹列表: VirtualFolder[], fromFolderId: string): VirtualFolder[] {
  const 来源文件夹 = 文件夹列表.find((文件夹) => 文件夹.id === fromFolderId);
  const 已使用名称 = new Set<string>();
  if (来源文件夹) 已使用名称.add(来源文件夹.name.trim().toLocaleLowerCase("zh-CN"));

  const 目标列表: VirtualFolder[] = [];
  for (const 文件夹 of 文件夹列表) {
    if (文件夹.id === fromFolderId) continue;
    const 名称Key = 文件夹.name.trim().toLocaleLowerCase("zh-CN");
    if (已使用名称.has(名称Key)) continue;
    已使用名称.add(名称Key);
    目标列表.push(文件夹);
  }
  return 目标列表;
}

function 获取书架侧栏Key(id: string): string {
  return `bookshelf:${id}`;
}

function 从书架侧栏Key读取ID(key: string): string | null {
  return key.startsWith("bookshelf:") ? key.slice("bookshelf:".length) : null;
}

function 生成默认书架栏名称(书架列表: Bookshelf[]): string {
  const 已用名称 = new Set(书架列表.map((书架) => 书架.name.trim()).filter(Boolean));
  if (!已用名称.has("书架栏")) return "书架栏";
  let 序号 = 1;
  while (已用名称.has(`书架栏${序号}`)) 序号 += 1;
  return `书架栏${序号}`;
}

function 数组内容相同(左侧: string[], 右侧: string[]): boolean {
  if (左侧.length !== 右侧.length) return false;
  return 左侧.every((项目, 索引) => 项目 === 右侧[索引]);
}

function 获取书架目标加入状态(文件夹: VirtualFolder, items: VirtualFolderItemInput[]): "none" | "partial" | "all" {
  if (items.length === 0) return "none";
  const 已有资源 = new Set(文件夹.items.map((项目) => 项目.resourceKey));
  const 已有数量 = items.filter((项目) => 已有资源.has(项目.resourceKey)).length;
  if (已有数量 === 0) return "none";
  return 已有数量 === items.length ? "all" : "partial";
}

const 每页数量选项: 每页数量[] = [50, 100, 150, 200, 500];
const 图书切换按钮透明度选项: 图书切换按钮透明度[] = [20, 30, 40, 50, 60, 70, 80];
const 整理侧边栏透明度选项: 整理侧边栏透明度[] = [100, 90, 80, 70];
const 书架备注悬停延迟选项: 书架备注悬停延迟[] = [0, 500, 1000, 1500, 2000];
const 最近打开记录上限选项: 最近打开记录上限[] = [50, 100, 150, 200];
const 每页数量下拉选项: readonly GlassSelectOption<每页数量>[] = 每页数量选项.map((数量) => ({ value: 数量, label: String(数量) }));
const 最近打开上限下拉选项: readonly GlassSelectOption<最近打开记录上限>[] = 最近打开记录上限选项.map((数量) => ({ value: 数量, label: String(数量) }));
const 整理透明度下拉选项: readonly GlassSelectOption<整理侧边栏透明度>[] = 整理侧边栏透明度选项.map((透明度) => ({ value: 透明度, label: `${透明度}%` }));
const 备注悬停延迟下拉选项: readonly GlassSelectOption<书架备注悬停延迟>[] = 书架备注悬停延迟选项.map((延迟) => ({ value: 延迟, label: 延迟 === 0 ? "立即显示" : `${延迟 / 1000} 秒` }));
const 搜索模式下拉选项: readonly GlassSelectOption<搜索匹配模式>[] = [
  { value: "fuzzy", label: "任一条件" },
  { value: "exact", label: "全部条件" },
];
const 进度文本模式下拉选项: readonly GlassSelectOption<进度文本模式>[] = [
  { value: "page", label: "页数" },
  { value: "percent", label: "百分比" },
];
const 进度条粗细下拉选项: readonly GlassSelectOption<进度条粗细>[] = [
  { value: "thin", label: "细" },
  { value: "normal", label: "标准" },
  { value: "thick", label: "粗" },
];
const 阅读流向下拉选项: readonly GlassSelectOption<阅读流向>[] = [
  { value: "horizontal", label: "左右阅读" },
  { value: "vertical", label: "上下阅读" },
];
const 阅读页模式下拉选项: readonly GlassSelectOption<阅读器页模式>[] = [
  { value: "single", label: "单页" },
  { value: "double", label: "双页" },
];
const 翻页方向下拉选项: readonly GlassSelectOption<双页阅读方向>[] = [
  { value: "left-to-right", label: "从左到右" },
  { value: "right-to-left", label: "从右到左" },
];
const 缩放模式下拉选项: readonly GlassSelectOption<阅读器缩放模式>[] = [
  { value: "fit-window", label: "适应窗口" },
  { value: "fit-height", label: "适应高度" },
  { value: "fit-width", label: "适应宽度" },
  { value: "original", label: "原始尺寸" },
];
const 沉浸隐藏延迟下拉选项: readonly GlassSelectOption<沉浸自动隐藏延迟>[] = [500, 1000, 1500, 2000, 2500, 3000].map((延迟) => ({ value: 延迟 as 沉浸自动隐藏延迟, label: `${延迟 / 1000} 秒` }));
const 图书按钮透明度下拉选项: readonly GlassSelectOption<图书切换按钮透明度>[] = 图书切换按钮透明度选项.map((透明度) => ({ value: 透明度, label: `${透明度}%` }));
const 排序方式选项: readonly GlassSelectOption<排序方式>[] = [
  { value: "name-asc", label: "名称升序" },
  { value: "name-desc", label: "名称降序" },
  { value: "time-asc", label: "修改时间升序" },
  { value: "time-desc", label: "修改时间降序" },
  { value: "type", label: "类型" },
];
const 文件名排序器 = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const 常用拼音首字母: Record<string, string> = {
  小: "x",
  春: "c",
  色: "s",
  捏: "n",
  魔: "m",
  法: "f",
  少: "s",
  女: "n",
  想: "x",
  重: "c",
  看: "k",
  作: "z",
  画: "h",
  参: "c",
  考: "k",
  剧: "j",
  情: "q",
  甜: "t",
  糖: "t",
  搞: "g",
  笑: "x",
  纯: "c",
  爱: "a",
  校: "x",
  园: "y",
  奇: "q",
  幻: "h",
  战: "z",
  斗: "d",
  服: "f",
  装: "z",
  设: "s",
  定: "d",
  分: "f",
  镜: "j",
  表: "b",
  线: "x",
  稿: "g",
};

const 常用拼音全拼: Record<string, string> = {
  小: "xiao",
  春: "chun",
  色: "se",
  捏: "nie",
  魔: "mo",
  法: "fa",
  少: "shao",
  女: "nv",
  想: "xiang",
  重: "chong",
  看: "kan",
  作: "zuo",
  画: "hua",
  参: "can",
  考: "kao",
  剧: "ju",
  情: "qing",
  甜: "tian",
  糖: "tang",
  搞: "gao",
  笑: "xiao",
  纯: "chun",
  爱: "ai",
  校: "xiao",
  园: "yuan",
  奇: "qi",
  幻: "huan",
  战: "zhan",
  斗: "dou",
  服: "fu",
  装: "zhuang",
  设: "she",
  定: "ding",
  分: "fen",
  镜: "jing",
  表: "biao",
  线: "xian",
  稿: "gao",
  夸: "kua",
  虾: "xia",
  奶: "nai",
  油: "you",
  泡: "pao",
  芙: "fu",
  彩: "cai",
  仓: "cang",
  库: "ku",
  汉: "han",
  化: "hua",
  可: "ke",
  萌: "meng",
};
const 默认设置: AppSettings = {
  colorTheme: "mist",
  cardSize: "medium",
  cardScale: 100,
  detailThumbnailScale: 100,
  pageSize: 50,
  sortMode: "name-asc",
  sortDirection: "asc",
  folderFirst: true,
  hideBookshelfItemsInLibrary: true,
  showProgressBar: true,
  showProgressText: true,
  progressTextMode: "page",
  progressBarThickness: "normal",
  readerDefaultFitMode: "fit-window",
  readerDefaultFlow: "horizontal",
  readerDefaultPanorama: false,
  readerDefaultImmersive: false,
  readerPageMode: "single",
  doublePageFirstSingle: false,
  doublePageDirection: "left-to-right",
  smartDetectSpreadPage: true,
  wheelPageTurn: true,
  immersiveAutoHide: false,
  immersiveAutoHideDelay: 3000,
  readerHideFooterControls: false,
  readerHideImmersiveProgress: false,
  readerMemoryCacheSizeMb: 200,
  readerPreloadPages: 5,
  readerImageLoadConcurrency: 4,
  bookSwitchButtonOpacity: 40,
  organizeDrawerOpacity: 90,
  bookshelfNoteHoverDelayMs: 1000,
  recentOpenedLimit: 50,
  tagSearchMode: "fuzzy",
  confirmBeforeDeleteTags: true,
  confirmBeforeBatchDelete: {
    favorites: true,
    bookmarks: true,
    recent: true,
  },
};
const 类型顺序: Record<资源类型, number> = {
  folder: 0,
  image: 1,
  archive: 2,
  pdf: 3,
  epub: 4,
  unknown: 5,
};

const 类型信息: Record<资源类型, { label: string; icon: ReturnType<typeof ResourcePlaceholder> }> = {
  folder: { label: "文件夹", icon: <ResourcePlaceholder type="folder" /> },
  image: { label: "图片", icon: <ResourcePlaceholder type="image" /> },
  archive: { label: "压缩包", icon: <ResourcePlaceholder type="archive" /> },
  pdf: { label: "PDF", icon: <ResourcePlaceholder type="pdf" /> },
  epub: { label: "EPUB", icon: <ResourcePlaceholder type="epub" /> },
  unknown: { label: "未知文件", icon: <ResourcePlaceholder type="unknown" /> },
};

function 获取目录名称(目录路径: string): string {
  const 片段 = 目录路径.split(/[\\/]/).filter(Boolean);
  return 片段.at(-1) ?? 目录路径;
}

function 格式化大小(字节数?: number): string {
  if (字节数 === undefined) return "大小未知";
  if (字节数 < 1024) return `${字节数} B`;
  if (字节数 < 1024 ** 2) return `${(字节数 / 1024).toFixed(1)} KB`;
  if (字节数 < 1024 ** 3) return `${(字节数 / 1024 ** 2).toFixed(1)} MB`;
  return `${(字节数 / 1024 ** 3).toFixed(1)} GB`;
}

function 格式化日期时间(时间戳: number): string {
  if (!Number.isFinite(时间戳)) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(时间戳));
}

function 支持真实缩略图(类型: 资源类型): boolean {
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive" || 类型 === "pdf" || 类型 === "epub";
}

function 获取父目录路径(文件路径: string): string {
  const 位置 = Math.max(文件路径.lastIndexOf("\\"), 文件路径.lastIndexOf("/"));
  return 位置 > 0 ? 文件路径.slice(0, 位置) : 文件路径;
}

function 获取文件扩展名(文件路径: string): string {
  const 文件名 = 文件路径.split(/[\\/]/).at(-1) ?? 文件路径;
  const 位置 = 文件名.lastIndexOf(".");
  return 位置 >= 0 ? 文件名.slice(位置 + 1).toLowerCase() : "";
}

function 获取文件资源Key(文件: 文件条目): string | null {
  if (文件.type === "folder") return `folder:${文件.path}`;
  if (文件.type === "image") return `folder:${获取父目录路径(文件.path)}`;
  if (文件.type === "archive") return `archive:${文件.path}`;
  if (文件.type === "pdf") return `pdf:${文件.path}`;
  if (文件.type === "epub") return `epub:${文件.path}`;
  if (文件.type === "unknown") return `file:${文件.path}`;
  return null;
}

function 支持收藏(类型: 资源类型): boolean {
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive" || 类型 === "pdf" || 类型 === "epub";
}

function 获取文件收藏输入(文件: 文件条目): Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex"> | null {
  if (!支持收藏(文件.type)) return null;
  const resourceKey = 获取文件资源Key(文件);
  if (!resourceKey) return null;
  const sourceType = 文件.type === "pdf" || 文件.type === "epub" || 文件.type === "archive" ? 文件.type : "folder";

  return {
    resourceKey,
    sourcePath: 文件.type === "image" ? 获取父目录路径(文件.path) : 文件.path,
    sourceType,
    title: 文件.type === "image" ? 获取目录名称(获取父目录路径(文件.path)) : 文件.name,
  };
}

function 获取文件资源元数据输入(文件: 文件条目): ResourceMetaInput | null {
  const resourceKey = 获取文件资源Key(文件);
  if (!resourceKey) return null;
  const 是图片 = 文件.type === "image";
  const sourcePath = 是图片 ? 获取父目录路径(文件.path) : 文件.path;
  return {
    resourceKey,
    sourcePath,
    sourceType: 文件.type,
    title: 是图片 ? 获取目录名称(sourcePath) : 文件.name,
  };
}

function 转为虚拟文件夹项目输入(输入: ResourceMetaInput): VirtualFolderItemInput {
  return {
    resourceKey: 输入.resourceKey,
    sourcePath: 输入.sourcePath,
    sourceType: 输入.sourceType === "image" && 输入.resourceKey.startsWith("folder:")
      ? "folder"
      : 输入.sourceType,
    title: 输入.title,
  };
}

function 规范化标签列表(输入: string[] | undefined): string[] {
  if (!输入) return [];
  const 已加入 = new Set<string>();
  const 标签列表: string[] = [];
  for (const 原标签 of 输入) {
    const 标签 = 原标签.trim();
    if (!标签 || 已加入.has(标签)) continue;
    标签列表.push(标签);
    已加入.add(标签);
  }
  return 标签列表;
}

function PreviewTagRow({ tags, tagKey, onMoreClick }: PreviewTagRowProps) {
  const 标签列表 = useMemo(() => 规范化标签列表(tags), [tags]);
  const 行容器 = useRef<HTMLSpanElement>(null);
  const 测量容器 = useRef<HTMLSpanElement>(null);
  const [可见数量, 设置可见数量] = useState(标签列表.length);

  useLayoutEffect(() => {
    let 测量定时器: number | null = null;

    const 更新可见数量 = (): void => {
      const 行 = 行容器.current;
      const 测量 = 测量容器.current;
      if (!行 || !测量) return;

      const 行样式 = window.getComputedStyle(行);
      const 行宽 = 行.clientWidth - parseFloat(行样式.paddingLeft) - parseFloat(行样式.paddingRight);
      if (行宽 <= 0) return;

      const 标签节点 = Array.from(测量.querySelectorAll<HTMLElement>("[data-preview-tag-measure='tag']"));
      const 更多节点 = 测量.querySelector<HTMLElement>("[data-preview-tag-measure='more']");
      const 间距 = parseFloat(行样式.columnGap) || 0;
      const 更多宽度 = 更多节点?.getBoundingClientRect().width ?? 32;

      const 计算可放数量 = (保留更多: boolean): number => {
        let 当前行宽 = 0;
        let 数量 = 0;

        for (const 标签节点项 of 标签节点) {
          const 标签宽度 = Math.min(标签节点项.getBoundingClientRect().width, 行宽);
          const 追加后宽度 = 当前行宽 === 0 ? 标签宽度 : 当前行宽 + 间距 + 标签宽度;
          if (追加后宽度 + (保留更多 ? 间距 + 更多宽度 : 0) > 行宽) break;
          当前行宽 = 追加后宽度;
          数量 += 1;
        }

        return 数量;
      };

      const 全部可见数量 = 计算可放数量(false);
      const 下一数量 = 全部可见数量 >= 标签列表.length
        ? 标签列表.length
        : Math.max(行宽 - 更多宽度 - 间距 >= 28 ? 1 : 0, Math.min(标签列表.length - 1, 计算可放数量(true)));
      设置可见数量((当前数量) => 当前数量 === 下一数量 ? 当前数量 : 下一数量);
    };

    const 安排更新可见数量 = (): void => {
      if (测量定时器 !== null) window.clearTimeout(测量定时器);
      测量定时器 = window.setTimeout(() => {
        测量定时器 = null;
        更新可见数量();
      }, 90);
    };

    更新可见数量();

    const 观察器 = new ResizeObserver(安排更新可见数量);
    if (行容器.current) 观察器.observe(行容器.current);
    return () => {
      if (测量定时器 !== null) window.clearTimeout(测量定时器);
      观察器.disconnect();
    };
  }, [标签列表]);

  if (标签列表.length === 0) return null;

  const 有更多 = 可见数量 < 标签列表.length;
  const 显示标签 = 标签列表.slice(0, 可见数量);
  const 隐藏标签 = 标签列表.slice(可见数量);

  return (
    <span className="preview-tag-row" aria-label={t("标签")} ref={行容器}>
      {显示标签.map((标签) => (
        <span className="preview-tag-chip" title={标签} key={标签}>{标签}</span>
      ))}
      {有更多 && (
        <span
          role="button"
          tabIndex={0}
          className="preview-tag-chip preview-tag-more"
          aria-label={tr`显示其余 ${隐藏标签.length} 个标签`}
          aria-haspopup="dialog"
          title={tr`另有 ${隐藏标签.length} 个标签`}
          onClick={(事件) => onMoreClick(事件, tagKey, 隐藏标签)}
          onDoubleClick={(事件) => 事件.stopPropagation()}
          onKeyDown={(事件) => {
            if (事件.key !== "Enter" && 事件.key !== " ") return;
            事件.preventDefault();
            事件.stopPropagation();
            事件.currentTarget.click();
          }}
        >
          +{隐藏标签.length}
        </span>
      )}
      <span className="preview-tag-measure" aria-hidden="true" ref={测量容器}>
        {标签列表.map((标签) => (
          <span className="preview-tag-chip" data-preview-tag-measure="tag" key={标签}>{标签}</span>
        ))}
        <span className="preview-tag-chip preview-tag-more" data-preview-tag-measure="more">+{标签列表.length}</span>
      </span>
    </span>
  );
}

function 解析标签输入(输入: string): string[] {
  return 规范化标签列表(输入.split(/[，,\s]+/));
}

function 获取整理备注(项目: Pick<FavoriteItem | BookmarkItem, "note">): string {
  return (项目.note ?? "").trim();
}

function 获取整理标签(项目: Pick<FavoriteItem | BookmarkItem, "tags">): string[] {
  return 规范化标签列表(项目.tags);
}


function 获取标签筛选选项(项目列表: Array<Pick<FavoriteItem | BookmarkItem, "tags">>): string[] {
  const 标签集合 = new Set<string>();
  for (const 项目 of 项目列表) {
    for (const 标签 of 获取整理标签(项目)) 标签集合.add(标签);
  }
  return Array.from(标签集合).sort((左侧, 右侧) => 文件名排序器.compare(左侧, 右侧));
}

function 获取标签匹配文本(标签: string): string {
  return 标签
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("zh-CN");
}

function 标签匹配查询(标签: string, 查询: string): boolean {
  const 修正查询 = 获取标签匹配文本(查询.trim());
  if (!修正查询) return false;
  const 标签文本 = 获取标签匹配文本(标签);
  const 简化拼音 = Array.from(标签).map((字符) => 常用拼音首字母[字符] ?? "").join("");
  const 全拼片段列表 = Array.from(标签).map((字符) => 常用拼音全拼[字符] ?? "");
  const 全拼文本 = 全拼片段列表.join("");
  const ASCII片段 = 标签文本.replace(/[^a-z0-9]+/g, "");
  const 首字母片段 = 标签文本
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((片段) => 片段[0])
    .join("");
  const 是英文查询 = /^[a-z0-9]+$/.test(修正查询);
  if (!是英文查询) return 标签文本.includes(修正查询);
  if (修正查询.length === 1) {
    return ASCII片段.startsWith(修正查询)
      || 首字母片段.startsWith(修正查询)
      || 简化拼音.startsWith(修正查询)
      || 全拼文本.startsWith(修正查询);
  }
  return ASCII片段.includes(修正查询)
    || 首字母片段.includes(修正查询)
    || 简化拼音.includes(修正查询)
    || 全拼文本.includes(修正查询)
    || 全拼片段列表.some((片段) => 片段.includes(修正查询));
}

function 获取当前标签查询片段(输入: string): string {
  const 分隔位置 = Math.max(输入.lastIndexOf(","), 输入.lastIndexOf("，"));
  return (分隔位置 >= 0 ? 输入.slice(分隔位置 + 1) : 输入).trim();
}

function 替换当前标签查询片段(输入: string, 标签: string): string {
  const 分隔位置 = Math.max(输入.lastIndexOf(","), 输入.lastIndexOf("，"));
  if (分隔位置 < 0) return 标签;
  return `${输入.slice(0, 分隔位置 + 1).replace(/\s*$/, "")}${标签}`;
}

function 获取标签查询列表(输入: string): string[] {
  return 输入.includes(",") || 输入.includes("，") ? 解析标签输入(输入) : 规范化标签列表([输入]);
}

function 标签匹配查询模式(标签: string, 查询: string, 模式: 搜索匹配模式): boolean {
  const 修正查询 = 查询.trim();
  if (!修正查询) return false;
  return 模式 === "exact" ? 标签 === 修正查询 : 标签匹配查询(标签, 修正查询);
}

function 获取标签建议(输入: string, 全部标签: string[], 模式: 搜索匹配模式): string[] {
  const 查询 = 获取当前标签查询片段(输入);
  if (!查询) return [];
  if (全部标签.includes(查询)) return [];
  return 全部标签.filter((标签) => 标签匹配查询模式(标签, 查询, 模式)).slice(0, 8);
}

function 筛选标签列表(输入: string, 全部标签: string[], 模式: 搜索匹配模式): string[] {
  const 查询列表 = 获取标签查询列表(输入);
  if (查询列表.length === 0) return 全部标签;
  return 全部标签.filter((标签) => 查询列表.some((查询) => 标签匹配查询模式(标签, 查询, 模式)));
}

function 资源标签匹配筛选模式(
  资源标签: string[],
  筛选标签: string[],
  模式: 搜索匹配模式,
): boolean {
  if (筛选标签.length === 0) return true;
  if (模式 === "exact") return 筛选标签.every((标签) => 资源标签.includes(标签));
  return 筛选标签.some((查询) => 资源标签.some((标签) => 标签匹配查询(标签, 查询)));
}


function 获取可阅读页数Key(文件: 文件条目): string | null {
  return 获取文件资源Key(文件) ?? null;
}

function 支持可阅读页数统计(类型: 资源类型): boolean {
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive" || 类型 === "pdf" || 类型 === "epub";
}

function 可作为阅读资源(类型: 资源类型): boolean {
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive" || 类型 === "pdf" || 类型 === "epub";
}

function 获取文件阅读类型(文件: 文件条目): "folder" | "image" | "archive" | "pdf" | "epub" | null {
  if (文件.type === "folder" || 文件.type === "image" || 文件.type === "archive" || 文件.type === "pdf" || 文件.type === "epub") return 文件.type;
  return null;
}

function 限制数值(数值: number, 最小值: number, 最大值: number): number {
  return Math.min(Math.max(数值, 最小值), 最大值);
}

function 获取卡片进度显示状态(
  进度: ReadingProgress | null,
  可阅读页数: number | null,
  文本模式: 进度文本模式,
  允许显示进度条: boolean,
): 卡片进度显示状态 {
  const 进度总页数 = Math.max(0, Math.floor(进度?.totalPages ?? 0));
  const 元数据总页数 = Math.max(0, Math.floor(可阅读页数 ?? 0));
  const 总页数 = 进度总页数 > 0 ? 进度总页数 : 元数据总页数;
  if (总页数 <= 0) {
    return {
      文本: null,
      进度百分比: 0,
      显示胶囊: false,
      显示进度条: false,
      已完成: false,
      状态: "unread",
    };
  }

  if (!进度) {
    return {
      文本: 文本模式 === "percent" ? "0%" : String(总页数),
      进度百分比: 0,
      显示胶囊: true,
      显示进度条: false,
      已完成: false,
      状态: "unread",
    };
  }

  const 当前页索引 = 限制数值(Math.floor(进度.currentPageIndex), 0, 总页数 - 1);
  const 已完成 = 当前页索引 >= 总页数 - 1;
  const 已开始阅读 = Boolean(进度.hasStartedReading || 当前页索引 > 0 || 已完成);
  const 进度百分比 = 限制数值(Math.round(((当前页索引 + 1) / 总页数) * 100), 0, 100);

  if (已完成) {
    return {
      文本: 文本模式 === "percent" ? "100%" : `${总页数} / ${总页数}`,
      进度百分比: 100,
      显示胶囊: true,
      显示进度条: 允许显示进度条,
      已完成: true,
      状态: "completed",
    };
  }

  if (!已开始阅读) {
    return {
      文本: 文本模式 === "percent" ? "0%" : String(总页数),
      进度百分比: 0,
      显示胶囊: true,
      显示进度条: false,
      已完成: false,
      状态: "unread",
    };
  }

  return {
    文本: 文本模式 === "percent" ? `${进度百分比}%` : `${当前页索引 + 1} / ${总页数}`,
    进度百分比,
    显示胶囊: true,
    显示进度条: 允许显示进度条 && 当前页索引 > 0,
    已完成: false,
    状态: "started",
  };
}

function LibraryPage({ onOpenReader, onHome, refreshToken, isActive, onReady, backgroundPaused = false, initialData }: LibraryPageProps) {
  const 首次资料刷新 = useRef(initialData ? { active: isActive, refreshToken } : null);
  const [初始目录就绪, 设置初始目录就绪] = useState(false);
  useEffect(() => { if (初始目录就绪) onReady?.(); }, [初始目录就绪,onReady]);
  const 手机布局 = useMobileLayout();
  const [手机侧栏, 设置手机侧栏] = useState<"library" | "bookshelf" | null>(null);
  const [手机根目录管理, 设置手机根目录管理] = useState<LibraryRoot | null>(null);
  const [手机分类管理, 设置手机分类管理] = useState<Bookshelf | null>(null);
  const [手机书架管理, 设置手机书架管理] = useState<VirtualFolder | null>(null);
  const [手机选中书架, 设置手机选中书架] = useState<Set<string>>(new Set());
  const [手机显示选项, 设置手机显示选项] = useState(false);
  const [手机显示设置, 设置手机显示设置] = useState<Partial<AppSettings>>({});
  const [手机操作目标, 设置手机操作目标] = useState<手机资源操作目标 | null>(null);
  const [手机排序中, 设置手机排序中] = useState(false);
  const [手机设置子页, 设置手机设置子页] = useState(false);
  const [书签重命名, 设置书签重命名] = useState<BookmarkItem | null>(null);
  const [手机详情菜单, 设置手机详情菜单] = useState(false);
  const [手机书架排序, 设置手机书架排序] = useState(false);
  const [手机每页数量, 设置手机每页数量] = useState<50 | 100 | 150 | 200 | 500>(50);
  const [手机预览宽度, 设置手机预览宽度] = useState(88);
  const 手机导航区域 = useRef<HTMLElement>(null);
  function 匹配整理搜索(query: string, texts: Array<string | undefined | null>, tags: string[], mode: 搜索匹配模式): boolean {
    return matchesMobileSearch(query, texts, tags, mode, 空格分隔搜索条件);
  }
  const [手机筛选展开, 设置手机筛选展开] = useState(false);
  const [音量键翻页, 设置音量键翻页] = useState(false);
  const [反转音量键, 设置反转音量键] = useState(false);
  const [本地文件目标, 设置本地文件目标] = useState<LocalFileTarget | null>(null);
  const [移除索引数量, 设置移除索引数量] = useState(0);
  useEffect(() => {
    const back = (event: Event) => {
      if (!isActive) return;
      // Custom events dispatched directly on window run target listeners in
      // registration order. Let the sheet consume Back before navigating a folder.
      if (document.querySelector('.mobile-settings-page')) {event.preventDefault();return;}
      if (document.querySelector('.mobile-sheet-overlay') && !document.querySelector('.root-delete-overlay,.settings-window-overlay')) { event.preventDefault(); return; }
      if (书签重命名) { event.preventDefault(); return; }
      if (本地文件目标) { event.preventDefault(); return; }
      if (批量删除确认) { 设置批量删除确认(null); event.preventDefault(); return; }
      if (待删除标签列表) { if (!删除确认处理中) 设置待删除标签列表(null); event.preventDefault(); return; }
      if (待删除根目录) { if (!删除确认处理中) 设置待删除根目录(null); event.preventDefault(); return; }
      if (待删除书架) { if (!删除确认处理中) 设置待删除书架(null); event.preventDefault(); return; }
      if (待删除书架列表) { if (!删除确认处理中) 设置待删除书架列表(null); event.preventDefault(); return; }
      if (待删除虚拟文件夹) { if (!删除确认处理中) 设置待删除虚拟文件夹(null); event.preventDefault(); return; }
      if (待清空虚拟文件夹) { if (!删除确认处理中) 设置待清空虚拟文件夹(null); event.preventDefault(); return; }
      if (待清空无效资源) { if (!删除确认处理中) 设置待清空无效资源(null); event.preventDefault(); return; }
      if (待全局清空无效资源) { if (!删除确认处理中) 设置待全局清空无效资源(null); event.preventDefault(); return; }
      if (移动到书架目标) { 设置移动到书架目标(null); event.preventDefault(); return; }
      if (加入虚拟文件夹目标) { 设置加入虚拟文件夹目标(null); event.preventDefault(); return; }
      if (书架弹窗) { 设置书架弹窗(null); event.preventDefault(); return; }
      if (虚拟文件夹弹窗) { 设置虚拟文件夹弹窗(null); event.preventDefault(); return; }
      if (当前右侧抽屉 === "settings" && 手机设置子页) { 设置手机设置子页(false); event.preventDefault(); return; }
      if (当前右侧抽屉) { 设置当前右侧抽屉(null); event.preventDefault(); return; }
      if (标签添加弹窗打开) { 关闭标签添加弹窗(); event.preventDefault(); return; }
      if (资源详情路径浮层打开) { 设置资源详情路径浮层打开(false); event.preventDefault(); return; }
      if (资源信息目标 && 资源详情编辑模式) { void 完成资源详情信息编辑(); event.preventDefault(); return; }
      if (资源信息目标) { void 返回手机上一页(); event.preventDefault(); return; }
      if (选择模式) { 退出选择模式(); 设置手机操作目标(null); 设置手机排序中(false); event.preventDefault(); return; }
      if (手机操作目标) { 设置手机操作目标(null); event.preventDefault(); return; }
      if (手机书架管理 || 手机书架排序) { 设置手机书架管理(null); 设置手机书架排序(false); event.preventDefault(); return; }
      if (手机筛选展开 || 当前搜索内容) { 取消当前搜索(); event.preventDefault(); return; }
      if (正在打开资源路径 || 正在读取) { 打开阅读请求序号.current++; 读取序号.current++; 设置正在打开资源路径(null); 设置正在读取(false); event.preventDefault(); return; }
      if (当前视图 === "virtual-folder") { 返回书架根层(); event.preventDefault(); return; }
      if (当前视图 === "directory" && 当前目录?.parentPath && 当前根目录) {
        void 返回上一处(); event.preventDefault();
      }
    };
    window.addEventListener("omi-library-back",back);
    return () => window.removeEventListener("omi-library-back",back);
  });
  const [根目录列表, 设置根目录列表] = useState<LibraryRoot[]>([]);
  const [当前根目录, 设置当前根目录] = useState<string | null>(null);
  const [当前目录, 设置当前目录] = useState<目录结果 | null>(null);
  const [历史记录, 设置历史记录] = useState<历史状态>({ entries: [], index: -1 });
  const [正在读取, 设置正在读取] = useState(false);
  const [正在打开资源路径, 设置正在打开资源路径] = useState<string | null>(null);
  const 打开清单任务 = useRef<{ path: string; promise: ReturnType<typeof window.omicomic.getResourcePages> } | null>(null);
  const [错误信息, 设置错误信息] = useState<string | null>(null);
  const [成功提示, 设置成功提示] = useState<string | null>(null);
  const [搜索内容, 设置搜索内容] = useState("");
  const [最近搜索内容, 设置最近搜索内容] = useState("");
  const [收藏搜索内容, 设置收藏搜索内容] = useState("");
  const [书签搜索内容, 设置书签搜索内容] = useState("");
  const [搜索模式, 设置搜索模式] = useState<搜索匹配模式>("fuzzy");
  const [空格分隔搜索条件, 设置空格分隔搜索条件] = useState(false);
  const [主搜索建议可见, 设置主搜索建议可见] = useState(false);
  const [已选标签列表, 设置已选标签列表] = useState<string[]>([]);
  const [标签搜索内容, 设置标签搜索内容] = useState("");
  const [标签搜索建议可见, 设置标签搜索建议可见] = useState(false);
  const [当前主题配色, 设置当前主题配色] = useState<主题配色>(默认设置.colorTheme);
  const [显示主界面, 设置显示主界面] = useState(true);
  const [排序, 设置排序] = useState<排序方式>(默认设置.sortMode);
  const [卡片缩放, 设置卡片缩放] = useState(默认设置.cardScale);
  const [缩放动效, 设置缩放动效] = useState<Partial<Record<"library" | "detail", CardScaleMotion>>>({});
  const 缩略图尺寸 = 卡片缩放 <= 60 ? "small" : 卡片缩放 < 100 ? "medium" : "large";
  const [每页数量, 设置每页数量] = useState<每页数量>(默认设置.pageSize);
  const [显示进度条, 设置显示进度条] = useState(默认设置.showProgressBar);
  const [显示进度文本, 设置显示进度文本] = useState(默认设置.showProgressText);
  const [进度文本模式, 设置进度文本模式] = useState<进度文本模式>(默认设置.progressTextMode);
  const [进度条粗细, 设置进度条粗细] = useState<进度条粗细>(默认设置.progressBarThickness);
  const [文件夹优先, 设置文件夹优先] = useState(默认设置.folderFirst);
  const [隐藏已加入书架资源, 设置隐藏已加入书架资源] = useState(默认设置.hideBookshelfItemsInLibrary);
  const [阅读器默认缩放模式, 设置阅读器默认缩放模式] = useState<阅读器缩放模式>(默认设置.readerDefaultFitMode);
  const [阅读器默认流向, 设置阅读器默认流向] = useState<阅读流向>(默认设置.readerDefaultFlow);
  const [默认开启全景, 设置默认开启全景] = useState(默认设置.readerDefaultPanorama);
  const [默认开启沉浸, 设置默认开启沉浸] = useState(默认设置.readerDefaultImmersive);
  const [阅读器默认页模式, 设置阅读器默认页模式] = useState<阅读器页模式>(默认设置.readerPageMode);
  const [双页阅读方向, 设置双页阅读方向] = useState<双页阅读方向>(默认设置.doublePageDirection);
  const [智能识别跨页图, 设置智能识别跨页图] = useState(默认设置.smartDetectSpreadPage);
  const [滚轮翻页, 设置滚轮翻页] = useState(默认设置.wheelPageTurn);
  const [沉浸自动隐藏延迟, 设置沉浸自动隐藏延迟] = useState<沉浸自动隐藏延迟>(默认设置.immersiveAutoHideDelay);
  const [隐藏阅读器底部按钮, 设置隐藏阅读器底部按钮] = useState(默认设置.readerHideFooterControls);
  const [隐藏沉浸模式进度条, 设置隐藏沉浸模式进度条] = useState(默认设置.readerHideImmersiveProgress);
  const [界面语言, 设置界面语言] = useState<'zh-CN'|'en'|'ja'>('zh-CN');
  const [信息字号, 设置信息字号] = useState(12);
  const [全局字号, 设置全局字号] = useState(14);
  const [桌面自动隐藏, 设置桌面自动隐藏] = useState(false);
  const [桌面性能模式, 设置桌面性能模式] = useState<NonNullable<AppSettings['desktopPerformanceProfile']>>('auto');
  const [阅读器内存缓存大小, 设置阅读器内存缓存大小] = useState(默认设置.readerMemoryCacheSizeMb);
  const [阅读器预加载页数, 设置阅读器预加载页数] = useState(默认设置.readerPreloadPages);
  const [阅读器图片线程数, 设置阅读器图片线程数] = useState(默认设置.readerImageLoadConcurrency);
  const [图书切换按钮透明度, 设置图书切换按钮透明度] = useState<图书切换按钮透明度>(默认设置.bookSwitchButtonOpacity);
  const [当前页, 设置当前页] = useState(1);
  const [页码输入, 设置页码输入] = useState("1");
  const [正在输入页码, 设置正在输入页码] = useState(false);
  const [缩略图表, 设置缩略图表] = useBoundedRecord<缩略图状态>(512);
  const [书签预览表, 设置书签预览表] = useBoundedRecord<缩略图状态>(512);
  const [可阅读页数表, 设置可阅读页数表] = useBoundedRecord<可阅读页数状态>(4096);
  const [阅读进度表, 设置阅读进度表] = useState<Record<string, ReadingProgress>>({});
  const [最近打开列表, 设置最近打开列表] = useState<RecentOpenedItem[]>([]);
  const [临时存放列表, 设置临时存放列表] = useState<RecentOpenedItem[]>([]);
  const [阅读记录分类, 设置阅读记录分类] = useState<"recent" | "temporary">("recent");
  const 是临时存放 = 阅读记录分类 === "temporary";
  const 阅读记录标题 = 是临时存放 ? "临时存放" : "最近阅读";
  const 当前阅读记录列表 = 是临时存放 ? 临时存放列表 : 最近打开列表;
  const [收藏列表, 设置收藏列表] = useState<FavoriteItem[]>([]);
  const [书签列表, 设置书签列表] = useState<BookmarkItem[]>([]);
  const [书架列表, 设置书架列表] = useState<Bookshelf[]>([]);
  const [当前书架ID, 设置当前书架ID] = useState<string | null>(null);
  const [虚拟文件夹列表, 设置虚拟文件夹列表] = useState<VirtualFolder[]>([]);
  const [当前虚拟文件夹ID, 设置当前虚拟文件夹ID] = useState<string | null>(null);
  const [数据已加载, 设置数据已加载] = useState(false);
  const [当前视图, 设置当前视图] = useState<资源库视图>("directory");
  const [导航会话, 设置导航会话] = useState(0);
  const 当前随机范围 = 当前视图 === "directory" ? 当前根目录 ? `directory:${当前根目录}` : null
    : 当前视图 === "favorites" || 当前视图 === "bookmarks" ? 当前视图 : null;
  const 随机浏览 = useRandomBrowse(当前随机范围, 手机布局 ? 手机每页数量 : 每页数量,
    JSON.stringify([搜索内容, 收藏搜索内容, 书签搜索内容, 已选标签列表, 搜索模式, 空格分隔搜索条件]));
  const 随机模式 = 随机浏览.active;
  const 浏览排序选项: readonly GlassSelectOption<排序方式 | 'random'>[] = 当前随机范围 ? [...排序方式选项, { value: 'random', label: '随机排序' }] : 排序方式选项;
  function 应用浏览排序(value: 排序方式 | 'random') {
    if (value === 'random') { if (!随机模式) 随机浏览.toggle(); return; }
    随机浏览.stop(); 设置排序(value); 保存界面设置({ sortMode: value }); 回到第一页();
  }
  const 目录穿透搜索 = 当前视图 === "directory" && Boolean(搜索内容.trim() || 已选标签列表.length);
  const 全库索引 = useLibraryCatalog(当前根目录, 当前视图 === "directory" && (目录穿透搜索 || 随机模式) && isActive && !正在打开资源路径 && !backgroundPaused,
    !随机模式 && 排序.startsWith('time-'));
  useEffect(() => { if (当前根目录 && 当前目录) observeLibraryDirectory(当前根目录, 当前目录); }, [当前根目录, 当前目录]);
  const 搜索返回会话 = useRef<{ entrance: string; root: string; directory: 目录结果; query: string; tags: string[];
    sort: 排序方式; searchOpen: boolean; scrollTop: number; history: 历史状态; random: ReturnType<typeof 随机浏览.capture> } | null>(null);
  useEffect(() => { if (当前视图 !== 'directory') 搜索返回会话.current = null; }, [当前视图]);
  const 手机显示范围 = mobileDisplayScope(当前视图);
  const { layout: 手机卡片布局, columns: 手机基础列数, coverSize: 手机封面尺寸 } = getMobileDisplay(手机显示设置, 手机显示范围);
  const 手机自适应 = useResponsiveLibrary(手机基础列数, 手机布局);
  const 手机列数 = 手机自适应.columns;
  const [目录空白菜单, 设置目录空白菜单] = useState<{ x: number; y: number } | null>(null);
  const [资源菜单, 设置资源菜单] = useState<{
    x: number;
    y: number;
    input: ResourceMetaInput;
    fileType: 资源类型;
    itemKey: string;
    localPath: string;
    progressText?: string | null;
    thumbnailUrl?: string | null;
  } | null>(null);
  const [最近菜单, 设置最近菜单] = useState<{ x: number; y: number; 项目: RecentOpenedItem } | null>(null);
  const [收藏菜单, 设置收藏菜单] = useState<{ x: number; y: number; 项目: FavoriteItem } | null>(null);
  const [书签菜单, 设置书签菜单] = useState<{ x: number; y: number; 项目: BookmarkItem } | null>(null);
  const [书架菜单, 设置书架菜单] = useState<{ x: number; y: number; 项目: Bookshelf } | null>(null);
  const [书架栏空白菜单, 设置书架栏空白菜单] = useState<{ x: number; y: number } | null>(null);
  const [虚拟文件夹菜单, 设置虚拟文件夹菜单] = useState<{ x: number; y: number; 项目: VirtualFolder } | null>(null);
  const [书架空白菜单, 设置书架空白菜单] = useState<{ x: number; y: number } | null>(null);
  const [书架内部空白菜单, 设置书架内部空白菜单] = useState<{ x: number; y: number } | null>(null);
  const [整理空白菜单, 设置整理空白菜单] = useState<{ x: number; y: number; 视图: 整理空白菜单视图 } | null>(null);
  const [虚拟文件夹资源菜单, 设置虚拟文件夹资源菜单] = useState<{ x: number; y: number; 项目: VirtualFolderItem } | null>(null);
  const [根目录菜单, 设置根目录菜单] = useState<{ x: number; y: number; 项目: LibraryRoot } | null>(null);
  const [根目录下拉打开, 设置根目录下拉打开] = useState(false);
  const [标签菜单, 设置标签菜单] = useState<{ x: number; y: number; 标签: string } | null>(null);
  const [待删除标签列表, 设置待删除标签列表] = useState<string[] | null>(null);
  const [标签删除选择模式, 设置标签删除选择模式] = useState(false);
  const [待删除标签选择集合, 设置待删除标签选择集合] = useState<Set<string>>(() => new Set());
  const [待删除根目录, 设置待删除根目录] = useState<LibraryRoot | null>(null);
  const [选择模式, 设置选择模式] = useState<选择视图 | null>(null);
  const [已选项目Key集合, 设置已选项目Key集合] = useState<Set<string>>(() => new Set());
  const [框选, 设置框选] = useState<框选状态>(null);
  const [批量删除确认, 设置批量删除确认] = useState<管理视图 | null>(null);
  const [删除前确认设置, 设置删除前确认设置] = useState<批量删除确认设置>(默认设置.confirmBeforeBatchDelete);
  const [删除标签前确认, 设置删除标签前确认] = useState(默认设置.confirmBeforeDeleteTags);
  const [批量删除不再提醒, 设置批量删除不再提醒] = useState(false);
  const [删除标签不再提醒, 设置删除标签不再提醒] = useState(false);
  const [删除确认处理中, 设置删除确认处理中] = useState(false);
  const [书架弹窗, 设置书架弹窗] = useState<{ mode: "create" | "rename"; bookshelf?: Bookshelf } | null>(null);
  const [书架名称输入, 设置书架名称输入] = useState("");
  const [内联编辑书架栏, 设置内联编辑书架栏] = useState<{ id: string; name: string } | null>(null);
  const [书架分类展开, 设置书架分类展开] = useState(false);
  const [书架分类中键拖动中, 设置书架分类中键拖动中] = useState(false);
  const [书架分类面板拖拽源ID, 设置书架分类面板拖拽源ID] = useState<string | null>(null);
  const [书架分类面板拖拽落点, 设置书架分类面板拖拽落点] = useState<卡片拖拽落点>(null);
  const [书架分类轨道标记宽度, 设置书架分类轨道标记宽度] = useState(0);
  const [书架分类面板选择框, 设置书架分类面板选择框] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [待删除书架, 设置待删除书架] = useState<Bookshelf | null>(null);
  const [待删除书架列表, 设置待删除书架列表] = useState<Bookshelf[] | null>(null);
  const [已选书架栏ID集合, 设置已选书架栏ID集合] = useState<Set<string>>(() => new Set());
  const [虚拟文件夹弹窗, 设置虚拟文件夹弹窗] = useState<虚拟文件夹弹窗状态>(null);
  const [虚拟文件夹名称输入, 设置虚拟文件夹名称输入] = useState("");
  const [虚拟文件夹备注输入, 设置虚拟文件夹备注输入] = useState("");
  const [待删除虚拟文件夹, 设置待删除虚拟文件夹] = useState<(VirtualFolder & { selection?: VirtualFolder[] }) | null>(null);
  const [待清空虚拟文件夹, 设置待清空虚拟文件夹] = useState<清空书架确认状态>(null);
  const [待清空无效资源, 设置待清空无效资源] = useState<清空无效资源确认状态>(null);
  const [待全局清空无效资源, 设置待全局清空无效资源] = useState<全局清空无效资源确认状态>(null);
  const [正在检查全局无效资源, 设置正在检查全局无效资源] = useState(false);
  const [已忽略无效资源清理Key, 设置已忽略无效资源清理Key] = useState<string | null>(null);
  const [加入虚拟文件夹目标, 设置加入虚拟文件夹目标] = useState<{ items: VirtualFolderItemInput[]; title: string; anchor?: { x: number; y: number } } | null>(null);
  const [加入书架搜索内容, 设置加入书架搜索内容] = useState("");
  const [加入书架目标书架栏ID, 设置加入书架目标书架栏ID] = useState<string | null>(null);
  const [移动到书架目标, 设置移动到书架目标] = useState<移动到书架目标>(null);
  const [转存书架搜索内容, 设置转存书架搜索内容] = useState("");
  const [转存书架目标书架栏ID, 设置转存书架目标书架栏ID] = useState<string | null>(null);
  const [侧栏临时顺序, 设置侧栏临时顺序] = useState<string[]>([]);
  const [侧栏拖拽Key, 设置侧栏拖拽Key] = useState<string | null>(null);
  const [侧栏拖拽落点, 设置侧栏拖拽落点] = useState<侧栏拖拽落点>(null);
  const [根目录拖拽路径, 设置根目录拖拽路径] = useState<string | null>(null);
  const [根目录拖拽落点, 设置根目录拖拽落点] = useState<卡片拖拽落点>(null);
  const [书架文件夹拖拽Key, 设置书架文件夹拖拽Key] = useState<string | null>(null);
  const [书架文件夹拖拽落点, 设置书架文件夹拖拽落点] = useState<卡片拖拽落点>(null);
  const [书架资源拖拽Key, 设置书架资源拖拽Key] = useState<string | null>(null);
  const [书架资源拖拽落点, 设置书架资源拖拽落点] = useState<卡片拖拽落点>(null);
  const [收藏拖拽Key, 设置收藏拖拽Key] = useState<string | null>(null);
  const [收藏拖拽落点, 设置收藏拖拽落点] = useState<卡片拖拽落点>(null);
  const [书签拖拽Key, 设置书签拖拽Key] = useState<string | null>(null);
  const [书签拖拽落点, 设置书签拖拽落点] = useState<卡片拖拽落点>(null);
  const [中键拖拽悬浮卡片, 设置中键拖拽悬浮卡片] = useState<中键拖拽悬浮卡片>(null);
  const [当前右侧抽屉, 设置当前右侧抽屉] = useState<右侧抽屉>(null);
  const [当前设置分类, 设置当前设置分类] = useState<设置分类>("library");
  const [设置窗口偏移, 设置设置窗口偏移] = useState({ x: 0, y: 0 });
  const [资源信息目标, 设置资源信息目标] = useState<资源信息目标 | null>(null);
  const [资源详情阅读资源, 设置资源详情阅读资源] = useState<阅读资源结果 | null>(null);
  const [资源详情加载状态, 设置资源详情加载状态] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [资源详情所选页, 设置资源详情所选页] = useState(0);
  const [资源详情预览页, 设置资源详情预览页] = useState(0);
  const [详情缩略图缩放, 设置详情缩略图缩放] = useState(默认设置.detailThumbnailScale);
  const [资源详情顶部折叠, 设置资源详情顶部折叠] = useState(false);
  const [资源详情编辑模式, 设置资源详情编辑模式] = useState(false);
  const [资源详情路径浮层打开, 设置资源详情路径浮层打开] = useState(false);
  const 资源详情滚动容器 = useRef<HTMLElement>(null);
  const 资源详情预览滚动容器 = useRef<HTMLDivElement>(null);
  const 资源详情编辑快照 = useRef<{ note: string; tags: string } | null>(null);
  const 资源详情加载序号 = useRef(0);
  const 手机详情封面起点 = useRef<MobileNavigationOrigin>();
  const [整理备注输入, 设置整理备注输入] = useState("");
  const [整理标签输入, 设置整理标签输入] = useState("");
  const [标签添加弹窗打开, 设置标签添加弹窗打开] = useState(false);
  const [标签添加输入, 设置标签添加输入] = useState("");
  const [标签添加浮层样式, 设置标签添加浮层样式] = useState<CSSProperties>({});
  const [整理保存中, 设置整理保存中] = useState(false);
  const [整理错误, 设置整理错误] = useState<string | null>(null);
  const [完整标签浮层, 设置完整标签浮层] = useState<{ key: string; tags: string[]; style: CSSProperties } | null>(null);
  const [资源元数据表, 设置资源元数据表] = useState<Record<string, ResourceMetaItem>>({});
  const [标签顺序, 设置标签顺序] = useState<string[]>([]);
  const [拖拽标签, 设置拖拽标签] = useState<string | null>(null);
  const [整理侧边栏透明度, 设置整理侧边栏透明度] = useState<整理侧边栏透明度>(默认设置.organizeDrawerOpacity);
  const [书架备注悬停延迟, 设置书架备注悬停延迟] = useState<书架备注悬停延迟>(默认设置.bookshelfNoteHoverDelayMs);
  const [最近打开记录上限, 设置最近打开记录上限] = useState<最近打开记录上限>(默认设置.recentOpenedLimit);
  const [书架备注悬浮窗, 设置书架备注悬浮窗] = useState<{ folderId: string; note: string; style: CSSProperties } | null>(null);
  const [备注悬停快捷键按下, 设置备注悬停快捷键按下] = useState(false);
  const [资源路径状态表, 设置资源路径状态表] = useState<Record<string, 资源路径状态>>({});
  const 读取序号 = useRef(0);
  const 书签预览请求序号 = useRef(0);
  const 可阅读页数请求序号 = useRef(0);
  const 路径状态请求序号 = useRef(0);
  const 列表容器 = useRef<HTMLDivElement>(null);
  const 资源主区域 = useRef<HTMLDivElement>(null);
  const 主搜索输入框 = useRef<HTMLInputElement>(null);
  const 设置触发按钮 = useRef<HTMLButtonElement>(null);
  const 设置窗口元素 = useRef<HTMLElement>(null);
  const 视图菜单容器 = useRef<HTMLDetailsElement>(null);
  const 根目录下拉容器 = useRef<HTMLDivElement>(null);
  const 书架分类控件 = useRef<HTMLDivElement>(null);
  const 书架分类展开按钮 = useRef<HTMLButtonElement>(null);
  const 书架分类轨道视口 = useRef<HTMLDivElement>(null);
  const 书架分类面板网格 = useRef<HTMLDivElement>(null);
  const 书架分类按钮元素表 = useRef<Map<string, HTMLButtonElement>>(new Map());
  const 书架分类按钮前位置表 = useRef<Map<string, DOMRect>>(new Map());
  const 书架分类按钮动画表 = useRef<Map<string, Animation>>(new Map());
  const 书架分类轮转方向 = useRef<-1 | 1>(1);
  const 书架分类列表快照 = useRef<Bookshelf[]>([]);
  const 当前书架分类ID快照 = useRef<string | null>(null);
  const 书架分类滚轮累计 = useRef(0);
  const 书架分类滚轮冷却截止 = useRef(0);
  const 书架分类中键指针 = useRef<{ pointerId: number; x: number; accumulated: number } | null>(null);
  const 书架分类面板排序指针 = useRef<{
    pointerId: number;
    sourceId: string;
    originalIds: string[];
    drop: Exclude<卡片拖拽落点, null> | null;
    moved: boolean;
  } | null>(null);
  const 书架分类最近点击 = useRef<{
    id: string;
    at: number;
    x: number;
    y: number;
  } | null>(null);
  const 书架分类已处理双击 = useRef(false);
  const 标签搜索输入框 = useRef<HTMLInputElement>(null);
  const 标签添加触发区 = useRef<HTMLSpanElement>(null);
  const 标签添加浮层 = useRef<HTMLSpanElement>(null);
  const 资源详情路径控件 = useRef<HTMLDivElement>(null);
  const 标签添加忽略外部点击截止 = useRef(0);
  const 框选抑制点击 = useRef(false);
  const 书架备注悬停定时器 = useRef<number | null>(null);
  const 书架备注悬停Key = useRef<string | null>(null);
  const 书架备注鼠标位置 = useRef({ x: 0, y: 0 });
  const 设置保存请求序号 = useRef(0);
  const 成功提示定时器 = useRef<number | null>(null);
  const 可见书签ID集合 = useRef<Set<string>>(new Set());
  const 书签预览状态Ref = useRef<Record<string, 缩略图状态>>({});
  const 自动翻页锁定 = useRef(false);
  const 自动翻页冷却截止 = useRef(0);
  const 滚轮停止定时器 = useRef<number | null>(null);
  const 待恢复滚动位置 = useRef<"top" | "bottom" | null>(null);
  const 待恢复精确滚动位置 = useRef<number | null>(null);
  const 阅读返回定位快照 = useRef<阅读返回定位快照 | null>(null);
  const 打开阅读请求序号 = useRef(0);
  const 界面设置快照 = useRef<AppSettings>({ ...默认设置 });
  const 缩放保存定时器 = useRef<number | null>(null);
  const 待保存缩放 = useRef<Partial<AppSettings>>({});

  useEffect(() => {
    const changed = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail !== false;
      设置显示主界面(enabled);
      界面设置快照.current = { ...界面设置快照.current, showHomePage: enabled };
    };
    window.addEventListener('omi-home-visibility-changed', changed);
    return () => window.removeEventListener('omi-home-visibility-changed', changed);
  }, []);

  function 保存缩放设置(): void {
    if (缩放保存定时器.current !== null) window.clearTimeout(缩放保存定时器.current);
    缩放保存定时器.current = null;
    const 设置 = 待保存缩放.current;
    待保存缩放.current = {};
    if (Object.keys(设置).length) 保存界面设置(设置);
  }

  function 调整卡片缩放(比例: number, 范围: "library" | "detail"): void {
    const key = 范围 === "detail" ? "detailThumbnailScale" : "cardScale";
    const value = 规范卡片缩放(比例);
    if (value === 界面设置快照.current[key]) return;
    设置保存请求序号.current += 1;
    界面设置快照.current = { ...界面设置快照.current, [key]: value };
    if (范围 === "detail") 设置详情缩略图缩放(value);
    else 设置卡片缩放(value);
    待保存缩放.current = { ...待保存缩放.current, [key]: value };
    if (缩放保存定时器.current !== null) window.clearTimeout(缩放保存定时器.current);
    缩放保存定时器.current = window.setTimeout(保存缩放设置, 180);
  }

  useCardScaleWheel(资源主区域, isActive, (direction, scope, fast) => {
    const key = scope === "detail" ? "detailThumbnailScale" : "cardScale";
    const current = 规范卡片缩放(界面设置快照.current[key]);
    const next = 相邻卡片缩放(current, direction);
    设置缩放动效(previous => ({ ...previous, [scope]: { sequence: (previous[scope]?.sequence ?? 0) + 1, direction, fast, edge: current === next } }));
    调整卡片缩放(next, scope);
  });

  useEffect(() => () => {
    if (缩放保存定时器.current !== null) window.clearTimeout(缩放保存定时器.current);
    if (Object.keys(待保存缩放.current).length) {
      void window.omicomic.updateSettings(待保存缩放.current);
      待保存缩放.current = {};
    }
  }, []);

  function 应用界面设置(设置: AppSettings): void {
    设置 = { ...设置, cardScale: 规范卡片缩放(设置.cardScale), detailThumbnailScale: 规范卡片缩放(设置.detailThumbnailScale) };
    界面设置快照.current = 设置;
    设置手机显示设置(设置);
    设置手机每页数量(设置.mobilePageSize ?? 50);
    设置手机预览宽度(设置.mobilePreviewWidth ?? 88);
    设置音量键翻页(Boolean(设置.readerVolumeKeys));
    设置反转音量键(Boolean(设置.readerVolumeKeysReversed));
    设置当前主题配色(应用主题配色(设置.colorTheme));
    设置显示主界面(设置.showHomePage !== false);
    setUiLanguage(设置.language); 设置界面语言(normalizeLanguage(设置.language));
    const 字号 = applyDesktopTypography(设置);
    设置信息字号(字号.desktopInfoFontSize);
    设置全局字号(字号.desktopGlobalFontSize);
    设置桌面自动隐藏(设置.desktopReaderAutoHide === true);
    设置桌面性能模式(设置.desktopPerformanceProfile ?? 'auto');
    设置卡片缩放(设置.cardScale);
    设置详情缩略图缩放(设置.detailThumbnailScale);
    设置每页数量(设置.pageSize);
    设置排序(设置.sortMode);
    设置显示进度条(设置.showProgressBar);
    设置显示进度文本(设置.showProgressText);
    设置进度文本模式(设置.progressTextMode);
    设置进度条粗细(设置.progressBarThickness);
    设置文件夹优先(设置.folderFirst);
    设置隐藏已加入书架资源(设置.hideBookshelfItemsInLibrary);
    设置阅读器默认缩放模式(设置.readerDefaultFitMode);
    设置阅读器默认流向(设置.readerDefaultFlow);
    设置默认开启全景(设置.readerDefaultPanorama);
    设置默认开启沉浸(设置.readerDefaultImmersive);
    设置阅读器默认页模式(设置.readerPageMode);
    设置双页阅读方向(设置.doublePageDirection);
    设置智能识别跨页图(设置.smartDetectSpreadPage);
    设置滚轮翻页(设置.wheelPageTurn);
    设置沉浸自动隐藏延迟(设置.immersiveAutoHideDelay);
    设置隐藏阅读器底部按钮(设置.readerHideFooterControls);
    设置隐藏沉浸模式进度条(设置.readerHideImmersiveProgress);
    设置阅读器内存缓存大小(设置.readerMemoryCacheSizeMb);
    设置阅读器预加载页数(设置.readerPreloadPages);
    设置阅读器图片线程数(设置.readerImageLoadConcurrency);
    设置图书切换按钮透明度(设置.bookSwitchButtonOpacity);
    设置整理侧边栏透明度(设置.organizeDrawerOpacity);
    设置书架备注悬停延迟(设置.bookshelfNoteHoverDelayMs);
    设置最近打开记录上限(设置.recentOpenedLimit);
    设置搜索模式(设置.tagSearchMode);
    设置空格分隔搜索条件(设置.searchSplitSpaces === true);
    设置删除标签前确认(设置.confirmBeforeDeleteTags);
    设置删除前确认设置(设置.confirmBeforeBatchDelete);
  }

  function 保存界面设置(局部设置: Partial<AppSettings>, 保存成功后?: () => void | Promise<void>): void {
    // Commit an in-flight density edit with the next setting. Otherwise the
    // response still contains the old columns and briefly resets the scroll anchor.
    if (缩放保存定时器.current !== null) window.clearTimeout(缩放保存定时器.current);
    缩放保存定时器.current = null;
    局部设置 = { ...待保存缩放.current, ...局部设置 };
    待保存缩放.current = {};
    const 请求序号 = 设置保存请求序号.current + 1;
    设置保存请求序号.current = 请求序号;
    const 完整设置 = { ...界面设置快照.current, ...局部设置 };
    应用界面设置(完整设置);
    void window.omicomic.updateSettings(局部设置)
      .then((结果) => {
        if (请求序号 !== 设置保存请求序号.current) return;
        if (结果.ok) {
          应用界面设置({ ...完整设置, ...结果.data, ...局部设置 });
          if (局部设置.showHomePage !== undefined) window.dispatchEvent(new CustomEvent('omi-home-visibility-changed', { detail: 结果.data.showHomePage !== false }));
          if (保存成功后) {
            void Promise.resolve(保存成功后()).catch(() => {
              if (请求序号 === 设置保存请求序号.current) 设置错误信息("设置已保存，但界面数据刷新失败，请稍后重试。");
            });
          }
        } else {
          设置错误信息(结果.error.message);
        }
      })
      .catch(() => {
        if (请求序号 === 设置保存请求序号.current) 设置错误信息("设置保存失败，请稍后重试。");
      });
  }

  function 更新标签搜索模式(新模式: 搜索匹配模式): void {
    设置搜索模式(新模式);
    保存界面设置({ tagSearchMode: 新模式 });
    回到第一页();
  }

  function 显示成功提示(内容: string): void {
    if (成功提示定时器.current !== null) {
      window.clearTimeout(成功提示定时器.current);
      成功提示定时器.current = null;
    }
    设置错误信息(null);
    设置成功提示(内容);
    成功提示定时器.current = window.setTimeout(() => {
      设置成功提示(null);
      成功提示定时器.current = null;
    }, 2600);
  }

  function 关闭成功提示(): void {
    if (成功提示定时器.current !== null) {
      window.clearTimeout(成功提示定时器.current);
      成功提示定时器.current = null;
    }
    设置成功提示(null);
  }

  function 获取资源整理信息(输入: ResourceMetaInput, 兼容项目?: Pick<FavoriteItem, "note" | "tags">): ResourceMetaItem {
    const 已保存 = 资源元数据表[输入.resourceKey];
    if (已保存) {
      return {
        ...已保存,
        note: 已保存.note ?? "",
        tags: 规范化标签列表(已保存.tags),
      };
    }

    return {
      resourceKey: 输入.resourceKey,
      sourcePath: 输入.sourcePath,
      sourceType: 输入.sourceType,
      title: 输入.title,
      note: 兼容项目 ? 获取整理备注(兼容项目) : "",
      tags: 兼容项目 ? 获取整理标签(兼容项目) : [],
      updatedAt: 0,
    };
  }

  function 获取文件整理信息(文件: 文件条目): ResourceMetaItem | null {
    const 输入 = 获取文件资源元数据输入(文件);
    return 输入 ? 获取资源整理信息(输入) : null;
  }

  function 合并标签顺序(标签列表: string[]): string[] {
    const 标签集合 = new Set(标签列表);
    const 已排序 = 标签顺序.filter((标签) => 标签集合.has(标签));
    const 追加标签 = 标签列表
      .filter((标签) => !已排序.includes(标签))
      .sort((左侧, 右侧) => 文件名排序器.compare(左侧, 右侧));
    return [...已排序, ...追加标签];
  }

  function 推入本地标签顺序(标签列表: string[]): void {
    if (标签列表.length === 0) return;
    设置标签顺序((原顺序) => {
      const 新顺序 = [...原顺序];
      for (const 标签 of 标签列表) {
        if (!新顺序.includes(标签)) 新顺序.push(标签);
      }
      return 新顺序;
    });
  }

  function 取消当前搜索(): void {
    搜索返回会话.current = null; 设置当前视图搜索内容(''); 设置已选标签列表([]);
    设置手机筛选展开(false); 设置主搜索建议可见(false); 主搜索输入框.current?.blur();
  }
  function 重置栏目搜索(): void {
    取消当前搜索(); 设置搜索内容(''); 设置收藏搜索内容(''); 设置书签搜索内容(''); 设置最近搜索内容('');
  }

  function 设置当前视图搜索内容(值: string): void {
    if (!值 && 当前搜索内容) 设置导航会话(value => value + 1);
    if (当前视图 === "recent") 设置最近搜索内容(值);
    else if (当前视图 === "favorites") 设置收藏搜索内容(值);
    else if (当前视图 === "bookmarks") 设置书签搜索内容(值);
    else 设置搜索内容(值);
  }

  function 应用主搜索标签建议(标签: string): void {
    const 新搜索内容 = 替换当前标签查询片段(当前搜索内容, 标签);
    设置当前视图搜索内容(新搜索内容);
    设置主搜索建议可见(false);
    回到第一页();
    window.requestAnimationFrame(() => {
      主搜索输入框.current?.focus();
      主搜索输入框.current?.setSelectionRange(新搜索内容.length, 新搜索内容.length);
    });
  }

  function 切换抽屉标签建议(标签: string): void {
    const 新搜索内容 = 替换当前标签查询片段(标签搜索内容, 标签);
    设置标签搜索内容(新搜索内容);
    设置标签搜索建议可见(false);
    window.requestAnimationFrame(() => {
      标签搜索输入框.current?.focus();
      标签搜索输入框.current?.setSelectionRange(新搜索内容.length, 新搜索内容.length);
    });
  }

  function 过滤已删除标签(删除标签: string[]): void {
    const 删除集合 = new Set(删除标签);
    设置已选标签列表((原列表) => 原列表.filter((标签) => !删除集合.has(标签)));
    设置标签顺序((原列表) => 原列表.filter((标签) => !删除集合.has(标签)));
    设置待删除标签选择集合((原集合) => {
      const 新集合 = new Set(原集合);
      for (const 标签 of 删除集合) 新集合.delete(标签);
      return 新集合;
    });
  }

  async function 删除标签列表(标签列表: string[]): Promise<void> {
    const 删除标签 = 规范化标签列表(标签列表);
    if (删除标签.length === 0) return;
    if (删除确认处理中) return;
    设置删除确认处理中(true);
    设置整理错误(null);
    try {
      const 结果 = await window.omicomic.deleteTags(删除标签);
      if (!结果.ok) {
        设置整理错误(结果.error.message);
        return;
      }
      设置收藏列表(结果.data.favorites);
      设置书签列表(结果.data.bookmarks);
      设置虚拟文件夹列表(结果.data.virtualFolders);
      设置资源元数据表(结果.data.resourceMeta);
      设置标签顺序(结果.data.tagOrder);

      过滤已删除标签(删除标签);
      设置标签菜单(null);
      设置待删除标签列表(null);
      设置删除标签不再提醒(false);
      设置待删除标签选择集合(new Set());
      设置标签删除选择模式(false);
      回到第一页();
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 请求删除标签列表(标签列表: string[]): void {
    const 删除标签 = 规范化标签列表(标签列表);
    if (删除标签.length === 0) return;
    if (!删除标签前确认) {
      void 删除标签列表(删除标签);
      return;
    }
    设置删除标签不再提醒(false);
    设置待删除标签列表(删除标签);
  }

  async function 确认删除标签列表(): Promise<void> {
    if (!待删除标签列表 || 删除确认处理中) return;
    if (删除标签不再提醒) {
      设置删除标签前确认(false);
      保存界面设置({ confirmBeforeDeleteTags: false });
    }
    await 删除标签列表(待删除标签列表);
  }

  function 退出标签删除选择模式(): void {
    设置标签删除选择模式(false);
    设置待删除标签选择集合(new Set());
  }

  function 关闭标签添加弹窗(): void {
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
  }

  function 更新标签添加浮层位置(): void {
    const 触发区 = 标签添加触发区.current;
    if (!触发区) return;
    const 矩形 = 触发区.getBoundingClientRect();
    const 边距 = 16;
    const 宽度 = Math.max(236, Math.min(320, window.innerWidth - 边距 * 2));
    const 左侧 = Math.min(Math.max(边距, 矩形.left), window.innerWidth - 宽度 - 边距);
    const 预估高度 = 56;
    const 下方 = 矩形.bottom + 8;
    const 上方 = Math.max(边距, 矩形.top - 预估高度 - 8);
    const 顶部 = 下方 + 预估高度 > window.innerHeight - 边距 ? 上方 : 下方;
    设置标签添加浮层样式({ left: 左侧, top: 顶部, width: 宽度 });
  }

  function 切换待删除标签(标签: string): void {
    设置待删除标签选择集合((原集合) => {
      const 新集合 = new Set(原集合);
      if (新集合.has(标签)) 新集合.delete(标签);
      else 新集合.add(标签);
      return 新集合;
    });
  }

  function 设置当前可见标签为待删除(标签列表: string[]): void {
    设置待删除标签选择集合(new Set(标签列表));
  }

  function 请求删除已选择标签(): void {
    const 标签列表 = 规范化标签列表(Array.from(待删除标签选择集合));
    if (标签列表.length === 0) return;
    请求删除标签列表(标签列表);
  }

  function 移除整理标签(目标标签: string): void {
    const 标签列表 = 解析标签输入(整理标签输入).filter((标签) => 标签 !== 目标标签);
    设置整理标签输入(标签列表.join(", "));
  }

  function 添加整理标签(): void {
    const 新标签列表 = 解析标签输入(标签添加输入);
    if (新标签列表.length === 0) {
      设置标签添加弹窗打开(false);
      设置标签添加输入("");
      return;
    }
    const 合并标签 = 规范化标签列表([...解析标签输入(整理标签输入), ...新标签列表]);
    设置整理标签输入(合并标签.join(", "));
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
  }

  const 已加入书架资源集合 = useMemo(() => {
    const resourceKeys = new Set<string>();
    const sourcePaths = new Set<string>();
    for (const 文件夹 of 虚拟文件夹列表) {
      for (const 项目 of 文件夹.items) {
        resourceKeys.add(项目.resourceKey);
        sourcePaths.add(项目.sourcePath);
      }
    }
    return { resourceKeys, sourcePaths };
  }, [虚拟文件夹列表]);

  const 目录查询签名 = JSON.stringify([导航会话, 当前根目录, 当前目录?.path, 搜索内容, 已选标签列表, 搜索模式, 空格分隔搜索条件, 排序, 文件夹优先, 隐藏已加入书架资源, 随机模式]);
  const 目录查询来源 = useMemo(() => (目录穿透搜索 || 随机模式) ? 全库索引.items : 当前目录?.items ?? [],
    [目录穿透搜索, 随机模式, 全库索引.items, 当前目录]);
  const 目录查询条件 = useMemo(() => (文件: 文件条目) => {
    if (!['folder','image','archive','pdf','epub'].includes(文件.type)) return false;
    if ((目录穿透搜索 || 随机模式) && 文件.path === 当前根目录 && !文件.containsImages) return false;
    if (随机模式 && !(文件.type === 'folder' ? 文件.containsImages : ['archive','pdf','epub'].includes(文件.type))) return false;
    if (隐藏已加入书架资源 && 当前目录?.path === 当前根目录) {
      const resourceKey = 获取文件资源Key(文件);
      if (resourceKey && 已加入书架资源集合.resourceKeys.has(resourceKey)) return false;
      if (已加入书架资源集合.sourcePaths.has(文件.path)) return false;
      if (文件.type === "image" && 已加入书架资源集合.sourcePaths.has(获取父目录路径(文件.path))) return false;
    }
    const info = 获取文件整理信息(文件), tags = info?.tags ?? [];
    return 资源标签匹配筛选模式(tags, 已选标签列表, 搜索模式)
      && 匹配整理搜索(搜索内容, [文件.name, info?.note], tags, 搜索模式);
  }, [目录查询签名, 资源元数据表, 已加入书架资源集合]);
  const 目录比较 = useMemo(() => (左侧: 文件条目, 右侧: 文件条目) => {
    if (随机模式) return 0;
    if ((文件夹优先 || 目录穿透搜索) && (左侧.type === 'folder') !== (右侧.type === 'folder')) return 左侧.type === 'folder' ? -1 : 1;
    if (排序 === 'name-desc') return 文件名排序器.compare(右侧.name, 左侧.name);
    if (排序 === 'time-asc' || 排序 === 'time-desc') {
      // Unknown timestamps wait behind known metadata rather than pretending to
      // be the oldest files. Background batches supply the actual timestamps.
      if (左侧.modifiedAt === undefined || 右侧.modifiedAt === undefined) {
        if (左侧.modifiedAt !== 右侧.modifiedAt) return 左侧.modifiedAt === undefined ? 1 : -1;
      } else if (左侧.modifiedAt !== 右侧.modifiedAt) return (排序 === 'time-asc' ? 1 : -1) * (左侧.modifiedAt - 右侧.modifiedAt);
    }
    if (排序 === 'type' && 左侧.type !== 右侧.type) return 类型顺序[左侧.type] - 类型顺序[右侧.type];
    return 文件名排序器.compare(左侧.name, 右侧.name);
  }, [排序, 随机模式, 文件夹优先, 目录穿透搜索]);
  const 稳定搜索选项 = useMemo(() => 目录穿透搜索 && !随机模式 ? {
    key: (item: 文件条目) => item.path,
    first: (item: 文件条目) => item.type === 'folder',
  } : undefined, [目录穿透搜索, 随机模式]);
  const 目录匹配项目 = useLibraryQuery(目录查询来源, 目录查询条件, 目录比较, 目录查询签名, 稳定搜索选项);
  const 筛选排序后项目 = useMemo(() => 随机模式 && 当前视图 === 'directory' ? 随机浏览.select(目录匹配项目, item => item.path) : 目录匹配项目,
    [目录匹配项目, 随机模式, 随机浏览.revision, 随机浏览.selectionRevision, 手机每页数量, 每页数量]);

  const 普通筛选后收藏列表 = useMemo(() => 收藏列表.filter(项目 => {
    const info = 获取资源整理信息({ resourceKey: 项目.resourceKey, sourcePath: 项目.sourcePath, sourceType: 项目.sourceType, title: 项目.title }, 项目);
    return 资源标签匹配筛选模式(info.tags, 已选标签列表, 搜索模式)
      && 匹配整理搜索(收藏搜索内容, [项目.title, info.note], info.tags, 搜索模式);
  }), [收藏列表, 收藏搜索内容, 已选标签列表, 资源元数据表, 搜索模式, 空格分隔搜索条件]);
  const 筛选后收藏列表 = useMemo(() => 随机模式 && 当前视图 === 'favorites' ? 随机浏览.select(普通筛选后收藏列表, item => item.resourceKey) : 普通筛选后收藏列表,
    [普通筛选后收藏列表, 随机模式, 随机浏览.revision, 随机浏览.selectionRevision, 手机每页数量, 每页数量]);
  const 普通筛选后书签列表 = useMemo(() => 书签列表.filter(项目 => {
    const tags = 获取整理标签(项目);
    return 资源标签匹配筛选模式(tags, 已选标签列表, 搜索模式)
      && 匹配整理搜索(书签搜索内容, [项目.bookmarkTitle ?? 项目.title, 项目.note, 项目.title, 项目.pageName], tags, 搜索模式);
  }), [书签列表, 书签搜索内容, 已选标签列表, 搜索模式, 空格分隔搜索条件]);
  const 筛选后书签列表 = useMemo(() => 随机模式 && 当前视图 === 'bookmarks' ? 随机浏览.select(普通筛选后书签列表, item => item.id) : 普通筛选后书签列表,
    [普通筛选后书签列表, 随机模式, 随机浏览.revision, 随机浏览.selectionRevision, 手机每页数量, 每页数量]);
  const 当前虚拟文件夹 = useMemo(
    () => 虚拟文件夹列表.find((项目) => 项目.id === 当前虚拟文件夹ID) ?? null,
    [虚拟文件夹列表, 当前虚拟文件夹ID],
  );
  const 当前根目录项目 = useMemo(
    () => 根目录列表.find((项目) => 项目.path === 当前根目录) ?? null,
    [根目录列表, 当前根目录],
  );
  const 当前书架 = useMemo(
    () => 书架列表.find((项目) => 项目.id === 当前书架ID) ?? 书架列表[0] ?? null,
    [书架列表, 当前书架ID],
  );
  const 轨道书架列表 = useMemo(() => {
    if (书架列表.length <= 1 || !当前书架) return 书架列表;
    const 当前索引 = 书架列表.findIndex((项目) => 项目.id === 当前书架.id);
    if (当前索引 <= 0) return 书架列表;
    return [...书架列表.slice(当前索引), ...书架列表.slice(0, 当前索引)];
  }, [书架列表, 当前书架]);
  const 当前书架文件夹列表 = useMemo(
    () => 当前书架
      ? 虚拟文件夹列表.filter((文件夹) => 文件夹.bookshelfId === 当前书架.id)
      : [],
    [虚拟文件夹列表, 当前书架],
  );

  书架分类列表快照.current = 书架列表;
  当前书架分类ID快照.current = 当前书架?.id ?? null;

  function 记录书架分类按钮位置(): void {
    for (const 动画 of 书架分类按钮动画表.current.values()) 动画.cancel();
    书架分类按钮动画表.current.clear();
    书架分类轨道视口.current?.querySelectorAll(".bookshelf-category-loop-clone").forEach((元素) => 元素.remove());
    const 位置表 = new Map<string, DOMRect>();
    for (const [key, 元素] of 书架分类按钮元素表.current) {
      if (元素.isConnected) 位置表.set(key, 元素.getBoundingClientRect());
    }
    书架分类按钮前位置表.current = 位置表;
  }

  function 推断书架分类轮转方向(id: string): -1 | 1 {
    const 列表 = 书架分类列表快照.current;
    const 当前索引 = 列表.findIndex((项目) => 项目.id === 当前书架分类ID快照.current);
    const 目标索引 = 列表.findIndex((项目) => 项目.id === id);
    if (当前索引 < 0 || 目标索引 < 0) return 1;
    const 向前距离 = (目标索引 - 当前索引 + 列表.length) % 列表.length;
    const 向后距离 = (当前索引 - 目标索引 + 列表.length) % 列表.length;
    return 向前距离 <= 向后距离 ? 1 : -1;
  }

  function 切换书架分类(id: string, 方向?: -1 | 1): void {
    const 目标 = 书架分类列表快照.current.find((项目) => 项目.id === id);
    if (!目标 || 当前书架分类ID快照.current === id) return;
    书架分类轮转方向.current = 方向 ?? 推断书架分类轮转方向(id);
    记录书架分类按钮位置();
    当前书架分类ID快照.current = id;
    设置当前书架ID(id);
    设置当前虚拟文件夹ID(null);
    设置当前视图("bookshelf");
    设置已选书架栏ID集合(new Set());
    回到第一页();
  }

  function 安排点击切换书架分类(书架: Bookshelf, 事件: ReactMouseEvent<HTMLButtonElement>): void {
    const 当前时间 = performance.now();
    const 前次点击 = 书架分类最近点击.current;
    const 是同位置双击 = 前次点击
      && 当前时间 - 前次点击.at <= 420
      && Math.hypot(事件.clientX - 前次点击.x, 事件.clientY - 前次点击.y) <= 8;
    if (是同位置双击) {
      // The first click rotates the item immediately, so the second physical click can
      // land on another DOM button. Remember the first item and still rename that item.
      书架分类最近点击.current = null;
      书架分类已处理双击.current = true;
      const 原分类 = 书架分类列表快照.current.find((项目) => 项目.id === 前次点击.id);
      if (原分类) 开始内联编辑书架栏(原分类);
      return;
    }

    书架分类已处理双击.current = false;
    书架分类最近点击.current = {
      id: 书架.id,
      at: 当前时间,
      x: 事件.clientX,
      y: 事件.clientY,
    };
    // Switch on the first click. Double-click recognition above no longer needs to
    // hold the interaction for 260 ms before the rail begins moving.
    if (当前书架分类ID快照.current !== 书架.id) 切换书架分类(书架.id, 1);
  }

  function 取消待执行书架分类点击(): void {
    书架分类最近点击.current = null;
    书架分类已处理双击.current = false;
  }

  function 循环切换书架分类(方向: -1 | 1): void {
    const 列表 = 书架分类列表快照.current;
    if (列表.length <= 1 || 内联编辑书架栏) return;
    const 当前索引 = Math.max(0, 列表.findIndex((项目) => 项目.id === 当前书架分类ID快照.current));
    const 目标索引 = (当前索引 + 方向 + 列表.length) % 列表.length;
    切换书架分类(列表[目标索引].id, 方向);
  }

  function 处理书架分类滚轮(事件: ReactWheelEvent<HTMLElement>): void {
    if (书架列表.length <= 1 || 内联编辑书架栏) return;
    事件.preventDefault();
    事件.stopPropagation();
    const 位移 = Math.abs(事件.deltaX) > Math.abs(事件.deltaY) ? 事件.deltaX : 事件.deltaY;
    if (位移 === 0) return;
    const 当前时间 = performance.now();
    if (当前时间 < 书架分类滚轮冷却截止.current) return;
    书架分类滚轮累计.current += 位移;
    if (Math.abs(书架分类滚轮累计.current) < 32) return;
    循环切换书架分类(书架分类滚轮累计.current > 0 ? 1 : -1);
    书架分类滚轮累计.current = 0;
    书架分类滚轮冷却截止.current = 当前时间 + 110;
  }

  function 开始书架分类中键拖动(事件: ReactPointerEvent<HTMLElement>): void {
    if (事件.button !== 1 || 书架列表.length <= 1 || 内联编辑书架栏) return;
    事件.preventDefault();
    事件.stopPropagation();
    事件.currentTarget.setPointerCapture(事件.pointerId);
    书架分类中键指针.current = { pointerId: 事件.pointerId, x: 事件.clientX, accumulated: 0 };
    设置书架分类中键拖动中(true);
  }

  function 更新书架分类中键拖动(事件: ReactPointerEvent<HTMLElement>): void {
    const 拖动 = 书架分类中键指针.current;
    if (!拖动 || 拖动.pointerId !== 事件.pointerId) return;
    事件.preventDefault();
    const 横向位移 = 拖动.x - 事件.clientX;
    拖动.x = 事件.clientX;
    拖动.accumulated += 横向位移;
    if (Math.abs(拖动.accumulated) < 48) return;
    循环切换书架分类(拖动.accumulated > 0 ? 1 : -1);
    拖动.accumulated = 0;
  }

  function 结束书架分类中键拖动(事件: ReactPointerEvent<HTMLElement>): void {
    const 拖动 = 书架分类中键指针.current;
    if (!拖动 || 拖动.pointerId !== 事件.pointerId) return;
    书架分类中键指针.current = null;
    if (事件.currentTarget.hasPointerCapture(事件.pointerId)) {
      事件.currentTarget.releasePointerCapture(事件.pointerId);
    }
    设置书架分类中键拖动中(false);
  }

  function 获取书架分类面板拖拽落点(事件: ReactPointerEvent<HTMLButtonElement>): Exclude<卡片拖拽落点, null> | null {
    const 拖拽 = 书架分类面板排序指针.current;
    if (!拖拽) return null;
    const 命中元素 = document.elementFromPoint(事件.clientX, 事件.clientY);
    const 目标按钮 = 命中元素?.closest<HTMLButtonElement>("button[data-bookshelf-panel-id]");
    const 目标ID = 目标按钮?.dataset.bookshelfPanelId;
    if (!目标按钮 || !目标ID || 目标ID === 拖拽.sourceId) return null;

    const 目标矩形 = 目标按钮.getBoundingClientRect();
    const 源按钮 = document.querySelector<HTMLButtonElement>(`button[data-bookshelf-panel-id="${CSS.escape(拖拽.sourceId)}"]`);
    const 源矩形 = 源按钮?.getBoundingClientRect();
    const 是跨列 = 源矩形
      ? Math.abs((目标矩形.left + 目标矩形.width / 2) - (源矩形.left + 源矩形.width / 2)) > 目标矩形.width * 0.55
      : false;
    const position = 是跨列
      ? (事件.clientX < 目标矩形.left + 目标矩形.width / 2 ? "before" : "after")
      : (事件.clientY < 目标矩形.top + 目标矩形.height / 2 ? "before" : "after");
    return { key: 目标ID, position };
  }

  function 开始书架分类面板排序(事件: ReactPointerEvent<HTMLButtonElement>, sourceId: string): void {
    if (事件.button !== 1 || 书架列表.length <= 1 || 内联编辑书架栏) return;
    事件.preventDefault();
    事件.stopPropagation();
    取消待执行书架分类点击();
    事件.currentTarget.setPointerCapture(事件.pointerId);
    书架分类面板排序指针.current = {
      pointerId: 事件.pointerId,
      sourceId,
      originalIds: 书架分类列表快照.current.map((书架) => 书架.id),
      drop: null,
      moved: false,
    };
    设置书架分类面板拖拽源ID(sourceId);
    设置书架分类面板拖拽落点(null);
  }

  function 更新书架分类面板排序(事件: ReactPointerEvent<HTMLButtonElement>): void {
    const 拖拽 = 书架分类面板排序指针.current;
    if (!拖拽 || 拖拽.pointerId !== 事件.pointerId) return;
    事件.preventDefault();
    const 落点 = 获取书架分类面板拖拽落点(事件);
    拖拽.drop = 落点;
    if (落点) 拖拽.moved = true;
    设置书架分类面板拖拽落点(落点);
  }

  async function 保存书架分类面板顺序(新ID列表: string[], 原ID列表: string[]): Promise<void> {
    if (数组内容相同(新ID列表, 原ID列表)) return;
    const 结果 = await window.omicomic.reorderBookshelves(新ID列表);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置书架列表(结果.data);
    设置侧栏临时顺序(结果.data.map((书架) => 获取书架侧栏Key(书架.id)));
  }

  function 结束书架分类面板排序(事件: ReactPointerEvent<HTMLButtonElement>): void {
    const 拖拽 = 书架分类面板排序指针.current;
    if (!拖拽 || 拖拽.pointerId !== 事件.pointerId) return;
    事件.preventDefault();
    事件.stopPropagation();
    书架分类面板排序指针.current = null;
    if (事件.currentTarget.hasPointerCapture(事件.pointerId)) 事件.currentTarget.releasePointerCapture(事件.pointerId);
    设置书架分类面板拖拽源ID(null);
    设置书架分类面板拖拽落点(null);
    if (!拖拽.moved || !拖拽.drop) return;
    const 新ID列表 = 计算卡片拖拽后顺序(拖拽.originalIds, 拖拽.sourceId, 拖拽.drop);
    void 保存书架分类面板顺序(新ID列表, 拖拽.originalIds);
  }

  function 取消书架分类面板排序(事件: ReactPointerEvent<HTMLButtonElement>): void {
    const 拖拽 = 书架分类面板排序指针.current;
    if (!拖拽 || 拖拽.pointerId !== 事件.pointerId) return;
    书架分类面板排序指针.current = null;
    设置书架分类面板拖拽源ID(null);
    设置书架分类面板拖拽落点(null);
  }

  function 处理书架分类按键(事件: ReactKeyboardEvent<HTMLButtonElement>, id: string): void {
    if (内联编辑书架栏) return;
    if (事件.key === "ArrowRight" || 事件.key === "ArrowDown") {
      事件.preventDefault();
      循环切换书架分类(1);
    } else if (事件.key === "ArrowLeft" || 事件.key === "ArrowUp") {
      事件.preventDefault();
      循环切换书架分类(-1);
    } else if (事件.key === "Home") {
      事件.preventDefault();
      const 首项 = 书架分类列表快照.current[0];
      if (首项) 切换书架分类(首项.id);
    } else if (事件.key === "End") {
      事件.preventDefault();
      const 末项 = 书架分类列表快照.current.at(-1);
      if (末项) 切换书架分类(末项.id);
    } else if (事件.key === "Enter" || 事件.key === " ") {
      切换书架分类(id);
    }
  }

  useLayoutEffect(() => {
    const 前位置表 = 书架分类按钮前位置表.current;
    if (前位置表.size === 0) return;
    书架分类按钮前位置表.current = new Map();
    const 减少动画 = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const 方向 = 书架分类轮转方向.current;
    const 轨道位置 = [...书架分类按钮元素表.current]
      .filter(([key, 元素]) => key.startsWith("rail:") && 元素.isConnected)
      .map(([key, 元素]) => {
        const 前位置 = 前位置表.get(key);
        const 后位置 = 元素.getBoundingClientRect();
        return { key, 元素, 前位置, 后位置, x: 前位置 ? 前位置.left - 后位置.left : 0 };
      });
    // Every item that did not wrap has the same signed offset. Reuse that offset for
    // wrapped items as well so the entire rail keeps one speed and one item spacing.
    const 轨道共同位移 = 轨道位置.find(({ x }) => 方向 === 1 ? x > 0.5 : x < -0.5)?.x ?? 0;
    const 轨道动画时长 = Math.min(420, Math.max(250, 230 + Math.abs(轨道共同位移) * 0.28));
    for (const [key, 元素] of 书架分类按钮元素表.current) {
      const 前位置 = 前位置表.get(key);
      if (!前位置 || !元素.isConnected) continue;
      const 后位置 = 元素.getBoundingClientRect();
      const x = 前位置.left - 后位置.left;
      const y = 前位置.top - 后位置.top;
      if (减少动画 || (Math.abs(x) < 0.5 && Math.abs(y) < 0.5)) continue;
      书架分类按钮动画表.current.get(key)?.cancel();
      const 是轨道项目 = key.startsWith("rail:");
      const 是接回项目 = 是轨道项目
        && Math.abs(轨道共同位移) > 0.5
        && (方向 === 1 ? x < -0.5 : x > 0.5);
      if (是接回项目 && 书架分类轨道视口.current) {
        // The real item enters from the opposite edge while a non-interactive clone
        // finishes the departing movement. This keeps both ends of the loop visible
        // for the whole animation without an opacity cut or a mid-flight teleport.
        const 视口边界 = 书架分类轨道视口.current.getBoundingClientRect();
        const 离开副本 = 元素.cloneNode(true) as HTMLButtonElement;
        离开副本.classList.add("bookshelf-category-loop-clone");
        // Use the source button's border-box size so the text-only loop clone keeps
        // exactly the same spacing while it exits through the opposite edge.
        const 原始边框宽度 = 元素.offsetWidth || 前位置.width;
        const 原始边框高度 = 元素.offsetHeight || 前位置.height;
        离开副本.setAttribute("aria-hidden", "true");
        离开副本.tabIndex = -1;
        Object.assign(离开副本.style, {
          left: `${前位置.left - 视口边界.left + (前位置.width - 原始边框宽度) / 2}px`,
          top: `${前位置.top - 视口边界.top + (前位置.height - 原始边框高度) / 2}px`,
          width: `${原始边框宽度}px`,
          height: `${原始边框高度}px`,
        });
        书架分类轨道视口.current.append(离开副本);
        const 副本动画 = 离开副本.animate(
          [
            { transform: "translate3d(0, 0, 0)" },
            { transform: `translate3d(${-轨道共同位移}px, 0, 0)` },
          ],
          { duration: 轨道动画时长, easing: "linear" },
        );
        副本动画.addEventListener("finish", () => 离开副本.remove(), { once: true });
        副本动画.addEventListener("cancel", () => 离开副本.remove(), { once: true });
      }
      const 动画 = 元素.animate(
        [
          { transform: `translate3d(${是接回项目 ? 轨道共同位移 : x}px, ${是接回项目 ? 0 : y}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 是轨道项目 ? 轨道动画时长 : 230,
          easing: 是轨道项目 ? "linear" : "cubic-bezier(.22,.8,.3,1)",
        },
      );
      书架分类按钮动画表.current.set(key, 动画);
      动画.addEventListener("finish", () => {
        if (书架分类按钮动画表.current.get(key) === 动画) 书架分类按钮动画表.current.delete(key);
      }, { once: true });
    }
  }, [轨道书架列表, 书架分类展开]);

  useLayoutEffect(() => {
    if (内联编辑书架栏?.id === 当前书架?.id) {
      设置书架分类轨道标记宽度(0);
      return;
    }
    const 首位按钮 = 书架分类按钮元素表.current.get(`rail:${当前书架?.id ?? ""}`);
    if (!首位按钮) {
      设置书架分类轨道标记宽度(0);
      return;
    }
    const 更新标记宽度 = () => {
      const 下一宽度 = 首位按钮.offsetWidth;
      设置书架分类轨道标记宽度((原宽度) => Math.abs(原宽度 - 下一宽度) < 0.5 ? 原宽度 : 下一宽度);
    };
    更新标记宽度();
    const 观察器 = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(更新标记宽度);
    观察器?.observe(首位按钮);
    return () => 观察器?.disconnect();
  }, [当前视图, 当前书架?.id, 轨道书架列表, 内联编辑书架栏?.id]);

  useLayoutEffect(() => {
    if (!书架分类展开 || !当前书架) {
      设置书架分类面板选择框(null);
      return;
    }
    const 网格 = 书架分类面板网格.current;
    const 选中按钮 = 网格?.querySelector<HTMLButtonElement>(
      `button[data-bookshelf-panel-id="${CSS.escape(当前书架.id)}"]`,
    );
    if (!网格 || !选中按钮) {
      设置书架分类面板选择框(null);
      return;
    }
    const 下一位置 = {
      x: 选中按钮.offsetLeft,
      y: 选中按钮.offsetTop,
      width: 选中按钮.offsetWidth,
      height: 选中按钮.offsetHeight,
    };
    设置书架分类面板选择框((原位置) => (
      原位置
      && 原位置.x === 下一位置.x
      && 原位置.y === 下一位置.y
      && 原位置.width === 下一位置.width
      && 原位置.height === 下一位置.height
        ? 原位置
        : 下一位置
    ));
  }, [书架分类展开, 当前书架?.id, 书架列表]);

  useEffect(() => {
    if (!书架分类展开) return;
    function 处理外部指针(事件: PointerEvent): void {
      if (!书架分类控件.current?.contains(事件.target as Node)) 设置书架分类展开(false);
    }
    function 处理展开按键(事件: KeyboardEvent): void {
      if (事件.key !== "Escape") return;
      事件.preventDefault();
      设置书架分类展开(false);
      window.requestAnimationFrame(() => 书架分类展开按钮.current?.focus());
    }
    document.addEventListener("pointerdown", 处理外部指针, true);
    window.addEventListener("keydown", 处理展开按键);
    return () => {
      document.removeEventListener("pointerdown", 处理外部指针, true);
      window.removeEventListener("keydown", 处理展开按键);
    };
  }, [书架分类展开]);

  useEffect(() => () => {
    取消待执行书架分类点击();
    书架分类面板排序指针.current = null;
    for (const 动画 of 书架分类按钮动画表.current.values()) 动画.cancel();
    书架分类按钮动画表.current.clear();
    书架分类轨道视口.current?.querySelectorAll(".bookshelf-category-loop-clone").forEach((元素) => 元素.remove());
  }, []);
  const 默认侧栏浏览顺序 = useMemo(
    () => 书架列表.map((书架) => 获取书架侧栏Key(书架.id)),
    [书架列表],
  );
  const 侧栏浏览项目列表 = useMemo<侧栏浏览项[]>(() => {
    const 书架表 = new Map(书架列表.map((书架) => [获取书架侧栏Key(书架.id), 书架]));
    const 已加入 = new Set<string>();
    const 顺序 = 侧栏临时顺序.length > 0 ? 侧栏临时顺序 : 默认侧栏浏览顺序;
    const 项目列表: 侧栏浏览项[] = [];

    for (const key of 顺序) {
      if (key === "favorites") {
        项目列表.push({ key, kind: "favorites" });
        已加入.add(key);
        continue;
      }
      if (key === "bookmarks") {
        项目列表.push({ key, kind: "bookmarks" });
        已加入.add(key);
        continue;
      }

      const 书架 = 书架表.get(key);
      if (!书架) continue;
      项目列表.push({ key, kind: "bookshelf", bookshelf: 书架 });
      已加入.add(key);
    }

    for (const key of 默认侧栏浏览顺序) {
      if (已加入.has(key)) continue;
      if (key === "favorites") 项目列表.push({ key, kind: "favorites" });
      else if (key === "bookmarks") 项目列表.push({ key, kind: "bookmarks" });
      else {
        const 书架 = 书架表.get(key);
        if (书架) 项目列表.push({ key, kind: "bookshelf", bookshelf: 书架 });
      }
    }
    if (!已加入.has("favorites")) 项目列表.push({ key: "favorites", kind: "favorites" });
    if (!已加入.has("bookmarks")) 项目列表.push({ key: "bookmarks", kind: "bookmarks" });

    return 项目列表;
  }, [默认侧栏浏览顺序, 书架列表, 侧栏临时顺序]);
  const 转存书架目标组列表 = useMemo<书架转存目标组[]>(() => {
    if (!移动到书架目标) return [];
    const 搜索 = 转存书架搜索内容.trim().toLocaleLowerCase("zh-CN");
    const 可选目标列表 = 获取书架转存目标列表(虚拟文件夹列表, 移动到书架目标.fromFolderId);
    return 书架列表
      .map((书架) => {
        const 原文件夹列表 = 可选目标列表.filter((文件夹) => 文件夹.bookshelfId === 书架.id);
        const 书架栏匹配 = 搜索 !== "" && 书架.name.toLocaleLowerCase("zh-CN").includes(搜索);
        const folders = 搜索 === "" || 书架栏匹配
          ? 原文件夹列表
          : 原文件夹列表.filter((文件夹) => 文件夹.name.toLocaleLowerCase("zh-CN").includes(搜索));
        return { bookshelf: 书架, folders, total: 原文件夹列表.length };
      })
      .filter((组) => 组.total > 0 && (搜索 === "" || 组.folders.length > 0 || 组.bookshelf.name.toLocaleLowerCase("zh-CN").includes(搜索)));
  }, [书架列表, 虚拟文件夹列表, 移动到书架目标?.fromFolderId, 转存书架搜索内容]);
  const 当前转存书架目标组 = useMemo(() => {
    return 转存书架目标组列表.find((组) => 组.bookshelf.id === 转存书架目标书架栏ID)
      ?? 转存书架目标组列表[0]
      ?? null;
  }, [转存书架目标组列表, 转存书架目标书架栏ID]);
  const 移动到书架可选目标列表 = 当前转存书架目标组?.folders ?? [];
  const 移动到书架可选目标总数 = useMemo(
    () => 移动到书架目标 ? 获取书架转存目标列表(虚拟文件夹列表, 移动到书架目标.fromFolderId).length : 0,
    [虚拟文件夹列表, 移动到书架目标?.fromFolderId],
  );
  const 加入书架目标组列表 = useMemo<加入书架目标组[]>(() => {
    const 搜索 = 加入书架搜索内容.trim().toLocaleLowerCase("zh-CN");
    return 书架列表
      .map((书架) => {
        const 原文件夹列表 = 虚拟文件夹列表.filter((文件夹) => 文件夹.bookshelfId === 书架.id);
        const 书架栏匹配 = 搜索 !== "" && 书架.name.toLocaleLowerCase("zh-CN").includes(搜索);
        const folders = 搜索 === "" || 书架栏匹配
          ? 原文件夹列表
          : 原文件夹列表.filter((文件夹) => 文件夹.name.toLocaleLowerCase("zh-CN").includes(搜索));
        return { bookshelf: 书架, folders, total: 原文件夹列表.length };
      })
      .filter((组) => 搜索 === "" || 组.folders.length > 0 || 组.bookshelf.name.toLocaleLowerCase("zh-CN").includes(搜索));
  }, [书架列表, 虚拟文件夹列表, 加入书架搜索内容]);
  const 当前加入书架目标组 = useMemo(() => {
    return 加入书架目标组列表.find((组) => 组.bookshelf.id === 加入书架目标书架栏ID)
      ?? 加入书架目标组列表[0]
      ?? null;
  }, [加入书架目标组列表, 加入书架目标书架栏ID]);
  const 加入书架可选目标列表 = 当前加入书架目标组?.folders ?? [];
  const 使用分栏加入书架目标 = 书架列表.length > 1;
  const 加入书架菜单样式 = useMemo<CSSProperties>(() => {
    const 宽度 = 使用分栏加入书架目标 ? 690 : 260;
    const 高度 = 460;
    const 视口宽度 = typeof window === "undefined" ? 宽度 + 24 : window.innerWidth;
    const 视口高度 = typeof window === "undefined" ? 高度 + 24 : window.innerHeight;
    const 锚点 = 加入虚拟文件夹目标?.anchor ?? { x: Math.round(视口宽度 / 2 - 宽度 / 2), y: Math.round(视口高度 / 2 - 高度 / 2) };
    return {
      left: Math.max(8, Math.min(锚点.x, 视口宽度 - 宽度 - 12)),
      top: Math.max(8, Math.min(锚点.y, 视口高度 - 高度 - 12)),
      width: Math.min(宽度, 视口宽度 - 24),
    };
  }, [加入虚拟文件夹目标?.anchor, 使用分栏加入书架目标]);
  const 转存书架菜单样式 = useMemo<CSSProperties>(() => {
    const 宽度 = 690;
    const 高度 = 460;
    const 视口宽度 = typeof window === "undefined" ? 宽度 + 24 : window.innerWidth;
    const 视口高度 = typeof window === "undefined" ? 高度 + 24 : window.innerHeight;
    const 锚点 = 移动到书架目标?.anchor ?? { x: Math.round(视口宽度 / 2 - 宽度 / 2), y: Math.round(视口高度 / 2 - 高度 / 2) };
    return {
      left: Math.max(8, Math.min(锚点.x, 视口宽度 - 宽度 - 12)),
      top: Math.max(8, Math.min(锚点.y, 视口高度 - 高度 - 12)),
      width: Math.min(宽度, 视口宽度 - 24),
    };
  }, [移动到书架目标?.anchor]);
  const 筛选后移动到书架可选目标列表 = 移动到书架可选目标列表;
  function 比较书架文件夹(左侧: VirtualFolder, 右侧: VirtualFolder): number {
    if (手机布局 || 排序 === "name-asc") return 左侧.sortIndex - 右侧.sortIndex || 左侧.createdAt - 右侧.createdAt || 文件名排序器.compare(左侧.name, 右侧.name);
    if (排序 === "name-desc") return 文件名排序器.compare(右侧.name, 左侧.name);
    if (排序 === "time-asc") return 左侧.createdAt - 右侧.createdAt || 文件名排序器.compare(左侧.name, 右侧.name);
    if (排序 === "time-desc" || 排序 === "type") return 右侧.createdAt - 左侧.createdAt || 文件名排序器.compare(左侧.name, 右侧.name);
    return 文件名排序器.compare(左侧.name, 右侧.name);
  }
  const 筛选后书架文件夹列表 = useMemo(() => {
    const 搜索 = 搜索内容;
    return 当前书架文件夹列表
      .filter((文件夹) => {
        const 文件夹标签 = 规范化标签列表(文件夹.tags);
        const 文件夹自身匹配 = 资源标签匹配筛选模式(文件夹标签, 已选标签列表, 搜索模式)
          && 匹配整理搜索(搜索, [文件夹.name, 文件夹.note], 文件夹标签, 搜索模式);
        if (文件夹自身匹配) return true;

        return 文件夹.items.some((项目) => {
          const 整理信息 = 获取资源整理信息({
            resourceKey: 项目.resourceKey,
            sourcePath: 项目.sourcePath,
            sourceType: 项目.sourceType,
            title: 项目.title,
          });
          const 标签列表 = 整理信息.tags;
          const 标签匹配 = 资源标签匹配筛选模式(标签列表, 已选标签列表, 搜索模式);
          const 搜索匹配 = 匹配整理搜索(
            搜索,
            [项目.title, 整理信息.note],
            标签列表,
            搜索模式,
          );
          return 标签匹配 && 搜索匹配;
        });
      })
      .sort(比较书架文件夹);
  }, [当前书架文件夹列表, 搜索内容, 搜索模式, 空格分隔搜索条件, 排序, 已选标签列表, 资源元数据表]);
  const 筛选后虚拟文件夹项目 = useMemo(() => {
    const 项目列表 = 当前虚拟文件夹?.items ?? [];
    const 搜索 = 搜索内容;
    return 项目列表
      .filter((项目) => {
        const 整理信息 = 获取资源整理信息({
          resourceKey: 项目.resourceKey,
          sourcePath: 项目.sourcePath,
          sourceType: 项目.sourceType,
          title: 项目.title,
        });
        const 标签列表 = 整理信息.tags;
        const 标签匹配 = 资源标签匹配筛选模式(标签列表, 已选标签列表, 搜索模式);
        const 搜索匹配 = 匹配整理搜索(
          搜索,
          [项目.title, 整理信息.note],
          标签列表,
          搜索模式,
        );
        return 标签匹配 && 搜索匹配;
      })
      .sort((左侧, 右侧) => {
        return 左侧.sortIndex - 右侧.sortIndex
          || 左侧.addedAt - 右侧.addedAt
          || 文件名排序器.compare(左侧.title, 右侧.title);
      });
  }, [当前虚拟文件夹, 搜索内容, 已选标签列表, 资源元数据表, 搜索模式, 空格分隔搜索条件]);
  const 筛选后最近打开列表 = useMemo(() => 当前阅读记录列表.filter((项目) => {
    const 整理信息 = 获取资源整理信息({
      resourceKey: 项目.resourceKey,
      sourcePath: 项目.sourcePath,
      sourceType: 项目.sourceType,
      title: 项目.title,
    });
    const 标签列表 = 整理信息.tags;
    const 标签匹配 = 资源标签匹配筛选模式(标签列表, 已选标签列表, 搜索模式);
    const 搜索匹配 = 匹配整理搜索(
      最近搜索内容,
      [项目.title, 整理信息.note],
      标签列表,
      搜索模式,
    );
    return 标签匹配 && 搜索匹配;
  }), [当前阅读记录列表, 最近搜索内容, 已选标签列表, 资源元数据表, 搜索模式, 空格分隔搜索条件]);
  const 最近打开卡片项目 = useMemo(() => 筛选后最近打开列表.map((项目) => {
    const 文件类型: 资源类型 = 项目.sourceType;
    const 扩展名 = 文件类型 === "folder" ? "" : 获取文件扩展名(项目.sourcePath);

    return {
      项目,
      文件: {
        id: 项目.resourceKey,
        name: 项目.title,
        path: 项目.sourcePath,
        type: 文件类型,
        extension: 扩展名,
      } satisfies 文件条目,
    };
  }), [筛选后最近打开列表]);
  const 收藏卡片项目 = useMemo(() => 筛选后收藏列表.map((项目) => {
    const 文件类型: 资源类型 = 项目.sourceType;
    const 扩展名 = 文件类型 === "folder" ? "" : 获取文件扩展名(项目.sourcePath);

    return {
      项目,
      文件: {
        id: 项目.resourceKey,
        name: 项目.title,
        path: 项目.sourcePath,
        type: 文件类型,
        extension: 扩展名,
      } satisfies 文件条目,
    };
  }), [筛选后收藏列表]);
  const 书签卡片项目 = useMemo(() => 筛选后书签列表.map((项目) => {
    const 文件类型: 资源类型 = 项目.sourceType;
    const 扩展名 = 文件类型 === "folder" ? "" : 获取文件扩展名(项目.sourcePath);

    return {
      项目,
      文件: {
        id: 项目.id,
        name: 项目.title,
        path: 项目.sourcePath,
        type: 文件类型,
        extension: 扩展名,
      } satisfies 文件条目,
    };
  }), [筛选后书签列表]);
  const 书架文件夹预览项目 = useMemo(() => 筛选后书架文件夹列表
    .map((文件夹) => {
      const 预览资源 = 获取书架文件夹设定封面资源(文件夹);
      if (!预览资源) return null;
      return {
        文件夹,
        预览资源,
        文件: {
          id: `${文件夹.id}:${预览资源.resourceKey}`,
          name: 预览资源.title,
          path: 预览资源.sourcePath,
          type: 预览资源.sourceType,
          extension: 预览资源.sourceType === "folder" ? "" : 获取文件扩展名(预览资源.sourcePath),
        } satisfies 文件条目,
      };
    })
    .filter((项目): 项目 is { 文件夹: VirtualFolder; 预览资源: VirtualFolderItem; 文件: 文件条目 } => 项目 !== null),
  [筛选后书架文件夹列表]);
  const 虚拟文件夹卡片项目 = useMemo(() => 筛选后虚拟文件夹项目.map((项目) => {
    const 文件类型 = 项目.sourceType;
    const 扩展名 = 文件类型 === "folder" ? "" : 获取文件扩展名(项目.sourcePath);

    return {
      项目,
      文件: {
        id: 项目.resourceKey,
        name: 项目.title,
        path: 项目.sourcePath,
        type: 文件类型,
        extension: 扩展名,
      } satisfies 文件条目,
    };
  }), [筛选后虚拟文件夹项目]);
  const 当前分页项目总数 = 当前视图 === "recent"
    ? 最近打开卡片项目.length
    : 当前视图 === "favorites"
      ? 收藏卡片项目.length
      : 当前视图 === "bookmarks"
        ? 书签卡片项目.length
        : 当前视图 === "bookshelf"
          ? 筛选后书架文件夹列表.length
          : 当前视图 === "virtual-folder"
            ? 虚拟文件夹卡片项目.length
            : 筛选排序后项目.length;
  const 连续列表启用 = true;
  const 目录资源身份 = useMemo(() => 筛选排序后项目.map(item => item.path), [筛选排序后项目]);
  const 目录连续列表 = useContinuousLibrary(列表容器, isActive && 连续列表启用 && !资源信息目标 && !正在读取,
    当前分页项目总数, 手机布局 ? 手机卡片布局 === 'list' ? 手机自适应.listColumns : 手机列数 : 获取卡片列数(卡片缩放), 手机布局 ? 手机每页数量 : 每页数量,
    JSON.stringify([导航会话,随机模式 ? 当前随机范围 : "normal",随机浏览.revision,当前视图,当前目录?.path,当前书架ID,当前虚拟文件夹ID,搜索内容,最近搜索内容,收藏搜索内容,书签搜索内容,排序,文件夹优先,隐藏已加入书架资源,已选标签列表,搜索模式,空格分隔搜索条件]),手机布局 || 随机模式, 当前视图 === 'directory' ? 目录资源身份 : undefined);
  const 实际每页数量 = 随机模式 ? (手机布局 ? 手机每页数量 : 每页数量) : 连续列表启用 ? 目录连续列表.pageSize : 每页数量;
  const 手机连续样式 = {paddingTop:目录连续列表.offset,paddingBottom:目录连续列表.bottom};
  const 总页数 = Math.max(1, Math.ceil(当前分页项目总数 / 实际每页数量));
  const 安全当前页 = 连续列表启用 ? 目录连续列表.page : Math.min(Math.max(当前页, 1), 总页数);
  const 获取当前分页切片 = <T,>(项目列表: T[]): T[] => {
    if (连续列表启用) return 项目列表.slice(目录连续列表.start,目录连续列表.end);
    const 起始位置 = (安全当前页 - 1) * 实际每页数量;
    return 项目列表.slice(起始位置, 起始位置 + 实际每页数量);
  };
  const 当前页项目 = useMemo(
    () => 当前视图 === "directory" ? 筛选排序后项目.slice(目录连续列表.start, 目录连续列表.end) : 获取当前分页切片(筛选排序后项目),
    [当前视图, 目录连续列表.start, 目录连续列表.end, 安全当前页, 实际每页数量, 筛选排序后项目],
  );
  const 当前页最近打开卡片项目 = useMemo(
    () => 获取当前分页切片(最近打开卡片项目),
    [手机布局,目录连续列表.start,目录连续列表.end,安全当前页, 实际每页数量, 最近打开卡片项目],
  );
  const 当前页收藏卡片项目 = useMemo(
    () => 获取当前分页切片(收藏卡片项目),
    [手机布局,目录连续列表.start,目录连续列表.end,安全当前页, 实际每页数量, 收藏卡片项目],
  );
  const 当前页书签卡片项目 = useMemo(
    () => 获取当前分页切片(书签卡片项目),
    [手机布局,目录连续列表.start,目录连续列表.end,安全当前页, 实际每页数量, 书签卡片项目],
  );
  const 当前页书架文件夹列表 = useMemo(
    () => 获取当前分页切片(筛选后书架文件夹列表),
    [手机布局,目录连续列表.start,目录连续列表.end,安全当前页, 实际每页数量, 筛选后书架文件夹列表],
  );
  const 当前页虚拟文件夹卡片项目 = useMemo(
    () => 获取当前分页切片(虚拟文件夹卡片项目),
    [手机布局,目录连续列表.start,目录连续列表.end,安全当前页, 实际每页数量, 虚拟文件夹卡片项目],
  );
  const 书架文件夹缩略图候选项目 = useMemo(() => {
    const 文件表 = new Map<string, 文件条目>();
    const 加入候选 = (文件夹: VirtualFolder, 项目: VirtualFolderItem | null): void => {
      if (!项目 || 文件表.has(项目.sourcePath)) return;
      文件表.set(项目.sourcePath, {
        id: `${文件夹.id}:${项目.resourceKey}`,
        name: 项目.title,
        path: 项目.sourcePath,
        type: 项目.sourceType,
        extension: 项目.sourceType === "folder" ? "" : 获取文件扩展名(项目.sourcePath),
      });
    };

    const 封面书架 = isAndroid() ? 当前页书架文件夹列表.slice(Math.max(0,目录连续列表.visibleStart-目录连续列表.start),目录连续列表.visibleEnd-目录连续列表.start) : 当前页书架文件夹列表;
    for (const 文件夹 of 封面书架) {
      加入候选(文件夹, 获取书架文件夹设定封面资源(文件夹));
      加入候选(文件夹, 文件夹.items[0] ?? null);
      if (手机布局) 文件夹.items.slice(1,3).forEach(item => 加入候选(文件夹,item));
    }

    return Array.from(文件表.values());
  }, [当前页书架文件夹列表, 手机布局,目录连续列表.visibleStart,目录连续列表.visibleEnd,目录连续列表.start]);
  const 全部标签列表 = useMemo(() => {
    const 标签集合 = new Set<string>();
    for (const 元数据 of Object.values(资源元数据表)) {
      for (const 标签 of 规范化标签列表(元数据.tags)) 标签集合.add(标签);
    }
    for (const 收藏 of 收藏列表) {
      for (const 标签 of 获取整理标签(收藏)) 标签集合.add(标签);
    }
    for (const 书签 of 书签列表) {
      for (const 标签 of 获取整理标签(书签)) 标签集合.add(标签);
    }
    for (const 文件夹 of 虚拟文件夹列表) {
      for (const 标签 of 规范化标签列表(文件夹.tags)) 标签集合.add(标签);
    }
    return 合并标签顺序(Array.from(标签集合));
  }, [资源元数据表, 收藏列表, 书签列表, 虚拟文件夹列表, 标签顺序]);
  const 当前搜索内容 = 当前视图 === "recent"
    ? 最近搜索内容
    : 当前视图 === "favorites"
      ? 收藏搜索内容
      : 当前视图 === "bookmarks"
        ? 书签搜索内容
        : 搜索内容;
  const 标签建议列表 = useMemo(() => {
    return 获取标签建议(当前搜索内容, 全部标签列表, 搜索模式);
  }, [全部标签列表, 当前搜索内容, 搜索模式, 空格分隔搜索条件]);
  const 抽屉标签建议列表 = useMemo(
    () => 获取标签建议(标签搜索内容, 全部标签列表, 搜索模式),
    [全部标签列表, 标签搜索内容, 搜索模式],
  );
  const 收藏Key集合 = useMemo(
    () => new Set(收藏列表.map((项目) => 项目.resourceKey)),
    [收藏列表],
  );
  const 缩略图目标项目 = useMemo(
    () => {
      if (当前视图 === "bookshelf") return 书架文件夹缩略图候选项目;
      const items=当前视图 === "recent" ? 当前页最近打开卡片项目.map(({ 文件 }) => 文件)
        : 当前视图 === "favorites" ? 当前页收藏卡片项目.map(({ 文件 }) => 文件)
        : 当前视图 === "virtual-folder" ? 当前页虚拟文件夹卡片项目.map(({ 文件 }) => 文件) : 当前页项目;
      const start=Math.max(0,目录连续列表.visibleStart-目录连续列表.start),end=目录连续列表.visibleEnd-目录连续列表.start;
      // Visible rows precede a single look-ahead row. DOM overscan stays mounted
      // for smooth scrolling but no longer starts dozens of archive extractions.
      const lookAhead = 目录连续列表.columns * (isAndroid() ? 1 : 2);
      return [...items.slice(start,end),...items.slice(end,end+lookAhead),...items.slice(Math.max(0,start-lookAhead),start)];
    },
    [当前视图, 当前页最近打开卡片项目, 当前页收藏卡片项目, 书架文件夹缩略图候选项目, 当前页虚拟文件夹卡片项目, 当前页项目,目录连续列表.visibleStart,目录连续列表.visibleEnd,目录连续列表.start,目录连续列表.columns],
  );
  const 当前目录阅读队列 = useMemo<阅读相邻资源项[]>(() => (
    筛选排序后项目
      .filter((文件) => 可作为阅读资源(文件.type))
      .map((文件) => {
        const 类型 = 获取文件阅读类型(文件);
        if (!类型) return null;
        const resourceKey = 获取文件资源Key(文件);
        if (!resourceKey) return null;
        return {
          key: resourceKey,
          path: 文件.path,
          type: 类型,
          title: 文件.type === "image" ? 获取目录名称(获取父目录路径(文件.path)) : 文件.name,
        } satisfies 阅读相邻资源项;
      })
      .filter((项目): 项目 is 阅读相邻资源项 => 项目 !== null)
  ), [筛选排序后项目]);
  const 最近打开阅读队列 = useMemo<阅读相邻资源项[]>(() => (
    筛选后最近打开列表.map((项目) => ({
      key: 项目.resourceKey,
      path: 项目.sourcePath,
      type: 项目.sourceType,
      title: 项目.title,
    }))
  ), [筛选后最近打开列表]);
  const 书签阅读队列 = useMemo<阅读相邻资源项[]>(() => 筛选后书签列表.map(item => ({
    key: item.id, path: item.sourcePath, type: item.sourceType, title: item.bookmarkTitle ?? item.title,
    pageIndex: item.pageIndex, pageId: item.pageId, pageName: item.pageName,
  })), [筛选后书签列表]);
  const 收藏阅读队列 = useMemo<阅读相邻资源项[]>(() => (
    筛选后收藏列表.map((项目) => ({
      key: 项目.resourceKey,
      path: 项目.sourcePath,
      type: 项目.sourceType,
      title: 项目.title,
    }))
  ), [筛选后收藏列表]);
  const 虚拟文件夹阅读队列 = useMemo<阅读相邻资源项[]>(() => (
    筛选后虚拟文件夹项目
      .filter((项目) => 项目.sourceType === "folder" || 项目.sourceType === "image" || 项目.sourceType === "archive" || 项目.sourceType === "pdf" || 项目.sourceType === "epub")
      .map((项目) => ({
        key: 项目.resourceKey,
        path: 项目.sourcePath,
        type: 项目.sourceType as "folder" | "image" | "archive" | "pdf" | "epub",
        title: 项目.title,
      }))
  ), [筛选后虚拟文件夹项目]);
  const 当前管理视图 = 当前视图 === "recent" || 当前视图 === "favorites" || 当前视图 === "bookmarks"
    || 当前视图 === "virtual-folder"
    ? 当前视图
    : null;
  const 当前选择视图: 选择视图 | null = 当前视图 === "bookshelf"
    ? null
    : 当前视图 === "directory"
    ? 当前目录 ? "directory" : null
    : 当前视图;
  const 当前选择视图Key列表 = useMemo(() => {
    if (当前视图 === "directory") return 筛选排序后项目.map((项目) => 项目.id);
    if (当前视图 === "recent") return 最近打开卡片项目.map(({ 项目 }) => 项目.resourceKey);
    if (当前视图 === "favorites") return 收藏卡片项目.map(({ 项目 }) => 项目.resourceKey);
    if (当前视图 === "bookmarks") return 书签卡片项目.map(({ 项目 }) => 项目.id);
    if (当前视图 === "virtual-folder") return 虚拟文件夹卡片项目.map(({ 项目 }) => 项目.resourceKey);
    return [];
  }, [当前视图, 筛选排序后项目, 最近打开卡片项目, 收藏卡片项目, 书签卡片项目, 虚拟文件夹卡片项目]);
  const 左下统计文本 = useMemo(() => {
    if (当前视图 === "recent") return `${t(阅读记录标题)} ${当前阅读记录列表.length} 项`;
    if (当前视图 === "favorites") return `收藏 ${收藏列表.length} 项`;
    if (当前视图 === "bookmarks") return `书签 ${书签列表.length} 项`;
    if (当前视图 === "bookshelf") return `${当前书架?.name ?? "书架栏"} ${当前书架文件夹列表.length} 项`;
    if (当前视图 === "virtual-folder") return `${当前虚拟文件夹?.name ?? "书架"} ${当前虚拟文件夹?.items.length ?? 0} 项`;
    if (当前目录) {
      const 目录名 = 当前根目录项目 && 当前目录.path === 当前根目录项目.path
        ? 当前根目录项目.name
        : 获取目录名称(当前目录.path);
      return `${目录名} ${当前目录.items.length} 项`;
    }
    return "未选择目录 0 项";
  }, [
    当前视图,
    当前阅读记录列表.length, 阅读记录标题,
    收藏列表.length,
    书签列表.length,
    当前书架,
    当前书架文件夹列表.length,
    当前虚拟文件夹,
    当前目录,
    当前根目录项目,
  ]);
  const 当前虚拟文件夹无效资源项目 = useMemo(
    () => (当前虚拟文件夹?.items ?? []).filter((项目) => 路径是否失效(项目.sourcePath)),
    [当前虚拟文件夹, 资源路径状态表],
  );
  const 当前虚拟文件夹无效资源Key = useMemo(() => {
    if (!当前虚拟文件夹 || 当前虚拟文件夹无效资源项目.length === 0) return null;
    const keys = 当前虚拟文件夹无效资源项目.map((项目) => 项目.resourceKey).sort();
    return `${当前虚拟文件夹.id}:${keys.join("|")}`;
  }, [当前虚拟文件夹, 当前虚拟文件夹无效资源项目]);
  const 是否显示分页 = !随机模式 && 当前分页项目总数 > 实际每页数量;

  useEffect(() => {
    if (当前页 !== 安全当前页) {
      if (当前视图 !== "directory") 待恢复滚动位置.current = "top";
      设置当前页(安全当前页);
    }
    设置页码输入(String(安全当前页));
  }, [安全当前页, 当前页]);


  useEffect(() => {
    if (当前选择视图 && 选择模式 === 当前选择视图) {
      const 可用Key集合 = new Set(当前选择视图Key列表);
      设置已选项目Key集合((原集合) => {
        const 新集合 = new Set(Array.from(原集合).filter((key) => 可用Key集合.has(key)));
        return 新集合.size === 原集合.size ? 原集合 : 新集合;
      });
      return;
    }

    设置选择模式(null);
    设置已选项目Key集合(new Set());
    设置批量删除确认(null);
  }, [当前选择视图, 当前选择视图Key列表, 选择模式]);

  useEffect(() => {
    if (!isActive || !当前选择视图 || 选择模式 !== 当前选择视图) return;

    const 处理选择快捷键 = (事件: KeyboardEvent): void => {
      const 目标 = 事件.target;
      if (目标 instanceof HTMLElement) {
        const 标签名 = 目标.tagName.toLowerCase();
        if (目标.isContentEditable || 标签名 === "input" || 标签名 === "textarea" || 标签名 === "select") return;
      }
      if (当前右侧抽屉 || 资源信息目标 || 待删除标签列表 || 批量删除确认 || 待删除根目录 || 标签添加弹窗打开) return;

      if (事件.key === "Escape") {
        事件.preventDefault();
        退出选择模式();
        return;
      }

      if (事件.ctrlKey && 事件.key.toLowerCase() === "a") {
        事件.preventDefault();
        全选当前选择视图();
        return;
      }

      if (事件.key === "Delete" && 已选项目Key集合.size > 0) {
        事件.preventDefault();
        请求删除选中(当前选择视图);
      }
    };

    window.addEventListener("keydown", 处理选择快捷键);
    return () => window.removeEventListener("keydown", 处理选择快捷键);
  }, [
    当前选择视图,
    isActive,
    选择模式,
    已选项目Key集合,
    当前选择视图Key列表,
    删除前确认设置,
    当前右侧抽屉,
    资源信息目标,
    待删除标签列表,
    批量删除确认,
    待删除根目录,
    标签添加弹窗打开,
  ]);

  useLayoutEffect(() => {
    const 容器 = 列表容器.current;
    const 目标位置 = 待恢复滚动位置.current;
    if (!容器 || !目标位置) return;
    if (连续列表启用) { 待恢复滚动位置.current = null; return; }

    容器.scrollTo({
      top: 目标位置 === "bottom" ? 容器.scrollHeight : 0,
      behavior: "auto",
    });
    待恢复滚动位置.current = null;
  }, [安全当前页, 当前页项目]);

  useEffect(() => {
    if (!isActive || !阅读返回定位快照.current) return;
    const 快照 = 阅读返回定位快照.current;
    阅读返回定位快照.current = null;
    待恢复滚动位置.current = null;
    待恢复精确滚动位置.current = 快照.scrollTop;
    设置当前书架ID(快照.currentBookshelfId);
    设置当前虚拟文件夹ID(快照.currentVirtualFolderId);
    设置当前视图(快照.view);
    设置当前页(快照.page);
  }, [isActive]);

  useLayoutEffect(() => {
    if (!isActive || 待恢复精确滚动位置.current === null) return;
    const 目标位置 = 待恢复精确滚动位置.current;
    const 动画帧 = window.requestAnimationFrame(() => {
      const 容器 = 列表容器.current;
      if (!容器) return;
      容器.scrollTo({ top: 目标位置, behavior: "auto" });
      待恢复精确滚动位置.current = null;
    });
    return () => window.cancelAnimationFrame(动画帧);
  }, [
    isActive,
    当前视图,
    安全当前页,
    当前页项目,
    最近打开卡片项目,
    收藏卡片项目,
    书签卡片项目,
    虚拟文件夹卡片项目,
  ]);

  useEffect(() => {
    if (!isActive) return;

    const 聚焦搜索快捷键 = (事件: KeyboardEvent): void => {
      if (!(事件.ctrlKey || 事件.metaKey) || 事件.key.toLocaleLowerCase() !== "k") return;
      const 目标 = 事件.target;
      if (目标 instanceof HTMLElement) {
        const 标签名 = 目标.tagName.toLowerCase();
        if (目标.isContentEditable || 标签名 === "textarea" || 标签名 === "select") return;
      }
      if (当前右侧抽屉 || 资源信息目标) return;
      事件.preventDefault();
      主搜索输入框.current?.focus();
      主搜索输入框.current?.select();
    };

    window.addEventListener("keydown", 聚焦搜索快捷键);
    return () => window.removeEventListener("keydown", 聚焦搜索快捷键);
  }, [isActive, 当前右侧抽屉, 资源信息目标]);

  useEffect(() => {
    if (!isActive || !随机模式) return;
    document.documentElement.dataset.randomBrowse = 'on';
    const 先退出随机 = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      随机浏览.stop();
    };
    window.addEventListener('keydown', 先退出随机, true);
    window.addEventListener('omi-back', 先退出随机, true);
    window.addEventListener('omi-library-back', 先退出随机, true);
    return () => {
      delete document.documentElement.dataset.randomBrowse;
      window.removeEventListener('keydown', 先退出随机, true);
      window.removeEventListener('omi-back', 先退出随机, true);
      window.removeEventListener('omi-library-back', 先退出随机, true);
    };
  }, [isActive, 随机模式]);

  useEffect(() => {
    if (!isActive) return;

    const 退出主搜索焦点 = (): void => {
      const 输入框 = 主搜索输入框.current;
      if (!输入框 || document.activeElement !== 输入框) return;
      输入框.blur();
      设置主搜索建议可见(false);
    };

    const 处理搜索外部点击 = (事件: PointerEvent): void => {
      const 输入框 = 主搜索输入框.current;
      if (!输入框 || document.activeElement !== 输入框) return;
      const 目标 = 事件.target;
      const 搜索区域 = 输入框.closest(".search-shell");
      if (目标 instanceof Node && 搜索区域?.contains(目标)) return;
      退出主搜索焦点();
    };

    const 处理搜索退出按键 = (事件: KeyboardEvent): void => {
      if (事件.key !== 'Escape' || 事件.defaultPrevented || 当前右侧抽屉 || 资源信息目标) return;
      if (document.activeElement === 主搜索输入框.current) {
        事件.preventDefault(); 事件.stopImmediatePropagation(); 退出主搜索焦点(); return;
      }
      if (当前搜索内容 || 手机筛选展开) {
        事件.preventDefault(); 事件.stopImmediatePropagation(); 取消当前搜索();
      }
    };

    document.addEventListener("pointerdown", 处理搜索外部点击, true);
    document.addEventListener("keydown", 处理搜索退出按键, true);
    return () => {
      document.removeEventListener("pointerdown", 处理搜索外部点击, true);
      document.removeEventListener("keydown", 处理搜索退出按键, true);
    };
  }, [isActive, 当前搜索内容, 手机筛选展开, 当前右侧抽屉, 资源信息目标]);

  useEffect(() => () => {
    if (滚轮停止定时器.current !== null) {
      window.clearTimeout(滚轮停止定时器.current);
    }
    if (书架备注悬停定时器.current !== null) {
      window.clearTimeout(书架备注悬停定时器.current);
    }
    if (成功提示定时器.current !== null) {
      window.clearTimeout(成功提示定时器.current);
    }
  }, []);

  useEffect(() => {
    隐藏书架备注悬浮窗();
  }, [当前视图, 搜索内容, 排序, 缩略图尺寸, 书架备注悬停延迟]);

  useEffect(() => {
    function 处理按键按下(事件: KeyboardEvent): void {
      if (事件.key === "Control" || 事件.ctrlKey) 设置备注悬停快捷键按下(true);
    }

    function 处理按键松开(事件: KeyboardEvent): void {
      if (事件.key === "Control" || !事件.ctrlKey) {
        设置备注悬停快捷键按下(false);
        隐藏书架备注悬浮窗();
      }
    }

    function 处理窗口失焦(): void {
      设置备注悬停快捷键按下(false);
      隐藏书架备注悬浮窗();
    }

    window.addEventListener("keydown", 处理按键按下);
    window.addEventListener("keyup", 处理按键松开);
    window.addEventListener("blur", 处理窗口失焦);
    return () => {
      window.removeEventListener("keydown", 处理按键按下);
      window.removeEventListener("keyup", 处理按键松开);
      window.removeEventListener("blur", 处理窗口失焦);
    };
  }, []);

  useEffect(() => {
    if (!书架备注悬浮窗) return;

    window.addEventListener("pointerdown", 隐藏书架备注悬浮窗, true);
    window.addEventListener("wheel", 隐藏书架备注悬浮窗, true);
    window.addEventListener("scroll", 隐藏书架备注悬浮窗, true);
    window.addEventListener("resize", 隐藏书架备注悬浮窗);
    return () => {
      window.removeEventListener("pointerdown", 隐藏书架备注悬浮窗, true);
      window.removeEventListener("wheel", 隐藏书架备注悬浮窗, true);
      window.removeEventListener("scroll", 隐藏书架备注悬浮窗, true);
      window.removeEventListener("resize", 隐藏书架备注悬浮窗);
    };
  }, [书架备注悬浮窗]);

  useEffect(() => {
    let 已取消 = false;

    async function 恢复本地数据(): Promise<void> {
      const 结果 = initialData ? await Promise.resolve({ ok: true as const, data: initialData }) : await window.omicomic.getAppData();
      if (已取消) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        设置数据已加载(true);
        return;
      }

      应用界面设置(结果.data.settings);
      设置移除索引数量(结果.data.excludedResourcePaths?.length ?? 0);
      设置根目录列表(结果.data.library.roots);
      设置阅读进度表(结果.data.readingProgress);
      设置最近打开列表(结果.data.recentOpened);
      设置临时存放列表(结果.data.temporaryOpened ?? []);
      设置收藏列表(结果.data.favorites);
      设置书签列表(结果.data.bookmarks);
      设置书架列表(结果.data.bookshelves);
      设置当前书架ID((当前ID) => (
        当前ID && 结果.data.bookshelves.some((书架) => 书架.id === 当前ID)
          ? 当前ID
          : 结果.data.bookshelves[0]?.id ?? null
      ));
      设置虚拟文件夹列表(结果.data.virtualFolders);
      设置资源元数据表(结果.data.resourceMeta);
      设置标签顺序(结果.data.tagOrder);
      设置数据已加载(true);

      const 恢复根目录 = 结果.data.library.roots.find(
        (根目录) => 根目录.path === 结果.data.library.lastActiveRootPath,
      ) ?? 结果.data.library.roots[0];

      if (恢复根目录) {
        const 恢复目录 = 结果.data.library.lastCurrentPath ?? 恢复根目录.path;
        const 已恢复 = await 打开目录(恢复目录, 恢复根目录.path, "none", false);
        if (!已恢复 && !已取消) {
          await 打开目录(恢复根目录.path, 恢复根目录.path, "none", false);
          设置错误信息("上次打开的目录不存在或无法访问。");
        }
      }
    }

    void 恢复本地数据().finally(() => { if (!已取消) 设置初始目录就绪(true); });
    return () => {
      已取消 = true;
    };
  }, []);

  useEffect(() => {
    if (!数据已加载 || !isActive) return;
    const 首次快照 = 首次资料刷新.current;
    if (首次快照) {
      首次资料刷新.current = null;
      if (首次快照.active && 首次快照.refreshToken === refreshToken) return;
    }
    let 已取消 = false;

    async function 刷新阅读数据(): Promise<void> {
      const 保存序号 = 设置保存请求序号.current;
      const 结果 = await window.omicomic.getAppData();
      if (已取消 || !结果.ok) return;
      设置根目录列表(结果.data.library.roots);
      if (isAndroid() && 保存序号 === 设置保存请求序号.current) {
        const { readerVolumeKeys, readerVolumeKeysReversed } = 结果.data.settings;
        界面设置快照.current = { ...界面设置快照.current, readerVolumeKeys, readerVolumeKeysReversed };
        设置音量键翻页(Boolean(readerVolumeKeys));设置反转音量键(Boolean(readerVolumeKeysReversed));
      }
      设置阅读进度表(结果.data.readingProgress);
      设置最近打开列表(结果.data.recentOpened);
      设置临时存放列表(结果.data.temporaryOpened ?? []);
      设置收藏列表(结果.data.favorites);
      设置书签列表(结果.data.bookmarks);
      设置书架列表(结果.data.bookshelves);
      设置当前书架ID((当前ID) => (
        当前ID && 结果.data.bookshelves.some((书架) => 书架.id === 当前ID)
          ? 当前ID
          : 结果.data.bookshelves[0]?.id ?? null
      ));
      设置虚拟文件夹列表(结果.data.virtualFolders);
      设置资源元数据表(结果.data.resourceMeta);
      设置标签顺序(结果.data.tagOrder);
      // A details panel can stay mounted behind the reader. Refresh only its
      // page manifest on return, preserving the selected physical thumbnail.
      const preview = 资源详情阅读资源, sequence = 资源详情加载序号.current;
      if (preview && 资源信息目标 && preview.sourceType !== 'pdf' && preview.sourceType !== 'epub') {
        const selected = preview.pages[资源详情所选页];
        const refreshed = await window.omicomic.getResourcePages({ path: preview.sourcePath, type: preview.sourceType });
        if (!已取消 && sequence === 资源详情加载序号.current && refreshed.ok) {
          设置资源详情阅读资源(refreshed.data);
          const index = resolvePageIndex(refreshed.data.pages, selected ? pageIdentity(selected) : undefined, undefined, 资源详情所选页);
          设置资源详情所选页(index); 设置资源详情预览页(Math.floor(index / 48));
        }
      }
    }

    void 刷新阅读数据();
    return () => {
      已取消 = true;
    };
  }, [refreshToken, 数据已加载, isActive]);

  useEffect(() => {
    设置侧栏临时顺序((原顺序) => {
      const 有效Key = new Set(默认侧栏浏览顺序);
      const 保留顺序 = 原顺序.filter((key) => 有效Key.has(key));
      const 新顺序 = [
        ...保留顺序,
        ...默认侧栏浏览顺序.filter((key) => !保留顺序.includes(key)),
      ];
      return 数组内容相同(原顺序, 新顺序) ? 原顺序 : 新顺序;
    });
  }, [默认侧栏浏览顺序]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = 视图菜单容器.current;
      const list = (event.target as Element | null)?.closest?.('[role="listbox"]');
      const owner = list?.getAttribute("aria-labelledby");
      if (owner && menu?.contains(document.getElementById(owner))) return;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const menu = 视图菜单容器.current;
      if (event.key === "Escape" && menu?.open) {
        if (menu.querySelector('[role="combobox"][aria-expanded="true"]')) return;
        event.preventDefault(); event.stopPropagation(); menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, []);

  useEffect(() => {
    if (!根目录下拉打开) return;

    function 处理下拉外部点击(事件: MouseEvent): void {
      if (!根目录下拉容器.current?.contains(事件.target as Node)) {
        设置根目录下拉打开(false);
      }
    }

    function 处理下拉按键(事件: KeyboardEvent): void {
      if (事件.key === "Escape") 设置根目录下拉打开(false);
    }

    window.addEventListener("mousedown", 处理下拉外部点击, true);
    window.addEventListener("keydown", 处理下拉按键);
    return () => {
      window.removeEventListener("mousedown", 处理下拉外部点击, true);
      window.removeEventListener("keydown", 处理下拉按键);
    };
  }, [根目录下拉打开]);

  useEffect(() => {
    if (!根目录拖拽路径) return;
    const 当前拖拽路径 = 根目录拖拽路径;

    function 完成拖拽(): void {
      if (根目录拖拽落点) {
        const 当前顺序 = 根目录列表.map((根目录) => 根目录.path);
        const 新顺序 = 计算卡片拖拽后顺序(当前顺序, 当前拖拽路径, 根目录拖拽落点);
        if (!数组内容相同(当前顺序, 新顺序)) void 保存根目录顺序(新顺序);
      }
      设置根目录拖拽路径(null);
      设置根目录拖拽落点(null);
    }

    function 取消拖拽(): void {
      设置根目录拖拽路径(null);
      设置根目录拖拽落点(null);
    }

    window.addEventListener("mouseup", 完成拖拽);
    window.addEventListener("blur", 取消拖拽);
    return () => {
      window.removeEventListener("mouseup", 完成拖拽);
      window.removeEventListener("blur", 取消拖拽);
    };
  }, [根目录拖拽路径, 根目录拖拽落点, 根目录列表]);

  useEffect(() => {
    if (!侧栏拖拽Key) return;
    const 当前拖拽Key = 侧栏拖拽Key;

    function 完成拖拽(): void {
      const 当前顺序 = 侧栏临时顺序.length > 0 ? 侧栏临时顺序 : 默认侧栏浏览顺序;
      if (侧栏拖拽落点) {
        const 新顺序 = 计算侧栏拖拽后顺序(当前顺序, 当前拖拽Key, 侧栏拖拽落点);
        if (!数组内容相同(当前顺序, 新顺序)) {
          设置侧栏临时顺序(新顺序);
          void 保存侧栏书架顺序(新顺序, 当前顺序);
        }
      }
      设置侧栏拖拽Key(null);
      设置侧栏拖拽落点(null);
    }

    function 取消拖拽(): void {
      设置侧栏拖拽Key(null);
      设置侧栏拖拽落点(null);
    }

    window.addEventListener("mouseup", 完成拖拽);
    window.addEventListener("blur", 取消拖拽);
    return () => {
      window.removeEventListener("mouseup", 完成拖拽);
      window.removeEventListener("blur", 取消拖拽);
    };
  }, [侧栏拖拽Key, 侧栏拖拽落点, 侧栏临时顺序, 默认侧栏浏览顺序]);

  useEffect(() => {
    if (!中键拖拽悬浮卡片) return;

    function 更新悬浮卡片位置(事件: MouseEvent): void {
      设置中键拖拽悬浮卡片((当前) => 当前 ? { ...当前, x: 事件.clientX, y: 事件.clientY } : 当前);
      if (书架文件夹拖拽Key) 设置书架文件夹拖拽落点(cardDropAtPoint(事件, 'shelf', 书架文件夹拖拽Key));
      if (书架资源拖拽Key) 设置书架资源拖拽落点(cardDropAtPoint(事件, 'resource', 书架资源拖拽Key));
      if (收藏拖拽Key) 设置收藏拖拽落点(cardDropAtPoint(事件, 'favorite', 收藏拖拽Key));
      if (书签拖拽Key) 设置书签拖拽落点(cardDropAtPoint(事件, 'bookmark', 书签拖拽Key));
    }

    window.addEventListener("mousemove", 更新悬浮卡片位置);
    return () => window.removeEventListener("mousemove", 更新悬浮卡片位置);
  }, [Boolean(中键拖拽悬浮卡片), 书架文件夹拖拽Key, 书架资源拖拽Key, 收藏拖拽Key, 书签拖拽Key]);

  useEffect(() => {
    if (!书架文件夹拖拽Key || !当前书架) return;
    const 当前拖拽Key = 书架文件夹拖拽Key;
    const 当前书架ID = 当前书架.id;

    function 完成拖拽(事件: MouseEvent): void {
      if (事件.button !== 1) return;
      const 最终落点 = cardDropAtPoint(事件, 'shelf', 当前拖拽Key);
      if (最终落点) {
        const 当前顺序 = 当前书架文件夹列表.slice().sort(比较书架文件夹)
          .map((文件夹) => 文件夹.id);
        const 新顺序 = 计算卡片拖拽后顺序(当前顺序, 当前拖拽Key, 最终落点);
        if (!数组内容相同(当前顺序, 新顺序)) {
          void 保存书架文件夹拖拽顺序(当前书架ID, 新顺序);
        }
      }
      设置书架文件夹拖拽Key(null);
      设置书架文件夹拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    function 取消拖拽(): void {
      设置书架文件夹拖拽Key(null);
      设置书架文件夹拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    window.addEventListener("mouseup", 完成拖拽);
    window.addEventListener("blur", 取消拖拽);
    return () => {
      window.removeEventListener("mouseup", 完成拖拽);
      window.removeEventListener("blur", 取消拖拽);
    };
  }, [书架文件夹拖拽Key, 当前书架, 当前书架文件夹列表, 排序]);

  useEffect(() => {
    if (!书架资源拖拽Key || !当前虚拟文件夹) return;
    const 当前拖拽Key = 书架资源拖拽Key;
    const 当前文件夹 = 当前虚拟文件夹;

    function 完成拖拽(事件: MouseEvent): void {
      if (事件.button !== 1) return;
      const 最终落点 = cardDropAtPoint(事件, 'resource', 当前拖拽Key);
      if (最终落点) {
        const 当前顺序 = [...当前文件夹.items]
          .sort((左侧, 右侧) => (
            左侧.sortIndex - 右侧.sortIndex
              || 左侧.addedAt - 右侧.addedAt
              || 文件名排序器.compare(左侧.title, 右侧.title)
          ))
          .map((项目) => 项目.resourceKey);
        const 新顺序 = 计算卡片拖拽后顺序(当前顺序, 当前拖拽Key, 最终落点);
        if (!数组内容相同(当前顺序, 新顺序)) {
          void 保存书架资源拖拽顺序(当前文件夹.id, 新顺序);
        }
      }
      设置书架资源拖拽Key(null);
      设置书架资源拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    function 取消拖拽(): void {
      设置书架资源拖拽Key(null);
      设置书架资源拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    window.addEventListener("mouseup", 完成拖拽);
    window.addEventListener("blur", 取消拖拽);
    return () => {
      window.removeEventListener("mouseup", 完成拖拽);
      window.removeEventListener("blur", 取消拖拽);
    };
  }, [书架资源拖拽Key, 书架资源拖拽落点, 当前虚拟文件夹]);

  useEffect(() => {
    if (!收藏拖拽Key) return;
    const 当前拖拽Key = 收藏拖拽Key;

    function 完成拖拽(事件: MouseEvent): void {
      if (事件.button !== 1) return;
      const 最终落点 = cardDropAtPoint(事件, 'favorite', 当前拖拽Key);
      if (最终落点) {
        const 当前顺序 = 获取收藏拖拽当前顺序();
        const 新顺序 = 计算卡片拖拽后顺序(当前顺序, 当前拖拽Key, 最终落点);
        if (!数组内容相同(当前顺序, 新顺序)) {
          void 保存收藏拖拽顺序(新顺序);
        }
      }
      设置收藏拖拽Key(null);
      设置收藏拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    function 取消拖拽(): void {
      设置收藏拖拽Key(null);
      设置收藏拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    window.addEventListener("mouseup", 完成拖拽);
    window.addEventListener("blur", 取消拖拽);
    return () => {
      window.removeEventListener("mouseup", 完成拖拽);
      window.removeEventListener("blur", 取消拖拽);
    };
  }, [收藏拖拽Key, 收藏拖拽落点, 收藏列表]);

  useEffect(() => {
    if (!书签拖拽Key) return;
    const 当前拖拽Key = 书签拖拽Key;

    function 完成拖拽(事件: MouseEvent): void {
      if (事件.button !== 1) return;
      const 最终落点 = cardDropAtPoint(事件, 'bookmark', 当前拖拽Key);
      if (最终落点) {
        const 当前顺序 = 获取书签拖拽当前顺序();
        const 新顺序 = 计算卡片拖拽后顺序(当前顺序, 当前拖拽Key, 最终落点);
        if (!数组内容相同(当前顺序, 新顺序)) {
          void 保存书签拖拽顺序(新顺序);
        }
      }
      设置书签拖拽Key(null);
      设置书签拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    function 取消拖拽(): void {
      设置书签拖拽Key(null);
      设置书签拖拽落点(null);
      设置中键拖拽悬浮卡片(null);
    }

    window.addEventListener("mouseup", 完成拖拽);
    window.addEventListener("blur", 取消拖拽);
    return () => {
      window.removeEventListener("mouseup", 完成拖拽);
      window.removeEventListener("blur", 取消拖拽);
    };
  }, [书签拖拽Key, 书签拖拽落点, 书签列表]);

  useEffect(() => {
    if (!目录空白菜单 && !资源菜单 && !最近菜单 && !收藏菜单 && !书签菜单 && !书架菜单 && !书架栏空白菜单 && !虚拟文件夹菜单 && !书架空白菜单 && !书架内部空白菜单 && !整理空白菜单 && !虚拟文件夹资源菜单 && !根目录菜单 && !标签菜单) return;

    function 关闭菜单(): void {
      设置目录空白菜单(null);
      设置资源菜单(null);
      设置最近菜单(null);
      设置收藏菜单(null);
      设置书签菜单(null);
      设置书架菜单(null);
      设置书架栏空白菜单(null);
      设置虚拟文件夹菜单(null);
      设置书架空白菜单(null);
      设置书架内部空白菜单(null);
      设置整理空白菜单(null);
      设置虚拟文件夹资源菜单(null);
      设置根目录菜单(null);
      设置标签菜单(null);
    }

    function 处理按键(事件: KeyboardEvent): void {
      if (事件.key === "Escape") {
        设置目录空白菜单(null);
        设置资源菜单(null);
        设置最近菜单(null);
        设置收藏菜单(null);
        设置书签菜单(null);
        设置书架菜单(null);
        设置书架栏空白菜单(null);
        设置虚拟文件夹菜单(null);
        设置书架空白菜单(null);
        设置书架内部空白菜单(null);
        设置整理空白菜单(null);
        设置虚拟文件夹资源菜单(null);
        设置根目录菜单(null);
        设置标签菜单(null);
      }
    }

    window.addEventListener("click", 关闭菜单);
    window.addEventListener("keydown", 处理按键);
    return () => {
      window.removeEventListener("click", 关闭菜单);
      window.removeEventListener("keydown", 处理按键);
    };
  }, [目录空白菜单, 资源菜单, 最近菜单, 收藏菜单, 书签菜单, 书架菜单, 书架栏空白菜单, 虚拟文件夹菜单, 书架空白菜单, 书架内部空白菜单, 整理空白菜单, 虚拟文件夹资源菜单, 根目录菜单, 标签菜单]);

  useEffect(() => {
    if (!当前右侧抽屉) return;

    function 处理抽屉快捷键(事件: KeyboardEvent): void {
      if (事件.defaultPrevented) return;
      if (待删除标签列表 || 批量删除确认 || 待删除根目录) return;
      const 目标 = 事件.target;

      if (事件.key === "Escape") {
        事件.preventDefault();
        if (当前右侧抽屉 === "tag-filter" && 标签删除选择模式) {
          退出标签删除选择模式();
          return;
        }
        关闭右侧抽屉();
        return;
      }

      if (当前右侧抽屉 === "tag-filter" && 标签删除选择模式 && 事件.key === "Delete") {
        事件.preventDefault();
        请求删除已选择标签();
        return;
      }

      if (当前右侧抽屉 === "tag-filter" && 事件.ctrlKey && 事件.key.toLocaleLowerCase() === "d") {
        事件.preventDefault();
        设置已选标签列表([]);
        回到第一页();
      }
    }

    window.addEventListener("keydown", 处理抽屉快捷键);
    return () => window.removeEventListener("keydown", 处理抽屉快捷键);
  }, [当前右侧抽屉, 标签删除选择模式, 待删除标签选择集合, 待删除标签列表, 批量删除确认, 待删除根目录, 标签添加弹窗打开, 整理保存中, 资源信息目标, 整理备注输入, 整理标签输入]);

  useEffect(() => {
    if (!资源信息目标) return;

    function 处理资源详情快捷键(事件: KeyboardEvent): void {
      if (事件.defaultPrevented || 待删除标签列表 || 批量删除确认 || 待删除根目录) return;
      if (事件.key === "Escape") {
        事件.preventDefault();
        if (标签添加弹窗打开) 关闭标签添加弹窗();
        else if (资源详情路径浮层打开) 设置资源详情路径浮层打开(false);
        else if (资源详情编辑模式) 取消资源详情信息编辑();
        else 关闭资源详情页面();
        return;
      }
      if (事件.key !== "Enter" || 事件.isComposing || 整理保存中 || 标签添加弹窗打开) return;
      const 目标 = 事件.target;
      if (目标 instanceof HTMLElement) {
        const 标签名 = 目标.tagName.toLowerCase();
        if (标签名 === "textarea" && (事件.ctrlKey || 事件.metaKey)) {
          事件.preventDefault();
          void 完成资源详情信息编辑();
          return;
        }
        if (目标.isContentEditable || ["input", "textarea", "select", "button", "a"].includes(标签名)) return;
      }
      if (资源详情编辑模式) {
        事件.preventDefault();
        void 完成资源详情信息编辑();
      }
    }

    window.addEventListener("keydown", 处理资源详情快捷键);
    return () => window.removeEventListener("keydown", 处理资源详情快捷键);
  }, [资源信息目标, 资源详情编辑模式, 资源详情路径浮层打开, 标签添加弹窗打开, 整理保存中, 整理备注输入, 整理标签输入, 待删除标签列表, 批量删除确认, 待删除根目录]);

  useEffect(() => {
    if (!资源信息目标 || !资源详情编辑模式) return;

    function 处理资源详情编辑外部点击(事件: PointerEvent): void {
      const 目标 = 事件.target;
      if (!(目标 instanceof Node)) return;
      if (
        (目标 instanceof Element && !!目标.closest(".resource-detail-direct-summary textarea, .resource-detail-direct-tags button"))
        || 标签添加浮层.current?.contains(目标)
        || 标签添加触发区.current?.contains(目标)
        || (目标 instanceof Element && 目标.closest(".resource-detail-action, .mobile-library-back"))
      ) return;
      consumeDismissGesture(事件);
      void 完成资源详情信息编辑();
    }

    window.addEventListener("pointerdown", 处理资源详情编辑外部点击, true);
    return () => window.removeEventListener("pointerdown", 处理资源详情编辑外部点击, true);
  }, [资源信息目标, 资源详情编辑模式, 整理保存中, 整理备注输入, 整理标签输入]);

  useEffect(() => {
    if (当前右侧抽屉 !== "settings") return;

    let 动画帧 = window.requestAnimationFrame(() => {
      约束设置窗口位置();
      设置窗口元素.current
        ?.querySelector<HTMLElement>(".settings-category-button.is-active")
        ?.focus();
    });

    function 处理设置窗口尺寸变化(): void {
      window.cancelAnimationFrame(动画帧);
      动画帧 = window.requestAnimationFrame(约束设置窗口位置);
    }

    window.addEventListener("resize", 处理设置窗口尺寸变化);
    return () => {
      window.cancelAnimationFrame(动画帧);
      window.removeEventListener("resize", 处理设置窗口尺寸变化);
    };
  }, [当前右侧抽屉, 当前设置分类]);

  useEffect(() => {
    if (!标签添加弹窗打开) return;
    更新标签添加浮层位置();

    function 处理标签添加外部点击(事件: MouseEvent): void {
      if (performance.now() < 标签添加忽略外部点击截止.current) return;
      const 目标 = 事件.target;
      if (
        目标 instanceof Node
        && (
          标签添加触发区.current?.contains(目标)
          || 标签添加浮层.current?.contains(目标)
        )
      ) return;
      consumeDismissGesture(事件);
      关闭标签添加弹窗();
    }

    function 处理标签添加浮层重定位(): void {
      更新标签添加浮层位置();
    }

    window.addEventListener("mousedown", 处理标签添加外部点击, true);
    window.addEventListener("resize", 处理标签添加浮层重定位);
    window.addEventListener("scroll", 处理标签添加浮层重定位, true);
    return () => {
      window.removeEventListener("mousedown", 处理标签添加外部点击, true);
      window.removeEventListener("resize", 处理标签添加浮层重定位);
      window.removeEventListener("scroll", 处理标签添加浮层重定位, true);
    };
  }, [标签添加弹窗打开]);

  useEffect(() => {
    if (!资源详情路径浮层打开) return;

    function 处理路径浮层外部点击(事件: PointerEvent): void {
      const 目标 = 事件.target;
      if (目标 instanceof Node && 资源详情路径控件.current?.contains(目标)) return;
      consumeDismissGesture(事件);
      设置资源详情路径浮层打开(false);
    }

    window.addEventListener("pointerdown", 处理路径浮层外部点击, true);
    return () => window.removeEventListener("pointerdown", 处理路径浮层外部点击, true);
  }, [资源详情路径浮层打开]);

  useEffect(() => {
    if (!完整标签浮层) return;

    function 关闭完整标签预览(事件?: Event): void {
      if (事件?.target instanceof Element && 事件.target.closest(".preview-tag-popover")) return;
      if(事件) consumeDismissGesture(事件);
      设置完整标签浮层(null);
    }

    function 处理完整标签预览按键(事件: KeyboardEvent): void {
      if (事件.key === "Escape") 关闭完整标签预览();
    }

    window.addEventListener("pointerdown", 关闭完整标签预览, true);
    window.addEventListener("wheel", 关闭完整标签预览, true);
    window.addEventListener("scroll", 关闭完整标签预览, true);
    window.addEventListener("resize", 关闭完整标签预览);
    window.addEventListener("keydown", 处理完整标签预览按键);
    return () => {
      window.removeEventListener("pointerdown", 关闭完整标签预览, true);
      window.removeEventListener("wheel", 关闭完整标签预览, true);
      window.removeEventListener("scroll", 关闭完整标签预览, true);
      window.removeEventListener("resize", 关闭完整标签预览);
      window.removeEventListener("keydown", 处理完整标签预览按键);
    };
  }, [完整标签浮层]);

  useEffect(() => {
    设置完整标签浮层(null);
  }, [当前视图, 当前根目录, 当前页, 搜索内容, 最近搜索内容, 收藏搜索内容, 书签搜索内容, 排序, 每页数量, 当前右侧抽屉]);

  useEffect(() => {
    if (!资源信息目标 || 资源信息目标.thumbnailUrl) return;
    let 已取消 = false;

    async function 加载资源信息预览(): Promise<void> {
      if (!资源信息目标) return;
      if (资源信息目标.kind === "resource") {
        if (!支持真实缩略图(资源信息目标.fileType)) return;
        const 结果 = await getResourceThumbnail({
          path: 资源信息目标.input.sourcePath,
          type: 资源信息目标.fileType,
        });
        if (已取消 || !结果.ok || !结果.data.url) return;
        设置资源信息目标((当前目标) => {
          if (!当前目标 || 当前目标.kind !== "resource") return 当前目标;
          if (当前目标.input.resourceKey !== 资源信息目标.input.resourceKey) return 当前目标;
          return { ...当前目标, thumbnailUrl: 结果.data.url };
        });
        return;
      }

      const 结果 = await window.omicomic.getBookmarkPagePreview({
        sourcePath: 资源信息目标.item.sourcePath,
        sourceType: 资源信息目标.item.sourceType,
        pageIndex: 资源信息目标.item.pageIndex,
        pageName: 资源信息目标.item.pageName,
        archiveInnerPath: 资源信息目标.item.archiveInnerPath,
      });
      if (已取消 || !结果.ok) return;
      设置资源信息目标((当前目标) => {
        if (!当前目标 || 当前目标.kind !== "bookmark") return 当前目标;
        if (当前目标.item.id !== 资源信息目标.item.id) return 当前目标;
        return { ...当前目标, thumbnailUrl: 结果.data.dataUrl };
      });
    }

    void 加载资源信息预览();
    return () => {
      已取消 = true;
    };
  }, [资源信息目标]);

  useLayoutEffect(() => {
    if (资源详情顶部折叠) {
      // 收起后只滚动缩略图，清除外层遗留位移，避免工具栏和首排一起被推走。
      资源详情滚动容器.current?.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [资源详情顶部折叠]);

  useDetailPreviewWheel({
    enabled: isActive && !手机布局 && 资源信息目标 !== null,
    panel: 资源详情滚动容器,
    preview: 资源详情预览滚动容器,
    collapsed: 资源详情顶部折叠,
    setCollapsed: 设置资源详情顶部折叠,
  });

  useEffect(() => {
    if (!待删除标签列表 && !批量删除确认 && !待删除根目录 && !待删除书架 && !待删除书架列表 && !书架弹窗 && !待删除虚拟文件夹 && !待清空虚拟文件夹 && !待清空无效资源 && !待全局清空无效资源 && !虚拟文件夹弹窗 && !加入虚拟文件夹目标 && !移动到书架目标) return;

    function 正在编辑文本(目标: EventTarget | null): boolean {
      return 目标 instanceof HTMLElement
        && (目标.isContentEditable
          ||目标.tagName.toLowerCase() === "input"
          || 目标.tagName.toLowerCase() === "textarea"
          || 目标.tagName.toLowerCase() === "select");
    }

    function 处理删除确认快捷键(事件: KeyboardEvent): void {
      if (正在编辑文本(事件.target)) return;

      if (事件.key === "Escape") {
        事件.preventDefault();
        if (待删除标签列表) {
          设置待删除标签列表(null);
          设置删除标签不再提醒(false);
        } else if (批量删除确认) {
          设置批量删除确认(null);
          设置批量删除不再提醒(false);
        } else if (待删除根目录) {
          设置待删除根目录(null);
        } else if (待删除书架) {
          设置待删除书架(null);
        } else if (待删除书架列表) {
          设置待删除书架列表(null);
        } else if (书架弹窗) {
          打开书架弹窗(null);
        } else if (待删除虚拟文件夹) {
          设置待删除虚拟文件夹(null);
        } else if (待清空虚拟文件夹) {
          设置待清空虚拟文件夹(null);
        } else if (待清空无效资源) {
          if (当前虚拟文件夹无效资源Key) 设置已忽略无效资源清理Key(当前虚拟文件夹无效资源Key);
          设置待清空无效资源(null);
        } else if (待全局清空无效资源) {
          设置待全局清空无效资源(null);
        } else if (虚拟文件夹弹窗) {
          打开虚拟文件夹弹窗(null);
        } else if (加入虚拟文件夹目标) {
          设置加入虚拟文件夹目标(null);
          设置加入书架搜索内容("");
          设置加入书架目标书架栏ID(null);
        } else if (移动到书架目标) {
          设置移动到书架目标(null);
          设置转存书架搜索内容("");
          设置转存书架目标书架栏ID(null);
        }
        return;
      }

      if (事件.key !== "Delete" || 删除确认处理中) return;
      事件.preventDefault();
      if (待删除标签列表) void 确认删除标签列表();
      else if (批量删除确认) void 确认批量删除();
      else if (待删除根目录) void 确认删除根目录记录();
      else if (待删除书架 || 待删除书架列表) void 删除书架记录();
      else if (待删除虚拟文件夹) void 删除虚拟文件夹记录();
      else if (待清空虚拟文件夹) void 清空虚拟文件夹记录();
      else if (待清空无效资源) void 清空当前书架无效资源记录();
      else if (待全局清空无效资源) void 清空全局无效资源记录();
    }

    window.addEventListener("keydown", 处理删除确认快捷键);
    return () => window.removeEventListener("keydown", 处理删除确认快捷键);
  }, [待删除标签列表, 批量删除确认, 待删除根目录, 待删除书架, 待删除书架列表, 书架弹窗, 待删除虚拟文件夹, 待清空虚拟文件夹, 待清空无效资源, 待全局清空无效资源, 虚拟文件夹弹窗, 加入虚拟文件夹目标, 移动到书架目标, 删除确认处理中, 删除标签不再提醒, 批量删除不再提醒, 当前虚拟文件夹无效资源Key]);

  useEffect(() => {
    if (!isActive || (当前视图 !== "virtual-folder" && 当前视图 !== "directory")) return;

    function 正在编辑文本(目标: EventTarget | null): boolean {
      return 目标 instanceof HTMLElement
        && (目标.isContentEditable
          ||目标.tagName.toLowerCase() === "input"
          || 目标.tagName.toLowerCase() === "textarea"
          || 目标.tagName.toLowerCase() === "select");
    }

    function 处理书架内部返回快捷键(事件: KeyboardEvent): void {
      if (事件.key !== "Escape" || 事件.defaultPrevented || 事件.repeat) return;
      if (资源信息目标 || 本地文件目标 || 目录空白菜单 || 根目录下拉打开 || 主搜索建议可见 || 视图菜单容器.current?.open || document.querySelector('[role="listbox"], [role="dialog"]')) return;
      if (正在编辑文本(事件.target)) return;
      if (
        当前右侧抽屉
        || 完整标签浮层
        || 资源菜单
        || 最近菜单
        || 收藏菜单
        || 书签菜单
        || 书架菜单
        || 书架栏空白菜单
        || 虚拟文件夹菜单
        || 书架空白菜单
        || 书架内部空白菜单
        || 整理空白菜单
        || 虚拟文件夹资源菜单
        || 根目录菜单
        || 标签菜单
        || 待删除标签列表
        || 批量删除确认
        || 待删除根目录
        || 待删除书架
        || 待删除书架列表
        || 书架弹窗
        || 待删除虚拟文件夹
        || 待清空虚拟文件夹
        || 待清空无效资源
        || 待全局清空无效资源
        || 虚拟文件夹弹窗
        || 加入虚拟文件夹目标
        || 移动到书架目标
        || 选择模式
      ) return;

      事件.preventDefault();
      if (当前搜索内容 || 已选标签列表.length) { 取消当前搜索(); return; }
      if (当前视图 === "virtual-folder") 返回书架根层();
      else if (当前目录?.parentPath && 当前根目录 && !正在读取) void 返回上一处();
    }

    window.addEventListener("keydown", 处理书架内部返回快捷键);
    return () => window.removeEventListener("keydown", 处理书架内部返回快捷键);
  }, [
    当前目录, 当前根目录, 正在读取, 资源信息目标, 本地文件目标, 目录空白菜单, 根目录下拉打开, 主搜索建议可见,
    当前视图,
    isActive,
    当前右侧抽屉,
    完整标签浮层,
    资源菜单,
    最近菜单,
    收藏菜单,
    书签菜单,
    书架菜单,
    书架栏空白菜单,
    虚拟文件夹菜单,
    书架空白菜单,
    书架内部空白菜单,
    整理空白菜单,
    虚拟文件夹资源菜单,
    根目录菜单,
    标签菜单,
    待删除标签列表,
    批量删除确认,
    待删除根目录,
    待删除书架,
    待删除书架列表,
    书架弹窗,
    待删除虚拟文件夹,
    待清空虚拟文件夹,
    待清空无效资源,
    待全局清空无效资源,
    虚拟文件夹弹窗,
    加入虚拟文件夹目标,
    移动到书架目标,
    选择模式,
  ]);

  const 封面目标 = useMemo(()=>缩略图目标项目.filter(file=>支持真实缩略图(file.type)),[缩略图目标项目]);
  useCoverQueue(封面目标,isActive&&!正在打开资源路径&&!backgroundPaused,(文件,结果)=>{
    设置缩略图表(原表=>({...原表,[文件.path]:结果.ok&&结果.data.url
      ? {status:'loaded',url:结果.data.url,itemCount:结果.data.itemCount,childFolderCount:结果.data.childFolderCount,folderSummary:结果.data.folderSummary,byteSize:结果.data.byteSize,sourceVersion:`${文件.size??''}:${文件.modifiedAt??''}`}
      : {status:'error',url:null,itemCount:结果.ok?结果.data.itemCount:undefined,childFolderCount:结果.ok?结果.data.childFolderCount:undefined,folderSummary:结果.ok?结果.data.folderSummary:undefined,retryAfter:(!结果.ok||结果.data.retryable)?Date.now()+10_000:undefined,sourceVersion:`${文件.size??''}:${文件.modifiedAt??''}`}}));
  },isAndroid()?2:6);
  useEffect(() => {
    const 本次序号 = ++路径状态请求序号.current;
    if (!isActive || backgroundPaused || (isAndroid() && 正在打开资源路径)) return;
    const 路径项目Map = new Map<string, 文件条目>();
    for (const 文件 of 缩略图目标项目) {
      if (!文件.path || 路径项目Map.has(文件.path)) continue;
      路径项目Map.set(文件.path, 文件);
    }
    const 路径项目 = Array.from(路径项目Map.values());
    const 当前路径集合 = new Set(路径项目.map((文件) => 文件.path));

    设置资源路径状态表((原表) => {
      const 新表: Record<string, 资源路径状态> = {};
      for (const 文件 of 路径项目) {
        if (原表[文件.path]) 新表[文件.path] = 原表[文件.path];
      }
      return 新表;
    });

    async function 检查路径批次(): Promise<void> {
      const 并发数 = isAndroid() ? 2 : 6;
      let 游标 = 0;

      async function 工作线程(): Promise<void> {
        while (游标 < 路径项目.length) {
          const 文件 = 路径项目[游标];
          游标 += 1;
          if (本次序号 !== 路径状态请求序号.current) return;

          try {
            const 结果 = await window.omicomic.checkResourcePath({ path: 文件.path, type: 文件.type });
            if (本次序号 !== 路径状态请求序号.current) return;
            if (随机模式 && 结果.ok && (!结果.data.exists || !结果.data.readable)) 随机浏览.rejectPath(文件.path);
            设置资源路径状态表((原表) => {
              if (!当前路径集合.has(文件.path)) return 原表;
              return {
                ...原表,
                [文件.path]: 结果.ok
                  ? 结果.data
                  : { path: 文件.path, exists: false, readable: false, reason: 结果.error.message },
              };
            });
          } catch {
            if (本次序号 !== 路径状态请求序号.current) return;
            设置资源路径状态表((原表) => {
              if (!当前路径集合.has(文件.path)) return 原表;
              return {
                ...原表,
                [文件.path]: { path: 文件.path, exists: false, readable: false, reason: "资源原路径不存在或当前不可读取。" },
              };
            });
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(并发数, 路径项目.length) }, () => 工作线程()),
      );
    }

    void 检查路径批次();
    return () => { if (路径状态请求序号.current === 本次序号) 路径状态请求序号.current += 1; };
  }, [缩略图目标项目, isActive, backgroundPaused, isAndroid() ? 正在打开资源路径 : null]);

  useEffect(() => {
    if (当前视图 !== "virtual-folder" || !当前虚拟文件夹 || 当前虚拟文件夹无效资源项目.length === 0) return;
    if (!当前虚拟文件夹无效资源Key || 已忽略无效资源清理Key === 当前虚拟文件夹无效资源Key) return;
    if (待清空无效资源) return;

    设置错误信息(`检测到 ${当前虚拟文件夹无效资源项目.length} 个路径失效资源，原记录不会自动删除。`);
    设置待清空无效资源({
      folder: 当前虚拟文件夹,
      resourceKeys: 当前虚拟文件夹无效资源项目.map((项目) => 项目.resourceKey),
    });
  }, [
    当前视图,
    当前虚拟文件夹,
    当前虚拟文件夹无效资源项目,
    当前虚拟文件夹无效资源Key,
    已忽略无效资源清理Key,
    待清空无效资源,
  ]);

  useEffect(() => {
    const 本次序号 = ++书签预览请求序号.current;
    可见书签ID集合.current = new Set();

    if (当前视图 !== "bookmarks") {
      // Retain decoded bookmark previews when switching tabs.
      return;
    }

    设置书签预览表((原表) => {
      const 新表: Record<string, 缩略图状态> = { ...原表 };
    for (const { 项目 } of 当前页书签卡片项目) {
        新表[项目.id] = 原表[项目.id]?.status === 'loaded' ? 原表[项目.id]
          : (项目.thumbnailUrl && !手机布局
            ? { status: "loaded", url: 项目.thumbnailUrl }
            : { status: "idle", url: null });
      }
      书签预览状态Ref.current = 新表;
      return 新表;
    });

    async function 加载可见书签预览(): Promise<void> {
      if (本次序号 !== 书签预览请求序号.current) return;

      const 可加载书签 = 当前页书签卡片项目
        .map(({ 项目 }) => 项目)
        .filter((项目) => {
          if (!可见书签ID集合.current.has(项目.id)) return false;
          const 状态 = 书签预览状态Ref.current[项目.id];
          return 状态?.status !== "loaded" && 状态?.status !== "loading";
        });
      const 加载队列 = 可加载书签;

      if (加载队列.length === 0) return;

      const 加载中表: Record<string, 缩略图状态> = {
        ...书签预览状态Ref.current,
      };
      for (const 项目 of 加载队列) {
        加载中表[项目.id] = { status: "loading", url: null };
      }
      书签预览状态Ref.current = 加载中表;
      设置书签预览表((原表) => {
        const 新表: Record<string, 缩略图状态> = { ...原表 };
        for (const 项目 of 加载队列) {
          新表[项目.id] = { status: "loading", url: null };
        }
        return 新表;
      });

      const 并发数 = 3;
      let 游标 = 0;

      async function 工作线程(): Promise<void> {
        while (游标 < 加载队列.length) {
          const 项目 = 加载队列[游标];
          游标 += 1;
          if (本次序号 !== 书签预览请求序号.current) return;

          try {
            const 结果 = await window.omicomic.getBookmarkPagePreview({
              sourcePath: 项目.sourcePath,
              sourceType: 项目.sourceType,
              pageIndex: 项目.pageIndex,
              pageName: 项目.pageName,
              archiveInnerPath: 项目.archiveInnerPath,
            });
            if (本次序号 !== 书签预览请求序号.current) return;

            设置书签预览表((原表) => {
              if (!(项目.id in 原表)) return 原表;
              const 下一状态 = 结果.ok
                ? { status: "loaded" as const, url: 结果.data.dataUrl }
                : { status: "error" as const, url: null };
              书签预览状态Ref.current = {
                ...书签预览状态Ref.current,
                [项目.id]: 下一状态,
              };
              return {
                ...原表,
                [项目.id]: 下一状态,
              };
            });
          } catch {
            if (本次序号 !== 书签预览请求序号.current) return;
            设置书签预览表((原表) => {
              if (!(项目.id in 原表)) return 原表;
              书签预览状态Ref.current = {
                ...书签预览状态Ref.current,
                [项目.id]: { status: "error", url: null },
              };
              return {
                ...原表,
                [项目.id]: { status: "error", url: null },
              };
            });
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(并发数, 加载队列.length) }, () => 工作线程()),
      );
    }

    const 容器 = 列表容器.current;
    if (!容器) return;

    const 观察器 = new IntersectionObserver(
      (entries) => {
        let 有新增可见项 = false;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.bookmarkCardId;
          if (!id || 可见书签ID集合.current.has(id)) continue;
          可见书签ID集合.current.add(id);
          有新增可见项 = true;
        }
        if (有新增可见项) void 加载可见书签预览();
      },
      { root: 容器, rootMargin: "160px 0px", threshold: 0.01 },
    );

    const 卡片元素 = Array.from(
      容器.querySelectorAll<HTMLElement>("[data-bookmark-card-id]"),
    );
    for (const 卡片 of 卡片元素) {
      观察器.observe(卡片);
    }

    return () => {
      观察器.disconnect();
    };
  }, [当前视图, 当前页书签卡片项目]);

  useEffect(() => {
    const 本次序号 = ++可阅读页数请求序号.current;
    if (!isActive || backgroundPaused || (isAndroid() && 正在打开资源路径)) return;
    const 可统计项目Map = new Map<string, 文件条目>();
    for (const 文件 of 缩略图目标项目) {
      const key = 获取可阅读页数Key(文件);
      if (key && 支持可阅读页数统计(文件.type) && !可统计项目Map.has(key)) {
        可统计项目Map.set(key, 文件);
      }
    }
    const 可统计项目 = Array.from(可统计项目Map.values());
    const 当前显示Key集合 = new Set(
      Array.from(可统计项目Map.keys()),
    );

    设置可阅读页数表((原表) => {
      const 新表: Record<string, 可阅读页数状态> = { ...原表 };
      for (const key of 当前显示Key集合) {
        delete 新表[key]; // Promote currently visible entries before applying the cache bound.
        新表[key] = 原表[key] ?? { status: "loading", count: null };
      }
      return 新表;
    });

    async function 加载可阅读页数批次(): Promise<void> {
      const 待统计项目 = 可统计项目.filter((文件) => {
        const key = 获取可阅读页数Key(文件);
        if (!key) return false;
        const 状态 = 可阅读页数表[key];
        return 状态?.status !== "loaded" || (文件.size !== undefined || 文件.modifiedAt !== undefined)
          && 状态.sourceVersion !== `${文件.size ?? ''}:${文件.modifiedAt ?? ''}`;
      });
      const 统计队列 = 待统计项目;
      const 并发数 = 4;
      let 游标 = 0;

      async function 工作线程(): Promise<void> {
        while (游标 < 统计队列.length) {
          const 文件 = 统计队列[游标];
          const key = 获取可阅读页数Key(文件);
          游标 += 1;
          if (!key) continue;

          if (本次序号 !== 可阅读页数请求序号.current) return;

          try {
            const 结果 = await window.omicomic.getReadablePageCount({
              path: 文件.path,
              type: 文件.type,
            });
            if (本次序号 !== 可阅读页数请求序号.current) return;

            设置可阅读页数表((原表) => {
              if (!(key in 原表)) return 原表;
              return {
                ...原表,
                [key]: 结果.ok
                  ? { status: "loaded", count: 结果.data, sourceVersion: `${文件.size ?? ''}:${文件.modifiedAt ?? ''}` }
                  : { status: "error", count: null },
              };
            });
          } catch {
            if (本次序号 !== 可阅读页数请求序号.current) return;
            设置可阅读页数表((原表) => {
              if (!(key in 原表)) return 原表;
              return {
                ...原表,
                [key]: { status: "error", count: null },
              };
            });
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(并发数, 统计队列.length) }, () => 工作线程()),
      );
    }

    void 加载可阅读页数批次();
    return () => { if (可阅读页数请求序号.current === 本次序号) 可阅读页数请求序号.current += 1; };
  }, [缩略图目标项目, isActive, backgroundPaused, isAndroid() ? 正在打开资源路径 : null]);

  useEffect(() => {
    function 处理分页快捷键(事件: KeyboardEvent): void {
      if (!isActive) return;
      if (!是否显示分页 || 事件.defaultPrevented || 当前右侧抽屉 || 资源信息目标 || 本地文件目标) return;
      if (事件.target instanceof Element && 事件.target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="dialog"], [role="menu"]')) return;
      if (事件.key === "PageUp") {
        事件.preventDefault();
        跳转页码(安全当前页 - 1);
      } else if (事件.key === "PageDown") {
        事件.preventDefault();
        跳转页码(安全当前页 + 1);
      }
    }

    window.addEventListener("keydown", 处理分页快捷键);
    return () => window.removeEventListener("keydown", 处理分页快捷键);
  }, [是否显示分页, 总页数, 安全当前页, 当前视图, 每页数量, 卡片缩放, isActive, 当前右侧抽屉, 资源信息目标, 本地文件目标]);

  async function 打开目录(
    目录路径: string,
    根目录路径: string,
    历史处理: 历史操作 = "push",
    重置分页 = true,
    motion = mobileNavigationEpoch(),
  ): Promise<boolean> {
    目录连续列表.sync();
    const 本次序号 = ++读取序号.current;
    const 搜索入口 = 当前视图 === 'directory' && 目录穿透搜索 && 当前目录 && 目录路径 !== 当前目录.path
      ? { entrance: 目录路径, root: 根目录路径, directory: 当前目录, query: 搜索内容, tags: 已选标签列表,
        sort: 排序, searchOpen: 手机筛选展开, scrollTop: 列表容器.current?.scrollTop ?? 0, history: 历史记录, random: 随机浏览.capture() } : null;
    设置正在读取(true);
    设置错误信息(null);

    try {
      const 结果 = await window.omicomic.listDirectory(目录路径);
      if (本次序号 !== 读取序号.current) return false;

      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return false;
      }

      const commit = () => {
        if (本次序号 !== 读取序号.current) return;
        设置正在读取(false);
      设置当前目录(结果.data);
      if (搜索入口) {
        搜索返回会话.current = 搜索入口;
        设置搜索内容(''); 设置已选标签列表([]); 设置手机筛选展开(false); 随机浏览.stop();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }
      设置当前根目录(根目录路径);
      设置当前视图("directory");
      void window.omicomic.updateLibraryState({
        lastActiveRootPath: 根目录路径,
        lastCurrentPath: 结果.data.path,
      });
      if (重置分页) {
        退出选择模式();
        设置当前页(1);
      }

      设置历史记录((原记录) => {
        // Restoring the initial directory still needs a starting point for Back.
        if (历史处理 === "none" && 原记录.entries.length > 0) return 原记录;
        const 已保留记录 = 原记录.entries.slice(0, 原记录.index + 1);
        const 最后一项 = 已保留记录.at(-1);
        if (最后一项?.path === 结果.data.path) return 原记录;

        const 新记录 = [...已保留记录, { path: 结果.data.path, rootPath: 根目录路径 }];
        return { entries: 新记录, index: 新记录.length - 1 };
      });

      };
      if (手机布局 && isActive && 当前目录 && (当前视图 !== 'directory' || 当前目录.path !== 结果.data.path)) await mobileNavigate(commit, 'folder', undefined, undefined, motion);
      else commit();

      return true;
    } catch {
      if (本次序号 === 读取序号.current) {
        设置错误信息("目录读取失败，请稍后重试。");
      }
      return false;
    } finally {
      if (本次序号 === 读取序号.current) {
        设置正在读取(false);
      }
    }
  }

  async function 添加目录(): Promise<void> {
    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.selectFolder();
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      if (!结果.data) return;

      const 根目录结果 = await window.omicomic.addLibraryRoot({
        path: 结果.data,
        name: 获取目录名称(结果.data),
      });
      if (!根目录结果.ok) {
        设置错误信息(根目录结果.error.message);
        return;
      }

      const 根目录 = 根目录结果.data;
      设置根目录列表((原列表) =>
        [根目录, ...原列表.filter((项目) => 项目.path !== 根目录.path)],
      );
      const 最新数据 = await window.omicomic.getAppData();
      if (最新数据.ok) 设置临时存放列表(最新数据.data.temporaryOpened ?? []);
      await 打开目录(根目录.path, 根目录.path);
    } catch {
      设置错误信息("无法添加该目录，请稍后重试。");
    }
  }

  async function 返回上一处(): Promise<void> {
    const saved = 搜索返回会话.current;
    if (saved && 当前目录?.path === saved.entrance && 当前根目录 === saved.root && !正在读取) {
      const commit = () => {
        搜索返回会话.current = null; 设置当前目录(saved.directory); 设置当前根目录(saved.root);
        设置搜索内容(saved.query); 设置已选标签列表(saved.tags); 设置排序(saved.sort); 设置手机筛选展开(saved.searchOpen);
        随机浏览.restore(saved.random);
        设置历史记录(old => ({ entries: old.entries, index: Math.min(saved.history.index, old.entries.length - 1) }));
        待恢复精确滚动位置.current = saved.scrollTop;
      };
      目录连续列表.sync();
      if (手机布局) await mobileNavigate(commit, 'back'); else commit();
      return;
    }
    if (!当前目录?.parentPath || !当前根目录 || 当前目录.path === 当前根目录 || 正在读取) return;
    const parent = 当前目录.parentPath;
    let previous = -1;
    for (let index = 历史记录.index - 1; index >= 0; index--) {
      if (历史记录.entries[index].path === parent && 历史记录.entries[index].rootPath === 当前根目录) { previous = index; break; }
    }
    if (await 打开目录(parent, 当前根目录, "none")) {
      设置历史记录(old => {
        if (previous >= 0) return { entries: [...old.entries.slice(0, previous + 1), ...old.entries.slice(old.index)], index: previous };
        const entries = [...old.entries.slice(0, old.index), { path: parent, rootPath: 当前根目录 }, ...old.entries.slice(old.index)];
        return { entries, index: Math.max(0, old.index) };
      });
    }
  }

  async function 前进下一处(): Promise<void> {
    if (历史记录.index >= 历史记录.entries.length - 1) return;
    const 目标位置 = 历史记录.index + 1;
    const 目标 = 历史记录.entries[目标位置];
    if (await 打开目录(目标.path, 目标.rootPath, "none")) {
      设置历史记录((原记录) => ({ ...原记录, index: 目标位置 }));
    }
  }

  function 创建阅读上下文(
    source: 阅读打开上下文["source"],
    currentKey: string,
    items: 阅读相邻资源项[],
  ): 阅读打开上下文 | undefined {
    if (items.length <= 1 || !items.some((项目) => 项目.key === currentKey)) return undefined;
    return { source, currentKey, items };
  }

  function 记录阅读返回定位(): void {
    阅读返回定位快照.current = {
      view: 当前视图,
      page: 安全当前页,
      scrollTop: 列表容器.current?.scrollTop ?? 0,
      currentBookshelfId: 当前书架ID,
      currentVirtualFolderId: 当前虚拟文件夹ID,
    };
  }

  function 打开阅读器(
    资源: 阅读资源结果,
    起始页: number,
    上下文?: 阅读打开上下文,
    转场原点?: OmiBrandOriginGetter,
    motion = mobileNavigationEpoch(),
  ): void {
    记录阅读返回定位();
    if(!isAndroid()){
      if(手机布局)onOpenReader(资源, 起始页, 上下文, 转场原点, motion);
      else onOpenReader(资源, 起始页, 上下文, 转场原点);
      return;
    }
    const request=打开阅读请求序号.current;
    void Promise.resolve(onOpenReader(资源, 起始页, 上下文, 转场原点, motion)).catch(()=>{
      if(request===打开阅读请求序号.current)设置错误信息('阅读器打开失败，请重试。');
    }).finally(()=>{if(request===打开阅读请求序号.current)设置正在打开资源路径(null);});
  }

  function 读取漫画清单(input: Parameters<typeof window.omicomic.getResourcePages>[0]) {
    if (打开清单任务.current?.path === input.path) return 打开清单任务.current.promise;
    设置正在打开资源路径(input.path);
    const promise = window.omicomic.getResourcePages(input).then(result=>{
      if(isAndroid()&&!result.ok&&打开清单任务.current?.promise===promise)设置正在打开资源路径(null);
      return result;
    },error=>{
      if(isAndroid()&&打开清单任务.current?.promise===promise)设置正在打开资源路径(null);
      throw error;
    }).finally(() => {
      if (打开清单任务.current?.promise === promise) {
        打开清单任务.current = null;
        if(!isAndroid())设置正在打开资源路径(null);
      }
    });
    打开清单任务.current = { path: input.path, promise };
    return promise;
  }

  async function 打开混合目录(path: string, type: string, request: number, motion: number): Promise<boolean> {
    if (随机模式 || isAndroid() || type !== 'folder') return false;
    let summary: Pick<缩略图状态,'itemCount'|'childFolderCount'|'folderSummary'> | undefined = 缩略图表[path];
    if (summary?.childFolderCount === undefined) {
      const result = await window.omicomic.getThumbnail({path,type:'folder'});
      if (request !== 打开阅读请求序号.current) return true;
      if (result.ok) summary = result.data;
    }
    const mixed = (summary?.childFolderCount ?? 0) > 0 || (summary?.itemCount ?? 0) > 0
      || Boolean(summary?.folderSummary?.books && summary.folderSummary.images);
    if (!mixed) return false;
    const normalize = (value:string) => {const normalized=value.replace(/\\/g,'/').replace(/\/$/,'');return /^[a-z]:/i.test(normalized)?normalized.toLowerCase():normalized;};
    const source = normalize(path);
    const root = [...根目录列表].sort((a,b)=>b.path.length-a.path.length).find(item => source === normalize(item.path) || source.startsWith(normalize(item.path)+'/'));
    await 打开目录(path,root?.path ?? path,'push',true,motion);
    return true;
  }

  async function 打开资源(文件: 文件条目): Promise<void> {
    const motion = mobileNavigationEpoch();
    if (!当前根目录) return;
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (
      文件.type !== "folder"
      && 文件.type !== "image"
      && 文件.type !== "archive"
      && 文件.type !== "pdf"
      && 文件.type !== "epub"
    ) return;

    设置错误信息(null);
    try {
      if (await 打开混合目录(文件.path, 文件.type, 本次打开序号, motion)) return;
      const 结果 = await 读取漫画清单({ path: 文件.path, type: 文件.type });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        if (文件.type === "folder" && 结果.error.code === "NO_IMAGES") {
          const 已进入目录 = await 打开目录(文件.path, 当前根目录, 'push', true, motion);
          if (本次打开序号 !== 打开阅读请求序号.current) return;
          if (已进入目录) {
            设置错误信息(null);
          }
        } else {
          设置错误信息(结果.error.message);
        }
        return;
      }

      const 默认起始页 = 文件.type === "image"
        ? Math.max(0, 结果.data.pages.findIndex((页面) => 页面.sourcePath === 文件.path))
        : 0;
      const 进度结果 = 结果.data.readerInit ? { ok: true as const, data: 结果.data.readerInit.progress } : await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 已保存进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = 已保存进度
        ? 定位续读页面(结果.data, 已保存进度, 已保存进度.currentPageIndex)
        : 默认起始页;
      void 保存资源当前进度(结果.data, 起始页);
      打开阅读器(
        结果.data,
        起始页,
        创建阅读上下文("directory", 结果.data.resourceKey, 当前目录阅读队列),
        undefined, motion,
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if(isAndroid())设置正在打开资源路径(null);
      设置错误信息("无法打开该阅读资源，请稍后重试。");
    }
  }

  async function 打开最近项目(项目: RecentOpenedItem, 转场原点?: OmiBrandOriginGetter): Promise<void> {
    const motion = mobileNavigationEpoch();
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (路径是否失效(项目.sourcePath)) {
      设置错误信息("资源原路径已失效或不可读取，不会进入阅读器。请通过右键菜单复制原路径或移除此记录。");
      return;
    }
    设置错误信息(null);
    try {
      if (await 打开混合目录(项目.sourcePath, 项目.sourceType, 本次打开序号, motion)) return;
      const 结果 = await 读取漫画清单({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 进度结果 = 结果.data.readerInit ? { ok: true as const, data: 结果.data.readerInit.progress } : await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = 定位续读页面(结果.data, 进度, 进度?.currentPageIndex ?? 项目.currentPageIndex ?? 0);
      void 保存资源当前进度(结果.data, 起始页);
      打开阅读器(
        结果.data,
        起始页,
        创建阅读上下文("recent", 结果.data.resourceKey, 最近打开阅读队列),
        转场原点,
        motion,
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if(isAndroid())设置正在打开资源路径(null);
      设置错误信息("最近阅读的资源不存在或无法访问。");
    }
  }

  async function 打开收藏项目(项目: FavoriteItem): Promise<void> {
    const motion = mobileNavigationEpoch();
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (路径是否失效(项目.sourcePath)) {
      设置错误信息("收藏资源原路径已失效或不可读取，不会进入阅读器。请通过右键菜单复制原路径、查看资源信息或移除此记录。");
      return;
    }
    设置错误信息(null);
    try {
      if (await 打开混合目录(项目.sourcePath, 项目.sourceType, 本次打开序号, motion)) return;
      const 结果 = await 读取漫画清单({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 进度结果 = 结果.data.readerInit ? { ok: true as const, data: 结果.data.readerInit.progress } : await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = 定位续读页面(结果.data, 进度, 进度?.currentPageIndex ?? 0);
      void 保存资源当前进度(结果.data, 起始页);
      打开阅读器(
        结果.data,
        起始页,
        创建阅读上下文("favorites", 结果.data.resourceKey, 收藏阅读队列),
        undefined, motion,
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if(isAndroid())设置正在打开资源路径(null);
      设置错误信息("收藏资源不存在或无法访问。");
    }
  }

  async function 打开虚拟文件夹项目(项目: VirtualFolderItem): Promise<void> {
    const motion = mobileNavigationEpoch();
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (路径是否失效(项目.sourcePath)) {
      设置错误信息("书架中的资源原路径已失效或不可读取，不会进入阅读器。此记录不会自动删除，可右键从当前书架移除。");
      return;
    }
    if (项目.sourceType !== "folder" && 项目.sourceType !== "image" && 项目.sourceType !== "archive" && 项目.sourceType !== "pdf" && 项目.sourceType !== "epub") return;

    设置错误信息(null);
    try {
      if (await 打开混合目录(项目.sourcePath, 项目.sourceType, 本次打开序号, motion)) return;
      const 结果 = await 读取漫画清单({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 进度结果 = 结果.data.readerInit ? { ok: true as const, data: 结果.data.readerInit.progress } : await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = 定位续读页面(结果.data, 进度, 进度?.currentPageIndex ?? 0);
      void 保存资源当前进度(结果.data, 起始页);
      打开阅读器(
        结果.data,
        起始页,
        创建阅读上下文("virtual-folder", 结果.data.resourceKey, 虚拟文件夹阅读队列),
        undefined, motion,
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if(isAndroid())设置正在打开资源路径(null);
      设置错误信息("书架中的资源不存在或无法访问。");
    }
  }

  async function 打开书签项目(项目: BookmarkItem): Promise<void> {
    const motion = mobileNavigationEpoch();
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (路径是否失效(项目.sourcePath)) {
      设置错误信息("书签资源原路径已失效或不可读取，不会进入阅读器。此书签不会自动删除，可右键查看资源信息或删除此书签。");
      return;
    }
    设置错误信息(null);
    try {
      const 结果 = await 读取漫画清单({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 起始页 = 结果.data.sourceType === "pdf" || 结果.data.sourceType === "epub" ? Math.max(0, 项目.pageIndex) : resolvePageIndex(结果.data.pages, 项目.pageId, 项目.archiveInnerPath ?? 项目.pageName, 项目.pageIndex);
      if (项目.pageIndex >= 结果.data.total && !项目.pageId && !项目.pageName) {
        设置错误信息("书签页码已超出当前资源页数，已跳转到最后一页。");
      }
      void 保存资源当前进度(结果.data, 起始页);
      打开阅读器(结果.data, 起始页, 随机模式 ? 创建阅读上下文("bookmarks", 项目.id, 书签阅读队列) : undefined, undefined, motion);
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if(isAndroid())设置正在打开资源路径(null);
      设置错误信息("书签资源不存在或无法访问。");
    }
  }

  function 应用页码输入(): void {
    const 输入页码 = Number.parseInt(页码输入, 10);
    const 修正页码 = Number.isFinite(输入页码)
      ? Math.min(Math.max(输入页码, 1), 总页数)
      : 安全当前页;
    if (连续列表启用) { 设置页码输入(String(修正页码)); 目录连续列表.jump(修正页码); return; }
    待恢复滚动位置.current = "top";
    退出选择模式();
    设置当前页(修正页码);
    设置页码输入(String(修正页码));
  }

  function 跳转页码(目标页码: number): void {
    if (连续列表启用) { 目录连续列表.jump(目标页码); return; }
    待恢复滚动位置.current = "top";
    退出选择模式();
    设置当前页(Math.min(Math.max(目标页码, 1), 总页数));
  }

  function 回到第一页(): void {
    待恢复滚动位置.current = "top";
    退出选择模式();
    设置当前页(1);
    列表容器.current?.scrollTo({ top: 0, behavior: "auto" });
  }

  function 回到当前页顶部(): void {
    if (连续列表启用) { 目录连续列表.jump(安全当前页); return; }
    自动翻页锁定.current = false;
    自动翻页冷却截止.current = Date.now() + 250;
    待恢复滚动位置.current = null;
    列表容器.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function 隐藏书架备注悬浮窗(): void {
    if (书架备注悬停定时器.current !== null) {
      window.clearTimeout(书架备注悬停定时器.current);
      书架备注悬停定时器.current = null;
    }
    书架备注悬停Key.current = null;
    设置书架备注悬浮窗(null);
  }

  function 获取书架备注悬浮窗样式(备注: string, x: number, y: number): CSSProperties {
    const 最大宽度 = Math.min(280, Math.max(180, window.innerWidth - 32));
    const 估算高度 = Math.min(180, Math.max(48, Math.ceil(备注.length / 18) * 22 + 24));
    const 间距 = 12;
    const 边距 = 16;
    const 右侧 = x + 间距;
    const 下方 = y + 间距;
    const 左侧 = 右侧 + 最大宽度 <= window.innerWidth - 边距
      ? 右侧
      : Math.max(边距, x - 最大宽度 - 间距);
    const 顶部 = 下方 + 估算高度 <= window.innerHeight - 边距
      ? 下方
      : Math.max(边距, y - 估算高度 - 间距);
    return {
      left: `${左侧}px`,
      top: `${顶部}px`,
      maxWidth: `${最大宽度}px`,
    };
  }

  function 开始资源备注悬停(key: string, 备注文本: string, 事件: ReactMouseEvent<HTMLElement>): void {
    const 备注 = 备注文本.trim();
    const 子控件 = 事件.target instanceof Element ? 事件.target.closest('button, input, [role="button"], .preview-tag-row') : null;
    if (!事件.ctrlKey || !备注 || 子控件 && 子控件 !== 事件.currentTarget) {
      隐藏书架备注悬浮窗();
      return;
    }

    if (书架备注悬停定时器.current !== null) {
      window.clearTimeout(书架备注悬停定时器.current);
      书架备注悬停定时器.current = null;
    }

    书架备注悬停Key.current = key;
    书架备注鼠标位置.current = { x: 事件.clientX, y: 事件.clientY };
    const 显示 = (): void => {
      const 位置 = 书架备注鼠标位置.current;

      设置书架备注悬浮窗({
        folderId: key,
        note: 备注,
        style: 获取书架备注悬浮窗样式(备注, 位置.x, 位置.y),
      });
    };

    if (书架备注悬停延迟 === 0) {
      显示();
      return;
    }
    书架备注悬停定时器.current = window.setTimeout(显示, 书架备注悬停延迟);
  }

  function 更新资源备注悬停(key: string, 备注文本: string, 事件: ReactMouseEvent<HTMLElement>): void {
    const 备注 = 备注文本.trim();
    const 子控件 = 事件.target instanceof Element ? 事件.target.closest('button, input, [role="button"], .preview-tag-row') : null;
    if (!事件.ctrlKey || !备注 || 子控件 && 子控件 !== 事件.currentTarget) {
      if (书架备注悬停Key.current === key) 隐藏书架备注悬浮窗();
      return;
    }

    书架备注鼠标位置.current = { x: 事件.clientX, y: 事件.clientY };
    if (书架备注悬停Key.current !== key) {
      开始资源备注悬停(key, 备注, 事件);
      return;
    }

    设置书架备注悬浮窗((当前悬浮窗) => {
      if (!当前悬浮窗 || 当前悬浮窗.folderId !== key) return 当前悬浮窗;
      return {
        ...当前悬浮窗,
        style: 获取书架备注悬浮窗样式(当前悬浮窗.note, 事件.clientX, 事件.clientY),
      };
    });
  }

  function 显示路径悬浮窗(key: string, 路径文本: string, 事件: ReactMouseEvent<HTMLElement>): void {
    const 路径 = 路径文本.trim();
    if (!路径 || 事件.ctrlKey) return;

    if (书架备注悬停定时器.current !== null) {
      window.clearTimeout(书架备注悬停定时器.current);
      书架备注悬停定时器.current = null;
    }

    书架备注悬停Key.current = key;
    设置书架备注悬浮窗({
      folderId: key,
      note: 路径,
      style: 获取书架备注悬浮窗样式(路径, 事件.clientX, 事件.clientY),
    });
  }

  function 开始路径悬停(key: string, 路径文本: string, 事件: ReactMouseEvent<HTMLElement>): void {
    显示路径悬浮窗(key, 路径文本, 事件);
  }

  function 更新路径悬停(key: string, 路径文本: string, 事件: ReactMouseEvent<HTMLElement>): void {
    const 路径 = 路径文本.trim();
    if (!路径 || 事件.ctrlKey) {
      if (书架备注悬停Key.current === key) 隐藏书架备注悬浮窗();
      return;
    }

    if (书架备注悬停Key.current !== key) {
      显示路径悬浮窗(key, 路径, 事件);
      return;
    }

    设置书架备注悬浮窗((当前悬浮窗) => {
      if (!当前悬浮窗 || 当前悬浮窗.folderId !== key) return 当前悬浮窗;
      return {
        ...当前悬浮窗,
        style: 获取书架备注悬浮窗样式(当前悬浮窗.note, 事件.clientX, 事件.clientY),
      };
    });
  }

  function 结束路径悬停(key: string): void {
    if (书架备注悬停Key.current === key) 隐藏书架备注悬浮窗();
  }

  function 切换书架栏选择(id: string): void {
    设置已选书架栏ID集合((原集合) => {
      const 新集合 = new Set(原集合);
      if (新集合.has(id)) 新集合.delete(id);
      else 新集合.add(id);
      return 新集合;
    });
  }

  function 获取已选书架栏列表(): Bookshelf[] {
    if (已选书架栏ID集合.size === 0) return [];
    return 书架列表.filter((书架) => 已选书架栏ID集合.has(书架.id));
  }

  function 获取待删除书架栏列表(): Bookshelf[] {
    return 待删除书架列表 ?? (待删除书架 ? [待删除书架] : []);
  }

  function 请求删除书架栏(书架: Bookshelf): void {
    const 已选列表 = 获取已选书架栏列表();
    const 删除列表 = 已选书架栏ID集合.has(书架.id) && 已选列表.length > 1 ? 已选列表 : [书架];
    if (书架列表.length - 删除列表.length < 1) {
      设置错误信息("至少需要保留一个书架分类。");
      设置书架菜单(null);
      return;
    }
    设置待删除书架(删除列表.length === 1 ? 删除列表[0] : null);
    设置待删除书架列表(删除列表.length > 1 ? 删除列表 : null);
    设置书架菜单(null);
  }

  function 计算侧栏拖拽后顺序(当前顺序: string[], 拖拽Key: string, 落点: Exclude<侧栏拖拽落点, null>): string[] {
    if (拖拽Key === 落点.key) return 当前顺序;
    const 移除后顺序 = 当前顺序.filter((key) => key !== 拖拽Key);
    const 目标索引 = 移除后顺序.indexOf(落点.key);
    if (目标索引 < 0) return 当前顺序;
    const 插入索引 = 落点.position === "before" ? 目标索引 : 目标索引 + 1;
    return [
      ...移除后顺序.slice(0, 插入索引),
      拖拽Key,
      ...移除后顺序.slice(插入索引),
    ];
  }

  function 计算卡片拖拽后顺序(当前顺序: string[], 拖拽Key: string, 落点: Exclude<卡片拖拽落点, null>): string[] {
    if (拖拽Key === 落点.key) return 当前顺序;
    const 移除后顺序 = 当前顺序.filter((key) => key !== 拖拽Key);
    const 目标索引 = 移除后顺序.indexOf(落点.key);
    if (目标索引 < 0) return 当前顺序;
    const 插入索引 = 落点.position === "before" ? 目标索引 : 目标索引 + 1;
    return [
      ...移除后顺序.slice(0, 插入索引),
      拖拽Key,
      ...移除后顺序.slice(插入索引),
    ];
  }


  async function 保存根目录顺序(新顺序: string[]): Promise<void> {
    const 结果 = await window.omicomic.reorderLibraryRoots(新顺序);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置根目录列表(结果.data);
  }

  function 开始根目录中键拖拽(事件: ReactMouseEvent<HTMLElement>, 根路径: string): void {
    if (事件.button !== 1) return;
    事件.preventDefault();
    事件.stopPropagation();
    设置根目录拖拽路径(根路径);
    设置根目录拖拽落点(null);
  }

  function 更新根目录拖拽落点(事件: ReactMouseEvent<HTMLElement>, 根路径: string): void {
    if (!根目录拖拽路径 || 根目录拖拽路径 === 根路径) return;
    const 矩形 = 事件.currentTarget.getBoundingClientRect();
    设置根目录拖拽落点({
      key: 根路径,
      position: 事件.clientY < 矩形.top + 矩形.height / 2 ? "before" : "after",
    });
  }

  async function 保存侧栏书架顺序(新顺序: string[], 原顺序: string[]): Promise<void> {
    const 原书架ID列表 = 原顺序.map(从书架侧栏Key读取ID).filter((id): id is string => Boolean(id));
    const 新书架ID列表 = 新顺序.map(从书架侧栏Key读取ID).filter((id): id is string => Boolean(id));
    if (新书架ID列表.length === 0 || 数组内容相同(原书架ID列表, 新书架ID列表)) return;

    const 结果 = await window.omicomic.reorderBookshelves(新书架ID列表);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置书架列表(结果.data);
  }

  function 开始侧栏中键拖拽(事件: ReactMouseEvent<HTMLElement>, key: string): void {
    if (事件.button !== 1) return;
    if (!从书架侧栏Key读取ID(key)) return;
    事件.preventDefault();
    事件.stopPropagation();
    隐藏书架备注悬浮窗();
    设置侧栏拖拽Key(key);
    设置侧栏拖拽落点(null);
  }

  function 更新侧栏拖拽落点(事件: ReactMouseEvent<HTMLElement>, key: string): void {
    if (!侧栏拖拽Key || 侧栏拖拽Key === key) return;
    if (!从书架侧栏Key读取ID(key)) return;
    const 矩形 = 事件.currentTarget.getBoundingClientRect();
    设置侧栏拖拽落点({
      key,
      position: 事件.clientY < 矩形.top + 矩形.height / 2 ? "before" : "after",
    });
  }

  async function 保存书架资源拖拽顺序(folderId: string, orderedResourceKeys: string[]): Promise<void> {
    const 结果 = await window.omicomic.reorderVirtualFolderItems({ folderId, orderedResourceKeys });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
      文件夹.id === 结果.data.id ? 结果.data : 文件夹
    )));
  }

  async function 保存书架文件夹拖拽顺序(bookshelfId: string, orderedFolderIds: string[]): Promise<void> {
    const 同书架ID集合 = new Set(orderedFolderIds);
    const 其他书架文件夹ID列表 = 虚拟文件夹列表
      .filter((文件夹) => 文件夹.bookshelfId !== bookshelfId || !同书架ID集合.has(文件夹.id))
      .sort((左侧, 右侧) => (
        左侧.sortIndex - 右侧.sortIndex
          || 左侧.createdAt - 右侧.createdAt
          || 文件名排序器.compare(左侧.name, 右侧.name)
      ))
      .map((文件夹) => 文件夹.id);
    const 结果 = await window.omicomic.reorderVirtualFolders([...orderedFolderIds, ...其他书架文件夹ID列表]);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表(结果.data);
    if (!手机布局 && 排序 !== "name-asc") 保存界面设置({ sortMode: "name-asc" });
  }

  function 获取收藏拖拽当前顺序(): string[] {
    return [...收藏列表]
      .sort((左侧, 右侧) => (
        左侧.sortIndex - 右侧.sortIndex
          || 右侧.updatedAt - 左侧.updatedAt
          || 文件名排序器.compare(左侧.title, 右侧.title)
      ))
      .map((项目) => 项目.resourceKey);
  }

  function 获取书签拖拽当前顺序(): string[] {
    return [...书签列表]
      .sort((左侧, 右侧) => (
        左侧.sortIndex - 右侧.sortIndex
          || 右侧.updatedAt - 左侧.updatedAt
          || 文件名排序器.compare(左侧.title, 右侧.title)
          || 左侧.pageIndex - 右侧.pageIndex
      ))
      .map((项目) => 项目.id);
  }

  async function 保存收藏拖拽顺序(orderedResourceKeys: string[]): Promise<void> {
    const 结果 = await window.omicomic.reorderFavorites(orderedResourceKeys);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置收藏列表(结果.data);
  }

  async function 保存书签拖拽顺序(orderedIds: string[]): Promise<void> {
    const 结果 = await window.omicomic.reorderBookmarks(orderedIds);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置书签列表(结果.data);
  }

  function 计算置顶置底顺序(当前顺序: string[], 目标Key列表: string[], 位置: "top" | "bottom"): string[] {
    const 目标集合 = new Set(目标Key列表);
    const 命中列表 = 当前顺序.filter((key) => 目标集合.has(key));
    if (命中列表.length === 0) return 当前顺序;
    const 其余列表 = 当前顺序.filter((key) => !目标集合.has(key));
    return 位置 === "top" ? [...命中列表, ...其余列表] : [...其余列表, ...命中列表];
  }

  async function 调整收藏项目顺序(resourceKey: string, 位置: "top" | "bottom"): Promise<void> {
    const 当前顺序 = 获取收藏拖拽当前顺序();
    const 使用选中项 = 选择模式 === "favorites"
      && 已选项目Key集合.size > 0
      && 已选项目Key集合.has(resourceKey);
    const 目标Key列表 = 使用选中项 ? Array.from(已选项目Key集合) : [resourceKey];
    const 新顺序 = 计算置顶置底顺序(当前顺序, 目标Key列表, 位置);
    设置收藏菜单(null);
    if (数组内容相同(当前顺序, 新顺序)) return;
    await 保存收藏拖拽顺序(新顺序);
    显示成功提示(位置 === "top" ? "已置顶收藏。" : "已置底收藏。");
  }

  async function 调整书签项目顺序(id: string, 位置: "top" | "bottom"): Promise<void> {
    const 当前顺序 = 获取书签拖拽当前顺序();
    const 使用选中项 = 选择模式 === "bookmarks"
      && 已选项目Key集合.size > 0
      && 已选项目Key集合.has(id);
    const 目标Key列表 = 使用选中项 ? Array.from(已选项目Key集合) : [id];
    const 新顺序 = 计算置顶置底顺序(当前顺序, 目标Key列表, 位置);
    设置书签菜单(null);
    if (数组内容相同(当前顺序, 新顺序)) return;
    await 保存书签拖拽顺序(新顺序);
    显示成功提示(位置 === "top" ? "已置顶书签。" : "已置底书签。");
  }

  async function 设置当前书架封面(resourceKey: string): Promise<void> {
    if (!当前虚拟文件夹) return;
    const 结果 = await window.omicomic.updateVirtualFolder({
      id: 当前虚拟文件夹.id,
      coverResourceKey: resourceKey,
    });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
      文件夹.id === 结果.data.id ? 结果.data : 文件夹
    )));
    设置虚拟文件夹资源菜单(null);
    显示成功提示("已设为书架封面预览图，只修改 OmiComic 内部数据。");
  }

  async function 清除书架设定封面(文件夹: VirtualFolder): Promise<void> {
    const 结果 = await window.omicomic.updateVirtualFolder({
      id: 文件夹.id,
      coverResourceKey: null,
    });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
      文件夹.id === 结果.data.id ? 结果.data : 文件夹
    )));
    设置书架内部空白菜单(null);
    设置虚拟文件夹菜单(null);
    显示成功提示("已清除设定封面，将按第一个文件显示书架封面。");
  }

  function 开始书架资源中键拖拽(
    事件: ReactMouseEvent<HTMLElement>,
    resourceKey: string,
    title: string,
    subtitle: string,
    icon: ReturnType<typeof ResourcePlaceholder>,
    typeLabel: string,
    thumbnailUrl: string | null,
  ): void {
    if (事件.button !== 1 || 删除确认处理中) return;
    事件.preventDefault();
    事件.stopPropagation();
    设置虚拟文件夹资源菜单(null);
    设置书架资源拖拽Key(resourceKey);
    设置书架资源拖拽落点(null);
    设置中键拖拽悬浮卡片({
      kind: "resource",
      title,
      subtitle,
      icon,
      typeLabel,
      thumbnailUrl,
      x: 事件.clientX,
      y: 事件.clientY,
    });
  }


  function 开始书架文件夹中键拖拽(事件: ReactMouseEvent<HTMLElement>, 文件夹: VirtualFolder): void {
    if (事件.button !== 1 || 删除确认处理中) return;
    事件.preventDefault();
    事件.stopPropagation();
    隐藏书架备注悬浮窗();
    设置虚拟文件夹菜单(null);
    设置书架文件夹拖拽Key(文件夹.id);
    设置书架文件夹拖拽落点(null);
    const 预览资源 = 获取书架文件夹显示封面资源(文件夹);
    const 预览缩略图 = 预览资源 ? 缩略图表[预览资源.sourcePath] : null;
    设置中键拖拽悬浮卡片({
      kind: "folder",
      title: 文件夹.name,
      subtitle: `${文件夹.items.length} 个资源`,
      thumbnailUrl: 预览缩略图?.status === "loaded" && 预览缩略图.url ? 预览缩略图.url : null,
      x: 事件.clientX,
      y: 事件.clientY,
    });
  }


  function 开始收藏中键拖拽(
    事件: ReactMouseEvent<HTMLElement>,
    项目: FavoriteItem,
    icon: ReturnType<typeof ResourcePlaceholder>,
    typeLabel: string,
    thumbnailUrl: string | null,
  ): void {
    if (事件.button !== 1 || 删除确认处理中) return;
    事件.preventDefault();
    事件.stopPropagation();
    设置收藏菜单(null);
    设置收藏拖拽Key(项目.resourceKey);
    设置收藏拖拽落点(null);
    设置中键拖拽悬浮卡片({
      kind: "resource",
      title: 项目.title,
      subtitle: 项目.sourcePath,
      icon,
      typeLabel,
      thumbnailUrl,
      x: 事件.clientX,
      y: 事件.clientY,
    });
  }


  function 开始书签中键拖拽(
    事件: ReactMouseEvent<HTMLElement>,
    项目: BookmarkItem,
    icon: ReturnType<typeof ResourcePlaceholder>,
    typeLabel: string,
    thumbnailUrl: string | null,
  ): void {
    if (事件.button !== 1 || 删除确认处理中) return;
    事件.preventDefault();
    事件.stopPropagation();
    设置书签菜单(null);
    设置书签拖拽Key(项目.id);
    设置书签拖拽落点(null);
    设置中键拖拽悬浮卡片({
      kind: "resource",
      title: 项目.title,
      subtitle: 项目.pageName ?? `第 ${项目.pageIndex + 1} / ${项目.totalPages} ${项目.sourceType === "epub" ? "章" : "页"}`,
      icon,
      typeLabel,
      thumbnailUrl,
      x: 事件.clientX,
      y: 事件.clientY,
    });
  }


  function 取消手机后台打开请求(): void {
    读取序号.current++; 打开阅读请求序号.current++;
    设置正在读取(false); 设置正在打开资源路径(null);
    window.dispatchEvent(new Event("omi-cancel-reader-prepare"));
  }

  function 手机栏目序号(视图: 资源库视图): number {
    return ['directory', 'bookshelf', 'favorites', 'bookmarks', 'recent'].indexOf(视图 === 'virtual-folder' ? 'bookshelf' : 视图);
  }

  function 切换手机栏目(目标: 资源库视图, commit: () => void): void {
    取消手机后台打开请求();
    重置栏目搜索();
    const 当前序号 = 手机栏目序号(当前视图), 目标序号 = 手机栏目序号(目标);
    if (当前序号 === 目标序号) { cancelMobileNavigation(); commit(); return; }
    void mobileNavigate(commit, 目标序号 > 当前序号 ? 'tab-next' : 'tab-prev');
  }

  function 打开书架(已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { 切换手机栏目('bookshelf', () => 打开书架(true)); return; }
    设置导航会话(value => value + 1);
    重置栏目搜索();
    if (资源信息目标) 关闭资源详情页面(true);
    if (排序 === "type") 设置排序("name-asc");
    if (!当前书架ID && 书架列表[0]) 设置当前书架ID(书架列表[0].id);
    设置当前视图("bookshelf");
    设置当前虚拟文件夹ID(null);
    设置错误信息(null);
    回到第一页();
  }

  function 进入书架文件夹(文件夹: VirtualFolder, 已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { 取消手机后台打开请求(); void mobileNavigate(() => 进入书架文件夹(文件夹, true), "folder"); return; }
    设置当前虚拟文件夹ID(文件夹.id);
    目录连续列表.sync();
    设置当前视图("virtual-folder");
    设置错误信息(null);
    退出选择模式();
    设置当前页(1);
  }

  function 返回书架根层(已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { 取消手机后台打开请求(); void mobileNavigate(() => 返回书架根层(true), "folder"); return; }
    if (排序 === "type") 设置排序("name-asc");
    if (!当前书架ID && 书架列表[0]) 设置当前书架ID(书架列表[0].id);
    目录连续列表.sync();
    设置当前视图("bookshelf");
    设置当前虚拟文件夹ID(null);
    设置错误信息(null);
    退出选择模式();
    设置当前页(1);
  }

  async function 刷新最近打开(): Promise<void> {
    const 最近结果 = await window.omicomic.getAppData();
    if (最近结果.ok) {
      设置最近打开列表(最近结果.data.recentOpened);
      设置临时存放列表(最近结果.data.temporaryOpened ?? []);
    }
  }

  function 切换阅读记录分类(分类: "recent" | "temporary", 已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { 切换手机栏目('recent', () => 切换阅读记录分类(分类, true)); return; }
    重置栏目搜索();
    if (资源信息目标) 关闭资源详情页面(true);
    退出选择模式();
    设置最近菜单(null);
    设置整理空白菜单(null);
    设置阅读记录分类(分类);
    设置当前视图("recent");
    设置最近搜索内容("");
    设置已选标签列表([]);
    设置错误信息(null);
    回到第一页();
  }

  async function 直接打开文件(): Promise<void> {
    try {
      const 结果 = await window.omicomic.chooseExternalFiles();
      if (!结果.ok) 设置错误信息(结果.error.message);
    } catch { 设置错误信息("无法打开文件选择窗口。"); }
  }

  async function 临时文件目录加入资源库(项目: RecentOpenedItem): Promise<void> {
    设置最近菜单(null);
    try {
      const 结果 = await window.omicomic.promoteTemporaryOpened(项目.resourceKey);
      if (!结果.ok) { 设置错误信息(结果.error.message); return; }
      同步应用数据状态(结果.data);
      退出选择模式();
      显示成功提示("所在目录已加入资源库，目录内的临时引用已归入资源库。");
    } catch { 设置错误信息("所在目录加入资源库失败，请稍后重试。"); }
  }

  async function 刷新收藏列表(): Promise<void> {
    const 收藏结果 = await window.omicomic.getFavorites();
    if (收藏结果.ok) {
      设置收藏列表(收藏结果.data);
    }
  }

  async function 刷新书签列表(): Promise<void> {
    const 书签结果 = await window.omicomic.getBookmarks();
    if (书签结果.ok) {
      设置书签列表(书签结果.data);
    }
  }

  function 同步应用数据状态(数据: OmiComicAppData): void {
    设置移除索引数量(数据.excludedResourcePaths?.length ?? 0);
    设置根目录列表(数据.library.roots);
    设置最近打开列表(数据.recentOpened);
    设置临时存放列表(数据.temporaryOpened ?? []);
    设置收藏列表(数据.favorites);
    设置书签列表(数据.bookmarks);
    设置阅读进度表(数据.readingProgress);
    设置书架列表(数据.bookshelves);
    设置虚拟文件夹列表(数据.virtualFolders);
    设置资源元数据表(数据.resourceMeta);
    设置标签顺序(数据.tagOrder);
  }

  async function 同步文件操作(数据: OmiComicAppData, changedPaths?: string[]): Promise<void> {
    clearMobileTreeCache();
    excludeLibraryCatalogPaths(数据.excludedResourcePaths ?? []);
    const parents = changedPaths ? [...new Set(changedPaths.map(获取父目录路径))] : 当前目录 ? [当前目录.path] : [];
    for (const root of 根目录列表) {
      const affected = parents.filter(path => path === root.path || path.replace(/\\/g,'/').startsWith(root.path.replace(/\\/g,'/').replace(/\/$/,'') + '/'));
      if (affected.length) invalidateLibraryCatalog(root.path, affected);
    }
    clearResourceThumbnailCache();
    设置缩略图表({});
    设置手机操作目标(null);
    同步应用数据状态(数据);
    关闭资源详情页面();
    退出选择模式();
    if (当前目录) {
      const 刷新 = await window.omicomic.listDirectory(当前目录.path);
      if (刷新.ok) 设置当前目录(刷新.data);
    }
    显示成功提示("资源已更新。");
  }

  function 收集内部资源记录(): VirtualFolderItemInput[] {
    const 记录表 = new Map<string, VirtualFolderItemInput>();
    const 加入记录 = (项目: { resourceKey: string; sourcePath: string; sourceType: 资源类型; title: string }): void => {
      if (!项目.resourceKey || !项目.sourcePath) return;
      if (!记录表.has(项目.resourceKey)) {
        记录表.set(项目.resourceKey, {
          resourceKey: 项目.resourceKey,
          sourcePath: 项目.sourcePath,
          sourceType: 项目.sourceType,
          title: 项目.title,
        });
      }
    };

    for (const 项目 of 最近打开列表) 加入记录(项目);
    for (const 项目 of 临时存放列表) 加入记录(项目);
    for (const 项目 of 收藏列表) 加入记录(项目);
    for (const 项目 of 书签列表) 加入记录(项目);
    for (const 项目 of Object.values(阅读进度表)) 加入记录(项目);
    for (const 项目 of Object.values(资源元数据表)) 加入记录(项目);
    for (const 文件夹 of 虚拟文件夹列表) {
      for (const 项目 of 文件夹.items) 加入记录(项目);
    }

    return [...记录表.values()];
  }

  async function 扫描全局无效资源记录(): Promise<全局清空无效资源确认状态> {
    const 路径记录表 = new Map<string, VirtualFolderItemInput[]>();
    for (const 项目 of 收集内部资源记录()) {
      const 同路径记录 = 路径记录表.get(项目.sourcePath) ?? [];
      同路径记录.push(项目);
      路径记录表.set(项目.sourcePath, 同路径记录);
    }

    const 失效路径集合 = new Set<string>();
    const 失效Key集合 = new Set<string>();
    for (const [sourcePath, 同路径记录] of 路径记录表.entries()) {
      const 代表记录 = 同路径记录[0];
      const 结果 = await window.omicomic.checkResourcePath({ path: sourcePath, type: 代表记录.sourceType });
      if (!结果.ok || !结果.data.exists || !结果.data.readable) {
        失效路径集合.add(sourcePath);
        for (const 项目 of 同路径记录) 失效Key集合.add(项目.resourceKey);
      }
    }

    if (失效路径集合.size === 0 && 失效Key集合.size === 0) return null;
    return {
      sourcePaths: [...失效路径集合],
      resourceKeys: [...失效Key集合],
      count: 失效Key集合.size,
    };
  }

  async function 处理刷新按钮(): Promise<void> {
    设置导航会话(value => value + 1);
    设置可阅读页数表({});
    clearMobileTreeCache();
    invalidateLibraryCatalog(当前根目录 ?? undefined, 当前目录 ? [当前目录.path] : undefined);
    if (正在读取 || 正在检查全局无效资源) return;

    设置错误信息(null);
    设置正在检查全局无效资源(true);
    try {
      const 封面刷新 = await window.omicomic.refreshThumbnails?.();
      if (封面刷新 && !封面刷新.ok) throw new Error(封面刷新.error.message);
      clearResourceThumbnailCache();
      const 清理目标 = await 扫描全局无效资源记录();
      if (清理目标) {
        设置错误信息(`检测到 ${清理目标.count} 个路径失效资源，原记录不会自动删除。`);
        设置待全局清空无效资源(清理目标);
        return;
      }

      if (当前视图 === "directory" && 当前目录 && 当前根目录) {
        设置缩略图表({});
        await 打开目录(当前目录.path, 当前根目录, "none", false);
      }
      if (随机模式) 随机浏览.redraw();
    } catch {
      设置错误信息("失效资源检测失败，请稍后重试。");
    } finally {
      设置正在检查全局无效资源(false);
    }
  }

  async function 切换收藏(收藏输入: 收藏输入): Promise<void> {
    if (收藏Key集合.has(收藏输入.resourceKey)) {
      const 结果 = await window.omicomic.removeFavorite(收藏输入.resourceKey);
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置收藏列表((原列表) => 原列表.filter((项目) => 项目.resourceKey !== 收藏输入.resourceKey));
      return;
    }

    const 结果 = await window.omicomic.addFavorite(收藏输入);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置收藏列表((原列表) => [
      结果.data,
      ...原列表.filter((项目) => 项目.resourceKey !== 结果.data.resourceKey),
    ]);
  }

  function 打开资源库(已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { 切换手机栏目('directory', () => 打开资源库(true)); return; }
    设置导航会话(value => value + 1);
    重置栏目搜索();
    随机浏览.stop();
    if (资源信息目标) 关闭资源详情页面(true);
    设置手机筛选展开(false);
    设置搜索内容("");
    设置错误信息(null);
    设置当前虚拟文件夹ID(null);
    const root = 当前根目录 ?? 根目录列表[0]?.path;
    if (root) {
      if (当前目录?.path === root) { 设置当前视图("directory"); 回到第一页(); }
      else void 打开目录(root, root);
    } else 设置当前视图("directory");
  }

  function 转为收藏输入(项目: VirtualFolderItemInput): 收藏输入 | null {
    if (项目.sourceType !== "folder" && 项目.sourceType !== "image" && 项目.sourceType !== "archive" && 项目.sourceType !== "pdf" && 项目.sourceType !== "epub") return null;
    return {
      resourceKey: 项目.resourceKey,
      sourcePath: 项目.sourcePath,
      sourceType: 项目.sourceType,
      title: 项目.title,
    };
  }

  async function 批量加入收藏(items: VirtualFolderItemInput[], title: string): Promise<void> {
    const 已处理Key = new Set<string>();
    const 待加入 = items
      .map(转为收藏输入)
      .filter((项目): 项目 is 收藏输入 => {
        if (!项目 || 收藏Key集合.has(项目.resourceKey) || 已处理Key.has(项目.resourceKey)) return false;
        已处理Key.add(项目.resourceKey);
        return true;
      });

    if (待加入.length === 0) {
      设置错误信息(items.length === 0 ? "当前选择中没有可加入收藏的资源。" : "当前可收藏资源已在收藏中。");
      return;
    }

    const 新收藏列表: FavoriteItem[] = [];
    for (const 项目 of 待加入) {
      const 结果 = await window.omicomic.addFavorite(项目);
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        break;
      }
      新收藏列表.push(结果.data);
    }

    if (新收藏列表.length === 0) return;
    const 新收藏Key = new Set(新收藏列表.map((项目) => 项目.resourceKey));
    设置收藏列表((原列表) => [
      ...新收藏列表,
      ...原列表.filter((项目) => !新收藏Key.has(项目.resourceKey)),
    ]);
    if (选择模式 === "directory" || 选择模式 === "virtual-folder") 退出选择模式();
    显示成功提示(新收藏列表.length === 1 ? `已将“${title}”加入收藏。` : `已加入 ${新收藏列表.length} 个收藏。`);
  }

  async function 删除收藏记录(resourceKey: string): Promise<void> {
    const 结果 = await window.omicomic.removeFavorite(resourceKey);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }

    设置收藏列表((原列表) => 原列表.filter((项目) => 项目.resourceKey !== resourceKey));
    设置收藏菜单(null);
  }

  async function 删除书签记录(id: string): Promise<void> {
    const 结果 = await window.omicomic.removeBookmark(id);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }

    设置书签列表((原列表) => 原列表.filter((项目) => 项目.id !== id));
    设置书签菜单(null);
  }

  async function 删除最近打开记录(resourceKey: string): Promise<void> {
    const 结果 = await window.omicomic.removeRecentOpened(resourceKey);
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }

    设置最近打开列表((原列表) => 原列表.filter((项目) => 项目.resourceKey !== resourceKey));
    设置最近菜单(null);
  }

  function 打开书架弹窗(状态: { mode: "create" | "rename"; bookshelf?: Bookshelf } | null): void {
    设置书架弹窗(状态);
    设置错误信息(null);
    if (!状态) {
      设置书架名称输入("");
      return;
    }
    设置书架名称输入(状态.mode === "rename" && 状态.bookshelf ? 状态.bookshelf.name : 生成默认书架栏名称(书架列表));
  }

  async function 保存书架弹窗(): Promise<void> {
    if (!书架弹窗 || 删除确认处理中) return;
    const 名称 = 书架名称输入.trim();
    if (!名称) {
      设置错误信息("书架栏名称不能为空。");
      return;
    }
    if (书架列表.some((项目) => 项目.name === 名称 && (书架弹窗.mode === "create" || 项目.id !== 书架弹窗.bookshelf?.id))) {
      设置错误信息("已存在同名书架栏。");
      return;
    }

    设置删除确认处理中(true);
    try {
      if (书架弹窗.mode === "create") {
        const 结果 = await window.omicomic.createBookshelf({ name: 名称 });
        if (!结果.ok) {
          设置错误信息(结果.error.message);
          return;
        }
        设置书架列表((原列表) => [...原列表, 结果.data]);
        设置当前书架ID(结果.data.id);
        设置当前视图("bookshelf");
        打开书架弹窗(null);
        return;
      }

      if (!书架弹窗.bookshelf) return;
      const 结果 = await window.omicomic.updateBookshelf({ id: 书架弹窗.bookshelf.id, name: 名称 });
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置书架列表((原列表) => 原列表.map((项目) => 项目.id === 结果.data.id ? 结果.data : 项目));
      打开书架弹窗(null);
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 开始内联编辑书架栏(书架: Bookshelf): void {
    设置内联编辑书架栏({ id: 书架.id, name: 书架.name });
    设置错误信息(null);
  }

  function 取消内联编辑书架栏(): void {
    设置内联编辑书架栏(null);
  }

  async function 保存内联编辑书架栏(): Promise<void> {
    if (!内联编辑书架栏 || 删除确认处理中) return;
    const 名称 = 内联编辑书架栏.name.trim();
    const 原书架 = 书架列表.find((项目) => 项目.id === 内联编辑书架栏.id);
    if (!原书架) {
      设置内联编辑书架栏(null);
      return;
    }
    if (!名称) {
      设置错误信息("书架栏名称不能为空。");
      return;
    }
    if (名称 === 原书架.name) {
      设置内联编辑书架栏(null);
      return;
    }
    if (书架列表.some((项目) => 项目.id !== 原书架.id && 项目.name === 名称)) {
      设置错误信息("已存在同名书架栏。");
      return;
    }

    设置删除确认处理中(true);
    try {
      const 结果 = await window.omicomic.updateBookshelf({ id: 原书架.id, name: 名称 });
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置书架列表((原列表) => 原列表.map((项目) => 项目.id === 结果.data.id ? 结果.data : 项目));
      设置内联编辑书架栏(null);
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 删除书架记录(): Promise<void> {
    const 删除列表 = 待删除书架列表 ?? (待删除书架 ? [待删除书架] : []);
    if (删除列表.length === 0 || 删除确认处理中) return;
    if (书架列表.length - 删除列表.length < 1) {
      设置错误信息("至少需要保留一个书架分类。");
      设置待删除书架(null);
      设置待删除书架列表(null);
      return;
    }
    设置删除确认处理中(true);
    try {
      let 最新数据: OmiComicAppData | null = null;
      for (const 书架 of 删除列表) {
        const 结果 = await window.omicomic.deleteBookshelf(书架.id);
        if (!结果.ok) {
          设置错误信息(结果.error.message === "BOOKSHELF_MINIMUM_REQUIRED" ? "至少需要保留一个书架分类。" : 结果.error.message);
          return;
        }
        最新数据 = 结果.data;
      }
      if (!最新数据) return;
      设置书架列表(最新数据.bookshelves);
      设置虚拟文件夹列表(最新数据.virtualFolders);
      设置资源元数据表(最新数据.resourceMeta);
      设置标签顺序(最新数据.tagOrder);
      设置已选书架栏ID集合(new Set());
      const 下一个书架ID = 最新数据.bookshelves[0]?.id ?? null;
      设置当前书架ID(下一个书架ID);
      设置当前虚拟文件夹ID(null);
      if (当前视图 === "bookshelf" || 当前视图 === "virtual-folder") 设置当前视图("bookshelf");
      设置待删除书架(null);
      设置待删除书架列表(null);
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 打开虚拟文件夹弹窗(状态: 虚拟文件夹弹窗状态): void {
    设置虚拟文件夹弹窗(状态);
    设置错误信息(null);
    if (!状态) {
      设置虚拟文件夹名称输入("");
      设置虚拟文件夹备注输入("");
      return;
    }
    if (状态.mode === "create") {
      设置虚拟文件夹名称输入("");
      设置虚拟文件夹备注输入("");
    } else {
      设置虚拟文件夹名称输入(状态.folder.name);
      设置虚拟文件夹备注输入(状态.folder.note);
    }
  }

  async function 保存虚拟文件夹弹窗(): Promise<void> {
    if (!虚拟文件夹弹窗 || 删除确认处理中) return;
    const 名称 = 虚拟文件夹名称输入.trim();
    const 备注 = 虚拟文件夹备注输入.trim();

    if ((虚拟文件夹弹窗.mode === "create" || 虚拟文件夹弹窗.mode === "rename") && !名称) {
      设置错误信息("书架名称不能为空。");
      return;
    }
    if (
      名称
      && 虚拟文件夹列表.some((项目) => 项目.name === 名称 && 项目.bookshelfId === (
        虚拟文件夹弹窗.mode === "create"
          ? 虚拟文件夹弹窗.bookshelfId ?? 当前书架?.id
          : 虚拟文件夹弹窗.folder.bookshelfId
      ) && (
        虚拟文件夹弹窗.mode === "create" || 项目.id !== 虚拟文件夹弹窗.folder.id
      ))
    ) {
      设置错误信息("已存在同名书架。");
      return;
    }

    设置删除确认处理中(true);
    try {
      if (虚拟文件夹弹窗.mode === "create") {
        const 目标书架栏ID = 虚拟文件夹弹窗.bookshelfId ?? 当前书架?.id;
        const 结果 = await window.omicomic.createVirtualFolder({ name: 名称, note: 备注, bookshelfId: 目标书架栏ID });
        if (!结果.ok) {
          设置错误信息(结果.error.message);
          return;
        }
        let 新文件夹 = 结果.data;
        if (虚拟文件夹弹窗.items && 虚拟文件夹弹窗.items.length > 0) {
          const 加入结果 = await window.omicomic.addVirtualFolderItems({
            folderId: 结果.data.id,
            items: 虚拟文件夹弹窗.items,
          });
          if (加入结果.ok) 新文件夹 = 加入结果.data.folder;
        }
        设置虚拟文件夹列表((原列表) => [...原列表, 新文件夹]);
        if (!虚拟文件夹弹窗.items?.length) {
          设置当前书架ID(新文件夹.bookshelfId);
          设置当前虚拟文件夹ID(null);
          设置当前视图("bookshelf");
        }
        设置加入虚拟文件夹目标(null);
        设置加入书架搜索内容("");
        设置加入书架目标书架栏ID(null);
        打开虚拟文件夹弹窗(null);
        if (虚拟文件夹弹窗.items?.length) 显示成功提示(`已新建书架并加入 ${虚拟文件夹弹窗.items.length} 个资源。`);
        return;
      }

      const 结果 = await window.omicomic.updateVirtualFolder({
        id: 虚拟文件夹弹窗.folder.id,
        name: 虚拟文件夹弹窗.mode === "rename" ? 名称 : undefined,
        note: 虚拟文件夹弹窗.mode === "note" ? 备注 : undefined,
      });
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置虚拟文件夹列表((原列表) => 原列表.map((项目) => 项目.id === 结果.data.id ? 结果.data : 项目));
      打开虚拟文件夹弹窗(null);
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 删除虚拟文件夹记录(): Promise<void> {
    if (!待删除虚拟文件夹 || 删除确认处理中) return;
    const 删除书架 = 待删除虚拟文件夹.selection ?? [待删除虚拟文件夹];
    设置删除确认处理中(true);
    try {
      for (const 文件夹 of 删除书架) {
      const 结果 = await window.omicomic.deleteVirtualFolder(文件夹.id);
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置虚拟文件夹列表(结果.data);
      }
      设置待删除虚拟文件夹(null);
      设置手机书架管理(null);
      if (当前视图 === "virtual-folder" && 删除书架.some(item=>item.id===当前虚拟文件夹ID)) {
        设置当前虚拟文件夹ID(null);
        设置当前视图("bookshelf");
      }
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 选择已有虚拟文件夹加入(items: VirtualFolderItemInput[], title: string, anchor?: { x: number; y: number }): void {
    const 默认书架栏ID = 当前书架 && 当前书架文件夹列表.length > 0
      ? 当前书架.id
      : 书架列表.find((书架) => 虚拟文件夹列表.some((文件夹) => 文件夹.bookshelfId === 书架.id))?.id ?? 当前书架?.id ?? 书架列表[0]?.id;
    if (虚拟文件夹列表.length === 0) {
      打开虚拟文件夹弹窗({ mode: "create", items, bookshelfId: 默认书架栏ID });
      return;
    }
    设置加入书架搜索内容("");
    设置加入书架目标书架栏ID(默认书架栏ID ?? null);
    设置加入虚拟文件夹目标({ items, title, anchor });
  }

  async function 加入到虚拟文件夹(folderId: string, items: VirtualFolderItemInput[]): Promise<void> {
    const 结果 = await window.omicomic.addVirtualFolderItems({ folderId, items });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((项目) => 项目.id === folderId ? 结果.data.folder : 项目));
    设置加入虚拟文件夹目标(null);
    设置加入书架搜索内容("");
    设置加入书架目标书架栏ID(null);
    设置最近菜单(null);
    设置收藏菜单(null);
    设置虚拟文件夹资源菜单(null);
    if (选择模式 === "directory") 退出选择模式();
    const 反馈 = 结果.data.addedCount > 0
      ? `已加入 ${结果.data.addedCount} 个资源到书架。`
      : "该资源已在目标书架中。";
    显示成功提示(反馈);
  }

  async function 从当前虚拟文件夹移除(resourceKey: string): Promise<void> {
    if (!当前虚拟文件夹) return;
    const 结果 = await window.omicomic.removeVirtualFolderItem({
      folderId: 当前虚拟文件夹.id,
      resourceKey,
    });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((项目) => 项目.id === 结果.data.id ? 结果.data : 项目));
    设置虚拟文件夹资源菜单(null);
    显示成功提示("已从当前书架移除 1 个资源。");
  }

  async function 清空虚拟文件夹记录(): Promise<void> {
    if (!待清空虚拟文件夹 || 删除确认处理中) return;
    设置删除确认处理中(true);
    try {
      const 结果 = await window.omicomic.clearVirtualFolderItems(待清空虚拟文件夹.folder.id);
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
        文件夹.id === 结果.data.id ? 结果.data : 文件夹
      )));
      设置已选项目Key集合(new Set());
      设置待清空虚拟文件夹(null);
      设置虚拟文件夹菜单(null);
      显示成功提示("已清空该书架的内部资源引用，不会删除、移动或复制任何原始漫画文件。");
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 清空当前书架无效资源记录(): Promise<void> {
    if (!待清空无效资源 || 删除确认处理中) return;
    设置删除确认处理中(true);
    try {
      const 结果 = await window.omicomic.removeVirtualFolderItems({
        folderId: 待清空无效资源.folder.id,
        resourceKeys: 待清空无效资源.resourceKeys,
      });
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
        文件夹.id === 结果.data.id ? 结果.data : 文件夹
      )));
      设置已选项目Key集合((原集合) => {
        const 删除集合 = new Set(待清空无效资源.resourceKeys);
        const 新集合 = new Set(原集合);
        for (const key of 删除集合) 新集合.delete(key);
        return 新集合;
      });
      设置待清空无效资源(null);
      设置书架内部空白菜单(null);
      设置已忽略无效资源清理Key(null);
      显示成功提示("已清空当前书架中的失效资源内部引用，不会删除、移动或复制任何原始漫画文件。");
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 调整当前书架项目顺序(resourceKey: string, 操作: "up" | "down" | "top" | "bottom"): Promise<void> {
    if (!当前虚拟文件夹 || 删除确认处理中) return;
    const 项目列表 = [...当前虚拟文件夹.items].sort((左侧, 右侧) => (
      左侧.sortIndex - 右侧.sortIndex
        || 左侧.addedAt - 右侧.addedAt
        || 文件名排序器.compare(左侧.title, 右侧.title)
    ));
    const 起点 = 项目列表.findIndex((项目) => 项目.resourceKey === resourceKey);
    if (起点 < 0) {
      设置错误信息("当前书架中已没有该资源。");
      return;
    }
    let 终点 = 起点;
    if (操作 === "up") 终点 = Math.max(0, 起点 - 1);
    else if (操作 === "down") 终点 = Math.min(项目列表.length - 1, 起点 + 1);
    else if (操作 === "top") 终点 = 0;
    else 终点 = 项目列表.length - 1;
    if (终点 === 起点) {
      显示成功提示("当前资源顺序未变化。");
      设置虚拟文件夹资源菜单(null);
      return;
    }

    const [移动项] = 项目列表.splice(起点, 1);
    项目列表.splice(终点, 0, 移动项);
    const 结果 = await window.omicomic.reorderVirtualFolderItems({
      folderId: 当前虚拟文件夹.id,
      orderedResourceKeys: 项目列表.map((项目) => 项目.resourceKey),
    });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
      文件夹.id === 结果.data.id ? 结果.data : 文件夹
    )));
    设置虚拟文件夹资源菜单(null);
    显示成功提示("已调整当前书架内部显示顺序，只修改 OmiComic 内部数据。");
  }

  function 打开批量转存到书架弹窗(
    action: "move" | "copy",
    items: VirtualFolderItemInput[],
    title: string,
    anchor?: { x: number; y: number },
  ): void {
    if (!当前虚拟文件夹) return;
    const 可选目标列表 = 获取书架转存目标列表(虚拟文件夹列表, 当前虚拟文件夹.id);
    if (items.length === 0) {
      设置错误信息("当前选择中没有可整理的资源。");
      return;
    }
    if (可选目标列表.length === 0) {
      关闭成功提示();
      设置移动到书架目标(null);
      设置转存书架搜索内容("");
      设置转存书架目标书架栏ID(null);
      设置错误信息(action === "copy" ? "暂无其他书架可复制，请先新建目标书架。" : "暂无其他书架可移动，请先新建目标书架。");
      return;
    }
    设置移动到书架目标({
      action,
      fromFolderId: 当前虚拟文件夹.id,
      items,
      resourceKeys: items.map((项目) => 项目.resourceKey),
      title,
      anchor,
    });
    设置转存书架搜索内容("");
    设置转存书架目标书架栏ID(可选目标列表[0]?.bookshelfId ?? null);
  }

  function 打开移动到书架弹窗(项目: VirtualFolderItem): void {
    if (!当前虚拟文件夹) return;
    设置虚拟文件夹资源菜单(null);
    打开批量转存到书架弹窗("move", [{
      resourceKey: 项目.resourceKey,
      sourcePath: 项目.sourcePath,
      sourceType: 项目.sourceType,
      title: 项目.title,
    }], 项目.title);
  }

  function 打开复制到书架弹窗(项目: VirtualFolderItem): void {
    if (!当前虚拟文件夹) return;
    设置虚拟文件夹资源菜单(null);
    打开批量转存到书架弹窗("copy", [{
      resourceKey: 项目.resourceKey,
      sourcePath: 项目.sourcePath,
      sourceType: 项目.sourceType,
      title: 项目.title,
    }], 项目.title);
  }

  async function 转存到虚拟文件夹(toFolderId: string): Promise<void> {
    if (!移动到书架目标 || 删除确认处理中) return;
    设置删除确认处理中(true);
    try {
      if (移动到书架目标.action === "copy") {
        const 结果 = await window.omicomic.addVirtualFolderItems({
          folderId: toFolderId,
          items: 移动到书架目标.items,
        });
        if (!结果.ok) {
          关闭成功提示();
          设置错误信息(结果.error.message);
          return;
        }
        设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
          文件夹.id === toFolderId ? 结果.data.folder : 文件夹
        )));
        设置虚拟文件夹资源菜单(null);
        设置移动到书架目标(null);
        设置转存书架搜索内容("");
        设置转存书架目标书架栏ID(null);
        显示成功提示(
          结果.data.addedCount > 0
            ? `已复制 ${结果.data.addedCount} 个资源到书架“${结果.data.folder.name}”。只修改 OmiComic 内部引用。`
            : `目标书架“${结果.data.folder.name}”中已存在这些资源，当前书架已保留。`,
        );
        return;
      }

      const 结果 = await window.omicomic.moveVirtualFolderItems({
        fromFolderId: 移动到书架目标.fromFolderId,
        toFolderId,
        items: 移动到书架目标.items,
      });
      if (!结果.ok) {
        关闭成功提示();
        设置错误信息(结果.error.message);
        return;
      }
      const 移动资源Key集合 = new Set(移动到书架目标.resourceKeys);
      设置虚拟文件夹列表(结果.data.virtualFolders);
      设置已选项目Key集合((原集合) => {
        const 新集合 = new Set(原集合);
        for (const key of 移动资源Key集合) 新集合.delete(key);
        return 新集合;
      });
      设置虚拟文件夹资源菜单(null);
      设置移动到书架目标(null);
      设置转存书架搜索内容("");
      设置转存书架目标书架栏ID(null);
      const 目标文件夹 = 结果.data.virtualFolders.find((文件夹) => 文件夹.id === toFolderId);
      显示成功提示(
        结果.data.targetAlreadyHadCount > 0
          ? `已从当前书架移除 ${结果.data.movedCount} 个资源；其中 ${结果.data.targetAlreadyHadCount} 个目标书架已存在，未重复添加。`
          : `已移动 ${结果.data.movedCount} 个资源到书架${目标文件夹 ? `“${目标文件夹.name}”` : ""}。只修改 OmiComic 内部引用。`,
      );
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 关闭所有右键菜单(): void {
    设置目录空白菜单(null); 设置资源菜单(null); 设置最近菜单(null); 设置收藏菜单(null);
    设置书签菜单(null); 设置书架菜单(null); 设置书架栏空白菜单(null); 设置虚拟文件夹菜单(null);
    设置书架空白菜单(null); 设置书架内部空白菜单(null); 设置整理空白菜单(null);
    设置虚拟文件夹资源菜单(null); 设置根目录菜单(null); 设置标签菜单(null);
  }

  function 打开资源详情页面(目标: 资源信息目标, 已转场: unknown = false): void {
    关闭所有右键菜单();
    if (手机布局 && 已转场 !== true) {
      取消手机后台打开请求();
      const keys = 目标.kind === 'bookmark' ? [目标.item.id] : [目标.input.resourceKey, 目标.localPath, 目标.input.sourcePath];
      const card = [...document.querySelectorAll<HTMLElement>('.page-panel.is-visible .mobile-resource-card')].find(element => keys.includes(element.dataset.selectionKey));
      const rect = card?.querySelector('.resource-preview')?.getBoundingClientRect();
      const origin = rect && rect.width > 0 && rect.height > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height, selectionKey: card?.dataset.selectionKey } : undefined;
      手机详情封面起点.current = origin;
      void mobileNavigate(() => 打开资源详情页面(目标, true), 'detail', undefined, origin);
      return;
    }
    设置完整标签浮层(null);
    设置资源信息目标(目标);
    设置资源详情顶部折叠(false);
    设置资源详情编辑模式(false);
    资源详情编辑快照.current = null;
    设置资源详情路径浮层打开(false);
    设置整理错误(null);
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
    设置收藏菜单(null);
    设置书签菜单(null);
    设置最近菜单(null);

    if (目标.kind === "bookmark") {
      设置整理备注输入(获取整理备注(目标.item));
      设置整理标签输入(获取整理标签(目标.item).join(", "));
    } else {
      const 整理信息 = 获取资源整理信息(目标.input);
      设置整理备注输入(整理信息.note);
      设置整理标签输入(整理信息.tags.join(", "));
    }
    设置资源详情预览页(0);
    设置资源详情阅读资源(null);
    设置资源详情加载状态("loading");
    设置资源详情所选页(目标.kind === "bookmark" ? 目标.item.pageIndex : 0);
    const 本次加载序号 = ++资源详情加载序号.current;
    const 路径 = 目标.kind === "bookmark" ? 目标.item.sourcePath : 目标.input.sourcePath;
    const 类型 = 目标.kind === "bookmark" ? 目标.item.sourceType : 目标.fileType;
    if (类型 !== "folder" && 类型 !== "image" && 类型 !== "archive" && 类型 !== "pdf" && 类型 !== "epub") {
      设置资源详情加载状态("error");
      return;
    }
    void window.omicomic.getResourcePages({ path: 路径, type: 类型 })
      .then((结果) => {
        if (本次加载序号 !== 资源详情加载序号.current) return;
        if (!结果.ok) {
          设置资源详情加载状态("error");
          设置整理错误(结果.error.message);
          return;
        }
        设置资源详情阅读资源(结果.data);
        设置资源详情所选页((原页) => Math.min(Math.max(原页, 0), (结果.data.sourceType === "pdf" || 结果.data.sourceType === "epub" ? Number.MAX_SAFE_INTEGER : Math.max(0, 结果.data.total - 1))));
        设置资源详情加载状态("loaded");
      })
      .catch(() => {
        if (本次加载序号 !== 资源详情加载序号.current) return;
        设置资源详情加载状态("error");
        设置整理错误("页面缩略图加载失败，请稍后重试。");
      });
  }

  function 关闭资源详情页面(已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { void mobileNavigate(() => 关闭资源详情页面(true), 'detail-back', undefined, 手机详情封面起点.current); return; }
    if (整理保存中) return;
    资源详情加载序号.current += 1;
    设置资源信息目标(null);
    设置资源详情阅读资源(null);
    设置资源详情加载状态("idle");
    设置资源详情所选页(0);
    设置资源详情顶部折叠(false);
    设置资源详情编辑模式(false);
    资源详情编辑快照.current = null;
    设置资源详情路径浮层打开(false);
    设置整理错误(null);
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
  }

  async function 返回手机上一页(): Promise<void> {
    if (资源信息目标) {
      if (资源详情编辑模式 && !(await 完成资源详情信息编辑())) return;
      关闭资源详情页面();
    } else if (当前视图 === "directory" && 当前目录?.parentPath && 当前根目录) {
      await 返回上一处();
    } else onHome();
  }

  function 打开资源详情阅读器(页码 = 资源详情所选页): void {
    if (!资源详情阅读资源) return;
    const 起始页 = Math.min(Math.max(页码, 0), (资源详情阅读资源.sourceType === "pdf" || 资源详情阅读资源.sourceType === "epub" ? Number.MAX_SAFE_INTEGER : Math.max(0, 资源详情阅读资源.total - 1)));
    void 保存资源当前进度(资源详情阅读资源, 起始页);
    打开阅读器(资源详情阅读资源, 起始页);
  }

  async function 打开详情文件操作(mode: "rename" | "delete"): Promise<void> {
    if (!资源信息目标 || 整理保存中) return;
    if (资源详情编辑模式 && !(await 完成资源详情信息编辑())) return;
    const item = 资源信息目标.kind === "bookmark" ? 资源信息目标.item : 资源信息目标.input;
    const path = 资源信息目标.kind === "resource" ? 资源信息目标.localPath ?? item.sourcePath : item.sourcePath;
    设置本地文件目标({ path, title: item.title, mode });
  }

  function 更新书籍阅读设置(progress: ReadingProgress, resource?: 阅读资源结果): void {
    设置阅读进度表(previous => ({ ...previous, [progress.resourceKey]: progress }));
    void 刷新最近打开();
    void window.omicomic.getBookmarks().then(result => { if (result.ok) 设置书签列表(result.data); });
    if (resource && 资源详情阅读资源?.resourceKey === resource.resourceKey) {
      const selected = 资源详情阅读资源.pages[资源详情所选页];
      const index = resolvePageIndex(resource.pages, selected ? pageIdentity(selected) : undefined, undefined, 资源详情所选页);
      设置资源详情阅读资源(resource); 设置资源详情所选页(index); 设置资源详情预览页(Math.floor(index / 48));
    }
  }

  useEffect(() => {
    const open = () => 打开设置窗口();
    window.addEventListener("omi-open-settings", open);
    return () => window.removeEventListener("omi-open-settings", open);
  }, []);
  useEffect(() => { 设置手机操作目标(null); 设置手机排序中(false); }, [当前视图, 当前目录?.path, 当前虚拟文件夹ID]);
  useEffect(() => { 设置手机书架管理(null); }, [当前视图, 当前书架ID]);
  useEffect(() => { if (!手机书架管理) { 设置手机选中书架(new Set()); 设置手机书架排序(false); } }, [手机书架管理]);

  function 打开设置窗口(已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true) { 取消手机后台打开请求(); void mobileNavigate(() => 打开设置窗口(true), "forward"); return; }
    设置手机显示选项(false);
    设置手机设置子页(false);
    设置当前设置分类("library");
    设置设置窗口偏移({ x: 0, y: 0 });
    设置完整标签浮层(null);
    设置框选(null);
    设置中键拖拽悬浮卡片(null);
    隐藏书架备注悬浮窗();
    设置当前右侧抽屉("settings");
  }

  function 约束设置窗口位置(): void {
    const 窗口 = 设置窗口元素.current;
    const 遮罩 = 窗口?.parentElement;
    if (!窗口 || !遮罩) return;
    const 窗口矩形 = 窗口.getBoundingClientRect();
    const 遮罩矩形 = 遮罩.getBoundingClientRect();
    const 边距 = 12;
    let 修正X = 0;
    let 修正Y = 0;
    if (窗口矩形.left < 遮罩矩形.left + 边距) 修正X = 遮罩矩形.left + 边距 - 窗口矩形.left;
    else if (窗口矩形.right > 遮罩矩形.right - 边距) 修正X = 遮罩矩形.right - 边距 - 窗口矩形.right;
    if (窗口矩形.top < 遮罩矩形.top + 边距) 修正Y = 遮罩矩形.top + 边距 - 窗口矩形.top;
    else if (窗口矩形.bottom > 遮罩矩形.bottom - 边距) 修正Y = 遮罩矩形.bottom - 边距 - 窗口矩形.bottom;
    if (修正X === 0 && 修正Y === 0) return;
    设置设置窗口偏移((原偏移) => ({ x: 原偏移.x + 修正X, y: 原偏移.y + 修正Y }));
  }

  function 开始拖动设置窗口(事件: ReactPointerEvent<HTMLElement>): void {
    if (手机布局) return;
    if (事件.button !== 0 || !事件.isPrimary) return;
    const 目标 = 事件.target;
    if (目标 instanceof HTMLElement && 目标.closest("button, input, select, textarea, a")) return;
    const 窗口 = 设置窗口元素.current;
    const 遮罩 = 窗口?.parentElement;
    if (!窗口 || !遮罩) return;
    事件.preventDefault();
    const 起始X = 事件.clientX;
    const 起始Y = 事件.clientY;
    const 起始偏移 = 设置窗口偏移;
    const 窗口矩形 = 窗口.getBoundingClientRect();
    const 遮罩矩形 = 遮罩.getBoundingClientRect();
    const 边距 = 12;
    const 最小X = 起始偏移.x + 遮罩矩形.left + 边距 - 窗口矩形.left;
    const 最大X = 起始偏移.x + 遮罩矩形.right - 边距 - 窗口矩形.right;
    const 最小Y = 起始偏移.y + 遮罩矩形.top + 边距 - 窗口矩形.top;
    const 最大Y = 起始偏移.y + 遮罩矩形.bottom - 边距 - 窗口矩形.bottom;

    function 处理移动(移动事件: PointerEvent): void {
      设置设置窗口偏移({
        x: 限制数值(起始偏移.x + 移动事件.clientX - 起始X, 最小X, 最大X),
        y: 限制数值(起始偏移.y + 移动事件.clientY - 起始Y, 最小Y, 最大Y),
      });
    }

    function 结束拖动(): void {
      window.removeEventListener("pointermove", 处理移动);
      window.removeEventListener("pointerup", 结束拖动);
      window.removeEventListener("pointercancel", 结束拖动);
      window.removeEventListener("blur", 结束拖动);
      window.requestAnimationFrame(约束设置窗口位置);
    }

    window.addEventListener("pointermove", 处理移动);
    window.addEventListener("pointerup", 结束拖动);
    window.addEventListener("pointercancel", 结束拖动);
    window.addEventListener("blur", 结束拖动);
  }

  function 处理设置窗口键盘(事件: ReactKeyboardEvent<HTMLElement>): void {
    if (事件.key !== "Tab") return;
    const 窗口 = 设置窗口元素.current;
    if (!窗口) return;
    const 可聚焦元素 = Array.from(窗口.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((元素) => !元素.hidden && 元素.offsetParent !== null);
    if (可聚焦元素.length === 0) return;
    const 首个元素 = 可聚焦元素[0];
    const 末尾元素 = 可聚焦元素[可聚焦元素.length - 1];
    if (事件.shiftKey && document.activeElement === 首个元素) {
      事件.preventDefault();
      末尾元素.focus();
    } else if (!事件.shiftKey && document.activeElement === 末尾元素) {
      事件.preventDefault();
      首个元素.focus();
    }
  }

  function 关闭右侧抽屉(已转场: unknown = false): void {
    if (手机布局 && 已转场 !== true && 当前右侧抽屉 === "settings") { void mobileNavigate(() => 关闭右侧抽屉(true), "back"); return; }
    const 恢复设置按钮焦点 = 当前右侧抽屉 === "settings";
    设置当前右侧抽屉(null);
    设置整理错误(null);
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
    设置标签删除选择模式(false);
    设置待删除标签选择集合(new Set());
    if (恢复设置按钮焦点) {
      window.requestAnimationFrame(() => 设置触发按钮.current?.focus());
    }
  }

  function 开始资源详情信息编辑(): void {
    if (!资源信息目标 || 整理保存中 || 资源详情编辑模式) return;
    资源详情编辑快照.current = {
      note: 整理备注输入,
      tags: 整理标签输入,
    };
    设置整理错误(null);
    设置资源详情路径浮层打开(false);
    设置资源详情编辑模式(true);
  }

  function 取消资源详情信息编辑(): void {
    const 快照 = 资源详情编辑快照.current;
    if (快照) {
      设置整理备注输入(快照.note);
      设置整理标签输入(快照.tags);
    }
    资源详情编辑快照.current = null;
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
    设置整理错误(null);
    设置资源详情编辑模式(false);
  }

  async function 完成资源详情信息编辑(): Promise<boolean> {
    if (!资源详情编辑模式 || 整理保存中) return false;
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
    设置资源详情编辑模式(false);
    const 保存成功 = await 保存资源信息();
    if (保存成功) 资源详情编辑快照.current = null;
    else if (资源信息目标) 设置资源详情编辑模式(true);
    return 保存成功;
  }

  async function 保存资源信息(更改?: 整理信息输入): Promise<boolean> {
    if (!资源信息目标 || 整理保存中) return false;
    const 本次保存目标 = 资源信息目标;
    const 输入: 整理信息输入 = 更改 ?? {
      note: 整理备注输入.trim(),
      tags: 解析标签输入(整理标签输入),
    };

    设置整理保存中(true);
    设置整理错误(null);
    try {
      if (本次保存目标.kind === "bookmark") {
        const 结果 = await window.omicomic.updateBookmarkMeta(本次保存目标.item.id, 输入);
        if (!结果.ok) {
          设置整理错误(结果.error.message);
          return false;
        }
        设置书签列表((原列表) => [
          结果.data,
          ...原列表.filter((项目) => 项目.id !== 结果.data.id),
        ]);
        设置资源信息目标((当前目标) => (
          当前目标?.kind === "bookmark" && 当前目标.item.id === 本次保存目标.item.id
            ? { ...当前目标, item: 结果.data }
            : 当前目标
        ));
      } else {
        const 结果 = await window.omicomic.updateResourceMeta({
          ...本次保存目标.input,
          ...输入,
        });
        if (!结果.ok) {
          设置整理错误(结果.error.message);
          return false;
        }
        设置资源元数据表((原表) => ({
          ...原表,
          [结果.data.resourceKey]: 结果.data,
        }));
      }
      推入本地标签顺序(输入.tags ?? []);
      return true;
    } catch {
      设置整理错误("整理信息保存失败，请稍后重试。");
      return false;
    } finally {
      设置整理保存中(false);
    }
  }

  function 切换筛选标签(标签: string): void {
    设置已选标签列表((原列表) => 原列表.includes(标签)
      ? 原列表.filter((项目) => 项目 !== 标签)
      : [...原列表, 标签]);
    回到第一页();
  }

  async function 保存标签排序(新顺序: string[]): Promise<void> {
    设置标签顺序(新顺序);
    const 结果 = await window.omicomic.updateTagOrder(新顺序);
    if (!结果.ok) 设置错误信息(结果.error.message);
    else 设置标签顺序(结果.data);
  }

  function 处理标签拖放(目标标签: string): void {
    if (!拖拽标签 || 拖拽标签 === 目标标签) {
      设置拖拽标签(null);
      return;
    }
    const 新顺序 = [...全部标签列表];
    const 起点 = 新顺序.indexOf(拖拽标签);
    const 终点 = 新顺序.indexOf(目标标签);
    if (起点 >= 0 && 终点 >= 0) {
      新顺序.splice(起点, 1);
      新顺序.splice(终点, 0, 拖拽标签);
      void 保存标签排序(新顺序);
    }
    设置拖拽标签(null);
  }

  function 复制路径(路径: string): void {
    void navigator.clipboard.writeText(路径)
      .then(() => 显示成功提示("已复制原路径。"))
      .catch(() => {
        设置整理错误("路径复制失败，请手动复制。");
        设置错误信息("路径复制失败，请手动复制。");
      });
  }

  function 打开完整标签浮层(事件: ReactMouseEvent<HTMLElement>, key: string, 标签列表: string[]): void {
    事件.preventDefault();
    事件.stopPropagation();
    const 矩形 = 事件.currentTarget.getBoundingClientRect();
    const 边距 = 14;
    const 宽度 = Math.min(260, window.innerWidth - 边距 * 2);
    const 左侧 = Math.min(Math.max(边距, 矩形.left), window.innerWidth - 宽度 - 边距);
    const 预估高度 = Math.min(180, Math.max(72, Math.ceil(标签列表.length / 3) * 30 + 24));
    const 下方 = 矩形.bottom + 8;
    const 上方 = Math.max(边距, 矩形.top - 预估高度 - 8);
    const 顶部 = 下方 + 预估高度 > window.innerHeight - 边距 ? 上方 : 下方;
    设置完整标签浮层({
      key,
      tags: 标签列表,
      style: { left: 左侧, top: 顶部, width: 宽度 },
    });
  }

  function 渲染预览标签(标签输入: string[], key: string) {
    return <PreviewTagRow tags={标签输入} tagKey={key} onMoreClick={打开完整标签浮层} />;
  }

  function 路径是否失效(路径: string): boolean {
    const 状态 = 资源路径状态表[路径];
    return Boolean(状态 && (!状态.exists || !状态.readable));
  }

  function 获取书架文件夹设定封面资源(文件夹: VirtualFolder): VirtualFolderItem | null {
    const 默认资源 = 文件夹.items[0] ?? null;
    if (!文件夹.coverResourceKey) return 默认资源;

    const 设定资源 = 文件夹.items.find((项目) => 项目.resourceKey === 文件夹.coverResourceKey) ?? null;
    return 设定资源 ?? 默认资源;
  }

  function 获取书架文件夹显示封面资源(文件夹: VirtualFolder): VirtualFolderItem | null {
    const 默认资源 = 文件夹.items[0] ?? null;
    const 设定资源 = 获取书架文件夹设定封面资源(文件夹);
    if (!设定资源 || 路径是否失效(设定资源.sourcePath)) return 默认资源;
    return 设定资源;
  }

  function 渲染路径失效标记(路径: string) {
    if (!路径是否失效(路径)) return null;
    return <span className="resource-invalid-badge">{t("路径失效")}</span>;
  }

  function 获取书架资源右键整理目标(项目: VirtualFolderItem): {
    items: VirtualFolderItemInput[];
    resourceKeys: string[];
    title: string;
  } {
    const 使用选中项 = 选择模式 === "virtual-folder"
      && 已选项目Key集合.size > 0
      && 已选项目Key集合.has(项目.resourceKey);
    if (!使用选中项) {
      return {
        items: [{
          resourceKey: 项目.resourceKey,
          sourcePath: 项目.sourcePath,
          sourceType: 项目.sourceType,
          title: 项目.title,
        }],
        resourceKeys: [项目.resourceKey],
        title: 项目.title,
      };
    }

    const items = 获取已选资源输入("virtual-folder");
    return {
      items,
      resourceKeys: items.map((输入) => 输入.resourceKey),
      title: `已选择 ${items.length} 个资源`,
    };
  }

  function 获取目录资源右键整理目标(input: ResourceMetaInput, itemKey: string): {
    items: VirtualFolderItemInput[];
    title: string;
  } {
    const 使用选中项 = 选择模式 === "directory"
      && 已选项目Key集合.size > 0
      && 已选项目Key集合.has(itemKey);
    if (!使用选中项) {
      return {
        items: [转为虚拟文件夹项目输入(input)],
        title: input.title,
      };
    }

    const items = 获取已选资源输入("directory");
    return {
      items,
      title: `已选择 ${items.length} 个资源`,
    };
  }

  function 切换选择项目(key: string): void {
    设置已选项目Key集合((原集合) => {
      const 新集合 = new Set(原集合);
      if (新集合.has(key)) 新集合.delete(key);
      else 新集合.add(key);
      return 新集合;
    });
  }

  function 进入选择模式(视图: 选择视图): void {
    设置选择模式(视图);
    设置已选项目Key集合(new Set());
    设置批量删除确认(null);
    设置批量删除不再提醒(false);
  }

  function 进入当前视图选择模式(): void {
    if (当前选择视图) 进入选择模式(当前选择视图);
  }

  function 获取框选矩形(状态: NonNullable<框选状态>): DOMRect {
    const startX = 状态.startX - (状态.container.scrollLeft - 状态.scrollLeft);
    const startY = 状态.startY - (状态.container.scrollTop - 状态.scrollTop);
    const left = Math.min(startX, 状态.currentX);
    const top = Math.min(startY, 状态.currentY);
    const width = Math.abs(状态.currentX - startX);
    const height = Math.abs(状态.currentY - startY);
    return new DOMRect(left, top, width, height);
  }

  function 开始框选(事件: ReactMouseEvent<HTMLDivElement>, 视图: 选择视图): void {
    if (手机布局 || 选择模式 !== 视图 || 事件.button !== 0) return;
    const 目标 = 事件.target;
    if (
      目标 instanceof HTMLElement
      && 目标.closest("input, select, textarea, .recent-context-menu, .selection-check, .favorite-button, .resource-info-button, .preview-tag-more")
    ) return;

    const 容器边界 = 事件.currentTarget.getBoundingClientRect();
    // Scrollbar interaction must keep the current selection intact.
    if (事件.clientX >= 容器边界.left + 事件.currentTarget.clientLeft + 事件.currentTarget.clientWidth
      || 事件.clientY >= 容器边界.top + 事件.currentTarget.clientTop + 事件.currentTarget.clientHeight) return;

    事件.preventDefault();
    框选抑制点击.current = false;
    const baseKeys = 事件.ctrlKey ? Array.from(已选项目Key集合) : [];
    if (!事件.ctrlKey && !(目标 instanceof Element && 目标.closest("[data-selection-key]"))) {
      设置已选项目Key集合(new Set());
    }
    设置框选({
      view: 视图,
      container: 事件.currentTarget,
      scrollLeft: 事件.currentTarget.scrollLeft,
      scrollTop: 事件.currentTarget.scrollTop,
      startX: 事件.clientX,
      startY: 事件.clientY,
      currentX: 事件.clientX,
      currentY: 事件.clientY,
      baseKeys,
    });
  }

  function 更新框选(事件: ReactMouseEvent<HTMLDivElement>): void {
    if (!框选) return;
    事件.preventDefault();
    const 新框选 = { ...框选, currentX: 事件.clientX, currentY: 事件.clientY };
    设置框选(新框选);
    应用框选(新框选);
  }

  function 应用框选(状态: NonNullable<框选状态>): void {
    const 选择矩形 = 获取框选矩形(状态);
    if (选择矩形.width > 4 || 选择矩形.height > 4) 框选抑制点击.current = true;
    const 首项 = 状态.container.querySelector<HTMLElement>("[data-selection-key]");
    if (!首项) return;
    const 首索引 = 当前选择视图Key列表.indexOf(首项.dataset.selectionKey!);
    if (首索引 < 0) return;
    // The virtual window may unmount selected rows. Its uniform grid still gives
    // every resource a stable content position, including rows outside the DOM.
    const 样式 = getComputedStyle(首项.parentElement!);
    const 列数 = Math.max(1, 样式.gridTemplateColumns.split(/\s+/).filter(Boolean).length);
    const 首矩形 = 首项.getBoundingClientRect();
    if (!首矩形.width || !首矩形.height) return;
    const 横步长 = 首矩形.width + (parseFloat(样式.columnGap) || 0);
    const 纵步长 = 首矩形.height + (parseFloat(样式.rowGap) || 0);
    const 起点X = 首矩形.left - (首索引 % 列数) * 横步长;
    const 起点Y = 首矩形.top - Math.floor(首索引 / 列数) * 纵步长;
    const 首行 = Math.max(0, Math.ceil((选择矩形.top - 起点Y - 首矩形.height) / 纵步长));
    const 末行 = Math.min(Math.ceil(当前选择视图Key列表.length / 列数) - 1, Math.floor((选择矩形.bottom - 起点Y) / 纵步长));
    const 首列 = Math.max(0, Math.ceil((选择矩形.left - 起点X - 首矩形.width) / 横步长));
    const 末列 = Math.min(列数 - 1, Math.floor((选择矩形.right - 起点X) / 横步长));
    const 已选 = new Set(状态.baseKeys);
    for (let 行 = 首行; 行 <= 末行; 行++) for (let 列 = 首列; 列 <= 末列; 列++) {
      const key = 当前选择视图Key列表[行 * 列数 + 列];
      if (key) 已选.add(key);
    }
    设置已选项目Key集合(已选);
  }

  useEffect(() => {
    if (!框选) return;
    const 滚动时更新 = () => { 设置框选({ ...框选 }); 应用框选(框选); };
    框选.container.addEventListener("scroll", 滚动时更新, { passive: true });
    return () => 框选.container.removeEventListener("scroll", 滚动时更新);
  }, [框选, 当前选择视图Key列表]);

  function 结束框选(): void {
    if (框选) 设置框选(null);
  }

  function 框选后忽略点击(事件: ReactMouseEvent): boolean {
    if (!框选抑制点击.current) return false;
    事件.preventDefault();
    事件.stopPropagation();
    框选抑制点击.current = false;
    return true;
  }

  function 全选当前选择视图(): void {
    设置已选项目Key集合(new Set(当前选择视图Key列表));
  }

  function 取消全选(): void {
    设置已选项目Key集合(new Set());
  }

  function 退出选择模式(): void {
    设置手机排序中(false);
    设置选择模式(null);
    设置已选项目Key集合(new Set());
    设置批量删除确认(null);
    设置批量删除不再提醒(false);
  }

  function 请求删除选中(视图: 选择视图): void {
    if (已选项目Key集合.size === 0) return;
    if (视图 === "directory") {
      设置错误信息("当前目录资源暂不支持批量删除真实文件。");
      return;
    }

    if (视图 === "virtual-folder") {
      设置批量删除不再提醒(false);
      设置批量删除确认(视图);
      return;
    }

    if (!删除前确认设置[视图]) {
      void 执行批量删除(视图);
      return;
    }

    设置批量删除不再提醒(false);
    设置批量删除确认(视图);
  }

  function 请求右键删除记录(视图: 管理视图, key: string): void {
    const 使用现有选择 = 选择模式 === 视图
      && 已选项目Key集合.size > 0
      && 已选项目Key集合.has(key);
    if (使用现有选择 && 已选项目Key集合.size > 1) {
      请求删除选中(视图);
      return;
    }
    if (!使用现有选择) 设置已选项目Key集合(new Set([key]));
    设置选择模式(视图);
    设置批量删除不再提醒(false);
    设置批量删除确认(视图);
  }

  function 获取已选资源输入(视图: 选择视图): VirtualFolderItemInput[] {
    const 已选 = 已选项目Key集合;
    if (视图 === "directory") {
      return 筛选排序后项目
        .filter((文件) => 已选.has(文件.id))
        .map((文件) => {
          const 输入 = 获取文件资源元数据输入(文件);
          return 输入 && 支持收藏(文件.type) ? 转为虚拟文件夹项目输入(输入) : null;
        })
        .filter((项目): 项目 is VirtualFolderItemInput => 项目 !== null);
    }
    if (视图 === "recent") {
      return 当前阅读记录列表
        .filter((项目) => 已选.has(项目.resourceKey))
        .map((项目) => ({
          resourceKey: 项目.resourceKey,
          sourcePath: 项目.sourcePath,
          sourceType: 项目.sourceType,
          title: 项目.title,
        }));
    }
    if (视图 === "favorites") {
      return 筛选后收藏列表
        .filter((项目) => 已选.has(项目.resourceKey))
        .map((项目) => ({
          resourceKey: 项目.resourceKey,
          sourcePath: 项目.sourcePath,
          sourceType: 项目.sourceType,
          title: 项目.title,
        }));
    }
    if (视图 === "virtual-folder") {
      return 筛选后虚拟文件夹项目
        .filter((项目) => 已选.has(项目.resourceKey))
        .map((项目) => ({
          resourceKey: 项目.resourceKey,
          sourcePath: 项目.sourcePath,
          sourceType: 项目.sourceType,
          title: 项目.title,
        }));
    }
    return [];
  }

  async function 执行批量删除(视图: 管理视图): Promise<void> {
    if (已选项目Key集合.size === 0) {
      设置批量删除确认(null);
      return;
    }

    const 删除Key列表 = Array.from(已选项目Key集合);
    const 删除Key集合 = new Set(删除Key列表);
    try {
      if (视图 === "virtual-folder" && 当前虚拟文件夹) {
        const 结果 = await window.omicomic.removeVirtualFolderItems({
          folderId: 当前虚拟文件夹.id,
          resourceKeys: 删除Key列表,
        });
        if (!结果.ok) {
          设置错误信息(结果.error.message);
          return;
        }
        设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
          文件夹.id === 结果.data.id ? 结果.data : 文件夹
        )));
      } else {
        for (const key of 删除Key列表) {
          const 结果 = 视图 === "favorites"
            ? await window.omicomic.removeFavorite(key)
            : 视图 === "bookmarks"
              ? await window.omicomic.removeBookmark(key)
              : 是临时存放 ? await window.omicomic.removeTemporaryOpened(key) : await window.omicomic.removeRecentOpened(key);
          if (!结果.ok) {
            设置错误信息(结果.error.message);
            return;
          }
        }
      }

      if (视图 === "favorites") {
        设置收藏列表((原列表) => 原列表.filter((项目) => !删除Key集合.has(项目.resourceKey)));
      } else if (视图 === "bookmarks") {
        设置书签列表((原列表) => 原列表.filter((项目) => !删除Key集合.has(项目.id)));
      } else if (视图 === "virtual-folder") {
        // 已使用批量 IPC 刷新当前书架，真实漫画文件不会被删除。
      } else if (是临时存放) {
        设置临时存放列表(原列表 => 原列表.filter(项目 => !删除Key集合.has(项目.resourceKey)));
      } else {
        设置最近打开列表((原列表) => 原列表.filter((项目) => !删除Key集合.has(项目.resourceKey)));
      }
      退出选择模式();
      if (视图 === "virtual-folder") {
        显示成功提示(`已从当前书架移除 ${删除Key列表.length} 个内部引用，不会删除任何原始漫画文件。`);
      }
    } catch {
      设置错误信息("批量删除失败，请稍后重试。");
    }
  }

  async function 确认批量删除(): Promise<void> {
    if (!批量删除确认 || 删除确认处理中) return;
    const 当前确认视图 = 批量删除确认;
    设置删除确认处理中(true);
    if (批量删除不再提醒 && 当前确认视图 !== "virtual-folder") {
      const 新设置: 批量删除确认设置 = {
        ...删除前确认设置,
        [当前确认视图]: false,
      };
      设置删除前确认设置(新设置);
      保存界面设置({ confirmBeforeBatchDelete: 新设置 });
    }

    try {
      await 执行批量删除(当前确认视图);
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 清空全局无效资源记录(): Promise<void> {
    if (!待全局清空无效资源 || 删除确认处理中) return;

    设置删除确认处理中(true);
    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.clearInvalidResourceRecords({
        sourcePaths: 待全局清空无效资源.sourcePaths,
        resourceKeys: 待全局清空无效资源.resourceKeys,
      });
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      同步应用数据状态(结果.data);
      设置待全局清空无效资源(null);
      设置资源路径状态表((原表) => {
        const 新表 = { ...原表 };
        for (const 路径 of 待全局清空无效资源.sourcePaths) delete 新表[路径];
        return 新表;
      });
      显示成功提示(`已清理 ${待全局清空无效资源.count} 个失效资源的 OmiComic 内部记录，不会删除、移动或复制任何原始漫画文件。`);
      if (当前目录 && 当前根目录 && 当前视图 === "directory") {
        await 打开目录(当前目录.path, 当前根目录, "none", false);
      }
    } catch {
      设置错误信息("清理失效资源记录失败，请稍后重试。");
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 确认删除根目录记录(): Promise<void> {
    if (!待删除根目录 || 删除确认处理中) return;

    const 删除路径 = 待删除根目录.path;
    const 删除的是当前根目录 = 当前根目录 === 删除路径;
    设置错误信息(null);
    设置删除确认处理中(true);

    try {
      const 结果 = await window.omicomic.removeLibraryRoot(删除路径);
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      同步应用数据状态(结果.data);
      设置待删除根目录(null);
      设置根目录菜单(null);

      if (!删除的是当前根目录) return;

      const 下一个根目录 = 结果.data.library.roots[0];
      设置历史记录({ entries: [], index: -1 });
      设置搜索内容("");
      回到第一页();

      if (下一个根目录) {
        await 打开目录(下一个根目录.path, 下一个根目录.path, "none");
      } else {
        ++读取序号.current;
        设置当前根目录(null);
        设置当前目录(null);
        设置当前视图("directory");
        设置正在读取(false);
      }
    } catch {
      设置错误信息("资源库目录移除失败，请稍后重试。");
    } finally {
      设置删除确认处理中(false);
    }
  }

  async function 手机保存卡片顺序(keys: string[]): Promise<void> {
    if (当前视图 === "favorites") await 保存收藏拖拽顺序(keys);
    else if (当前视图 === "bookmarks") await 保存书签拖拽顺序(keys);
    else if (当前视图 === "virtual-folder" && 当前虚拟文件夹) await 保存书架资源拖拽顺序(当前虚拟文件夹.id, keys);
  }

  function 手机当前排序Keys(): string[] {
    if (当前视图 === "favorites") return 获取收藏拖拽当前顺序();
    if (当前视图 === "bookmarks") return 获取书签拖拽当前顺序();
    return [...(当前虚拟文件夹?.items ?? [])].sort((a,b) => a.sortIndex - b.sortIndex).map(item => item.resourceKey);
  }

  function 手机拖动卡片(from: string, to: string): void {
    const keys = 手机当前排序Keys();
    const start = keys.indexOf(from), end = keys.indexOf(to);
    if (start < 0 || end < 0 || start === end) return;
    keys.splice(start, 1); keys.splice(end, 0, from);
    void 手机保存卡片顺序(keys);
  }

  function 渲染手机资源卡片(文件: 文件条目, input: ResourceMetaInput, key: string, open: () => void,
    pages: string, tags: string[], bookmark?: BookmarkItem, index?: number) {
    const thumb = bookmark ? 书签预览表[bookmark.id] ?? (bookmark.thumbnailUrl ? {status:"loaded" as const,url:bookmark.thumbnailUrl} : undefined) : 缩略图表[文件.path];
    const collection = !bookmark && 文件.type === "folder" && (Boolean(thumb?.itemCount) || !thumb || thumb.status === "loading");
    const progress = 阅读进度表[input.resourceKey] ?? 最近打开列表.find(item => item.resourceKey === input.resourceKey);
    const countKey = 获取可阅读页数Key(文件);
    const total = Math.max(0, Math.floor(bookmark?.totalPages ?? progress?.totalPages ?? (countKey ? 可阅读页数表[countKey]?.count : 0) ?? 0));
    const started = progress && (progress.hasStartedReading || progress.currentPageIndex > 0 || progress.completed);
    const current = total ? Math.min(total, Math.max(0, bookmark ? bookmark.pageIndex + 1 : started ? progress.currentPageIndex + 1 : 0)) : 0;
    const mobilePages = total ? `${current}/${total}${bookmark ? '' : ` · ${Math.round(current / total * 100)}%`}` : "";
    const bytes = thumb?.byteSize ?? (文件.type !== "folder" ? 文件.size : undefined);
    const mobileSize = !bytes ? undefined : bytes < 1024 * 1024 * .1 ? "<0.1MB" : `${Number((bytes / (1024 * 1024)).toFixed(1))}MB`;
    const info: 资源信息目标 | null = collection ? null : bookmark
      ? { kind: "bookmark", item: bookmark, fileType: 文件.type, thumbnailUrl: thumb?.url }
      : { kind: "resource", input, fileType: 文件.type, localPath: 文件.path, progressText: pages, thumbnailUrl: thumb?.url };
    return <MobileResourceCard key={key} id={key} index={index} bookmarkId={bookmark?.id} title={bookmark?.bookmarkTitle ?? input.title} type={文件.type}
      layout={手机卡片布局} thumbnail={thumb?.url} tags={tags} bookmarkDate={bookmark ? new Date(bookmark.createdAt).toLocaleDateString("sv-SE") : undefined} pages={collection ? thumb?.itemCount ? `${thumb.itemCount} 项` : "" : mobilePages}
      size={bookmark ? undefined : mobileSize}
      invalid={路径是否失效(文件.path)} favorite={收藏Key集合.has(input.resourceKey)}
      onFavorite={collection || bookmark || input.sourceType === "unknown" ? undefined : () => { if (input.sourceType !== "unknown") void 切换收藏({ ...input, sourceType: input.sourceType }); }}
      onInfo={info ? () => 打开资源详情页面(info) : undefined} onOpen={open}
      onHold={() => { if (当前选择视图 && !手机排序中) { 设置手机操作目标({view:当前选择视图,key,input,info}); 设置选择模式(当前选择视图); 设置已选项目Key集合(old=>new Set([...(选择模式===当前选择视图?old:[]),key])); } }}
      selecting={选择模式 === 当前视图} selected={手机排序中 || 已选项目Key集合.has(key)} onSelect={() => 切换选择项目(key)}
      sorting={手机排序中} onReorder={手机拖动卡片} />;
  }

  function 渲染对话框(内容: ReactNode) {
    // Mobile drawers already live at body level; dialogs must share that layer.
    return 手机布局 ? createPortal(内容, document.body) : 内容;
  }

  async function 手机打开资源所在目录(input: ResourceMetaInput): Promise<void> {
    设置手机操作目标(null); 退出选择模式(); 取消手机后台打开请求();
    设置手机筛选展开(false); 设置搜索内容(''); 设置已选标签列表([]);
    const sourcePath = input.sourcePath.replace(/\/$/, '');
    // Android document grants are virtual roots, not real /local directories.
    // A directly granted file cannot expose its parent without a directory grant.
    if (/^\/local\/[^/]+\/[^/]+$/.test(sourcePath) && input.sourceType !== 'folder') {
      设置错误信息('这个文件通过单独授权打开，尚未授权所在目录。请先在资源库添加所在目录。');
      return;
    }
    const exactRoot = 根目录列表.find(root => root.path === sourcePath);
    const path = exactRoot || (/^\/local\/[^/]+\/[^/]+$/.test(sourcePath) && input.sourceType === 'folder') ? sourcePath : 获取父目录路径(sourcePath);
    const root = [...根目录列表].sort((a, b) => b.path.length - a.path.length).find(item => path === item.path || path.startsWith(item.path + '/') || path.startsWith(item.path + '\\'));
    const grantedRoot = /^\/local\/[^/]+\/[^/]+/.exec(path)?.[0];
    await 打开目录(path, root?.path ?? grantedRoot ?? path);
  }

  function 渲染手机操作栏() {
    let target = 手机操作目标;
    if (!target) return null;
    const multi = 选择模式 === target.view;
    const count = multi ? 已选项目Key集合.size : 1;
    if (multi && count === 1 && !已选项目Key集合.has(target.key)) {
      const key = [...已选项目Key集合][0];
      const bookmark = target.view === "bookmarks" ? 书签列表.find(item => item.id === key) : undefined;
      const item = target.view === "recent" ? 最近打开列表.find(item => item.resourceKey === key)
        : target.view === "favorites" ? 收藏列表.find(item => item.resourceKey === key)
        : target.view === "virtual-folder" ? 当前虚拟文件夹?.items.find(item => item.resourceKey === key) : bookmark;
      const file = target.view === "directory" ? 当前目录?.items.find(item => item.id === key) : undefined;
      const input = file ? 获取文件资源元数据输入(file) : item ? {resourceKey:item.resourceKey,sourcePath:item.sourcePath,sourceType:item.sourceType,title:item.title} : null;
      if (input) target = {...target,key,input,info:bookmark ? {kind:"bookmark",item:bookmark,fileType:bookmark.sourceType,thumbnailUrl:书签预览表[bookmark.id]?.url} : input.sourceType === "folder" && 缩略图表[input.sourcePath]?.itemCount ? null : {kind:"resource",input,fileType:input.sourceType,localPath:input.sourcePath,thumbnailUrl:缩略图表[input.sourcePath]?.url}};
    }
    const close = () => { if (!multi) 设置手机操作目标(null); };
    const resourceInputs = () => multi ? 获取已选资源输入(target.view) : [target.input];
    const rename: MobileAction = { label: target.view === "bookmarks" ? "重命名书签" : "重命名", icon: "rename", disabled: count !== 1, onClick: () => { if(target.view === "bookmarks") 设置书签重命名(书签列表.find(item => item.id===target.key) ?? null); else 设置本地文件目标({path:target.input.sourcePath,title:target.input.title,mode:"rename"}); close(); } };
    const info: MobileAction = { label: "信息页", icon: "ⓘ", disabled: !target.info || count !== 1, onClick: () => { if (target.info) 打开资源详情页面(target.info); close(); } };
    const add: MobileAction = { label: "加入书架", icon: "＋", disabled: count === 0, onClick: () => { 选择已有虚拟文件夹加入(resourceInputs(), count > 1 ? `已选择 ${count} 个资源` : target.input.title); close(); } };
    const remove: MobileAction = { label: target.view === "bookmarks" ? "删除书签" : target.view === "favorites" ? "删除收藏" : target.view === "recent" ? "删除历史" : "删除", icon: "⌫", disabled: count === 0, onClick: () => {
      if (target.view === "directory") 设置本地文件目标({path:target.input.sourcePath,paths:resourceInputs().map(input => input.sourcePath),title:count > 1 ? `${count} 个资源` : target.input.title,mode:"delete"});
      else if (multi) 请求删除选中(target.view);
      else 请求右键删除记录(target.view, target.key);
      close();
    } };
    const actions = target.view === "virtual-folder"
      ? [{label:"设为封面",icon:"▧",disabled:count !== 1,onClick:() => { void 设置当前书架封面(target.input.resourceKey); close(); }},rename,info]
      : target.view === "bookmarks" || target.view === "favorites" ? [rename,info,remove] : [rename,info,add,remove];
    const floating: MobileAction[] = [];
    const openPath: MobileAction = {label:'打开路径',icon:'open-folder',disabled:count !== 1,onClick:() => { void 手机打开资源所在目录(target.input); }};
    if (target.view === 'recent') floating.push(openPath);
    if (["virtual-folder","favorites","bookmarks"].includes(target.view)) {
      floating.push({label:"置顶",icon:"↑",disabled:count === 0,onClick:() => { const keys = 手机当前排序Keys(); const selected = multi ? [...已选项目Key集合] : [target.key]; void 手机保存卡片顺序([...keys.filter(key => selected.includes(key)),...keys.filter(key => !selected.includes(key))]); close(); }},
        {label:手机排序中 ? "完成排序" : "排序",icon:"↕",active:手机排序中,onClick:() => { if (!手机排序中) { 设置选择模式(target.view); 设置已选项目Key集合(new Set(当前选择视图Key列表)); } 设置手机排序中(value => !value); }});
    }
    if (target.view === "virtual-folder") floating.push(add,
      {label:"移入书架",icon:"↗",disabled:count === 0,onClick:() => { 打开批量转存到书架弹窗("move",resourceInputs(),target.input.title); close(); }},
      {label:"移出书架",icon:"−",disabled:count === 0,onClick:() => { if (multi) 请求删除选中("virtual-folder"); else 请求右键删除记录("virtual-folder",target.key); close(); }});
    if (multi) floating.push({label:count === 当前选择视图Key列表.length ? "取消全选" : "全选",icon:"☑",disabled:手机排序中,onClick:() => count === 当前选择视图Key列表.length ? 取消全选() : 全选当前选择视图()});
    if (target.view === 'virtual-folder') floating.push(openPath);
    return <MobileActionBar actions={actions} floating={floating} selected={multi ? count : undefined} onDismiss={multi ? undefined : close} />;
  }

  function 渲染手机书架操作栏() {
    if (!手机书架管理) return null;
    const selected = 筛选后书架文件夹列表.filter(item => 手机选中书架.has(item.id));
    const target = selected[0] ?? 手机书架管理;
    const all = selected.length === 筛选后书架文件夹列表.length;
    return <MobileActionBar selected={selected.length} actions={[
      {label:'重命名',icon:'rename',disabled:selected.length !== 1,onClick:() => 打开虚拟文件夹弹窗({mode:'rename',folder:target})},
      {label:'重置封面',icon:'reset',disabled:selected.length !== 1 || !target.coverResourceKey,onClick:() => {void 清除书架设定封面(target);}},
      {label:'删除书架',icon:'delete',disabled:!selected.length,onClick:() => 设置待删除虚拟文件夹({...target,selection:selected})}
    ]} floating={[
      {label:'置顶',icon:'pin',disabled:!selected.length,onClick:() => {const keys=筛选后书架文件夹列表.map(item=>item.id);void 保存书架文件夹拖拽顺序(target.bookshelfId,[...keys.filter(id=>手机选中书架.has(id)),...keys.filter(id=>!手机选中书架.has(id))]);}},
      {label:手机书架排序?'完成排序':'排序',icon:'sort',active:手机书架排序,onClick:() => {if(!手机书架排序)设置手机选中书架(new Set(筛选后书架文件夹列表.map(item=>item.id)));设置手机书架排序(value=>!value);}},
      {label:all?'取消全选':'全选',icon:'select',disabled:手机书架排序,onClick:() => 设置手机选中书架(new Set(all ? [] : 筛选后书架文件夹列表.map(item=>item.id)))}
    ]}/>;
  }

  function 渲染桌面卡片元信息(文件: 文件条目, 进度: ReadingProgress | null, 页数: number | null, 缩略图: 缩略图状态, 书签?: BookmarkItem) {
    const 合集 = !书签 && 文件.type === "folder" && Boolean(缩略图.itemCount);
    const 总页数 = Math.max(0, Math.floor(书签?.totalPages ?? ((进度?.totalPages ?? 0) > 0 ? 进度!.totalPages : 页数 ?? 0)));
    const 已开始 = 进度 && (进度.hasStartedReading || 进度.currentPageIndex > 0 || 进度.completed);
    const 当前页 = 总页数 ? Math.min(总页数, Math.max(0, 书签 ? 书签.pageIndex + 1 : 已开始 ? 进度.currentPageIndex + 1 : 0)) : 0;
    const 百分比 = 总页数 ? Math.round(当前页 / 总页数 * 100) : 0;
    const 合集说明 = String(缩略图.itemCount ?? 0) + t(" 项");
    const 页码 = 合集 ? 合集说明
      : 书签 ? (总页数 ? `${当前页}/${总页数}` : "")
      : 显示进度文本 && 总页数 ? (进度文本模式 === "percent" ? `${百分比}%` : `${当前页}/${总页数} · ${百分比}%`) : "";
    const 字节数 = 缩略图.byteSize ?? (文件.type !== "folder" ? 文件.size : undefined);
    const 大小 = !书签 && !合集 && 字节数 ? (字节数 < 104857.6 ? "<0.1MB" : `${Number((字节数 / 1048576).toFixed(1))}MB`) : "";
    return <span className="resource-card-meta">
      {页码 && <span className="resource-card-page">{页码}</span>}
      {大小 && <span className="resource-card-size">{大小}</span>}
      {书签 && <><span aria-hidden="true">·</span><time>{new Date(书签.createdAt ?? 书签.updatedAt).toLocaleDateString("sv-SE")}</time></>}
    </span>;
  }

  function 渲染收藏按钮(收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex"> | null) {
    if (!收藏输入 || (收藏输入.sourceType === "folder" && 缩略图表[收藏输入.sourcePath]?.itemCount)) return null;

    const 已收藏 = 收藏Key集合.has(收藏输入.resourceKey);
    return (
      <span
        className={`favorite-button ${已收藏 ? "is-active" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={已收藏 ? t("取消收藏") : t("收藏")}
        aria-pressed={已收藏}
        title={已收藏 ? t("取消收藏") : t("收藏")}
        onClick={(事件) => {
          事件.stopPropagation();
          void 切换收藏(收藏输入);
        }}
        onDoubleClick={(事件) => 事件.stopPropagation()}
        onKeyDown={(事件) => {
          if (事件.key !== "Enter" && 事件.key !== " ") return;
          事件.preventDefault();
          事件.stopPropagation();
          void 切换收藏(收藏输入);
        }}
      >
        <AppIcon name="heart" className="preview-action-icon"/>
      </span>
    );
  }

  function 渲染资源信息按钮(目标: 资源信息目标 | null) {
    if (!目标) return null;
    const path = 目标.kind === "resource" ? 目标.input.sourcePath : 目标.item.sourcePath;
    if (目标.fileType === "folder" && 缩略图表[path]?.itemCount) return null;

    return (
      <span
        className="resource-info-button"
        role="button"
        tabIndex={0}
        aria-label={t("打开资源信息")}
        title={t("资源信息")}
        onClick={(事件) => {
          事件.stopPropagation();
          打开资源详情页面(目标);
        }}
        onDoubleClick={(事件) => 事件.stopPropagation()}
        onKeyDown={(事件) => {
          if (事件.key !== "Enter" && 事件.key !== " ") return;
          事件.preventDefault();
          事件.stopPropagation();
          打开资源详情页面(目标);
        }}
      >
        <AppIcon name="dots" className="preview-action-icon is-more"/>
      </span>
    );
  }

  function 获取选择视图名称(视图: 选择视图): string {
    if (视图 === "recent") return 阅读记录标题;
    if (视图 === "favorites") return "收藏";
    if (视图 === "bookmarks") return "书签";
    if (视图 === "virtual-folder") return "书架";
    if (视图 === "directory") return "当前目录";
    return "最近阅读";
  }

  function 获取批量删除标题(视图: 管理视图, 数量: number): string {
    if (视图 === "recent" && 是临时存放) return `确认移除选中的 ${数量} 个临时引用？`;
    if (视图 === "favorites") return `确认移除选中的 ${数量} 条收藏记录？`;
    if (视图 === "bookmarks") return `确认删除选中的 ${数量} 条书签？`;
    if (视图 === "virtual-folder") return `确认从当前书架移除选中的 ${数量} 个资源？`;
    return `确认删除选中的 ${数量} 条最近阅读记录？`;
  }

  function 获取批量删除说明(视图: 管理视图): string {
    if (视图 === "recent" && 是临时存放) return "只删除临时存放中的引用，原文件、标签、收藏、书签和阅读进度均保留。";
    if (视图 === "favorites") return "此操作不会删除磁盘中的真实文件，也不会删除阅读进度、书签或最近阅读记录。";
    if (视图 === "bookmarks") return "此操作不会删除磁盘中的真实文件，也不会删除阅读进度、收藏或最近阅读记录。";
    if (视图 === "virtual-folder") return "只移除当前书架中的内部引用，不会删除原始漫画文件、收藏、书签或阅读进度。";
    return "此操作不会删除磁盘中的真实文件，也不会删除阅读进度、收藏或书签。";
  }

  function 渲染选择工具条(视图: 选择视图, 总数: number) {
    if (手机布局) return null;
    if (总数 <= 0) return null;
    const 正在选择 = 选择模式 === 视图;
    return (
      <div className="selection-toolbar" aria-label={tr`${获取选择视图名称(视图)}选择操作`}>
        {!正在选择 ? (
          <button type="button" className="compact-toolbar-button" onClick={() => 进入选择模式(视图)}>{t("选择")}</button>
        ) : (
          <>
            <span>{t("已选择 ")}{已选项目Key集合.size}{t(" 项")}</span>
            <button type="button" onClick={全选当前选择视图}>{t("全选")}</button>
            <button type="button" onClick={取消全选}>{t("取消全选")}</button>
            <button type="button" onClick={退出选择模式}>{t("退出选择")}</button>
          </>
        )}
      </div>
    );
  }

  function 渲染资源详情工作区() {
    if (!资源信息目标) return null;
    return 渲染资源详情页面();
    /* Legacy drawer markup retained temporarily during the workspace-page migration.
    if (!资源信息目标) return null;

    const 是书签 = 资源信息目标.kind === "bookmark";
    const 标题 = 是书签 ? (资源信息目标.item.bookmarkTitle ?? 资源信息目标.item.title) : 资源信息目标.input.title;
    const 路径 = 是书签 ? 资源信息目标.item.sourcePath : 资源信息目标.input.sourcePath;
    const 类型 = 资源信息目标.fileType;
    const 信息 = 类型信息[类型];
    const 当前标签 = 解析标签输入(整理标签输入);
    const 进度文本 = 是书签
      ? `第 ${资源信息目标.item.pageIndex + 1} / ${资源信息目标.item.totalPages} ${资源信息目标.item.sourceType === "epub" ? "章" : "页"}`
      : 资源信息目标.progressText;
    const 已保存备注 = 是书签
      ? 获取整理备注(资源信息目标.item)
      : 获取资源整理信息(资源信息目标.input).note;
    const 已保存标签 = 是书签
      ? 获取整理标签(资源信息目标.item)
      : 获取资源整理信息(资源信息目标.input).tags;

    return (
      <div
        className={`settings-overlay organize-drawer-overlay drawer-opacity-${整理侧边栏透明度}`}
        role="presentation"
        onMouseDown={() => {
          if (标签添加弹窗打开) {
            关闭标签添加弹窗();
            return;
          }
          关闭右侧抽屉();
        }}
      >
        <aside
          className="settings-panel organize-drawer resource-info-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="resource-info-title"
          onMouseDown={(事件) => 事件.stopPropagation()}
        >
          <header className="settings-panel-header">
            <div>
              <h2 id="resource-info-title">{是书签 ? "编辑书签信息" : "资源信息"}</h2>
              <p title={标题}>{标题}</p>
            </div>
            <button type="button" aria-label="关闭资源信息" onClick={关闭右侧抽屉}>×</button>
          </header>
          <div className="settings-panel-body">
            <section
              className="resource-info-summary"
              style={{ gridTemplateColumns: `${资源信息预览尺寸}px minmax(0, 1fr)` }}
            >
              <div
                className={`resource-info-preview thumbnail-${资源信息目标.thumbnailUrl ? "loaded" : "error"}`}
                style={{
                  width: 资源信息预览尺寸,
                  height: Math.round(资源信息预览尺寸 * 1.28),
                }}
              >
                {资源信息目标.thumbnailUrl ? (
                  <img src={资源信息目标.thumbnailUrl} alt="" draggable={false} />
                ) : (
                  <span>{信息.icon}</span>
                )}
                <button
                  type="button"
                  className="resource-preview-resize-handle"
                  aria-label="调整预览图大小"
                  title="拖拽调整预览图大小"
                  onPointerDown={开始调整资源预览尺寸}
                />
              </div>
              <div>
                <div className="resource-info-facts">
                  <span>{信息.label}</span>
                  {进度文本 && <span>进度 {进度文本}</span>}
                  {!是书签 && 收藏Key集合.has(资源信息目标.input.resourceKey) && <span>已收藏</span>}
                  {是书签 && 资源信息目标.item.pageName && <span title={资源信息目标.item.pageName}>页面 {资源信息目标.item.pageName}</span>}
                </div>
              </div>
            </section>
            <section className="settings-section">
              <h3>标签</h3>
              <div className="resource-tag-editor" aria-label="资源标签">
                {当前标签.length > 0 ? 当前标签.map((标签) => (
                  <button
                    type="button"
                    className="tag-chip editable-tag-chip"
                    key={标签}
                    title={`移除标签：${标签}`}
                    onClick={() => 移除整理标签(标签)}
                  >
                    <span>{标签}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                )) : <span className="drawer-muted">未设置标签</span>}
                <span className={`tag-add-wrap ${标签添加弹窗打开 ? "is-open" : ""}`} ref={标签添加触发区}>
                  <button
                    type="button"
                    className="tag-chip tag-add-button"
                    aria-label="添加标签"
                    onPointerDown={(事件) => {
                      事件.stopPropagation();
                    }}
                    onMouseDown={(事件) => {
                      事件.stopPropagation();
                    }}
                    onClick={(事件) => {
                      事件.preventDefault();
                      事件.stopPropagation();
                      if (标签添加弹窗打开) {
                        关闭标签添加弹窗();
                        return;
                      }
                      标签添加忽略外部点击截止.current = performance.now() + 120;
                      设置标签添加输入("");
                      设置标签添加弹窗打开(true);
                      window.requestAnimationFrame(更新标签添加浮层位置);
                    }}
                  >
                    <MobileIcon name="add"/>
                  </button>
                </span>
                {标签添加弹窗打开 && createPortal(
                  <span
                    ref={标签添加浮层}
                    className="tag-add-popover"
                    style={标签添加浮层样式}
                    onMouseDown={(事件) => 事件.stopPropagation()}
                    onClick={(事件) => 事件.stopPropagation()}
                  >
                    <input
                      autoFocus
                      value={标签添加输入}
                      placeholder="输入标签，逗号分隔"
                      onChange={(事件) => 设置标签添加输入(事件.target.value)}
                      onKeyDown={(事件) => {
                        if (事件.key === "Enter") {
                          事件.preventDefault();
                          事件.stopPropagation();
                          添加整理标签();
                        } else if (事件.key === "Escape") {
                          事件.preventDefault();
                          事件.stopPropagation();
                          关闭标签添加弹窗();
                        }
                      }}
                    />
                    <button type="button" onClick={添加整理标签}>添加</button>
                    <button type="button" onClick={关闭标签添加弹窗}>取消</button>
                  </span>,
                  document.body,
                )}
              </div>
              {(已保存备注 || 已保存标签.length > 0) && (
                <p className="drawer-muted">保存后会覆盖原有标签记录。</p>
              )}
            </section>
            <section className="settings-section">
              <h3>备注</h3>
              <label className="organize-field">
                <textarea
                  value={整理备注输入}
                  rows={6}
                  maxLength={2000}
                  placeholder="记录喜欢原因、剧情印象或整理说明"
                  onChange={(事件) => 设置整理备注输入(事件.target.value)}
                />
              </label>
              {整理错误 && <p className="organize-edit-error">{整理错误}</p>}
            </section>
            <section className="settings-section">
              <h3>路径</h3>
              <p
                className="drawer-path"
                data-tooltip-disabled
                onMouseEnter={(事件) => 开始路径悬停("drawer-path", 路径, 事件)}
                onMouseMove={(事件) => 更新路径悬停("drawer-path", 路径, 事件)}
                onMouseLeave={() => 结束路径悬停("drawer-path")}
              >
                {路径}
              </p>
              <button type="button" className="secondary-action drawer-copy-button" onClick={() => 复制路径(路径)}>
                复制路径
              </button>
            </section>
            <div className="drawer-actions">
              <button type="button" disabled={整理保存中} onClick={关闭右侧抽屉}>取消</button>
              <button type="button" className="primary-action" disabled={整理保存中} onClick={() => void 保存资源信息()}>
                {整理保存中 ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    ); */
  }

  function 渲染标签筛选抽屉() {
    const 查询 = 标签搜索内容.trim();
    const 显示标签 = 查询 ? 筛选标签列表(标签搜索内容, 全部标签列表, 搜索模式) : 全部标签列表;
    const 有选中标签 = 已选标签列表.length > 0;
    const 待删除数量 = 待删除标签选择集合.size;

    if(手机布局) return <MobileSheet side="right" title={t("标签管理")} onClose={关闭右侧抽屉} beforeClose={()=>{if(标签删除选择模式){退出标签删除选择模式();return false;}return true;}}>
      <div className="mobile-tag-manager">
        <div className="mobile-tag-manage-actions">
          <button className={标签删除选择模式?'is-active':''} onClick={()=>标签删除选择模式?退出标签删除选择模式():设置标签删除选择模式(true)}><MobileIcon name="select"/>{标签删除选择模式?t("取消"):t("选择")}</button>
          <button disabled={!标签删除选择模式||!全部标签列表.length} onClick={()=>设置当前可见标签为待删除(全部标签列表)}>{t("全选")}</button>
          <button disabled={!待删除数量} onClick={请求删除已选择标签}><MobileIcon name="delete"/>{t("删除")}{待删除数量?` ${待删除数量}`:''}</button>
        </div>
        <div className="mobile-tag-catalogue"><MobileReorderList items={全部标签列表} itemKey={tag=>tag} onReorder={keys=>{if(!标签删除选择模式)void 保存标签排序(keys);}} render={tag=><button className={`tag-chip ${待删除标签选择集合.has(tag)?'is-delete-selected':''}`} aria-pressed={待删除标签选择集合.has(tag)} onClick={()=>{if(!标签删除选择模式)设置标签删除选择模式(true);切换待删除标签(tag);}}>{tag}</button>}/>{!全部标签列表.length&&<p className="drawer-muted">{t("暂无标签")}</p>}</div>
      </div>
    </MobileSheet>;

    return (
      <div
        className={`settings-overlay organize-drawer-overlay drawer-opacity-${整理侧边栏透明度}`}
        role="presentation"
        onMouseDown={事件 => { consumeDismissGesture(事件.nativeEvent); 关闭右侧抽屉(); }}
      >
        <aside
          className="settings-panel organize-drawer tag-filter-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tag-filter-title"
          onMouseDown={(事件) => 事件.stopPropagation()}
        >
          <header className="settings-panel-header">
            <div>
              <h2 id="tag-filter-title">{t("标签筛选")}</h2>

            </div>
          </header>
          <div className="settings-panel-body">
            <div className="tag-drawer-search-area">
              <label className="organize-field">
                <span>{t("搜索标签")}</span>
                <span className="tag-drawer-search-box">
                  <input
                    ref={标签搜索输入框}
                    value={标签搜索内容}
                    placeholder={搜索模式 === "fuzzy" ? t("输入标签名或拼音片段") : t("输入完整标签名")}
                    onFocus={() => 设置标签搜索建议可见(true)}
                    onBlur={() => window.setTimeout(() => 设置标签搜索建议可见(false), 120)}
                    onChange={(事件) => {
                      设置标签搜索建议可见(true);
                      设置标签搜索内容(事件.target.value);
                    }}
                  />
                  {标签搜索内容 && (
                    <button
                      type="button"
                      aria-label={t("清空标签搜索")}
                      title={t("清空标签搜索")}
                      onMouseDown={(事件) => 事件.preventDefault()}
                      onClick={() => {
                        设置标签搜索内容("");
                        设置标签搜索建议可见(false);
                        window.requestAnimationFrame(() => 标签搜索输入框.current?.focus());
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              </label>
              {标签搜索建议可见 && 抽屉标签建议列表.length > 0 && (
                <div className="tag-suggestions tag-drawer-suggestions" aria-label={t("标签建议")}>
                  {抽屉标签建议列表.map((标签) => (
                    <button
                      type="button"
                      key={标签}
                      onMouseDown={(事件) => 事件.preventDefault()}
                      onClick={() => 切换抽屉标签建议(标签)}
                    >
                      {标签}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="tag-drawer-mode-row">
              <span className="tag-drawer-mode-label">{t("多条件匹配方式")}</span>
              <div className="search-mode-toggle" role="group" aria-label={t("多条件匹配方式")}>
                <button
                  type="button"
                  className={搜索模式 === "fuzzy" ? "is-active" : ""}
                  onClick={() => 更新标签搜索模式("fuzzy")}
                >{t("任一条件")}</button>
                <button
                  type="button"
                  className={搜索模式 === "exact" ? "is-active" : ""}
                  onClick={() => 更新标签搜索模式("exact")}
                >{t("全部条件")}</button>
              </div>
            </div>
            <section className="settings-section">
              <h3>{t("当前筛选")}</h3>
              <div className="tag-filter-list">
                {已选标签列表.length > 0 ? 已选标签列表.map((标签) => (
                  <button
                    type="button"
                    className="tag-filter-chip is-active"
                    key={标签}
                    onClick={() => 切换筛选标签(标签)}
                  >
                    {标签}
                  </button>
                )) : <span className="drawer-muted">{t("全部标签")}</span>}
              </div>
              <button type="button" className="secondary-action drawer-copy-button" onClick={() => {
                  设置已选标签列表([]);
                  回到第一页();
                }} disabled={!有选中标签}>{t("清除选择")}</button>
            </section>
            <section className="settings-section tag-manage-section">
              <h3>{t("标签管理")}</h3>

              <div className="tag-filter-actions">
                <button
                  type="button"
                  className={`secondary-action drawer-copy-button ${标签删除选择模式 ? "is-active" : ""}`}
                  onClick={() => {
                    if (标签删除选择模式) 退出标签删除选择模式();
                    else 设置标签删除选择模式(true);
                  }}
                >{t("选择")}</button>
                <button
                  type="button"
                  className="secondary-action drawer-copy-button"
                  disabled={!标签删除选择模式 || 显示标签.length === 0}
                  onClick={() => 设置当前可见标签为待删除(显示标签)}
                >{t("全选")}</button>
                <button
                  type="button"
                  className="danger-soft-action drawer-copy-button"
                  disabled={!标签删除选择模式 || 待删除数量 === 0}
                  onClick={请求删除已选择标签}
                >{t("删除")}{待删除数量 > 0 ? ` ${待删除数量}` : ""}
                </button>
                {标签删除选择模式 && (
                  <button
                    type="button"
                    className="secondary-action drawer-copy-button"
                    onClick={退出标签删除选择模式}
                  >{t("取消")}</button>
                )}
              </div>

            </section>
            <section className="settings-section tag-all-section">
              <h3>{t("全部标签")}</h3>
              <div className="tag-filter-list">
                {显示标签.length > 0 ? 显示标签.map((标签) => (
                  <button
                    type="button"
                    draggable={!标签删除选择模式}
                    className={`tag-filter-chip ${已选标签列表.includes(标签) && !标签删除选择模式 ? "is-active" : ""} ${待删除标签选择集合.has(标签) ? "is-delete-selected" : ""}`}
                    key={标签}
                    onClick={() => {
                      if (标签删除选择模式) 切换待删除标签(标签);
                      else 切换筛选标签(标签);
                    }}
                    onDragStart={() => 设置拖拽标签(标签)}
                    onDragOver={(事件) => 事件.preventDefault()}
                    onDrop={() => {
                      if (!标签删除选择模式) 处理标签拖放(标签);
                    }}
                    aria-pressed={标签删除选择模式 ? 待删除标签选择集合.has(标签) : 已选标签列表.includes(标签)}
                    title={标签删除选择模式 ? t("点击选择或取消待删除标签") : t("拖拽调整标签顺序")}
                  >
                    {标签}
                  </button>
                )) : <span className="drawer-muted">{t("暂无标签")}</span>}
              </div>
            </section>
          </div>
        </aside>
      </div>
    );
  }

  function 获取最近打开阅读进度(项目: RecentOpenedItem): ReadingProgress {
    const 已保存进度 = 阅读进度表[项目.resourceKey];
    if (已保存进度) return 已保存进度;

    const totalPages = Math.max(1, 项目.totalPages);
    const currentPageIndex = Math.min(Math.max(项目.currentPageIndex, 0), totalPages - 1);
    return {
      resourceKey: 项目.resourceKey,
      sourcePath: 项目.sourcePath,
      sourceType: 项目.sourceType,
      title: 项目.title,
      currentPageIndex,
      totalPages,
      percent: Math.round(((currentPageIndex + 1) / totalPages) * 100),
      completed: currentPageIndex >= totalPages - 1,
      hasStartedReading: currentPageIndex > 0 || currentPageIndex >= totalPages - 1,
      firstReadAt: 项目.updatedAt,
      updatedAt: 项目.updatedAt,
    };
  }

  function 定位续读页面(资源: 阅读资源结果, 进度: ReadingProgress | null, fallback: number): number {
    if (资源.sourceType === 'pdf' || 资源.sourceType === 'epub') return Math.max(0, fallback);
    return resolvePageIndex(资源.pages, 进度?.currentPageId, 进度?.currentPageName, fallback);
  }

  async function 保存资源当前进度(资源: 阅读资源结果, 当前页索引: number): Promise<void> {
    const 当前页面 = 资源.pages[当前页索引];
    if (!当前页面) return;

    资源.requestedPageId = pageIdentity(当前页面);
    // Android's reader records the open only after its prepared page and entry
    // transition are visible. An early save here reorders the list under the tap.
    if (手机布局) return;
    const completed = 当前页索引 >= 资源.total - 1;
    const 结果 = await window.omicomic.saveReadingProgress({
      resourceKey: 资源.resourceKey,
      sourcePath: 资源.sourcePath,
      sourceType: 资源.sourceType,
      title: 资源.title,
      currentPageIndex: 当前页索引,
      currentPageId: pageIdentity(当前页面),
      totalPages: 资源.total,
      currentPageName: 当前页面.name,
      percent: Math.round(((当前页索引 + 1) / Math.max(1, 资源.total)) * 100),
      completed,
      hasStartedReading: 当前页索引 > 0 || completed,
      firstReadAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (结果.ok) {
      设置阅读进度表((原表) => ({
        ...原表,
        [结果.data.resourceKey]: 结果.data,
      }));
      await 刷新最近打开();
      await 刷新收藏列表();
      await 刷新书签列表();
    }
  }

  function 处理网格滚轮(事件: ReactWheelEvent<HTMLDivElement>): void {
    if (连续列表启用 || 事件.ctrlKey || !是否显示分页 || Math.abs(事件.deltaY) < 1) return;

    if (滚轮停止定时器.current !== null) {
      window.clearTimeout(滚轮停止定时器.current);
    }
    滚轮停止定时器.current = window.setTimeout(() => {
      自动翻页锁定.current = false;
      滚轮停止定时器.current = null;
    }, 180);

    const 当前时间 = Date.now();
    if (自动翻页锁定.current || 当前时间 < 自动翻页冷却截止.current) return;

    const 容器 = 事件.currentTarget;
    const 边界阈值 = 40;
    const 距离底部 = Math.max(0, 容器.scrollHeight - 容器.clientHeight - 容器.scrollTop);
    const 接近顶部 = 容器.scrollTop <= 边界阈值;
    const 接近底部 = 距离底部 <= 边界阈值;

    if (事件.deltaY > 0 && 接近底部 && 安全当前页 < 总页数) {
      事件.preventDefault();
      自动翻页锁定.current = true;
      自动翻页冷却截止.current = 当前时间 + 350;
      待恢复滚动位置.current = "top";
      设置当前页(安全当前页 + 1);
    } else if (事件.deltaY < 0 && 接近顶部 && 安全当前页 > 1) {
      事件.preventDefault();
      自动翻页锁定.current = true;
      自动翻页冷却截止.current = 当前时间 + 350;
      待恢复滚动位置.current = "bottom";
      设置当前页(安全当前页 - 1);
    }
  }

  const 正在显示最近打开 = 当前视图 === "recent";
  const 正在显示书架 = 当前视图 === "bookshelf";
  const 正在显示收藏 = 当前视图 === "favorites";
  const 正在显示书签 = 当前视图 === "bookmarks";
  const 正在显示虚拟文件夹 = 当前视图 === "virtual-folder";
  const 正在显示非目录视图 = 正在显示最近打开 || 正在显示书架 || 正在显示收藏 || 正在显示书签 || 正在显示虚拟文件夹;
  const 可以返回 = 当前视图 === "directory" && Boolean(当前目录?.parentPath && 当前根目录 && 当前目录.path !== 当前根目录) && !正在读取;
  const 可以前进 = 历史记录.index >= 0
    && 历史记录.index < 历史记录.entries.length - 1
    && 当前视图 === "directory"
    && !正在读取;
  const 视图标题 = 正在显示最近打开
    ? 阅读记录标题
    : 正在显示书架
      ? "我的书架"
      : 正在显示收藏
        ? "收藏"
        : 正在显示书签
          ? "书签"
          : 正在显示虚拟文件夹
            ? 当前虚拟文件夹?.name ?? "书架"
            : "资源库";
  function 渲染书架分类项(书架: Bookshelf, 表面: "rail" | "panel") {
    const 数量 = 虚拟文件夹列表.filter((文件夹) => 文件夹.bookshelfId === 书架.id).length;
    const 是当前分类 = 当前书架?.id === 书架.id;
    const 是面板拖拽源 = 表面 === "panel" && 书架分类面板拖拽源ID === 书架.id;
    const 是面板拖拽落点 = 表面 === "panel" && 书架分类面板拖拽落点?.key === 书架.id;
    if (表面 === "rail" && 内联编辑书架栏?.id === 书架.id) {
      return (
        <span className="bookshelf-category-edit" key={书架.id}>
          <input
            value={内联编辑书架栏.name}
            autoFocus
            disabled={删除确认处理中}
            aria-label={tr`重命名分类 ${书架.name}`}
            onChange={(事件) => 设置内联编辑书架栏({ id: 书架.id, name: 事件.target.value })}
            onBlur={() => void 保存内联编辑书架栏()}
            onKeyDown={(事件) => {
              if (事件.key === "Enter") void 保存内联编辑书架栏();
              else if (事件.key === "Escape") 取消内联编辑书架栏();
            }}
          />
        </span>
      );
    }
    const 动画Key = `${表面}:${书架.id}`;
    return (
      <button
        ref={(元素) => {
          if (元素) 书架分类按钮元素表.current.set(动画Key, 元素);
          else 书架分类按钮元素表.current.delete(动画Key);
        }}
        type="button"
        role="tab"
        aria-selected={是当前分类}
        tabIndex={是当前分类 ? 0 : -1}
        key={书架.id}
        data-bookshelf-panel-id={表面 === "panel" ? 书架.id : undefined}
        className={[
          "bookshelf-category-tab",
          是当前分类 ? "is-active" : "",
          是面板拖拽源 ? "is-panel-sort-source" : "",
          是面板拖拽落点 ? `is-panel-sort-drop-${书架分类面板拖拽落点?.position}` : "",
        ].filter(Boolean).join(" ")}
        onClick={(事件) => {
          if (表面 === "panel" || singleTapNavigation()) 切换书架分类(书架.id);
          else 安排点击切换书架分类(书架, 事件);
        }}
        onKeyDown={(事件) => 处理书架分类按键(事件, 书架.id)}
        onPointerDown={表面 === "panel" ? (事件) => 开始书架分类面板排序(事件, 书架.id) : undefined}
        onPointerMove={表面 === "panel" ? 更新书架分类面板排序 : undefined}
        onPointerUp={表面 === "panel" ? 结束书架分类面板排序 : undefined}
        onPointerCancel={表面 === "panel" ? 取消书架分类面板排序 : undefined}
        onLostPointerCapture={表面 === "panel" ? 取消书架分类面板排序 : undefined}
        onDoubleClick={(事件) => {
          事件.preventDefault();
          事件.stopPropagation();
          if (表面 === "rail" && 书架分类已处理双击.current) {
            书架分类已处理双击.current = false;
            return;
          }
          取消待执行书架分类点击();
          // This is also a native fallback when both clicks still land on the same
          // element (for example the already-selected leading item).
          开始内联编辑书架栏(书架);
        }}
        onContextMenu={(事件) => {
          取消待执行书架分类点击();
          事件.preventDefault();
          设置已选书架栏ID集合(new Set([书架.id]));
          设置书架菜单({ x: 事件.clientX, y: 事件.clientY, 项目: 书架 });
        }}
      >
        <span>{书架.name}</span>
        <em>{数量}</em>
      </button>
    );
  }

  function 渲染资源详情页面() {
    if (!资源信息目标) return null;
    const 是书签 = 资源信息目标.kind === "bookmark";
    const 标题 = 是书签 ? (资源信息目标.item.bookmarkTitle ?? 资源信息目标.item.title) : 资源信息目标.input.title;
    const 路径 = 是书签 ? 资源信息目标.item.sourcePath : 资源信息目标.input.sourcePath;
    const 类型 = 资源信息目标.fileType;
    const 阅读单位 = t(类型 === "epub" ? "章" : "页");
    const 信息 = 类型信息[类型];
    const 当前标签 = 解析标签输入(整理标签输入);
    const 资源Key = 是书签 ? 资源信息目标.item.resourceKey : 资源信息目标.input.resourceKey;
    const 阅读进度 = 阅读进度表[资源Key] ?? null;
    const 总页数 = 资源详情阅读资源?.total || (是书签 ? 资源信息目标.item.totalPages : 阅读进度?.totalPages ?? 0);
    const 当前页索引 = 是书签
      ? 资源信息目标.item.pageIndex
      : Math.min(Math.max(阅读进度?.currentPageIndex ?? 0, 0), Math.max(0, 总页数 - 1));
    const 进度百分比 = 总页数 > 0 ? Math.min(100, Math.max(0, ((当前页索引 + 1) / 总页数) * 100)) : 0;
    const 阅读按钮文案 = 阅读进度?.hasStartedReading || 是书签 ? "继续阅读" : "开始阅读";
    const 已保存备注 = 是书签 ? 获取整理备注(资源信息目标.item) : 获取资源整理信息(资源信息目标.input).note;
    const 已保存标签 = 是书签 ? 获取整理标签(资源信息目标.item) : 获取资源整理信息(资源信息目标.input).tags;
    const 资源详情有未保存修改 = 整理备注输入.trim() !== 已保存备注.trim()
      || 当前标签.join("\u0000") !== 规范化标签列表(已保存标签).join("\u0000");

    return (
      <section
        ref={资源详情滚动容器}
        className={`resource-detail-page ${!手机布局 && 资源详情顶部折叠 ? "is-header-collapsed" : ""}`}
        aria-labelledby="resource-detail-title"
      >
        {手机布局 && <header className="mobile-detail-toolbar"><button className="mobile-icon-button" aria-label={t("返回资源列表")} onClick={() => void 返回手机上一页()}><MobileIcon name="back"/></button><button className="mobile-icon-button" aria-label={t("详情操作")} onClick={() => 设置手机详情菜单(true)}><MobileIcon name="more"/></button></header>}
        <div className="resource-detail-compact-shell">
          <div className="resource-detail-compact-bar" aria-hidden={!资源详情顶部折叠}>
            <div className="resource-detail-compact-copy">
              <strong title={标题}>{标题}</strong>
              <span>{总页数 > 0 ? tr`第 ${当前页索引 + 1} / ${总页数} ${t(阅读单位)} · ${Math.round(进度百分比)}%` : (类型 === "pdf" || 类型 === "epub" ? t("打开后继续阅读") : t("正在读取页面清单"))}</span>
            </div>
            <button
              type="button"
              className="primary-action resource-detail-compact-read-button"
              disabled={!资源详情阅读资源 || 资源详情加载状态 !== "loaded"}
              onClick={() => 打开资源详情阅读器(当前页索引)}
              tabIndex={资源详情顶部折叠 ? 0 : -1}
            >
              {t(阅读按钮文案)}
            </button>
            <button
              type="button"
              className="secondary-action resource-detail-compact-expand-button"
              onClick={() => {
                // 先复位再展开，避免平滑滚动经过收起阈值时再次折叠。
                资源详情滚动容器.current?.scrollTo({ top: 0, behavior: "instant" });
                资源详情预览滚动容器.current?.scrollTo({ top: 0, behavior: "instant" });
                设置资源详情顶部折叠(false);
              }}
              tabIndex={资源详情顶部折叠 ? 0 : -1}
            >{t("展开详情")}</button>
          </div>
        </div>
        <header className="resource-detail-hero">
          <div className={`resource-detail-cover thumbnail-${资源信息目标.thumbnailUrl ? "loaded" : "error"}`}>
            {资源信息目标.thumbnailUrl ? (
              <img src={资源信息目标.thumbnailUrl} alt="" draggable={false} />
            ) : (
              <span aria-hidden="true">{手机布局 ? <MobileIcon name="library"/> : 信息.icon}</span>
            )}
          </div>
          <div className="resource-detail-intro">
            <p className="resource-detail-kicker">
              {是书签 ? t("书签资源") : 信息.label}{手机布局 && 总页数 > 0 ? tr` · 共 ${总页数} ${t(阅读单位)}` : ""}
            </p>
            <h2 id="resource-detail-title">{标题}</h2>
            <div className="resource-detail-reading-launch">
              <div className="resource-detail-reading-status">
                <div className="resource-detail-progress-copy">
                  <span>{t("阅读进度")}</span>
                  <strong>{总页数 > 0 ? tr`第 ${当前页索引 + 1} ${t(阅读单位)} / 共 ${总页数} ${t(阅读单位)}` : (类型 === "pdf" || 类型 === "epub" ? t("打开后继续阅读") : t("等待页面清单"))}</strong>
                  <em>{Math.round(进度百分比)}%</em>
                </div>
                <span className="resource-detail-progress-track" aria-hidden="true">
                  <span style={{ width: `${进度百分比}%` }} />
                </span>
              </div>
              <div className="resource-detail-primary-actions">
                <button
                  type="button"
                  className="primary-action resource-detail-read-button"
                  disabled={!资源详情阅读资源 || 资源详情加载状态 !== "loaded"}
                  onClick={() => 打开资源详情阅读器(当前页索引)}
                >
                  <SidebarIcon name="bookshelf" />
                  <span>{t(阅读按钮文案)}</span>
                </button>
              </div>
            </div>
            <MobileDetailMetadata key={资源Key} mobile={手机布局} tags={当前标签} note={整理备注输入} error={t(整理错误 ?? '')} onSave={async patch=>{
              const saved=await 保存资源信息(patch);
              if(saved){if(patch.tags)设置整理标签输入(patch.tags.join(", "));if(patch.note!==undefined)设置整理备注输入(patch.note);}
              return saved;
            }}/>

          </div>
        </header>

        <div className="resource-detail-lower">
          <section
            className="resource-detail-preview-panel"
            aria-labelledby="resource-preview-heading"
          >
            <div className="resource-detail-section-heading">
              <div className="resource-detail-preview-title">
                <h3 id="resource-preview-heading">{t("缩略预览")}</h3>
                {!手机布局 ? (总页数 > 0 && <p>{tr`共 ${总页数} ${t(阅读单位)}`}</p>) : <p>{类型 === "pdf" || 类型 === "epub"
                  ? (总页数 > 0 ? tr`共 ${总页数} ${t(阅读单位)} · 使用上方按钮继续阅读` : t("使用上方按钮开始阅读"))
                  : 总页数 > 0 ? tr`共 ${总页数} 页 · ${t(singleTapNavigation() ? "点击从该页阅读" : "单击选择，双击从该页阅读")}` : t("正在读取页面清单")}</p>}
              </div>
              <div className="resource-detail-preview-controls">
                {资源详情阅读资源 && 资源详情阅读资源.pages.length > 48 && (手机布局 ? <MobileDetailPager current={资源详情预览页+1} total={Math.ceil(资源详情阅读资源.pages.length/48)} onPage={page=>设置资源详情预览页(page-1)}/> : (
                  <nav className="detail-pagination" aria-label={t("预览分页")}>
                    <button type="button" aria-label={t("上一组预览")} disabled={资源详情预览页 === 0}
                      onClick={() => { 设置资源详情预览页((页) => Math.max(0, 页 - 1)); 资源详情预览滚动容器.current?.scrollTo({ top: 0 }); }}>‹</button>
                    <span>{资源详情预览页 + 1} / {Math.ceil(资源详情阅读资源.pages.length / 48)}</span>
                    <button type="button" aria-label={t("下一组预览")} disabled={(资源详情预览页 + 1) * 48 >= 资源详情阅读资源.pages.length}
                      onClick={() => { 设置资源详情预览页((页) => 页 + 1); 资源详情预览滚动容器.current?.scrollTo({ top: 0 }); }}>›</button>
                  </nav>
                ))}
                <div className="resource-detail-path-control" ref={资源详情路径控件}>
                  <button
                    type="button"
                    className="resource-detail-path-trigger"
                    aria-expanded={资源详情路径浮层打开}
                    onClick={() => {
                      if (标签添加弹窗打开) 关闭标签添加弹窗();
                      设置资源详情路径浮层打开((当前) => !当前);
                    }}
                  >{t("路径")}</button>
                  {资源详情路径浮层打开 && (
                    <div className="resource-detail-path-popover" role="dialog" aria-label={t("资源路径")}>
                      <span>{t("资源路径")}</span>
                      <p>{路径}</p>
                      <button
                        type="button"
                        onClick={() => {
                          复制路径(路径);
                          设置资源详情路径浮层打开(false);
                        }}
                      >{t("复制路径")}</button>
                    </div>
                  )}
                </div>
                {手机布局 && 资源详情阅读资源 && 资源详情阅读资源.pages.length > 0 && (
                  <span>{t("已选择第 ")}{Math.min(资源详情所选页 + 1, Math.max(1, 总页数))}{t(" 页")}</span>
                )}
                {类型 !== "pdf" && 类型 !== "epub" && <CardScaleControl
                  className="resource-detail-size-control" label={t("缩略预览大小")} scope="detail"
                  motion={缩放动效.detail}
                  value={详情缩略图缩放} onChange={value => 调整卡片缩放(value, "detail")} onCommit={保存缩放设置}
                />}
              </div>
            </div>
            <div
              ref={资源详情预览滚动容器}
              className="resource-detail-thumbnail-grid"
              style={{ "--card-columns": 获取卡片列数(详情缩略图缩放) } as CSSProperties}
              role="region"
              aria-label={t("页面缩略图")}
              tabIndex={0}
            >
              {资源详情加载状态 === "loading" && Array.from({ length: 8 }, (_, 索引) => (
                <span className="resource-detail-thumbnail-placeholder" key={索引} aria-hidden="true" />
              ))}
              {资源详情加载状态 === "error" && (
                <div className="resource-detail-preview-empty">
                  <strong>{t("无法读取页面预览")}</strong>
                  <span>{整理错误 ?? t("请返回后重新打开资源信息。")}</span>
                </div>
              )}
              {资源详情加载状态 === "loaded" && 资源详情阅读资源 && (类型 === "pdf" || 类型 === "epub") && (
                <div className="resource-detail-preview-empty"><strong>{信息.label}{t(" 文档")}</strong><span>{t("使用上方阅读按钮打开，沿用当前阅读模式。")}</span></div>
              )}
              {资源详情阅读资源?.pages.slice(资源详情预览页 * 48, (资源详情预览页 + 1) * 48).map((页面) => (
                <资源详情缩略图
                  key={`${资源详情阅读资源.resourceKey}:${页面.index}`}
                  page={页面}
                  selected={资源详情所选页 === 页面.index}
                  selectable={手机布局}
                  onSelect={() => 设置资源详情所选页(页面.index)}
                  onOpen={() => { 设置资源详情所选页(页面.index); 打开资源详情阅读器(页面.index); }}
                />
              ))}
            </div>
          </section>

        </div>
      </section>
    );
  }
  useMobileDrawerGesture(手机导航区域, 手机布局 && isActive && !资源信息目标 && !选择模式 && !手机书架排序, side => {
    if (side === 'right') 设置当前右侧抽屉("tag-filter");
    else if (当前视图 === 'directory') 设置手机侧栏('library');
    else if (当前视图 === 'bookshelf' || 当前视图 === 'virtual-folder') 设置手机侧栏('bookshelf');
    else return false;
    return true;
  });

  return (
    <section className={`library-layout ${手机布局 ? `is-mobile-library mobile-cards-${手机卡片布局}` : ""} ${手机筛选展开 ? "is-mobile-filters-open" : ""}`} ref={手机导航区域}
      aria-labelledby="library-title" style={手机布局 ? { "--mobile-columns": 手机列数, "--mobile-list-columns": 手机自适应.listColumns, "--mobile-cover-size": `${手机封面尺寸}px`, "--mobile-preview-width": `${手机预览宽度}px` } as CSSProperties : undefined}>
      {手机布局 && !资源信息目标 && <MobileLibraryBar title={资源信息目标 ? t("漫画详情") : 当前视图 === "directory" ? 当前目录 ? (根目录列表.find(root => root.path === 当前目录.path)?.name ?? 获取目录名称(当前目录.path)) : t("资源库") : 当前视图 === "bookshelf" ? t("我的书架") : 当前视图 === "virtual-folder" ? 视图标题 : t(视图标题)}
        detail={Boolean(资源信息目标)}
        drawerLabel={当前视图 === "bookshelf" || 当前视图 === "virtual-folder" ? "书架分类" : "资源库目录"}
        onDrawer={!资源信息目标 && 当前视图 === "directory" ? () => 设置手机侧栏("library") : !资源信息目标 && (当前视图 === "bookshelf" || 当前视图 === "virtual-folder") ? () => 设置手机侧栏("bookshelf") : undefined}
        onOptions={() => 设置手机显示选项(true)} layout={手机卡片布局}
        onLayout={() => 保存界面设置(patchMobileDisplay(界面设置快照.current, 手机显示范围, { layout: 手机卡片布局 === "grid" ? "list" : "grid" }))}
        searchOpen={手机筛选展开} query={当前搜索内容} suggestions={标签建议列表}
        onQuery={value => { 设置当前视图搜索内容(value); 回到第一页(); }}
        onSearch={open => open ? 设置手机筛选展开(true) : 取消当前搜索()} />}
      {书签重命名 && <RenameBookmarkDialog bookmark={书签重命名} onClose={() => 设置书签重命名(null)} onSaved={item => { 设置书签列表(old => old.map(value => value.id===item.id ? item : value)); if(资源信息目标?.kind==='bookmark' && 资源信息目标.item.id===item.id) 设置资源信息目标({...资源信息目标,item}); }}/>}
      {手机布局 && 手机详情菜单 && 资源信息目标 && <MobileSheet title={t("漫画操作")} onClose={() => 设置手机详情菜单(false)}>
        <button className="mobile-settings-link" onClick={() => { if(资源信息目标.kind==='bookmark') 设置书签重命名(资源信息目标.item); else 打开详情文件操作("rename"); 设置手机详情菜单(false); }}><MobileIcon name="rename"/>{资源信息目标.kind==='bookmark' ? t("重命名书签") : t("重命名")}</button>
        <button className="mobile-settings-link" onClick={() => { 打开详情文件操作("delete"); 设置手机详情菜单(false); }}><MobileIcon name="delete"/>{t("删除")}</button>
      </MobileSheet>}
      {手机布局 && 手机侧栏 === "library" && <MobileLibraryDrawer roots={根目录列表} current={当前目录?.path ?? null} onClose={() => 设置手机侧栏(null)} onOpen={(path,root) => { 设置手机筛选展开(false); void 打开目录(path,root); }} onReorder={paths => void 保存根目录顺序(paths)} onManage={设置手机根目录管理} onAdd={() => { 设置手机侧栏(null); void 添加目录(); }} onFile={() => { 设置手机侧栏(null); void 直接打开文件(); }} />}
      {手机布局 && 手机根目录管理 && <MobileSheet title={手机根目录管理.name} showClose={false} onClose={() => 设置手机根目录管理(null)}>
        <button className="mobile-settings-link" onClick={() => { 设置待删除根目录(手机根目录管理); 设置手机根目录管理(null); }}><MobileIcon name="delete"/>{t("删除资源库")}</button>
      </MobileSheet>}
      {手机布局 && 手机侧栏 === "bookshelf" && <MobileSheet side title={t("书架分类")} onClose={() => 设置手机侧栏(null)}>
        <MobileReorderList items={书架列表} itemKey={item => item.id} onReorder={keys => void 保存书架分类面板顺序(keys,书架列表.map(item => item.id))} render={item => <div className={`mobile-category-row ${当前书架ID === item.id ? "is-active" : ""}`}><button onClick={() => { dismissMobileSheet(() => { 设置当前书架ID(item.id); 打开书架(); }); }}>{item.name}</button><button aria-label={tr`管理分类 ${item.name}`} onClick={() => { 设置手机分类管理(item); }}><MobileIcon name="more"/></button></div>} />
        <div className="mobile-drawer-footer"><button onClick={() => { 打开书架弹窗({mode:"create"}); }}><MobileIcon name="add"/>{t("新建分类")}</button><button onClick={() => { 打开虚拟文件夹弹窗({mode:"create"}); }}><MobileIcon name="add"/>{t("新建书架")}</button></div>
      </MobileSheet>}
      {手机布局 && 手机分类管理 && <MobileSheet title={手机分类管理.name} showClose={false} onClose={() => 设置手机分类管理(null)}>
        <button className="mobile-settings-link" onClick={() => { 打开书架弹窗({mode:"rename",bookshelf:手机分类管理}); 设置手机分类管理(null); }}>{t("重命名分类")}</button>
        <button className="mobile-settings-link" onClick={() => { 请求删除书架栏(手机分类管理); 设置手机分类管理(null); }}>{t("删除分类")}</button>
      </MobileSheet>}
      {手机布局 && 渲染手机书架操作栏()}
      {手机布局 && 手机显示选项 && <MobileSheet title={t("显示选项")} onClose={() => 设置手机显示选项(false)}>
        <p className="settings-hint">{t("仅调整")}{t(mobileDisplayLabels[手机显示范围])}{t("的显示方式。")}</p>
        <label className="mobile-option-row"><span>{t("网格列数 ")}<b>{手机基础列数}</b></span><input aria-label={t("网格列数")} type="range" min="2" max="6" step="1" value={手机基础列数} onChange={event => 保存界面设置(patchMobileDisplay(界面设置快照.current, 手机显示范围, {columns:Number(event.target.value)}))} /></label>
        {手机自适应.wide && <small className="mobile-adaptive-hint">{t("宽屏自动适配")} · {手机列数} {t("列")}</small>}
        <label className="mobile-option-row"><span>{t("列表封面尺寸 ")}<b>{手机封面尺寸}</b></span><input aria-label={t("列表封面尺寸")} type="range" min="64" max="132" step="4" value={手机封面尺寸} onChange={event => 保存界面设置(patchMobileDisplay(界面设置快照.current, 手机显示范围, {coverSize:Number(event.target.value)}))} /></label>
        <div className="mobile-option-row mobile-sort-row"><span>{t("排序")}</span><GlassSelect value={随机模式 ? 'random' : 排序} options={uiOptions(浏览排序选项)} ariaLabel={t("资源库默认排序")} onChange={应用浏览排序} />{当前随机范围 && <RandomBrowseToggle active={随机模式} onChange={随机浏览.toggle}/>}</div>
        <button className="mobile-settings-link" disabled={正在读取 || 正在检查全局无效资源} onClick={() => { 设置手机显示选项(false); void 处理刷新按钮(); }}>{t("刷新资源库 ")}<MobileIcon name="refresh"/></button>
        {移除索引数量 > 0 && <button className="mobile-settings-link" onClick={async () => { const result = await window.omicomic.restoreResourceIndex(); if (result.ok) { await 同步文件操作(result.data); 设置手机显示选项(false); } else 设置错误信息(result.error.message); }}>{t("恢复文件索引 (")}{移除索引数量})</button>}
        <button className="mobile-settings-link" onClick={() => { 设置手机显示选项(false); 设置当前右侧抽屉("tag-filter"); }}>{t("标签管理 ")}<MobileIcon name="chevron"/></button>
        <button className="mobile-settings-link" onClick={() => 打开设置窗口()}>{t("应用设置 ")}<MobileIcon name="chevron"/></button>
      </MobileSheet>}
      {手机布局 && !资源信息目标 && 渲染手机操作栏()}
      <aside className="library-sidebar">
        <OmiPageBrand onActivate={onHome} onRead={origin => {
          const 最近项目 = [...最近打开列表].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          if (最近项目) return 打开最近项目(最近项目, origin);
        }} disabled={!数据已加载 || !isActive} readDisabled={最近打开列表.length === 0} titleId="library-title" />

        <nav className="sidebar-primary-nav" aria-label={t("主导航")}>
          <button
            type="button"
            className={`sidebar-item ${当前视图 === "directory" ? "is-active" : ""}`}
            aria-current={手机布局 && 当前视图 === 'directory' ? 'page' : undefined}
            onClick={打开资源库}
          >
            <SidebarIcon name="library" />
            <span>{t("资源库")}</span>
          </button>
          <button
            type="button"
            className={`sidebar-item ${当前视图 === "bookshelf" || 当前视图 === "virtual-folder" ? "is-active" : ""}`}
            aria-current={手机布局 && (当前视图 === 'bookshelf' || 当前视图 === 'virtual-folder') ? 'page' : undefined}
            onClick={打开书架}
          >
            <SidebarIcon name="bookshelf" />
            <span>{t("书架")}</span>
            <em className="sidebar-count">{虚拟文件夹列表.length}</em>
          </button>
          <button
            type="button"
            className={`sidebar-item ${当前视图 === "favorites" ? "is-active" : ""}`}
            aria-current={手机布局 && 当前视图 === 'favorites' ? 'page' : undefined}
            onClick={() => {
              if (资源信息目标) 关闭资源详情页面(手机布局);
              重置栏目搜索(); 设置导航会话(value => value + 1); if(当前视图 === "favorites") { 随机浏览.stop(); 回到第一页(); 目录连续列表.reset(); }
              if (手机布局) { 切换手机栏目('favorites', () => { 设置当前视图("favorites"); 设置错误信息(null); }); }
              else { 设置当前视图("favorites"); 设置错误信息(null); }
            }}
          >
            <SidebarIcon name="favorite" />
            <span>{t("收藏")}</span>
            <em className="sidebar-count">{收藏列表.length}</em>
          </button>
          <button
            type="button"
            className={`sidebar-item ${当前视图 === "bookmarks" ? "is-active" : ""}`}
            aria-current={手机布局 && 当前视图 === 'bookmarks' ? 'page' : undefined}
            onClick={() => {
              if (资源信息目标) 关闭资源详情页面(手机布局);
              重置栏目搜索(); 设置导航会话(value => value + 1); if(当前视图 === "bookmarks") { 随机浏览.stop(); 回到第一页(); 目录连续列表.reset(); }
              if (手机布局) { 切换手机栏目('bookmarks', () => { 设置当前视图("bookmarks"); 设置错误信息(null); }); }
              else { 设置当前视图("bookmarks"); 设置错误信息(null); }
            }}
          >
            <SidebarIcon name="bookmark" />
            <span>{t("书签")}</span>
            <em className="sidebar-count">{书签列表.length}</em>
          </button>
          <button
            type="button"
            className={`sidebar-item ${手机布局 ? "mobile-hidden" : ""} ${当前视图 === "recent" && 是临时存放 ? "is-active" : ""}`}
            onClick={() => 切换阅读记录分类("temporary")}
          >
            <AppIcon name="temporary" className="sidebar-nav-icon"/>
            <span>{t("临时存放")}</span>
            <em className="sidebar-count">{临时存放列表.length}</em>
          </button>
          <button
            type="button"
            className={`sidebar-item ${当前视图 === "recent" && !是临时存放 ? "is-active" : ""}`}
            aria-current={手机布局 && 当前视图 === 'recent' && !是临时存放 ? 'page' : undefined}
            onClick={() => { if(手机布局 && 当前视图==="recent") 回到第一页(); 切换阅读记录分类("recent"); }}
          >
            <SidebarIcon name="recent" />
            <span>{t("最近阅读")}</span>
            <em className="sidebar-count">{最近打开列表.length}</em>
          </button>
        </nav>

        <div className="sidebar-footer-actions">
          <button
            ref={设置触发按钮}
            className={`sidebar-item sidebar-settings-button ${当前右侧抽屉 === "settings" ? "is-active" : ""}`}
            aria-label={t("设置")}
            type="button"
            onClick={打开设置窗口}
          >
            <SidebarIcon name="settings" />
            <span>{t("设置")}</span>
          </button>
          <p className="sidebar-view-count" title={左下统计文本}>
            <span>{左下统计文本}</span>
          </p>
        </div>
      </aside>
      <div ref={资源主区域} className={`library-main ${资源信息目标 ? "is-resource-detail" : ""}`}
        style={{ "--card-columns": 获取卡片列数(卡片缩放) } as CSSProperties}>
        <h1 className="visually-hidden">{当前视图 === "virtual-folder" ? 视图标题 : t(视图标题)}</h1>
        {!手机布局 && 资源信息目标 && <div className="resource-detail-window-drag" aria-hidden="true" />}

        {!资源信息目标 && <div className={`library-controls ${选择模式 ? "is-selecting" : ""}`}>
          {移除索引数量 > 0 && <button className="restore-index-button" onClick={async () => {
            const 结果 = await window.omicomic.restoreResourceIndex();
            if (结果.ok) await 同步文件操作(结果.data);
            else 设置错误信息(结果.error.message);
          }}>{t("恢复文件索引 (")}{移除索引数量})</button>}
          <div className="search-shell">
            <label className="search-control">
              <span aria-hidden="true">⌕</span>
              <input
                ref={主搜索输入框}
                aria-label={正在显示最近打开 ? tr`搜索${t(阅读记录标题)}` : 正在显示收藏 ? t("搜索收藏") : 正在显示书签 ? t("搜索书签") : 正在显示书架 ? t("搜索书架") : 正在显示虚拟文件夹 ? t("搜索当前书架") : t("搜索当前资源库")}
                placeholder={正在显示最近打开 ? tr`搜索${t(阅读记录标题)}名称、备注或标签` : 正在显示收藏 ? t("搜索收藏文件名、备注或标签") : 正在显示书签 ? t("搜索书签资源、页面、备注或标签") : 正在显示书架 ? t("搜索书架、内部资源、备注或标签") : 正在显示虚拟文件夹 ? t("搜索当前书架内资源、备注或标签") : t("搜索当前资源库、备注或标签")}
                value={当前搜索内容}
                disabled={!正在显示最近打开 && !正在显示收藏 && !正在显示书签 && !正在显示书架 && !正在显示虚拟文件夹 && !当前目录}
                onFocus={() => 设置主搜索建议可见(true)}
                onBlur={() => window.setTimeout(() => 设置主搜索建议可见(false), 120)}
                onChange={(事件) => {
                  设置主搜索建议可见(true);
                  if (正在显示最近打开) {
                    设置最近搜索内容(事件.target.value);
                  } else if (正在显示收藏) {
                    设置收藏搜索内容(事件.target.value);
                  } else if (正在显示书签) {
                    设置书签搜索内容(事件.target.value);
                  } else {
                    设置当前视图搜索内容(事件.target.value);
                  }
                  回到第一页();
                }}
              />
              {!当前搜索内容 && <kbd className="search-shortcut">Ctrl K</kbd>}
              {当前搜索内容 && (
                <button
                  className="search-clear-button"
                  aria-label={t("清空搜索")}
                  title={t("清空搜索")}
                  onClick={() => {
                    if (正在显示最近打开) 设置最近搜索内容("");
                    else if (正在显示收藏) 设置收藏搜索内容("");
                    else if (正在显示书签) 设置书签搜索内容("");
                    else 设置搜索内容("");
                    回到第一页();
                  }}
                >
                  <AppIcon name="close"/>
                </button>
              )}
            </label>
            {主搜索建议可见 && 标签建议列表.length > 0 && (
              <div className="tag-suggestions" aria-label={t("标签建议")}>
                {标签建议列表.map((标签) => (
                  <button
                    type="button"
                    key={标签}
                    onMouseDown={(事件) => 事件.preventDefault()}
                    onClick={() => 应用主搜索标签建议(标签)}
                  >
                    {标签}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`tag-filter-button ${已选标签列表.length > 0 ? "is-active" : ""}`}
            onClick={() => 设置当前右侧抽屉("tag-filter")}
            title={t("按标签筛选")}
          >{t("标签")}{已选标签列表.length > 0 ? ` ${已选标签列表.length}` : ""}
          </button>

          <GlassSelect
            compact
            className="compact-sort-control"
            ariaLabel={t("排序方式")}
            title={t("排序方式")}
            value={随机模式 ? 'random' : 排序}
            options={uiOptions(浏览排序选项.map(option => ({ ...option, label: 正在显示书架 && option.value === "name-asc" ? "手动顺序" : option.label })))}
            disabled={正在显示最近打开 || 正在显示虚拟文件夹 || (!当前随机范围 && !正在显示书架 && !当前目录)}
            onChange={应用浏览排序}
          />

          <div className="view-selection-group">
          <details className="view-options-menu" ref={视图菜单容器}>
            <summary title={t("调整缩略图和进度显示")}>
              <span className="view-options-icon" aria-hidden="true"><AppIcon name="grid"/></span>
              <span>{t("视图")}</span>
            </summary>
            <div className="view-options-popover">
              <div className="view-options-heading">
                <strong>{t("视图设置")}</strong>
                <span>{当前视图 === "directory" ? t("调整卡片和阅读进度显示") : t("调整当前页面的卡片大小")}</span>
              </div>
              <div className="view-option-row">
                <span>{t("卡片大小")}</span>
                <CardScaleControl className="thumbnail-size-control" label={t("缩略图大小")} scope="library"
                  motion={缩放动效.library}
                  value={卡片缩放} disabled={!当前目录 && !正在显示非目录视图}
                  onChange={value => 调整卡片缩放(value, "library")} onCommit={保存缩放设置} />
              </div>
              {!正在显示非目录视图 && 当前目录 && (
                <>
                  <div className="view-option-row view-option-toggle-row">
                    <span>{t("阅读进度")}</span>
                    <label>
                      <input
                        type="checkbox"
                        checked={显示进度条}
                        onChange={(事件) => 保存界面设置({ showProgressBar: 事件.target.checked })}
                      />{t("进度条")}</label>
                    <label>
                      <input
                        type="checkbox"
                        checked={显示进度文本}
                        onChange={(事件) => 保存界面设置({ showProgressText: 事件.target.checked })}
                      />{t("进度文本")}</label>
                  </div>
                  <div className="view-option-row view-option-select-row">
                    <div className="view-option-field">
                      <span>{t("文本方式")}</span>
                      <GlassSelect
                        value={进度文本模式}
                        options={uiOptions(进度文本模式下拉选项)}
                        ariaLabel={t("进度文本方式")}
                        className="view-option-glass-select"
                        disabled={!显示进度文本}
                        onChange={(新模式) => 保存界面设置({ progressTextMode: 新模式 })}
                      />
                    </div>
                    <div className="view-option-field">
                      <span>{t("进度条")}</span>
                      <GlassSelect
                        value={进度条粗细}
                        options={uiOptions(进度条粗细下拉选项)}
                        ariaLabel={t("进度条粗细")}
                        className="view-option-glass-select"
                        disabled={!显示进度条}
                        onChange={(新粗细) => 保存界面设置({ progressBarThickness: 新粗细 })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </details>

          {当前选择视图 && (
            <div className="library-selection-control">
              {渲染选择工具条(当前选择视图, 当前选择视图Key列表.length)}
            </div>
          )}
          </div>
                <button
                  type="button"
                  className={`library-refresh-button ${正在读取 || 正在检查全局无效资源 ? "is-refreshing" : ""}`}
                  disabled={正在读取 || 正在检查全局无效资源}
                  onClick={() => void 处理刷新按钮()}
                  title={t("刷新并检测失效资源")}
                  aria-label={t("刷新并检测失效资源")}
                  aria-busy={正在读取 || 正在检查全局无效资源}
                >
                  <svg className="navigation-refresh-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M15.6 7.5A6 6 0 1 0 16 11M15.6 3.8v3.9h-3.9" />
                  </svg>
                </button>

        </div>}

        {资源信息目标 && !手机布局 && <div className="resource-detail-footer">
          <div className="resource-detail-file-actions">
            <button type="button" className="resource-detail-action" aria-label={t("重命名本地文件")} onClick={() => 打开详情文件操作("rename")}><span>{t("重命名")}</span></button>
            <button type="button" className="resource-detail-action" onClick={() => 打开详情文件操作("delete")}><span>{t("删除…")}</span></button>
          </div>
          <button type="button" className="resource-detail-action resource-detail-back" aria-label={t("返回资源列表")} onClick={async () => {
            if (资源详情编辑模式 && !(await 完成资源详情信息编辑())) return;
            关闭资源详情页面();
          }}><ArrowIcon direction="left" /><span>{t("返回")}</span></button>
        </div>}
        {资源信息目标 ? 渲染资源详情工作区() : <>
        <div className="library-body">
          {!手机布局 && 正在打开资源路径 && <div className="library-opening-status" role="status" aria-live="polite" aria-busy="true">{t("正在打开 ")}{正在打开资源路径.split(/[\\/]/).pop()}…</div>}
          {错误信息 && (
            <div className="error-banner" role="alert">
              <span>{t(错误信息 ?? '')}</span>
              <button onClick={() => 设置错误信息(null)} aria-label={t("关闭错误提示")}>×</button>
            </div>
          )}
          {成功提示 && (
            <div className="error-banner success-banner" style={错误信息 ? { top: 62 } : undefined} role="status">
              <span>{成功提示}</span>
              <button onClick={关闭成功提示} aria-label={t("关闭提示")}>×</button>
            </div>
          )}

          {当前视图 === 'directory' && (目录穿透搜索 || 随机模式) && 全库索引.error && <div className="library-opening-status" role="status">{全库索引.error}</div>}
          {随机模式 && 当前分页项目总数 === 0 ? <div className="empty-library compact-empty" role="status" aria-busy={全库索引.loading}>
            <div className="empty-illustration" aria-hidden="true"><RandomRefreshIcon/></div>
            <h2>{t(全库索引.loading && 当前视图 === 'directory' ? "正在补全资源清单…" : "暂无可随机阅读的资源")}</h2>
            <p>{全库索引.loading && 当前视图 === 'directory' ? t("发现漫画后立即显示，完整范围会继续补全。") : t("切换资源库或添加资源后再试。")}</p>
          </div> : 正在显示最近打开 ? (
            最近打开卡片项目.length === 0 ? (
              <div className="empty-library compact-empty">
                <div className="empty-illustration" aria-hidden="true"><AppIcon name={是临时存放 ? "temporary" : "history"}/></div>
                <h2>{当前阅读记录列表.length === 0 ? tr`暂无${t(阅读记录标题)}${t(是临时存放 ? "文件" : "记录")}` : tr`没有匹配的${t(阅读记录标题)}`}</h2>
                <p>{当前阅读记录列表.length === 0 ? 是临时存放 ? t("直接打开、尚未加入资源库的文件会留在这里。右键可将所在目录加入资源库。") : t("阅读文件夹图片或漫画压缩包后，这里会显示最近资源卡片。") : t("请尝试缩短关键词、清空搜索内容或取消标签筛选。")}</p>
                {当前阅读记录列表.length > 0 && (
                  <button
                    className="secondary-action empty-primary"
                    onClick={() => {
                      设置最近搜索内容("");
                      设置已选标签列表([]);
                      回到第一页();
                    }}
                  >{t("清空搜索")}</button>
                )}
              </div>
            ) : (
              <>
                <div
                  ref={列表容器} onScroll={目录连续列表.sync}
                  className={`resource-list-scroll recent-resource-list-scroll ${选择模式 === "recent" ? "is-selection-dragging-enabled" : ""}`}
                  aria-label={tr`${t(阅读记录标题)}资源列表`}
                  onWheel={处理网格滚轮}
                  onMouseDown={(事件) => 开始框选(事件, "recent")}
                  onMouseMove={更新框选}
                  onMouseUp={结束框选}
                  onMouseLeave={结束框选}
                  onContextMenu={(事件) => {
                    const 目标 = 事件.target;
                    if (
                      目标 instanceof HTMLElement
                      && 目标.closest("button, input, select, textarea, .recent-context-menu")
                    ) return;
                    事件.preventDefault();
                    设置最近菜单(null);
                    设置整理空白菜单({ x: 事件.clientX, y: 事件.clientY, 视图: "recent" });
                  }}
                >
                  <div className={`resource-list recent-resource-list size-${缩略图尺寸}`} style={手机连续样式}>
                {当前页最近打开卡片项目.map(({ 项目, 文件 }) => {
                  const 信息 = 类型信息[文件.type];
                  const 阅读进度 = 获取最近打开阅读进度(项目);
                  const 可阅读页数Key = 获取可阅读页数Key(文件);
                  const 可阅读页数 = 可阅读页数Key ? 可阅读页数表[可阅读页数Key]?.count ?? null : null;
                  const 进度显示状态 = 获取卡片进度显示状态(
                    阅读进度,
                    可阅读页数,
                    进度文本模式,
                    显示进度条,
                  );
                  const 缩略图 = 缩略图表[文件.path] ?? {
                    status: 支持真实缩略图(文件.type) ? "loading" : "error",
                    url: null,
                  };
                  const 收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex"> = {
                    resourceKey: 项目.resourceKey,
                    sourcePath: 项目.sourcePath,
                    sourceType: 项目.sourceType,
                    title: 项目.title,
                  };
                  const 资源整理输入: ResourceMetaInput = {
                    resourceKey: 项目.resourceKey,
                    sourcePath: 项目.sourcePath,
                    sourceType: 项目.sourceType,
                    title: 项目.title,
                  };
                  const 整理信息 = 获取资源整理信息(资源整理输入);
                  const 路径失效 = 路径是否失效(文件.path);

                  if (手机布局) return 渲染手机资源卡片(文件, 资源整理输入, 项目.resourceKey, () => void 打开最近项目(项目), 进度显示状态.文本?.replace(/第|页|章/g, "").trim() ?? (可阅读页数 ? String(可阅读页数) : ""), 整理信息.tags);
                  return (
                    <button
                      key={项目.resourceKey}
                      data-selection-key={项目.resourceKey}
                      className={`resource-card resource-${文件.type} ${
                        进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                      } progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.resourceKey) ? "is-selected" : ""} ${路径失效 ? "is-path-invalid" : ""}`}
                      onClick={(事件) => {
                        if (框选后忽略点击(事件)) return;
                        if (选择模式 === "recent") { if (事件.detail <= 1) 切换选择项目(项目.resourceKey); }
                        else if ((singleTapNavigation() && 事件.detail <= 1) || 事件.detail === 0) void 打开最近项目(项目);
                      }}
                      onDoubleClick={() => {
                        if (!singleTapNavigation() && 选择模式 !== "recent") void 打开最近项目(项目);
                      }}
                      onContextMenu={(事件) => {
                        事件.preventDefault();
                        设置整理空白菜单(null);
                        设置最近菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                      }}

                    >
                      {选择模式 === "recent" && (
                        <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={tr`选择 ${项目.title}`}
                            checked={已选项目Key集合.has(项目.resourceKey)}
                            onChange={() => 切换选择项目(项目.resourceKey)}
                          />
                        </span>
                      )}
                      <span className={`resource-preview thumbnail-${缩略图.status}`}>
                        {缩略图.status === "loaded" && 缩略图.url ? (
                          <img
                            src={缩略图.url}
                            alt=""
                            loading="eager"
                            draggable={false}
                            onError={() => {
                              设置缩略图表((原表) => ({
                                ...原表,
                                [文件.path]: { status: "error", url: null },
                              }));
                            }}
                          />
                        ) : (
                          <span className="resource-icon-symbol">{信息.icon}</span>
                        )}
                        {渲染路径失效标记(文件.path)}


                        {渲染收藏按钮(收藏输入)}
                      </span>
                      <span className="resource-details">
                        <strong title={项目.title}>{项目.title}</strong>

                      </span>
                      <span className="resource-card-info">
                        {渲染桌面卡片元信息(文件, 阅读进度 ?? null, 可阅读页数, 缩略图)}
                        {渲染资源信息按钮({
                          kind: "resource",
                          input: 资源整理输入,
                          fileType: 文件.type,
                          progressText: 进度显示状态.文本,
                          thumbnailUrl: 缩略图.url,
                        })}
                      </span>
                      {!缩略图.itemCount && 进度显示状态.显示进度条 && (
                        <span className="resource-progress" aria-hidden="true">
                          <span className="resource-progress-track">
                            <span
                              className="resource-progress-fill"
                              style={{ width: `${进度显示状态.进度百分比}%` }}
                            />
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
                  </div>
                </div>
              </>
            )
          ) : 正在显示书架 ? (
            <div
              className="bookshelf-root-view" ref={列表容器} onScroll={目录连续列表.sync}
              onContextMenu={(事件) => {
                const 目标 = 事件.target;
                if (
                  目标 instanceof HTMLElement
                  && 目标.closest("button, input, select, textarea, .bookshelf-folder-card, .recent-context-menu")
                ) return;
                事件.preventDefault();
                设置书架空白菜单({ x: 事件.clientX, y: 事件.clientY });
              }}
            >
              <div
                ref={书架分类控件}
                className="bookshelf-category-strip"
                aria-label={t("书架分类")}
                data-tooltip-disabled
              >
                <button
                  ref={书架分类展开按钮}
                  type="button"
                  className={`bookshelf-category-label ${书架分类展开 ? "is-expanded" : ""}`}
                  aria-expanded={书架分类展开}
                  aria-controls="bookshelf-category-panel"
                  onClick={() => 设置书架分类展开((原状态) => !原状态)}
                  title={t("展开全部分类")}
                >
                  <span>{t("分类")}</span>
                  <span className="bookshelf-category-label-chevron" aria-hidden="true" />
                </button>
                <div
                  ref={书架分类轨道视口}
                  className={`bookshelf-category-viewport ${书架分类中键拖动中 ? "is-middle-dragging" : ""}`}
                  onWheel={处理书架分类滚轮}
                  onPointerDown={开始书架分类中键拖动}
                  onPointerMove={更新书架分类中键拖动}
                  onPointerUp={结束书架分类中键拖动}
                  onPointerCancel={结束书架分类中键拖动}
                  onLostPointerCapture={结束书架分类中键拖动}
                >
                  <span
                    className={`bookshelf-category-slot-marker ${书架分类轨道标记宽度 > 0 ? "is-visible" : ""}`}
                    style={{ width: 书架分类轨道标记宽度 }}
                    aria-hidden="true"
                  />
                  <div className="bookshelf-category-list" role="tablist" aria-label={t("书架分类轨道")}>
                    {轨道书架列表.map((书架) => 渲染书架分类项(书架, "rail"))}
                  </div>
                </div>
                <div className="bookshelf-category-actions">
                  <button
                    type="button"
                    className="bookshelf-category-add"
                    onClick={() => 打开书架弹窗({ mode: "create" })}
                    title={t("新建书架分类")}
                  >{t("＋ 新建分类")}</button>
                  <button
                    type="button"
                    className="primary-action bookshelf-create-button"
                    onClick={() => 打开虚拟文件夹弹窗({ mode: "create" })}
                  >{t("新建书架")}</button>
                </div>
                {书架分类展开 && (
                  <div
                    id="bookshelf-category-panel"
                    className={`bookshelf-category-panel ${书架分类面板拖拽源ID ? "is-sorting" : ""}`}
                    style={{
                      "--bookshelf-category-panel-columns": Math.min(6, Math.max(1, 书架列表.length)),
                    } as CSSProperties}
                  >
                    <div
                      ref={书架分类面板网格}
                      className="bookshelf-category-panel-grid"
                      role="tablist"
                      aria-label={t("全部书架分类")}
                    >
                      <span
                        className={`bookshelf-category-panel-selection ${书架分类面板选择框 ? "is-visible" : ""}`}
                        style={书架分类面板选择框 ? {
                          width: 书架分类面板选择框.width,
                          height: 书架分类面板选择框.height,
                          transform: `translate3d(${书架分类面板选择框.x}px, ${书架分类面板选择框.y}px, 0)`,
                        } : undefined}
                        aria-hidden="true"
                      />
                      {书架列表.map((书架) => 渲染书架分类项(书架, "panel"))}
                    </div>
                  </div>
                )}
              </div>

              {筛选后书架文件夹列表.length === 0 ? (
                <div className="empty-library compact-empty">
                  <div className="empty-illustration" aria-hidden="true"><AppIcon name="shelf"/></div>
                  <h2>{当前书架文件夹列表.length === 0 ? t("暂无书架") : t("没有匹配的书架")}</h2>
                  <p>{当前书架文件夹列表.length === 0 ? t("点击新建书架后，它会显示在当前书架栏中。") : t("请尝试清空搜索内容。")}</p>
                  <button
                    className="secondary-action empty-primary"
                    type="button"
                    onClick={() => {
                      if (当前书架文件夹列表.length === 0) 打开虚拟文件夹弹窗({ mode: "create" });
                      else 设置搜索内容("");
                    }}
                  >
                    {当前书架文件夹列表.length === 0 ? t("新建书架") : t("清空搜索")}
                  </button>
                </div>
              ) : (
                <div className={`bookshelf-folder-grid size-${缩略图尺寸} ${书架文件夹拖拽Key ? "is-card-middle-dragging" : ""}`} aria-label={t("书架列表")} style={手机连续样式} onWheel={处理网格滚轮}>
                  {当前页书架文件夹列表.map((文件夹) => {
                    const 预览资源 = 获取书架文件夹显示封面资源(文件夹);
                    const 缩略图 = 预览资源 ? 缩略图表[预览资源.sourcePath] : null;
                    const 是否有预览 = 缩略图?.status === "loaded" && !!缩略图.url;
                    const 第二预览资源 = 文件夹.items.find((项目) => 项目.resourceKey !== 预览资源?.resourceKey) ?? null;
                    const 第二缩略图 = 第二预览资源 ? 缩略图表[第二预览资源.sourcePath] : null;
                    const 是否有第二预览 = 第二缩略图?.status === "loaded" && !!第二缩略图.url;
                    const 最近更新 = new Date(文件夹.updatedAt || 文件夹.createdAt).toLocaleDateString("zh-CN");

                    if (手机布局) return <MobileBookshelfCard key={文件夹.id} id={文件夹.id} title={文件夹.name} sorting={手机书架排序} selecting={Boolean(手机书架管理)} selected={手机书架排序 || 手机选中书架.has(文件夹.id)} onSelect={() => 设置手机选中书架(old => {const next=new Set(old);if(next.has(文件夹.id))next.delete(文件夹.id);else next.add(文件夹.id);return next;})} onReorder={(from,to) => {const keys=筛选后书架文件夹列表.map(item=>item.id),start=keys.indexOf(from),end=keys.indexOf(to);if(start<0||end<0)return;keys.splice(start,1);keys.splice(end,0,from);void 保存书架文件夹拖拽顺序(文件夹.bookshelfId,keys);}} onOpen={() => 进入书架文件夹(文件夹)} onManage={() => {if(!手机书架排序){设置手机书架管理(文件夹);设置手机选中书架(old=>new Set([...old,文件夹.id]));}}}>
                      <div className="mobile-bookshelf-stack" aria-hidden="true">
                        {[预览资源,文件夹.items[1],文件夹.items[2]].map((item,index) => {
                          const cover=item ? 缩略图表[item.sourcePath] : undefined;
                          return <span key={index} className={`mobile-shelf-layer layer-${index+1} ${cover?.url ? "has-cover" : "is-glass"}`}>
                            {cover?.url ? <img src={cover.url} alt="" draggable={false}/> : index===0 ? <MobileIcon name="shelf"/> : null}
                          </span>;
                        })}
                      </div>
                      <div className="bookshelf-folder-info"><strong>{文件夹.name}</strong><span>{文件夹.items.length}{t(" 个资源")}</span></div>
                    </MobileBookshelfCard>;

                    return (
                      <article
                        key={文件夹.id}
                        data-card-drag-scope="shelf" data-card-drag-key={文件夹.id}
                        className={`bookshelf-folder-card ${书架文件夹拖拽Key === 文件夹.id ? "is-card-middle-drag-source" : ""} ${书架文件夹拖拽落点?.key === 文件夹.id ? `is-card-middle-drop-${书架文件夹拖拽落点.position}` : ""}`}
                        tabIndex={0}
                        onClick={() => { if (singleTapNavigation()) 进入书架文件夹(文件夹); }}
                        onDoubleClick={() => { if (!singleTapNavigation()) 进入书架文件夹(文件夹); }}
                        onMouseDown={(事件) => 开始书架文件夹中键拖拽(事件, 文件夹)}
                        onMouseEnter={(事件) => 开始资源备注悬停(`bookshelf-folder:${文件夹.id}`, 文件夹.note, 事件)}
                        onMouseMove={(事件) => {
                          更新资源备注悬停(`bookshelf-folder:${文件夹.id}`, 文件夹.note, 事件);
                        }}
                        onMouseLeave={隐藏书架备注悬浮窗}
                        onAuxClick={(事件) => {
                          if (事件.button === 1) 事件.preventDefault();
                        }}
                        onKeyDown={(事件) => {
                          if (事件.key === "Enter" || 事件.key === " ") {
                            事件.preventDefault();
                            进入书架文件夹(文件夹);
                          }
                        }}
                        onContextMenu={(事件) => {
                          事件.preventDefault();
                          事件.stopPropagation();
                          设置书架空白菜单(null);
                          设置虚拟文件夹菜单({ x: 事件.clientX, y: 事件.clientY, 项目: 文件夹 });
                        }}
                      >
                        <div className={`bookshelf-folder-shell ${是否有预览 ? "has-preview" : "is-empty"}`} aria-hidden="true">
                          <span className="bookshelf-folder-tab" />
                          {是否有第二预览 && (
                            <span className="bookshelf-folder-cover bookshelf-folder-cover-back">
                              <img src={第二缩略图.url ?? ""} alt="" draggable={false} />
                            </span>
                          )}
                          <span className="bookshelf-folder-cover">
                            {是否有预览 ? (
                              <img src={缩略图.url ?? ""} alt="" draggable={false} />
                            ) : (
                              <span className="bookshelf-folder-empty-mark"><AppIcon name="shelf"/></span>
                            )}
                          </span>
                          <span className="bookshelf-folder-front" />
                        </div>
                        <div className="bookshelf-folder-info">
                          <strong>{文件夹.name}</strong>
                          <span>{文件夹.items.length}{t(" 个资源")}{!手机布局 && tr` · 更新于 ${最近更新}`}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : 正在显示收藏 ? (
            收藏卡片项目.length === 0 ? (
              <div className="empty-library compact-empty">
                <div className="empty-illustration" aria-hidden="true"><AppIcon name="heart"/></div>
                <h2>{收藏列表.length === 0 ? t("暂无收藏") : t("没有匹配的收藏")}</h2>
                <p>{收藏列表.length === 0 ? t("在资源卡片右下角点击爱心后，收藏资源会显示在这里。") : t("请尝试清空搜索内容或选择全部标签。")}</p>
              </div>
            ) : (
              <>
                <div
                  ref={列表容器} onScroll={目录连续列表.sync}
                  className={`resource-list-scroll recent-resource-list-scroll ${选择模式 === "favorites" ? "is-selection-dragging-enabled" : ""} ${收藏拖拽Key ? "is-card-middle-dragging" : ""}`}
                  aria-label={t("收藏资源列表")}
                  onWheel={处理网格滚轮}
                  onMouseDown={(事件) => 开始框选(事件, "favorites")}
                  onMouseMove={更新框选}
                  onMouseUp={结束框选}
                  onMouseLeave={结束框选}
                  onContextMenu={(事件) => {
                    const 目标 = 事件.target;
                    if (
                      目标 instanceof HTMLElement
                      && 目标.closest("button, input, select, textarea, .recent-context-menu")
                    ) return;
                    事件.preventDefault();
                    设置收藏菜单(null);
                    设置整理空白菜单({ x: 事件.clientX, y: 事件.clientY, 视图: "favorites" });
                  }}
                >
                  <div className={`resource-list recent-resource-list size-${缩略图尺寸}`} style={手机连续样式}>
                {当前页收藏卡片项目.map(({ 项目, 文件 }) => {
                  const 信息 = 类型信息[文件.type];
                  const 阅读进度 = 阅读进度表[项目.resourceKey] ?? null;
                  const 可阅读页数Key = 获取可阅读页数Key(文件);
                  const 可阅读页数 = 可阅读页数Key ? 可阅读页数表[可阅读页数Key]?.count ?? null : null;
                  const 进度显示状态 = 获取卡片进度显示状态(
                    阅读进度,
                    可阅读页数,
                    进度文本模式,
                    显示进度条,
                  );
                  const 缩略图 = 缩略图表[文件.path] ?? {
                    status: 支持真实缩略图(文件.type) ? "loading" : "error",
                    url: null,
                  };
                  const 收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex"> = {
                    resourceKey: 项目.resourceKey,
                    sourcePath: 项目.sourcePath,
                    sourceType: 项目.sourceType,
                    title: 项目.title,
                  };
                  const 资源整理输入: ResourceMetaInput = {
                    resourceKey: 项目.resourceKey,
                    sourcePath: 项目.sourcePath,
                    sourceType: 项目.sourceType,
                    title: 项目.title,
                  };
                  const 整理信息 = 获取资源整理信息(资源整理输入, 项目);
                  const 路径失效 = 路径是否失效(文件.path);

                  if (手机布局) return 渲染手机资源卡片(文件, 资源整理输入, 项目.resourceKey, () => void 打开收藏项目(项目), 进度显示状态.文本?.replace(/第|页|章/g, "").trim() ?? (可阅读页数 ? String(可阅读页数) : ""), 整理信息.tags);
                  return (
                    <button
                      key={项目.resourceKey}
                      data-selection-key={项目.resourceKey}
                        data-card-drag-scope="favorite" data-card-drag-key={项目.resourceKey}
                      className={`resource-card resource-${文件.type} ${
                        进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                      } progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.resourceKey) ? "is-selected" : ""} ${路径失效 ? "is-path-invalid" : ""} ${收藏拖拽Key === 项目.resourceKey ? "is-card-middle-drag-source" : ""} ${收藏拖拽落点?.key === 项目.resourceKey ? `is-card-middle-drop-${收藏拖拽落点.position}` : ""}`}
                      onMouseDown={(事件) => 开始收藏中键拖拽(
                        事件,
                        项目,
                        信息.icon,
                        信息.label,
                        缩略图.status === "loaded" && 缩略图.url ? 缩略图.url : null,
                      )}
                      onMouseEnter={(事件) => 开始资源备注悬停(`favorite:${项目.resourceKey}`, 整理信息.note, 事件)}
                      onMouseMove={(事件) => {
                        更新资源备注悬停(`favorite:${项目.resourceKey}`, 整理信息.note, 事件);
                      }}
                      onMouseLeave={隐藏书架备注悬浮窗}
                      onAuxClick={(事件) => {
                        if (事件.button === 1) 事件.preventDefault();
                      }}
                      onClick={(事件) => {
                        if (框选后忽略点击(事件)) return;
                        if (选择模式 === "favorites") { if (事件.detail <= 1) 切换选择项目(项目.resourceKey); }
                        else if ((singleTapNavigation() && 事件.detail <= 1) || 事件.detail === 0) void 打开收藏项目(项目);
                      }}
                      onDoubleClick={() => {
                        if (!singleTapNavigation() && 选择模式 !== "favorites") void 打开收藏项目(项目);
                      }}
                      onContextMenu={(事件) => {
                        事件.preventDefault();
                        设置整理空白菜单(null);
                        设置收藏菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                      }}
                    >
                      {选择模式 === "favorites" && (
                        <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={tr`选择 ${项目.title}`}
                            checked={已选项目Key集合.has(项目.resourceKey)}
                            onChange={() => 切换选择项目(项目.resourceKey)}
                          />
                        </span>
                      )}
                      <span className={`resource-preview thumbnail-${缩略图.status}`}>
                        {缩略图.status === "loaded" && 缩略图.url ? (
                          <img
                            src={缩略图.url}
                            alt=""
                            loading="eager"
                            draggable={false}
                            onError={() => {
                              设置缩略图表((原表) => ({
                                ...原表,
                                [文件.path]: { status: "error", url: null },
                              }));
                            }}
                          />
                        ) : (
                          <span className="resource-icon-symbol">{信息.icon}</span>
                        )}
                        {渲染路径失效标记(文件.path)}


                        {渲染收藏按钮(收藏输入)}
                      </span>
                      <span className="resource-details">
                        <strong title={项目.title}>{项目.title}</strong>

                      </span>
                      <span className="resource-card-info">
                        {渲染桌面卡片元信息(文件, 阅读进度 ?? null, 可阅读页数, 缩略图)}
                        {渲染资源信息按钮({
                          kind: "resource",
                          input: 资源整理输入,
                          fileType: 文件.type,
                          progressText: 进度显示状态.文本,
                          thumbnailUrl: 缩略图.url,
                        })}
                      </span>
                      {!缩略图.itemCount && 进度显示状态.显示进度条 && (
                        <span className="resource-progress" aria-hidden="true">
                          <span className="resource-progress-track">
                            <span
                              className="resource-progress-fill"
                              style={{ width: `${进度显示状态.进度百分比}%` }}
                            />
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
                  </div>
                </div>
              </>
            )
          ) : 正在显示书签 ? (
            书签卡片项目.length === 0 ? (
              <div className="empty-library compact-empty">
                <div className="empty-illustration" aria-hidden="true"><AppIcon name="bookmark"/></div>
                <h2>{书签列表.length === 0 ? t("暂无书签") : t("没有匹配的书签")}</h2>
                <p>{书签列表.length === 0 ? t("在阅读器中点击页码旁的书签按钮后，当前页会显示在这里。") : t("请尝试清空搜索内容或选择全部标签。")}</p>
              </div>
            ) : (
              <>
                <div
                  ref={列表容器} onScroll={目录连续列表.sync}
                  className={`resource-list-scroll bookmark-list-scroll ${选择模式 === "bookmarks" ? "is-selection-dragging-enabled" : ""} ${书签拖拽Key ? "is-card-middle-dragging" : ""}`}
                  aria-label={t("书签卡片列表")}
                  onWheel={处理网格滚轮}
                  onMouseDown={(事件) => 开始框选(事件, "bookmarks")}
                  onMouseMove={更新框选}
                  onMouseUp={结束框选}
                  onMouseLeave={结束框选}
                  onContextMenu={(事件) => {
                    const 目标 = 事件.target;
                    if (
                      目标 instanceof HTMLElement
                      && 目标.closest("button, input, select, textarea, .recent-context-menu")
                    ) return;
                    事件.preventDefault();
                    设置书签菜单(null);
                    设置整理空白菜单({ x: 事件.clientX, y: 事件.clientY, 视图: "bookmarks" });
                  }}
                >
                  <div className={`resource-list bookmark-resource-list size-${缩略图尺寸}`} style={手机连续样式}>
                {当前页书签卡片项目.map(({ 项目, 文件 }) => {
                  const 信息 = 类型信息[文件.type];
                  const 缩略图 = 书签预览表[项目.id] ?? (
                    项目.thumbnailUrl
                      ? { status: "loaded" as const, url: 项目.thumbnailUrl }
                      : { status: "idle" as const, url: null }
                  );
                  const 页码文本 = `第 ${项目.pageIndex + 1} / ${项目.totalPages} ${项目.sourceType === "epub" ? "章" : "页"}`;
                  const 标签列表 = 获取整理标签(项目);
                  const 书签备注 = 获取整理备注(项目);
                  const 路径失效 = 路径是否失效(文件.path);
                  if (手机布局) return 渲染手机资源卡片(文件, { resourceKey: 项目.resourceKey, sourcePath: 项目.sourcePath, sourceType: 项目.sourceType, title: 项目.title }, 项目.id, () => void 打开书签项目(项目), `${项目.pageIndex + 1}/${项目.totalPages}`, 标签列表, 项目);
                  return (
                    <button
                      key={项目.id}
                      data-bookmark-card-id={项目.id}
                      data-selection-key={项目.id}
                        data-card-drag-scope="bookmark" data-card-drag-key={项目.id}
                      className={`resource-card bookmark-card resource-${文件.type} progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.id) ? "is-selected" : ""} ${路径失效 ? "is-path-invalid" : ""} ${书签拖拽Key === 项目.id ? "is-card-middle-drag-source" : ""} ${书签拖拽落点?.key === 项目.id ? `is-card-middle-drop-${书签拖拽落点.position}` : ""}`}
                      onMouseDown={(事件) => 开始书签中键拖拽(
                        事件,
                        项目,
                        信息.icon,
                        信息.label,
                        缩略图.status === "loaded" && 缩略图.url ? 缩略图.url : null,
                      )}
                      onMouseEnter={(事件) => 开始资源备注悬停(`bookmark:${项目.id}`, 书签备注, 事件)}
                      onMouseMove={(事件) => {
                        更新资源备注悬停(`bookmark:${项目.id}`, 书签备注, 事件);
                      }}
                      onMouseLeave={隐藏书架备注悬浮窗}
                      onAuxClick={(事件) => {
                        if (事件.button === 1) 事件.preventDefault();
                      }}
                      onClick={(事件) => {
                        if (框选后忽略点击(事件)) return;
                        if (选择模式 === "bookmarks") { if (事件.detail <= 1) 切换选择项目(项目.id); }
                        else if ((singleTapNavigation() && 事件.detail <= 1) || 事件.detail === 0) void 打开书签项目(项目);
                      }}
                      onDoubleClick={() => {
                        if (!singleTapNavigation() && 选择模式 !== "bookmarks") void 打开书签项目(项目);
                      }}
                      onContextMenu={(事件) => {
                        事件.preventDefault();
                        设置整理空白菜单(null);
                        设置书签菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                      }}
                    >
                      {选择模式 === "bookmarks" && (
                        <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={tr`选择 ${项目.title}`}
                            checked={已选项目Key集合.has(项目.id)}
                            onChange={() => 切换选择项目(项目.id)}
                          />
                        </span>
                      )}
                      <span className={`resource-preview thumbnail-${缩略图.status}`}>
                        {缩略图.status === "loaded" && 缩略图.url ? (
                          <img
                            src={缩略图.url}
                            alt=""
                            loading="eager"
                            draggable={false}
                            onError={() => {
                              书签预览状态Ref.current = {
                                ...书签预览状态Ref.current,
                                [项目.id]: { status: "error", url: null },
                              };
                              设置书签预览表((原表) => ({
                                ...原表,
                                [项目.id]: { status: "error", url: null },
                              }));
                            }}
                          />
                        ) : (
                          <span className="resource-icon-symbol">{信息.icon}</span>
                        )}
                        {渲染路径失效标记(文件.path)}


                      </span>
                      <span className="resource-details bookmark-card-details">
                        <strong title={项目.bookmarkTitle ?? 项目.title}>{项目.bookmarkTitle ?? 项目.title}</strong>

                      </span>
                      <span className="resource-card-info bookmark-card-info">
                        {渲染桌面卡片元信息(文件, null, null, 缩略图, 项目)}
                        {渲染资源信息按钮({
                          kind: "bookmark",
                          item: 项目,
                          fileType: 文件.type,
                          thumbnailUrl: 缩略图.url,
                        })}
                      </span>

                    </button>
                  );
                })}
                  </div>
                </div>
              </>
            )
          ) : 正在显示虚拟文件夹 ? (
            !当前虚拟文件夹 ? (
              <div className="empty-library compact-empty">
                <div className="empty-illustration" aria-hidden="true"><AppIcon name="shelf"/></div>
                <h2>{t("请选择书架")}</h2>
                <p>{t("返回书架栏后，")}{singleTapNavigation() ? t("点击") : t("双击")}{t("书架卡片进入内部资源视图。")}</p>
                <button className="secondary-action empty-primary" type="button" onClick={返回书架根层}>{t("返回书架")}</button>
              </div>
            ) : 虚拟文件夹卡片项目.length === 0 ? (
              <div
                className="empty-library compact-empty"
                onContextMenu={(事件) => {
                  事件.preventDefault();
                  if (当前虚拟文件夹) 设置书架内部空白菜单({ x: 事件.clientX, y: 事件.clientY });
                }}
              >
                <div className="empty-illustration" aria-hidden="true"><AppIcon name="shelf"/></div>
                <h2>{当前虚拟文件夹.items.length === 0 ? t("此书架为空") : t("没有匹配的资源")}</h2>
                <p>{当前虚拟文件夹.items.length === 0 ? t("在资源卡片右键菜单中选择加入书架。") : t("请尝试清空搜索内容或选择全部标签。")}</p>
              </div>
            ) : (
              <div
                ref={列表容器} onScroll={目录连续列表.sync}
                className={`resource-list-scroll recent-resource-list-scroll ${选择模式 === "virtual-folder" ? "is-selection-dragging-enabled" : ""} ${书架资源拖拽Key ? "is-card-middle-dragging" : ""}`}
                aria-label={t("书架资源列表")}
                onWheel={处理网格滚轮}
                onMouseDown={(事件) => 开始框选(事件, "virtual-folder")}
                onMouseMove={更新框选}
                onMouseUp={结束框选}
                onMouseLeave={结束框选}
                onContextMenu={(事件) => {
                  const 目标 = 事件.target;
                  if (
                    目标 instanceof HTMLElement
                    && 目标.closest("button, input, select, textarea, .recent-context-menu")
                  ) return;
                  事件.preventDefault();
                  设置书架内部空白菜单({ x: 事件.clientX, y: 事件.clientY });
                }}
              >
                <div className={`resource-list recent-resource-list size-${缩略图尺寸}`} style={手机连续样式}>
                  {当前页虚拟文件夹卡片项目.map(({ 项目, 文件 }) => {
                    const 信息 = 类型信息[文件.type];
                    const 阅读进度 = 阅读进度表[项目.resourceKey] ?? null;
                    const 可阅读页数Key = 获取可阅读页数Key(文件);
                    const 可阅读页数 = 可阅读页数Key ? 可阅读页数表[可阅读页数Key]?.count ?? null : null;
                    const 进度显示状态 = 获取卡片进度显示状态(
                      阅读进度,
                      可阅读页数,
                      进度文本模式,
                      显示进度条,
                    );
                    const 缩略图 = 缩略图表[文件.path] ?? {
                      status: 支持真实缩略图(文件.type) ? "loading" : "error",
                      url: null,
                    };
                    const 收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex"> | null =
                      文件.type === "folder" || 文件.type === "archive" || 文件.type === "image" || 文件.type === "pdf" || 文件.type === "epub"
                        ? {
                            resourceKey: 项目.resourceKey,
                            sourcePath: 项目.sourcePath,
                            sourceType: 文件.type === "pdf" || 文件.type === "epub" || 文件.type === "archive" ? 文件.type : "folder",
                            title: 项目.title,
                          }
                        : null;
                    const 资源整理输入: ResourceMetaInput = {
                      resourceKey: 项目.resourceKey,
                      sourcePath: 项目.sourcePath,
                      sourceType: 项目.sourceType,
                      title: 项目.title,
                    };
                    const 整理信息 = 获取资源整理信息(资源整理输入);
                    const 路径失效 = 路径是否失效(文件.path);

                    if (手机布局) return 渲染手机资源卡片(文件, 资源整理输入, 项目.resourceKey, () => void 打开虚拟文件夹项目(项目), 进度显示状态.文本?.replace(/第|页|章/g, "").trim() ?? (可阅读页数 ? String(可阅读页数) : ""), 整理信息.tags);
                  return (
                      <button
                        key={项目.id}
                        data-selection-key={项目.resourceKey}
                        data-card-drag-scope="resource" data-card-drag-key={项目.resourceKey}
                        className={`resource-card resource-${文件.type} ${
                          进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                        } progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.resourceKey) ? "is-selected" : ""} ${路径失效 ? "is-path-invalid" : ""} ${书架资源拖拽Key === 项目.resourceKey ? "is-card-middle-drag-source" : ""} ${书架资源拖拽落点?.key === 项目.resourceKey ? `is-card-middle-drop-${书架资源拖拽落点.position}` : ""}`}
                        onMouseDown={(事件) => 开始书架资源中键拖拽(
                          事件,
                          项目.resourceKey,
                          项目.title,
                          项目.sourcePath,
                          信息.icon,
                          信息.label,
                          缩略图.status === "loaded" && 缩略图.url ? 缩略图.url : null,
                        )}
                        onMouseEnter={(事件) => 开始资源备注悬停(`virtual-folder:${项目.resourceKey}`, 整理信息.note, 事件)}
                        onMouseMove={(事件) => {
                          更新资源备注悬停(`virtual-folder:${项目.resourceKey}`, 整理信息.note, 事件);
                        }}
                        onMouseLeave={隐藏书架备注悬浮窗}
                        onAuxClick={(事件) => {
                          if (事件.button === 1) 事件.preventDefault();
                        }}
                        onClick={(事件) => {
                          if (框选后忽略点击(事件)) return;
                          if (选择模式 === "virtual-folder") { if (事件.detail <= 1) 切换选择项目(项目.resourceKey); }
                          else if ((singleTapNavigation() && 事件.detail <= 1) || 事件.detail === 0) void 打开虚拟文件夹项目(项目);
                        }}
                        onDoubleClick={() => {
                          if (!singleTapNavigation() && 选择模式 !== "virtual-folder") void 打开虚拟文件夹项目(项目);
                        }}
                        onContextMenu={(事件) => {
                          事件.preventDefault();
                          设置虚拟文件夹资源菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                        }}
                      >
                        {选择模式 === "virtual-folder" && (
                          <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={tr`选择 ${项目.title}`}
                              checked={已选项目Key集合.has(项目.resourceKey)}
                              onChange={() => 切换选择项目(项目.resourceKey)}
                            />
                          </span>
                        )}
                        <span className={`resource-preview thumbnail-${缩略图.status}`}>
                          {缩略图.status === "loaded" && 缩略图.url ? (
                            <img
                              src={缩略图.url}
                              alt=""
                              loading="eager"
                              draggable={false}
                              onError={() => {
                                设置缩略图表((原表) => ({
                                  ...原表,
                                  [文件.path]: { status: "error", url: null },
                                }));
                              }}
                            />
                          ) : (
                            <span className="resource-icon-symbol">{信息.icon}</span>
                          )}
                          {渲染路径失效标记(文件.path)}


                          {渲染收藏按钮(收藏输入)}
                        </span>
                        <span className="resource-details">
                          <strong title={项目.title}>{项目.title}</strong>

                        </span>
                        <span className="resource-card-info">
                        {渲染桌面卡片元信息(文件, 阅读进度 ?? null, 可阅读页数, 缩略图)}
                        {渲染资源信息按钮({
                            kind: "resource",
                            input: 资源整理输入,
                            fileType: 文件.type,
                            progressText: 进度显示状态.文本,
                            thumbnailUrl: 缩略图.url,
                          })}
                      </span>
                        {!缩略图.itemCount && 进度显示状态.显示进度条 && (
                          <span className="resource-progress" aria-hidden="true">
                            <span className="resource-progress-track">
                              <span
                                className="resource-progress-fill"
                                style={{ width: `${进度显示状态.进度百分比}%` }}
                              />
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : 目录穿透搜索 && 筛选排序后项目.length === 0 && (全库索引.loading || 全库索引.error) ? (
            <div className="empty-library compact-empty" role="status"><div className="empty-illustration" aria-hidden="true"><AppIcon name="search"/></div><h2>{t(全库索引.error || "正在搜索资源库…")}</h2><p>{t("搜索范围包括当前资源库的全部子目录。")}</p></div>
          ) : 正在读取 && (!手机布局 || !当前目录) ? (
            手机布局 ? null : <div className="empty-library compact-empty">
              <div className="loading-mark" aria-hidden="true">…</div>
              <h2>{t("正在读取目录")}</h2>
              <p>{t("请稍候。")}</p>
            </div>
          ) : !当前目录 ? (
            <div className="empty-library">
              <div className="empty-illustration" aria-hidden="true"><AppIcon name="library"/></div>
              <h2>{t("从本地目录开始浏览")}</h2>
              <p>{document.documentElement.dataset.platform === "android" ? t("选择漫画目录，直接阅读图片、ZIP / CBZ、RAR / CBR、7z / CB7、PDF 和 EPUB。") : t("添加漫画目录后，这里会显示文件夹、图片、ZIP / CBZ、RAR / CBR、7z / CB7、PDF 和 EPUB。")}</p>
              <button className="primary-action empty-primary" onClick={() => void 添加目录()}>{t("添加漫画目录")}</button>
            </div>
          ) : !随机模式 && !目录穿透搜索 && 当前目录.items.length === 0 ? (
            <div className="empty-library compact-empty">
              <div className="empty-illustration" aria-hidden="true"><AppIcon name="library"/></div>
              <h2>{t("此文件夹为空")}</h2>
              <p>{t("可以返回上一级或切换资源库目录。")}</p>
            </div>
          ) : 筛选排序后项目.length === 0 ? (
            <div className="empty-library compact-empty">
              <div className="empty-illustration" aria-hidden="true"><AppIcon name="search"/></div>
              <h2>{t("没有匹配项目")}</h2>
              <p>{t("请尝试缩短关键词或清空搜索内容。")}</p>
              <button
                className="secondary-action empty-primary"
                onClick={() => {
                  设置搜索内容("");
                  回到第一页();
                }}
              >{t("清空搜索")}</button>
            </div>
          ) : (
            <div
              ref={列表容器}
              className={`resource-list-scroll is-continuous ${选择模式 === "directory" ? "is-selection-dragging-enabled" : ""}`}
              aria-label={t("当前目录文件列表")}
              onScroll={目录连续列表.sync}
              onMouseDown={(事件) => 开始框选(事件, "directory")}
              onMouseMove={更新框选}
              onMouseUp={结束框选}
              onMouseLeave={结束框选}
              onContextMenu={(事件) => {
                const 目标 = 事件.target;
                if (
                  目标 instanceof HTMLElement
                  && 目标.closest("button, input, select, textarea, .recent-context-menu")
                ) return;
                事件.preventDefault();
                设置目录空白菜单({ x: 事件.clientX, y: 事件.clientY });
              }}
            >
              <div className="library-virtual-canvas" style={{ height: 目录连续列表.height }}>
              <div className={`resource-list size-${缩略图尺寸}`} style={{ position: "absolute", top: 目录连续列表.offset }}>
              {当前页项目.map((文件, 可见索引) => {
                const 信息 = 类型信息[文件.type];
                const 资源Key = 获取文件资源Key(文件);
                const 阅读进度 = 资源Key ? 阅读进度表[资源Key] : null;
                const 可阅读页数Key = 获取可阅读页数Key(文件);
                const 可阅读页数 = 可阅读页数Key ? 可阅读页数表[可阅读页数Key]?.count ?? null : null;
                const 进度显示状态 = 获取卡片进度显示状态(
                  阅读进度,
                  可阅读页数,
                  进度文本模式,
                  显示进度条,
                );
                const 缩略图 = 缩略图表[文件.path] ?? {
                  status: 支持真实缩略图(文件.type) ? "loading" : "error",
                  url: null,
                };
                const 收藏输入 = 获取文件收藏输入(文件);
                const 资源整理输入 = 获取文件资源元数据输入(文件);
                const 整理信息 = 资源整理输入 ? 获取资源整理信息(资源整理输入) : null;
                if (手机布局 && 资源整理输入) return 渲染手机资源卡片(文件, { ...资源整理输入, title: 文件.name }, 文件.id, () => void 打开资源(文件), 进度显示状态.文本?.replace(/第|页|章/g, "").trim() ?? (可阅读页数 ? String(可阅读页数) : ""), 整理信息?.tags ?? [], undefined, 目录连续列表.start + 可见索引);
                  return (
                  <button
                    key={文件.id}
                    data-library-index={目录连续列表.start + 可见索引}
                    data-selection-key={文件.id}
                    className={`resource-card resource-${文件.type} ${
                      进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                    } progress-thickness-${进度条粗细} ${已选项目Key集合.has(文件.id) ? "is-selected" : ""}`}
                    onClick={(事件) => {
                      if (框选后忽略点击(事件)) return;
                      if (选择模式 === "directory") { if (事件.detail <= 1) 切换选择项目(文件.id); }
                      else if ((singleTapNavigation() && 事件.detail <= 1) || 事件.detail === 0) void 打开资源(文件);
                    }}
                    onDoubleClick={() => {
                      if (!singleTapNavigation() && 选择模式 !== "directory") void 打开资源(文件);
                    }}
                    onContextMenu={(事件) => {
                      if (!资源整理输入) return;
                      事件.preventDefault();
                      设置资源菜单({
                        x: 事件.clientX,
                        y: 事件.clientY,
                        input: 资源整理输入,
                        localPath: 文件.path,
                        fileType: 文件.type,
                        progressText: 进度显示状态.文本,
                        thumbnailUrl: 缩略图.url,
                        itemKey: 文件.id,
                      });
                    }}

                  >
                    {选择模式 === "directory" && (
                      <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={tr`选择 ${文件.name}`}
                          checked={已选项目Key集合.has(文件.id)}
                          onChange={() => 切换选择项目(文件.id)}
                        />
                      </span>
                    )}
                    <span
                      className={`resource-preview thumbnail-${缩略图.status}`}
                    >
                      {缩略图.status === "loaded" && 缩略图.url ? (
                        <img
                          src={缩略图.url}
                          alt=""
                          loading="eager"
                          draggable={false}
                          onError={() => {
                            设置缩略图表((原表) => ({
                              ...原表,
                              [文件.path]: { status: "error", url: null },
                            }));
                          }}
                        />
                      ) : (
                        <span className="resource-icon-symbol">{信息.icon}</span>
                      )}


                      {渲染收藏按钮(收藏输入)}
                    </span>
                    <span className="resource-details">
                      <strong title={文件.name}>{文件.name}</strong>
                      {文件.hasError && <em>{文件.errorMessage}</em>}
                    </span>
                    <span className="resource-card-info">
                        {渲染桌面卡片元信息(文件, 阅读进度 ?? null, 可阅读页数, 缩略图)}
                        {渲染资源信息按钮(资源整理输入 ? {
                        kind: "resource",
                        input: 资源整理输入,
                        localPath: 文件.path,
                        fileType: 文件.type,
                        progressText: 进度显示状态.文本,
                        thumbnailUrl: 缩略图.url,
                      } : null)}
                      </span>
                    {!缩略图.itemCount && 进度显示状态.显示进度条 && (
                      <span className="resource-progress" aria-hidden="true">
                        <span className="resource-progress-track">
                          <span
                            className="resource-progress-fill"
                            style={{ width: `${进度显示状态.进度百分比}%` }}
                          />
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
              </div>
              </div>
            </div>
          )}
        </div>

        {(是否显示分页 || 当前随机范围 || 当前视图 === "directory" || 正在显示虚拟文件夹 || (正在显示最近打开 && 是临时存放)) && (
        <footer className={`library-footer ${随机模式 ? "is-random-footer" : ""} ${是否显示分页 ? "has-pagination" : ""} ${总页数 <= 1 ? "is-single-page" : ""}`}>
          <div className="library-footer-actions">
            {正在显示最近打开 && 是临时存放 && <button type="button" className="primary-action add-library-button" onClick={() => void 直接打开文件()}><span aria-hidden="true">＋</span>{t(" 打开文件")}</button>}
            {当前视图 === "directory" && (
              <button type="button" className="primary-action add-library-button" onClick={() => void 添加目录()} disabled={正在读取}>
                <span aria-hidden="true">＋</span>{t("添加目录")}</button>
            )}
            {!手机布局 && 当前随机范围 && <div className="random-browse-actions">
              <RandomBrowseToggle active={随机模式} onChange={随机浏览.toggle}/>
              {随机模式 && <button type="button" className="random-redraw-button" aria-label={t("重随机")} title={t("重随机")} disabled={随机浏览.busy} onClick={() => void 随机浏览.redraw()}><RandomRefreshIcon busy={随机浏览.busy}/></button>}
            </div>}
            {当前视图 === "directory" && (
              <div className="root-library-dropdown" ref={根目录下拉容器}>
                <button
                  type="button"
                  className="root-library-trigger"
                  aria-label={t("切换资源目录")}
                  aria-haspopup="listbox"
                  aria-expanded={根目录下拉打开}
                  title={当前根目录项目?.path ?? t("切换资源目录")}
                  disabled={根目录列表.length === 0}
                  onClick={() => 设置根目录下拉打开((当前) => !当前)}
                >
                  <span>{当前根目录项目?.name ?? (根目录列表.length === 0 ? t("尚未添加目录") : t("选择资源目录"))}</span>
                  <span className="root-library-chevron" aria-hidden="true" />
                </button>
                {根目录下拉打开 && (
                  <div className="root-library-options" role="listbox" aria-label={t("资源目录列表")}>
                    {根目录列表.map((根目录) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={根目录.path === 当前根目录}
                        className={`root-library-option ${根目录.path === 当前根目录 ? "is-active" : ""} ${
                          根目录拖拽路径 === 根目录.path ? "is-middle-drag-source" : ""
                        } ${
                          根目录拖拽落点?.key === 根目录.path ? `is-middle-drop-${根目录拖拽落点.position}` : ""
                        }`}
                        title={根目录.path}
                        onClick={() => {
                          设置根目录下拉打开(false);
                          if (根目录.path !== 当前根目录) void 打开目录(根目录.path, 根目录.path);
                        }}
                        onMouseDown={(事件) => 开始根目录中键拖拽(事件, 根目录.path)}
                        onMouseEnter={(事件) => 更新根目录拖拽落点(事件, 根目录.path)}
                        onMouseMove={(事件) => 更新根目录拖拽落点(事件, 根目录.path)}
                        onAuxClick={(事件) => 事件.preventDefault()}
                        onContextMenu={(事件) => {
                          事件.preventDefault();
                          事件.stopPropagation();
                          设置根目录下拉打开(false);
                          设置待删除根目录(根目录);
                        }}
                      >
                        <span className="root-library-option-name">{根目录.name}</span>
                        {根目录.path === 当前根目录 && <span className="root-library-option-check" aria-hidden="true">✓</span>}
                      </button>
                    ))}
                    <p className="root-library-options-hint">{t("右键删除引用 · 中键拖动排序")}</p>
                  </div>
                )}
              </div>
            )}
            {(当前视图 === "directory" || 正在显示虚拟文件夹) && (
              <div className="navigation-actions footer-navigation-actions" role="group" aria-label={t("目录导航")}>

                {正在显示虚拟文件夹 && <button type="button" onClick={() => 返回书架根层()} title={t("返回书架")} aria-label={t("返回书架")}><ArrowIcon direction="left" /></button>}
                {当前视图 === "directory" && (
                  <button type="button" disabled={!可以返回} onClick={() => void 返回上一处()} title={t("返回")} aria-label={t("返回")}>
                    <ArrowIcon direction="left" />
                  </button>
                )}
                {当前视图 === "directory" && (
                  <button type="button" disabled={!可以前进} onClick={() => void 前进下一处()} title={t("前进")} aria-label={t("前进")}>
                    <ArrowIcon direction="right" />
                  </button>
                )}
              </div>
            )}
          </div>
          {手机布局 && 随机模式 && !手机操作目标 && !手机书架管理 && <nav className="mobile-page-pill is-random-pager" aria-label={t("随机阅读")}><button type="button" aria-label={t("重随机")} title={t("重随机")} disabled={随机浏览.busy} onClick={() => void 随机浏览.redraw()}>{t("重随机")}</button></nav>}
          {手机布局 && 是否显示分页 && !手机操作目标 && !手机书架管理 && <MobilePagePager current={安全当前页} total={总页数} onPage={跳转页码}/>}
          {!手机布局 && 是否显示分页 && (
            <div className="pagination-bar" aria-label={t("分页")}>
              <div className="desktop-inline-page-navigation">
                <button type="button" onClick={回到当前页顶部}>{t("顶部")}</button>
                <button disabled={安全当前页 === 1} onClick={() => 跳转页码(1)}>{t("首页")}</button>
                <button disabled={安全当前页 === 1} onClick={() => 跳转页码(安全当前页 - 1)}>{t("上一页")}</button>
              </div>
              <label className="page-input">
                <input
                  inputMode="numeric"
                  value={正在输入页码 ? 页码输入 : String(安全当前页)}
                  aria-label={t("当前页码")}
                  onFocus={() => { 设置页码输入(String(安全当前页)); 设置正在输入页码(true); }}
                  onChange={(事件) => 设置页码输入(事件.target.value.replace(/\D/g, ""))}
                  onBlur={() => { 设置正在输入页码(false); 应用页码输入(); }}
                  onKeyDown={(事件) => {
                    if (事件.key === "Enter") {
                      事件.preventDefault();
                      事件.currentTarget.blur();
                    }
                  }}
                />
              </label>
              <span>/ {总页数}</span>
              <div className="desktop-inline-page-navigation">
                <button disabled={安全当前页 === 总页数} onClick={() => 跳转页码(安全当前页 + 1)}>{t("下一页")}</button>
                <button disabled={安全当前页 === 总页数} onClick={() => 跳转页码(总页数)}>{t("尾页")}</button>
              </div>
              <div className="page-size-control">
                <span>{t("每页")}</span>
                <GlassSelect
                  value={每页数量}
                  options={uiOptions(每页数量下拉选项)}
                  ariaLabel={t("每页数量")}
                  className="page-size-glass-select"
                  onChange={(新每页数量) => {
                    设置每页数量(新每页数量);
                    保存界面设置({ pageSize: 新每页数量 });
                    if (当前视图 !== "directory") 回到第一页();
                  }}
                />
              </div>
            </div>
          )}
        </footer>
        )}
        {!手机布局 && (是否显示分页 || 选择模式) && <nav className="desktop-library-float" aria-label={t("资源列表悬浮操作")}>
          {选择模式 && <div className="desktop-floating-selection" role="group" aria-label={t("选择操作")}>
            <button type="button" aria-label={t("全选")} onClick={全选当前选择视图}><span>{t("全选")}</span><i><AppIcon name="select"/></i></button>
            <button type="button" aria-label={t("取消全选")} onClick={取消全选}><span>{t("取消全选")}</span><i><LibraryPageIcon name="clear"/></i></button>
            <button type="button" aria-label={t("退出选择")} onClick={退出选择模式}><span>{t("退出选择")}</span><i><AppIcon name="close"/></i></button>
          </div>}
          {是否显示分页 && <div className="desktop-page-navigation">
            <button type="button" aria-label={t("顶部")} onClick={回到当前页顶部}><span>{t("顶部")}</span><i><LibraryPageIcon name="top"/></i></button>
            <button type="button" aria-label={t("首页")} disabled={安全当前页 === 1} onClick={() => 跳转页码(1)}><span>{t("首页")}</span><i><LibraryPageIcon name="first"/></i></button>
            <button type="button" aria-label={t("上一页")} disabled={安全当前页 === 1} onClick={() => 跳转页码(安全当前页 - 1)}><span>{t("上一页")}</span><i><LibraryPageIcon name="previous"/></i></button>
            <button type="button" aria-label={t("下一页")} disabled={安全当前页 === 总页数} onClick={() => 跳转页码(安全当前页 + 1)}><span>{t("下一页")}</span><i><LibraryPageIcon name="next"/></i></button>
            <button type="button" aria-label={t("尾页")} disabled={安全当前页 === 总页数} onClick={() => 跳转页码(总页数)}><span>{t("尾页")}</span><i><LibraryPageIcon name="last"/></i></button>
          </div>}
        </nav>}
        </>}
        {手机布局 && 当前右侧抽屉 === "settings" && <MobileSettings settings={界面设置快照.current} displayScope={手机显示范围} onSaved={应用界面设置} onClose={关闭右侧抽屉} bookSettings={<BookReaderSettings preferred={资源详情阅读资源} onSaved={更新书籍阅读设置}/>}/>}
        {!手机布局 && 当前右侧抽屉 === "settings" && (
          <div
            className="settings-window-overlay"
            role="presentation"
            onPointerDown={(事件) => {
              if (事件.target === 事件.currentTarget) { consumeDismissGesture(事件.nativeEvent); 关闭右侧抽屉(); }
            }}
          >
            <section
              ref={设置窗口元素}
              className={`settings-window ${手机布局 ? `is-mobile-settings ${手机设置子页 ? "is-category-open" : ""}` : ""}`}
              style={{ transform: `translate3d(${设置窗口偏移.x}px, ${设置窗口偏移.y}px, 0)` }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onKeyDown={处理设置窗口键盘}
            >
              <header className="settings-window-header" onPointerDown={开始拖动设置窗口}>
                <h2 id="settings-title">{手机布局 && 手机设置子页 ? 设置分类选项.find(item => item.id === 当前设置分类)?.label : t("设置")}</h2>
                <button type="button" aria-label={t("关闭设置")} onClick={关闭右侧抽屉}>×</button>
              </header>

              <div className="settings-window-layout">
                <nav className="settings-category-nav" aria-label={t("设置分类")} role="tablist" aria-orientation="vertical">
                  {设置分类选项.filter(分类 => !手机布局 || 分类.id !== "progress").map((分类) => {
                    const 是当前分类 = 当前设置分类 === 分类.id;
                    return (
                      <button
                        id={`settings-category-${分类.id}`}
                        key={分类.id}
                        type="button"
                        role="tab"
                        className={`settings-category-button ${是当前分类 ? "is-active" : ""}`}
                        aria-selected={是当前分类}
                        aria-current={是当前分类 ? "page" : undefined}
                        aria-controls={`settings-section-${分类.id}`}
                        onClick={() => { 设置当前设置分类(分类.id); 设置手机设置子页(true); }}
                      >
                        <span>{t(分类.label)}</span>
                        <small>{t(分类.description)}</small>
                      </button>
                    );
                  })}
                </nav>

                <div className="settings-window-content" data-active-category={当前设置分类}>
                <section
                  id="settings-section-appearance"
                  className="settings-section"
                  role="tabpanel"
                  data-settings-category="appearance"
                  aria-labelledby="settings-category-appearance"
                  hidden={当前设置分类 !== "appearance"}
                >
                  <div className="settings-row"><span>{t('语言 / Language')}</span><GlassSelect ariaLabel="语言 / Language" value={界面语言} options={[{value:'zh-CN',label:'简体中文'},{value:'en',label:'English'},{value:'ja',label:'日本語'}]} onChange={value => 保存界面设置({language:normalizeLanguage(value)})}/></div>
                  <label className="settings-toggle"><input type="checkbox" checked={显示主界面} onChange={event => 保存界面设置({showHomePage:event.target.checked})}/><span>{t("显示主界面")}</span></label>
                  <div className="settings-row"><span>{t('全局字号')}</span><FontSizeControl label={t('全局字号')} value={全局字号} onChange={value => 保存界面设置({desktopGlobalFontSize:value, desktopInfoFontSize:信息字号})}/></div>
                  <div className="settings-row"><span>{t('页码与信息字号')}</span><FontSizeControl label={t('页码与信息字号')} value={信息字号} onChange={value => 保存界面设置({desktopInfoFontSize:value, desktopGlobalFontSize:全局字号})}/></div>
                  <HomeArtworkSettings />
                  <div className="settings-row mobile-hidden">
                    <span>{t("卡片尺寸")}</span>
                    <CardScaleControl label={t("卡片尺寸")} scope="library" value={卡片缩放}
                      motion={缩放动效.library}
                      onChange={value => 调整卡片缩放(value, "library")} onCommit={保存缩放设置} />
                  </div>
                  <h3>{t("主题配色")}</h3>
                  <div className="theme-options" role="radiogroup" aria-label={t("主题配色")}>
                    {主题选项.map((配色) => (
                      <label className={`theme-option ${当前主题配色 === 配色.id ? "is-selected" : ""}`} key={配色.id}>
                        <input
                          type="radio"
                          name="color-theme"
                          value={配色.id}
                          aria-label={t(配色.label)}
                          checked={当前主题配色 === 配色.id}
                          onChange={() => 保存界面设置({ colorTheme: 配色.id })}
                        />
                        <span className="theme-option-preview" data-color-theme={配色.id} aria-hidden="true">
                          <span className="theme-preview-sidebar"><i /><i /><i /></span>
                          <span className="theme-preview-content"><i /><i /><i /></span>
                          <span className="theme-preview-palette"><i /><i /><i /></span>
                        </span>
                        <span className="theme-option-title"><strong>{t(配色.label)}</strong><span aria-hidden="true">{当前主题配色 === 配色.id ? "✓" : ""}</span></span>
                        <span className="theme-option-description">{t(配色.description)}</span>
                      </label>
                    ))}
                  </div>
                </section>
                <section
                  id="settings-section-library"
                  className="settings-section"
                  role="tabpanel"
                  data-settings-category="library"
                  aria-labelledby="settings-category-library"
                  hidden={当前设置分类 !== "library"}
                >
                  <h3>{t("资源库设置")}</h3>

                  <div className="settings-row">
                    <span>{t("每页数量")}</span>
                    <GlassSelect
                      value={每页数量}
                      options={uiOptions(每页数量下拉选项)}
                      ariaLabel={t("每页数量")}
                      className="settings-glass-select"
                      onChange={(新每页数量) => {
                        设置每页数量(新每页数量);
                        保存界面设置({ pageSize: 新每页数量 });
                        if (当前视图 !== "directory") 回到第一页();
                      }}
                    />
                  </div>
                  <div className="settings-row">
                    <span>{t("最近阅读记录上限")}</span>
                    <GlassSelect
                      value={最近打开记录上限}
                      options={uiOptions(最近打开上限下拉选项)}
                      ariaLabel={t("最近阅读记录上限")}
                      className="settings-glass-select"
                      onChange={(新上限) => {
                        设置最近打开记录上限(新上限);
                        设置最近打开列表((原列表) => 原列表.slice(0, 新上限));
                        保存界面设置({ recentOpenedLimit: 新上限 }, 刷新最近打开);
                      }}
                    />
                  </div>
                  <div className="settings-row mobile-hidden">
                    <span>{t("默认排序")}</span>
                    <GlassSelect
                      value={排序}
                      options={uiOptions(排序方式选项)}
                      ariaLabel={t("默认排序")}
                      className="settings-glass-select"
                      onChange={(新排序) => {
                        设置排序(新排序);
                        保存界面设置({ sortMode: 新排序 });
                        回到第一页();
                      }}
                    />
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={文件夹优先}
                      onChange={(事件) => {
                        设置文件夹优先(事件.target.checked);
                        保存界面设置({ folderFirst: 事件.target.checked });
                        回到第一页();
                      }}
                    />
                    <span>{t("文件夹优先")}</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={隐藏已加入书架资源}
                      onChange={(事件) => {
                        设置隐藏已加入书架资源(事件.target.checked);
                        保存界面设置({ hideBookshelfItemsInLibrary: 事件.target.checked });
                        回到第一页();
                      }}
                    />
                    <span>{t("资源库隐藏已加入书架的资源")}</span>
                  </label>
                  <div className="settings-row mobile-hidden">
                    <span>{t("信息与标签面板透明度")}</span>
                    <GlassSelect
                      value={整理侧边栏透明度}
                      options={uiOptions(整理透明度下拉选项)}
                      ariaLabel={t("信息与标签面板透明度")}
                      className="settings-glass-select"
                      onChange={(新透明度) => {
                        设置整理侧边栏透明度(新透明度);
                        保存界面设置({ organizeDrawerOpacity: 新透明度 });
                      }}
                    />
                  </div>
                  <div className="settings-row mobile-hidden">
                    <span>{t("书架备注悬停延迟")}</span>
                    <GlassSelect
                      value={书架备注悬停延迟}
                      options={uiOptions(备注悬停延迟下拉选项)}
                      ariaLabel={t("书架备注悬停延迟")}
                      className="settings-glass-select"
                      onChange={(新延迟) => {
                        设置书架备注悬停延迟(新延迟);
                        保存界面设置({ bookshelfNoteHoverDelayMs: 新延迟 });
                      }}
                    />
                  </div>
                  <label className="settings-toggle">
                    <input type="checkbox" checked={空格分隔搜索条件} onChange={event => 保存界面设置({ searchSplitSpaces: event.target.checked })} />
                    <span>{t("空格分隔搜索条件")}</span>
                  </label>
                  <p className="settings-help">{t("默认保留关键词中的空格。开启后，空格分隔的条件必须同时满足。")}</p>
                  <div className="settings-row">
                    <span>{t("多条件匹配方式")}</span>
                    <GlassSelect
                      value={搜索模式}
                      options={uiOptions(搜索模式下拉选项)}
                      ariaLabel={t("多条件匹配方式")}
                      className="settings-glass-select"
                      onChange={更新标签搜索模式}
                    />
                  </div>
                  <p className="settings-help">{t("逗号分隔条件；| 表示满足任一条件。此设置也控制多个标签的筛选关系。")}</p>
                </section>

                <section
                  id="settings-section-progress"
                  className="settings-section"
                  role="tabpanel"
                  data-settings-category="progress"
                  aria-labelledby="settings-category-progress"
                  hidden={当前设置分类 !== "progress"}
                >
                  <h3>{t("进度显示设置")}</h3>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={显示进度条}
                      onChange={(事件) => {
                        设置显示进度条(事件.target.checked);
                        保存界面设置({ showProgressBar: 事件.target.checked });
                      }}
                    />
                    <span>{t("显示进度条")}</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={显示进度文本}
                      onChange={(事件) => {
                        设置显示进度文本(事件.target.checked);
                        保存界面设置({ showProgressText: 事件.target.checked });
                      }}
                    />
                    <span>{t("显示进度文本")}</span>
                  </label>
                  <div className="settings-row">
                    <span>{t("进度文本模式")}</span>
                    <GlassSelect
                      value={进度文本模式}
                      options={uiOptions(进度文本模式下拉选项)}
                      ariaLabel={t("进度文本模式")}
                      className="settings-glass-select"
                      disabled={!显示进度文本}
                      onChange={(新模式) => {
                        设置进度文本模式(新模式);
                        保存界面设置({ progressTextMode: 新模式 });
                      }}
                    />
                  </div>
                  <div className="settings-row">
                    <span>{t("进度条粗细")}</span>
                    <GlassSelect
                      value={进度条粗细}
                      options={uiOptions(进度条粗细下拉选项)}
                      ariaLabel={t("进度条粗细")}
                      className="settings-glass-select"
                      disabled={!显示进度条}
                      onChange={(新粗细) => {
                        设置进度条粗细(新粗细);
                        保存界面设置({ progressBarThickness: 新粗细 });
                      }}
                    />
                  </div>
                </section>

                <section
                  id="settings-section-safety"
                  className="settings-section"
                  role="tabpanel"
                  data-settings-category="safety"
                  aria-labelledby="settings-category-safety"
                  hidden={当前设置分类 !== "safety"}
                >
                  <h3>{t("安全与确认")}</h3>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={删除前确认设置.favorites}
                      onChange={(事件) => {
                        const 新设置 = { ...删除前确认设置, favorites: 事件.target.checked };
                        设置删除前确认设置(新设置);
                        保存界面设置({ confirmBeforeBatchDelete: 新设置 });
                      }}
                    />
                    <span>{t("收藏批量删除前确认")}</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={删除前确认设置.bookmarks}
                      onChange={(事件) => {
                        const 新设置 = { ...删除前确认设置, bookmarks: 事件.target.checked };
                        设置删除前确认设置(新设置);
                        保存界面设置({ confirmBeforeBatchDelete: 新设置 });
                      }}
                    />
                    <span>{t("书签批量删除前确认")}</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={删除前确认设置.recent}
                      onChange={(事件) => {
                        const 新设置 = { ...删除前确认设置, recent: 事件.target.checked };
                        设置删除前确认设置(新设置);
                        保存界面设置({ confirmBeforeBatchDelete: 新设置 });
                      }}
                    />
                    <span>{t("最近阅读批量删除前确认")}</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={删除标签前确认}
                      onChange={(事件) => {
                        设置删除标签前确认(事件.target.checked);
                        保存界面设置({ confirmBeforeDeleteTags: 事件.target.checked });
                      }}
                    />
                    <span>{t("删除标签前确认")}</span>
                  </label>
                </section>

                <section
                  id="settings-section-reader-default"
                  className="settings-section"
                  role="tabpanel"
                  data-settings-category="reader-default"
                  aria-labelledby="settings-category-reader-default"
                  hidden={当前设置分类 !== "reader-default"}
                >
                  <h3>{t("默认阅读界面")}</h3>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={默认开启全景}
                      onChange={(事件) => {
                        设置默认开启全景(事件.target.checked);
                        保存界面设置({ readerDefaultPanorama: 事件.target.checked });
                      }}
                    />
                    <span>{t("默认开启全景模式")}</span>
                  </label>
                  <label className="settings-toggle mobile-hidden">
                    <input
                      type="checkbox"
                      checked={默认开启沉浸}
                      onChange={(事件) => {
                        设置默认开启沉浸(事件.target.checked);
                        保存界面设置({ readerDefaultImmersive: 事件.target.checked });
                      }}
                    />
                    <span>{t("默认开启沉浸模式")}</span>
                  </label>
                  <div className="settings-row">
                    <span>{t("默认阅读流向")}</span>
                    <GlassSelect
                      value={阅读器默认流向}
                      options={uiOptions(阅读流向下拉选项)}
                      ariaLabel={t("默认阅读流向")}
                      className="settings-glass-select"
                      onChange={(新流向) => {
                        设置阅读器默认流向(新流向);
                        保存界面设置({ readerDefaultFlow: 新流向 });
                      }}
                    />
                  </div>
                  <div className="settings-row">
                    <span>{t("默认单双页")}</span>
                    <GlassSelect
                      value={阅读器默认页模式}
                      options={uiOptions(阅读页模式下拉选项)}
                      ariaLabel={t("默认单双页")}
                      className="settings-glass-select"
                      onChange={(新模式) => {
                        设置阅读器默认页模式(新模式);
                        保存界面设置({ readerPageMode: 新模式 });
                      }}
                    />
                  </div>
                  <div className="settings-row">
                    <span>{t("默认翻页方向")}</span>
                    <GlassSelect
                      value={双页阅读方向}
                      options={uiOptions(翻页方向下拉选项)}
                      ariaLabel={t("默认翻页方向")}
                      className="settings-glass-select"
                      onChange={(新方向) => {
                        设置双页阅读方向(新方向);
                        保存界面设置({ doublePageDirection: 新方向 });
                      }}
                    />
                  </div>
                  <div className="settings-row">
                    <span>{t("默认缩放模式")}</span>
                    <GlassSelect
                      value={阅读器默认缩放模式}
                      options={uiOptions(缩放模式下拉选项)}
                      ariaLabel={t("默认缩放模式")}
                      className="settings-glass-select"
                      onChange={(新模式) => {
                        设置阅读器默认缩放模式(新模式);
                        保存界面设置({ readerDefaultFitMode: 新模式 });
                      }}
                    />
                  </div>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={智能识别跨页图}
                      onChange={(事件) => {
                        设置智能识别跨页图(事件.target.checked);
                        保存界面设置({ smartDetectSpreadPage: 事件.target.checked });
                      }}
                    />
                    <span>{t("智能识别跨页图：")}{智能识别跨页图 ? t("开") : t("关")}</span>
                  </label>
                </section>

                <section
                  id="settings-section-reader"
                  className="settings-section"
                  role="tabpanel"
                  data-settings-category="reader"
                  aria-labelledby="settings-category-reader"
                  hidden={当前设置分类 !== "reader"}
                >
                  <h3>{t("漫画阅读设置")}</h3>
                  {isAndroid() && <div className="mobile-volume-settings">
                    <label className="settings-toggle"><input type="checkbox" checked={音量键翻页} onChange={event => { 设置音量键翻页(event.target.checked); 保存界面设置({ readerVolumeKeys: event.target.checked }); }} /><span>{t("音量键翻页")}</span></label>
                    <p>{t("阅读时，音量＋上一页、音量－下一页。退出阅读后恢复调节音量。")}</p>
                    <label className="settings-toggle"><input type="checkbox" checked={反转音量键} disabled={!音量键翻页} onChange={event => { 设置反转音量键(event.target.checked); 保存界面设置({ readerVolumeKeysReversed: event.target.checked }); }} /><span>{t("反转音量键翻页方向")}</span></label>
                  </div>}
                  {!手机布局 && 当前设置分类 === "reader" && <BookReaderSettings preferred={资源详情阅读资源} onSaved={更新书籍阅读设置} />}


                  <label className="settings-toggle mobile-hidden">
                    <input
                      type="checkbox"
                      checked={滚轮翻页}
                      onChange={(事件) => {
                        设置滚轮翻页(事件.target.checked);
                        保存界面设置({ wheelPageTurn: 事件.target.checked });
                      }}
                    />
                    <span>{t("鼠标滚轮翻页")}</span>
                  </label>
                  <label className="settings-toggle mobile-hidden">
                    <input
                      type="checkbox"
                      checked={隐藏阅读器底部按钮}
                      onChange={(事件) => {
                        设置隐藏阅读器底部按钮(事件.target.checked);
                        保存界面设置({ readerHideFooterControls: 事件.target.checked });
                      }}
                    />
                    <span>{t("阅读器隐藏底部按钮")}</span>
                  </label>
                  <label className="settings-toggle mobile-hidden">
                    <input
                      type="checkbox"
                      checked={隐藏沉浸模式进度条}
                      onChange={(事件) => {
                        设置隐藏沉浸模式进度条(事件.target.checked);
                        保存界面设置({ readerHideImmersiveProgress: 事件.target.checked });
                      }}
                    />
                    <span>{t("沉浸模式隐藏进度条")}</span>
                  </label>
                  <div className="settings-row">
                    <span>{t("自动隐藏延迟")}</span>
                    <GlassSelect
                      value={沉浸自动隐藏延迟}
                      options={uiOptions(沉浸隐藏延迟下拉选项)}
                      ariaLabel={t("沉浸模式自动隐藏延迟")}
                      className="settings-glass-select"
                      onChange={(新延迟) => {
                        设置沉浸自动隐藏延迟(新延迟);
                        保存界面设置({ immersiveAutoHideDelay: 新延迟 });
                      }}
                    />
                  </div>
                  <label className="settings-toggle"><input type="checkbox" checked={桌面自动隐藏} onChange={event=>保存界面设置({desktopReaderAutoHide:event.target.checked})}/><span>{t('普通阅读工具栏自动隐藏')}</span></label>
                  <div className="settings-row mobile-hidden">
                    <span>{t("上/下一篇按钮透明度")}</span>
                    <GlassSelect
                      value={图书切换按钮透明度}
                      options={uiOptions(图书按钮透明度下拉选项)}
                      ariaLabel={t("上/下一篇按钮透明度")}
                      className="settings-glass-select"
                      onChange={(新透明度) => {
                        设置图书切换按钮透明度(新透明度);
                        保存界面设置({ bookSwitchButtonOpacity: 新透明度 });
                      }}
                    />
                  </div>
                </section>
                <section id="settings-section-performance" className="settings-section" role="tabpanel" data-settings-category="performance" aria-labelledby="settings-category-performance" hidden={当前设置分类 !== "performance"}>
                  <h3>{t("性能与缓存")}</h3>
                  <div className="settings-row"><span>{t('阅读性能')}</span><GlassSelect value={桌面性能模式} ariaLabel={t('阅读性能')} options={uiOptions([{value:'auto' as const,label:'自动'},{value:'balanced' as const,label:'均衡'},{value:'high' as const,label:'高性能'},{value:'custom' as const,label:'自定义'}])} onChange={value=>保存界面设置({desktopPerformanceProfile:value})}/></div>

                  <label className="settings-row">
                    <span>{t("图片缓存预算（估算 MB）")}</span>
                    <input
                      type="number"
                      min={0}
                      max={16384}
                      step={50}
                      value={阅读器内存缓存大小}
                      aria-label={t("图片缓存预算（估算 MB）")}
                      title={t("0 表示仅保留当前可见页；该数值为图片数据与解码位图的估算预算")}
                      onChange={(事件) => {
                        const 新大小 = Math.min(Math.max(Math.round(Number(事件.target.value) || 0), 0), 16384);
                        设置阅读器内存缓存大小(新大小);
                        保存界面设置({ readerMemoryCacheSizeMb: 新大小 });
                      }}
                    />
                  </label>
                  <label className="settings-row">
                    <span>{t("阅读预加载页数")}</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step={1}
                      value={阅读器预加载页数}
                      aria-label={t("阅读预加载页数")}
                      title={t("0 表示关闭预加载")}
                      onChange={(事件) => {
                        const 新页数 = Math.min(Math.max(Math.round(Number(事件.target.value) || 0), 0), 120);
                        设置阅读器预加载页数(新页数);
                        保存界面设置({ readerPreloadPages: 新页数 });
                      }}
                    />
                  </label>
                  <label className="settings-row">
                    <span>{t("图片并发加载数")}</span>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      step={1}
                      value={阅读器图片线程数}
                      aria-label={t("图片并发加载数")}
                      title={t("限制阅读器同时进行的图片读取请求数量")}
                      onChange={(事件) => {
                        const 新线程数 = Math.min(Math.max(Math.round(Number(事件.target.value) || 1), 1), 24);
                        设置阅读器图片线程数(新线程数);
                        保存界面设置({ readerImageLoadConcurrency: 新线程数 });
                      }}
                    />
                  </label>
                </section>
                <section id="settings-section-about" className="settings-section" role="tabpanel" data-settings-category="about" aria-labelledby="settings-category-about" hidden={当前设置分类 !== "about"}>
                  <AboutOmiComic active={当前设置分类 === "about"} />
                </section>
              </div>
              </div>
            </section>
          </div>
        )}
        {当前右侧抽屉 === "tag-filter" && 渲染标签筛选抽屉()}
        {完整标签浮层 && createPortal(
          <div className="preview-tag-popover" style={完整标签浮层.style} role="dialog" aria-label={t("隐藏标签列表")}>
            {完整标签浮层.tags.map((标签) => (
              <span className="preview-tag-popover-chip" key={标签}>{标签}</span>
            ))}
          </div>,
          document.body,
        )}
        {框选 && createPortal(
          <div
            className="selection-marquee"
            style={{
              left: 获取框选矩形(框选).left,
              top: 获取框选矩形(框选).top,
              width: 获取框选矩形(框选).width,
              height: 获取框选矩形(框选).height,
            }}
            aria-hidden="true"
          />,
          document.body,
        )}
        {中键拖拽悬浮卡片 && createPortal(
          <div
            className={`middle-drag-floating-card middle-drag-floating-${中键拖拽悬浮卡片.kind} ${
              中键拖拽悬浮卡片.kind === "resource" ? "resource-card" : "bookshelf-folder-card"
            }`}
            style={{
              left: 中键拖拽悬浮卡片.x,
              top: 中键拖拽悬浮卡片.y,
            }}
            aria-hidden="true"
          >
            {中键拖拽悬浮卡片.kind === "resource" ? (
              <>
                <span className={`resource-preview thumbnail-${中键拖拽悬浮卡片.thumbnailUrl ? "loaded" : "error"}`}>
                  {中键拖拽悬浮卡片.thumbnailUrl ? (
                    <img src={中键拖拽悬浮卡片.thumbnailUrl} alt="" draggable={false} />
                  ) : (
                    <span className="resource-icon-symbol">{中键拖拽悬浮卡片.icon}</span>
                  )}
                </span>
                <span className="resource-details">
                  <strong title={中键拖拽悬浮卡片.title}>{中键拖拽悬浮卡片.title}</strong>

                </span>
                <span className="resource-card-info">

                </span>
              </>
            ) : (
              <>
                <div className={`bookshelf-folder-shell ${中键拖拽悬浮卡片.thumbnailUrl ? "has-preview" : "is-empty"}`} aria-hidden="true">
                  <span className="bookshelf-folder-tab" />
                  <span className="bookshelf-folder-cover">
                    {中键拖拽悬浮卡片.thumbnailUrl ? (
                      <img src={中键拖拽悬浮卡片.thumbnailUrl} alt="" draggable={false} />
                    ) : (
                      <span className="bookshelf-folder-empty-mark"><AppIcon name="shelf"/></span>
                    )}
                  </span>
                  <span className="bookshelf-folder-front" />
                </div>
                <div className="bookshelf-folder-info">
                  <strong>{中键拖拽悬浮卡片.title}</strong>
                  <span>{中键拖拽悬浮卡片.subtitle}</span>
                </div>
              </>
            )}
          </div>,
          document.body,
        )}
        {根目录菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 根目录菜单.x, top: 根目录菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                设置待删除根目录(根目录菜单.项目);
                设置根目录菜单(null);
              }}
            >{t("移除此资源库目录")}</button>
          </div>
        )}
        {目录空白菜单 && 当前选择视图 === "directory" && (
          <div
            className="recent-context-menu"
            style={{ left: 目录空白菜单.x, top: 目录空白菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              disabled={当前选择视图Key列表.length === 0}
              onClick={() => {
                进入当前视图选择模式();
                设置目录空白菜单(null);
              }}
            >{t("选择文件")}</button>
            {选择模式 === "directory" && 已选项目Key集合.size > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void 批量加入收藏(获取已选资源输入("directory"), `已选择 ${已选项目Key集合.size} 个资源`);
                  设置目录空白菜单(null);
                }}
              >{t("加入收藏")}</button>
            )}
          </div>
        )}
        {整理空白菜单 && 当前选择视图 === 整理空白菜单.视图 && (
          <div
            className="recent-context-menu"
            style={{ left: 整理空白菜单.x, top: 整理空白菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              disabled={当前选择视图Key列表.length === 0}
              onClick={() => {
                进入选择模式(整理空白菜单.视图);
                设置整理空白菜单(null);
              }}
            >{t("选择文件")}</button>
          </div>
        )}
        {资源菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 资源菜单.x, top: 资源菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => { 设置本地文件目标({ path: 资源菜单.localPath, title: 资源菜单.input.title, mode: "rename" }); 设置资源菜单(null); }}>{t("重命名本地文件")}</button>
            <button type="button" role="menuitem" onClick={() => { 设置本地文件目标({ path: 资源菜单.localPath, title: 资源菜单.input.title, mode: "delete" }); 设置资源菜单(null); }}>{t("删除资源…")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开资源详情页面({
                  kind: "resource",
                  input: 资源菜单.input,
                  localPath: 资源菜单.localPath,
                  fileType: 资源菜单.fileType,
                  progressText: 资源菜单.progressText,
                  thumbnailUrl: 资源菜单.thumbnailUrl,
                });
                设置资源菜单(null);
              }}
            >{t("查看资源信息")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 目标 = 获取目录资源右键整理目标(资源菜单.input, 资源菜单.itemKey);
                void 批量加入收藏(目标.items, 目标.title);
                设置资源菜单(null);
              }}
            >{t("加入收藏")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 目标 = 获取目录资源右键整理目标(资源菜单.input, 资源菜单.itemKey);
                选择已有虚拟文件夹加入(目标.items, 目标.title, { x: 资源菜单.x, y: 资源菜单.y });
                设置资源菜单(null);
              }}
            >{t("加入书架")}</button>
          </div>
        )}
        {最近菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 最近菜单.x, top: 最近菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => { 设置本地文件目标({path:最近菜单.项目.sourcePath,title:最近菜单.项目.title,mode:"rename"}); 设置最近菜单(null); }}>{t("重命名本地文件")}</button>
            <button
              type="button"
              role="menuitem"
              disabled={当前选择视图Key列表.length === 0}
              onClick={() => {
                进入当前视图选择模式();
                设置最近菜单(null);
              }}
            >{t("选择文件")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开资源详情页面({
                  kind: "resource",
                  input: {
                    resourceKey: 最近菜单.项目.resourceKey,
                    sourcePath: 最近菜单.项目.sourcePath,
                    sourceType: 最近菜单.项目.sourceType,
                    title: 最近菜单.项目.title,
                  },
                  fileType: 最近菜单.项目.sourceType,
                  progressText: null,
                  thumbnailUrl: 缩略图表[最近菜单.项目.sourcePath]?.url ?? null,
                });
                设置最近菜单(null);
              }}
            >{t("查看资源信息")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                复制路径(最近菜单.项目.sourcePath);
                设置最近菜单(null);
              }}
            >{t("复制原路径")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 使用选中项 = 选择模式 === "recent"
                  && 已选项目Key集合.size > 0
                  && 已选项目Key集合.has(最近菜单.项目.resourceKey);
                const items = 使用选中项
                  ? 获取已选资源输入("recent")
                  : [{
                      resourceKey: 最近菜单.项目.resourceKey,
                      sourcePath: 最近菜单.项目.sourcePath,
                      sourceType: 最近菜单.项目.sourceType,
                      title: 最近菜单.项目.title,
                    }];
                void 批量加入收藏(items, 使用选中项 ? `已选择 ${items.length} 个资源` : 最近菜单.项目.title);
                设置最近菜单(null);
              }}
            >{t("加入收藏")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                选择已有虚拟文件夹加入([{
                  resourceKey: 最近菜单.项目.resourceKey,
                  sourcePath: 最近菜单.项目.sourcePath,
                  sourceType: 最近菜单.项目.sourceType,
                  title: 最近菜单.项目.title,
                }], 最近菜单.项目.title, { x: 最近菜单.x, y: 最近菜单.y });
                设置最近菜单(null);
              }}
            >{t("加入书架")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                请求右键删除记录("recent", 最近菜单.项目.resourceKey);
                设置最近菜单(null);
              }}
            >
              {是临时存放 ? t("删除临时引用") : 选择模式 === "recent" && 已选项目Key集合.has(最近菜单.项目.resourceKey) && 已选项目Key集合.size > 1
                ? tr`删除选中的 ${已选项目Key集合.size} 条最近记录`
                : t("删除此最近记录")}
            </button>
            {是临时存放 && <button type="button" role="menuitem" onClick={() => void 临时文件目录加入资源库(最近菜单.项目)}>{t("将所在目录加入资源库")}</button>}
          </div>
        )}
        {收藏菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 收藏菜单.x, top: 收藏菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => { 设置本地文件目标({path:收藏菜单.项目.sourcePath,title:收藏菜单.项目.title,mode:"rename"}); 设置收藏菜单(null); }}>{t("重命名本地文件")}</button>
            <button
              type="button"
              role="menuitem"
              disabled={当前选择视图Key列表.length === 0}
              onClick={() => {
                进入当前视图选择模式();
                设置收藏菜单(null);
              }}
            >{t("选择文件")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开资源详情页面({
                  kind: "resource",
                  input: {
                    resourceKey: 收藏菜单.项目.resourceKey,
                    sourcePath: 收藏菜单.项目.sourcePath,
                    sourceType: 收藏菜单.项目.sourceType,
                    title: 收藏菜单.项目.title,
                  },
                  fileType: 收藏菜单.项目.sourceType,
                  progressText: null,
                  thumbnailUrl: 缩略图表[收藏菜单.项目.sourcePath]?.url ?? null,
                });
                设置收藏菜单(null);
              }}
            >{t("查看资源信息")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                复制路径(收藏菜单.项目.sourcePath);
                设置收藏菜单(null);
              }}
            >{t("复制原路径")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 调整收藏项目顺序(收藏菜单.项目.resourceKey, "top")}
            >{t("置顶")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 调整收藏项目顺序(收藏菜单.项目.resourceKey, "bottom")}
            >{t("置底")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                选择已有虚拟文件夹加入([{
                  resourceKey: 收藏菜单.项目.resourceKey,
                  sourcePath: 收藏菜单.项目.sourcePath,
                  sourceType: 收藏菜单.项目.sourceType,
                  title: 收藏菜单.项目.title,
                }], 收藏菜单.项目.title, { x: 收藏菜单.x, y: 收藏菜单.y });
                设置收藏菜单(null);
              }}
            >{t("加入书架")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                请求右键删除记录("favorites", 收藏菜单.项目.resourceKey);
                设置收藏菜单(null);
              }}
            >
              {选择模式 === "favorites" && 已选项目Key集合.has(收藏菜单.项目.resourceKey) && 已选项目Key集合.size > 1
                ? tr`移除选中的 ${已选项目Key集合.size} 条收藏`
                : t("移除收藏")}
            </button>
          </div>
        )}
        {书架菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 书架菜单.x, top: 书架菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                开始内联编辑书架栏(书架菜单.项目);
                设置书架菜单(null);
              }}
            >{t("重命名书架栏")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                请求删除书架栏(书架菜单.项目);
              }}
            >
              {已选书架栏ID集合.has(书架菜单.项目.id) && 获取已选书架栏列表().length > 1
                ? tr`删除选中的 ${获取已选书架栏列表().length} 个书架栏`
                : t("删除书架栏")}
            </button>
          </div>
        )}
        {书架栏空白菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 书架栏空白菜单.x, top: 书架栏空白菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开书架弹窗({ mode: "create" });
                设置书架栏空白菜单(null);
              }}
            >{t("新增书架栏")}</button>
          </div>
        )}
        {虚拟文件夹菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 虚拟文件夹菜单.x, top: 虚拟文件夹菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开虚拟文件夹弹窗({ mode: "rename", folder: 虚拟文件夹菜单.项目 });
                设置虚拟文件夹菜单(null);
              }}
            >{t("重命名")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开虚拟文件夹弹窗({ mode: "note", folder: 虚拟文件夹菜单.项目 });
                设置虚拟文件夹菜单(null);
              }}
            >{t("编辑备注")}</button>
            <button
              type="button"
              role="menuitem"
              disabled={!虚拟文件夹菜单.项目.coverResourceKey}
              onClick={() => void 清除书架设定封面(虚拟文件夹菜单.项目)}
            >{t("清除设定封面")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                设置待删除虚拟文件夹(虚拟文件夹菜单.项目);
                设置虚拟文件夹菜单(null);
              }}
            >{t("删除")}</button>
          </div>
        )}
        {书架空白菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 书架空白菜单.x, top: 书架空白菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开虚拟文件夹弹窗({ mode: "create" });
                设置书架空白菜单(null);
              }}
            >{t("新建书架")}</button>
          </div>
        )}
        {书架内部空白菜单 && 当前虚拟文件夹 && (
          <div
            className="recent-context-menu"
            style={{ left: 书架内部空白菜单.x, top: 书架内部空白菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              disabled={当前选择视图Key列表.length === 0}
              onClick={() => {
                进入当前视图选择模式();
                设置书架内部空白菜单(null);
              }}
            >{t("选择文件")}</button>
            {选择模式 === "virtual-folder" && 已选项目Key集合.size > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void 批量加入收藏(获取已选资源输入("virtual-folder"), `已选择 ${已选项目Key集合.size} 个资源`);
                  设置书架内部空白菜单(null);
                }}
              >{t("加入收藏")}</button>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={当前虚拟文件夹.items.length === 0}
              onClick={() => {
                设置待清空虚拟文件夹({ folder: 当前虚拟文件夹 });
                设置书架内部空白菜单(null);
              }}
            >{t("清空书架")}</button>
            <button
              type="button"
              role="menuitem"
              disabled={当前虚拟文件夹无效资源项目.length === 0}
              onClick={() => {
                if (当前虚拟文件夹无效资源项目.length === 0) return;
                设置待清空无效资源({
                  folder: 当前虚拟文件夹,
                  resourceKeys: 当前虚拟文件夹无效资源项目.map((项目) => 项目.resourceKey),
                });
                设置书架内部空白菜单(null);
              }}
            >{t("清空无效资源")}</button>
          </div>
        )}
        {虚拟文件夹资源菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 虚拟文件夹资源菜单.x, top: 虚拟文件夹资源菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => { 设置本地文件目标({path:虚拟文件夹资源菜单.项目.sourcePath,title:虚拟文件夹资源菜单.项目.title,mode:"rename"}); 设置虚拟文件夹资源菜单(null); }}>{t("重命名本地文件")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单.项目;
                打开资源详情页面({
                  kind: "resource",
                  input: {
                    resourceKey: 项目.resourceKey,
                    sourcePath: 项目.sourcePath,
                    sourceType: 项目.sourceType,
                    title: 项目.title,
                  },
                  fileType: 项目.sourceType,
                  progressText: null,
                  thumbnailUrl: 缩略图表[项目.sourcePath]?.url ?? null,
                });
                设置虚拟文件夹资源菜单(null);
              }}
            >{t("查看资源信息")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (!项目) return;
                复制路径(项目.sourcePath);
                设置虚拟文件夹资源菜单(null);
              }}
            >{t("复制原路径")}</button>
            <button
              type="button"
              role="menuitem"
              disabled={当前虚拟文件夹?.coverResourceKey === 虚拟文件夹资源菜单.项目.resourceKey}
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (项目) void 设置当前书架封面(项目.resourceKey);
              }}
            >{t("设为封面")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (项目) void 调整当前书架项目顺序(项目.resourceKey, "top");
              }}
            >{t("置顶")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (项目) void 调整当前书架项目顺序(项目.resourceKey, "bottom");
              }}
            >{t("置底")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (!项目) return;
                const 目标 = 获取书架资源右键整理目标(项目);
                void 批量加入收藏(目标.items, 目标.title);
                设置虚拟文件夹资源菜单(null);
              }}
            >{t("加入收藏")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (!项目) return;
                const 目标 = 获取书架资源右键整理目标(项目);
                if (目标.items.length === 0) {
                  设置错误信息("当前选择中没有可加入书架的资源。");
                  return;
                }
                选择已有虚拟文件夹加入(目标.items, 目标.title, { x: 虚拟文件夹资源菜单.x, y: 虚拟文件夹资源菜单.y });
                设置虚拟文件夹资源菜单(null);
              }}
            >{t("加入书架")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (!项目) return;
                const 目标 = 获取书架资源右键整理目标(项目);
                打开批量转存到书架弹窗("move", 目标.items, 目标.title, { x: 虚拟文件夹资源菜单.x, y: 虚拟文件夹资源菜单.y });
                设置虚拟文件夹资源菜单(null);
              }}
            >{t("移动到书架")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (!项目) return;
                const 目标 = 获取书架资源右键整理目标(项目);
                打开批量转存到书架弹窗("copy", 目标.items, 目标.title, { x: 虚拟文件夹资源菜单.x, y: 虚拟文件夹资源菜单.y });
                设置虚拟文件夹资源菜单(null);
              }}
            >{t("复制到书架")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单?.项目;
                if (!项目) return;
                const 目标 = 获取书架资源右键整理目标(项目);
                if (目标.resourceKeys.length > 1) {
                  设置已选项目Key集合(new Set(目标.resourceKeys));
                  设置批量删除不再提醒(false);
                  设置批量删除确认("virtual-folder");
                  设置虚拟文件夹资源菜单(null);
                  return;
                }
                void 从当前虚拟文件夹移除(项目.resourceKey);
              }}
            >{t("从当前书架移除")}</button>
          </div>
        )}
        {书签菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 书签菜单.x, top: 书签菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button type="button" role="menuitem" onClick={() => { 设置书签重命名(书签菜单.项目); 设置书签菜单(null); }}>{t("重命名书签")}</button>
            <button
              type="button"
              role="menuitem"
              disabled={当前选择视图Key列表.length === 0}
              onClick={() => {
                进入当前视图选择模式();
                设置书签菜单(null);
              }}
            >{t("选择文件")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开资源详情页面({
                  kind: "bookmark",
                  item: 书签菜单.项目,
                  fileType: 书签菜单.项目.sourceType,
                  thumbnailUrl: 书签预览表[书签菜单.项目.id]?.url ?? 书签菜单.项目.thumbnailUrl ?? null,
                });
                设置书签菜单(null);
              }}
            >{t("查看资源信息")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                复制路径(书签菜单.项目.sourcePath);
                设置书签菜单(null);
              }}
            >{t("复制原路径")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 调整书签项目顺序(书签菜单.项目.id, "top")}
            >{t("置顶")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 调整书签项目顺序(书签菜单.项目.id, "bottom")}
            >{t("置底")}</button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                请求右键删除记录("bookmarks", 书签菜单.项目.id);
                设置书签菜单(null);
              }}
            >
              {选择模式 === "bookmarks" && 已选项目Key集合.has(书签菜单.项目.id) && 已选项目Key集合.size > 1
                ? tr`删除选中的 ${已选项目Key集合.size} 条书签`
                : t("删除此书签")}
            </button>
          </div>
        )}
        {标签菜单 && (
          <div
            className="recent-context-menu tag-context-menu"
            style={{ left: 标签菜单.x, top: 标签菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                请求删除标签列表([标签菜单.标签]);
                设置标签菜单(null);
              }}
            >{t("删除此标签")}</button>
          </div>
        )}
        {移动到书架目标 && (
          <div
            className="bookshelf-target-context-layer"
            onClick={() => {
              设置移动到书架目标(null);
              设置转存书架搜索内容("");
              设置转存书架目标书架栏ID(null);
            }}
            onContextMenu={(事件) => {
              事件.preventDefault();
              设置移动到书架目标(null);
              设置转存书架搜索内容("");
              设置转存书架目标书架栏ID(null);
            }}
          >
            <div
              className="bookshelf-target-dialog"
              style={转存书架菜单样式}
              role="menu"
              aria-label={移动到书架目标.action === "copy" ? t("复制到书架") : t("移动到书架")}
              onClick={(事件) => 事件.stopPropagation()}
            >
              <div className="bookshelf-target-cascade">
                <div className="bookshelf-target-menu bookshelf-target-bars" role="menu" aria-label={t("书架栏")}>
                  <label className="virtual-folder-field virtual-folder-search-field">
                    <span>{t("搜索书架")}</span>
                    <input
                      value={转存书架搜索内容}
                      disabled={删除确认处理中}
                      placeholder={t("输入书架名称")}
                      onChange={(事件) => 设置转存书架搜索内容(事件.target.value)}
                    />
                  </label>
                  <div className="bookshelf-target-bar-list">
                    {转存书架目标组列表.length === 0 ? (
                      <p className="drawer-muted">
                        {移动到书架可选目标总数 === 0 ? t("暂无其他书架。") : t("没有匹配的书架栏。")}
                      </p>
                    ) : (
                      转存书架目标组列表.map((组) => (
                        <button
                          type="button"
                          key={组.bookshelf.id}
                          className={当前转存书架目标组?.bookshelf.id === 组.bookshelf.id ? "is-active" : ""}
                          disabled={删除确认处理中}
                          onMouseEnter={() => 设置转存书架目标书架栏ID(组.bookshelf.id)}
                          onFocus={() => 设置转存书架目标书架栏ID(组.bookshelf.id)}
                          onClick={() => 设置转存书架目标书架栏ID(组.bookshelf.id)}
                        >
                          <span>{组.bookshelf.name}</span>
                          <em>{组.total}</em>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="virtual-folder-target-list bookshelf-target-submenu" role="menu" aria-label={t("书架")}>
                  {移动到书架可选目标总数 === 0 ? (
                    <p className="drawer-muted">
                      {移动到书架目标.action === "copy" ? t("暂无其他书架可复制。") : t("暂无其他书架可移动。")}
                    </p>
                  ) : 筛选后移动到书架可选目标列表.length === 0 ? (
                    <p className="drawer-muted">{转存书架目标组列表.length === 0 ? t("没有匹配的书架。") : t("当前书架栏暂无可用书架。")}</p>
                  ) : (
                    筛选后移动到书架可选目标列表.map((文件夹) => (
                      <button
                        type="button"
                        key={文件夹.id}
                        disabled={删除确认处理中}
                        onClick={() => void 转存到虚拟文件夹(文件夹.id)}
                      >
                        <span>{文件夹.name}</span>
                        <em>{文件夹.items.length}{t(" 项")}</em>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {书架弹窗 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookshelf-edit-title"
            onClick={() => {
              if (!删除确认处理中) 打开书架弹窗(null);
            }}
          >
            <div className="root-delete-dialog virtual-folder-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="bookshelf-edit-title">{书架弹窗.mode === "create" ? t("新建书架栏") : t("重命名书架栏")}</h2>
              <label className="virtual-folder-field">
                <span>{t("名称")}</span>
                <input
                  value={书架名称输入}
                  disabled={删除确认处理中}
                  autoFocus
                  onChange={(事件) => 设置书架名称输入(事件.target.value)}
                  onKeyDown={(事件) => {
                    if (事件.key === "Enter") void 保存书架弹窗();
                  }}
                />
              </label>
              <p>{t("书架栏用于分组管理 OmiComic 内部的书架，不会创建真实文件夹，也不会移动、复制或修改漫画文件。")}</p>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 打开书架弹窗(null)}>{t("取消")}</button>
                <button type="button" className="primary-action" disabled={删除确认处理中} onClick={() => void 保存书架弹窗()}>{t("保存")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {(待删除书架 ||待删除书架列表) && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookshelf-delete-title"
            onClick={() => {
              if (!删除确认处理中) {
                设置待删除书架(null);
                设置待删除书架列表(null);
              }
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="bookshelf-delete-title">{t("删除书架栏")}</h2>
              <p>{书架列表.length - 获取待删除书架栏列表().length < 1 ? t("至少需要保留一个书架栏，当前选择不能全部删除。") : t("只删除 OmiComic 内部的书架栏记录和其中的书架引用，不会删除任何原始漫画文件。")}</p>
              <strong>
                {获取待删除书架栏列表().length > 1
                  ? tr`已选择 ${获取待删除书架栏列表().length} 个书架栏`
                  : 获取待删除书架栏列表()[0]?.name}
              </strong>
              <div className="root-delete-actions">
                <button
                  type="button"
                  disabled={删除确认处理中}
                  onClick={() => {
                    设置待删除书架(null);
                    设置待删除书架列表(null);
                  }}
                >{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中 || 书架列表.length - 获取待删除书架栏列表().length < 1} onClick={() => void 删除书架记录()}>{t("删除")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {加入虚拟文件夹目标 && (
          <div
            className="bookshelf-target-context-layer"
            onClick={() => {
              设置加入虚拟文件夹目标(null);
              设置加入书架搜索内容("");
              设置加入书架目标书架栏ID(null);
            }}
            onContextMenu={(事件) => {
              事件.preventDefault();
              设置加入虚拟文件夹目标(null);
              设置加入书架搜索内容("");
              设置加入书架目标书架栏ID(null);
            }}
          >
            <div
              className="bookshelf-target-dialog"
              style={加入书架菜单样式}
              role="menu"
              aria-label={t("加入书架")}
              onClick={(事件) => 事件.stopPropagation()}
            >
              {使用分栏加入书架目标 ? (
                <div className="bookshelf-target-cascade">
                  <div className="bookshelf-target-menu bookshelf-target-bars" role="menu" aria-label={t("书架栏")}>
                    <label className="virtual-folder-field virtual-folder-search-field">
                      <span>{t("搜索书架")}</span>
                      <input
                        value={加入书架搜索内容}
                        disabled={删除确认处理中}
                        placeholder={t("输入书架名称")}
                        onChange={(事件) => 设置加入书架搜索内容(事件.target.value)}
                      />
                    </label>
                    <div className="bookshelf-target-bar-list">
                      {加入书架目标组列表.length === 0 ? (
                        <p className="drawer-muted">{t("没有匹配的书架栏。")}</p>
                      ) : (
                        加入书架目标组列表.map((组) => (
                          <button
                            type="button"
                            key={组.bookshelf.id}
                            className={当前加入书架目标组?.bookshelf.id === 组.bookshelf.id ? "is-active" : ""}
                            onMouseEnter={() => 设置加入书架目标书架栏ID(组.bookshelf.id)}
                            onFocus={() => 设置加入书架目标书架栏ID(组.bookshelf.id)}
                            onClick={() => 设置加入书架目标书架栏ID(组.bookshelf.id)}
                          >
                            <span>{组.bookshelf.name}</span>
                            <em>{组.total}</em>
                          </button>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      className="bookshelf-target-menu-action bookshelf-target-bar-action"
                      onClick={() => {
                        设置加入虚拟文件夹目标(null);
                        设置加入书架搜索内容("");
                        设置加入书架目标书架栏ID(null);
                        打开书架弹窗({ mode: "create" });
                      }}
                    >{t("新建书架栏")}</button>
                  </div>
                  <div className="virtual-folder-target-list bookshelf-target-submenu" role="menu" aria-label={t("书架")}>
                    {加入书架可选目标列表.length === 0 ? (
                      <p className="drawer-muted">{加入书架目标组列表.length === 0 ? t("没有匹配的书架。") : t("当前书架栏暂无可加入的书架。")}</p>
                    ) : (
                      加入书架可选目标列表.map((文件夹) => {
                        const 加入状态 = 获取书架目标加入状态(文件夹, 加入虚拟文件夹目标.items);
                        const 已全部加入 = 加入状态 === "all";
                        return (
                          <button
                            type="button"
                            key={文件夹.id}
                            className={已全部加入 ? "is-already-added" : ""}
                            disabled={删除确认处理中 || 已全部加入}
                            onClick={() => void 加入到虚拟文件夹(文件夹.id, 加入虚拟文件夹目标.items)}
                          >
                            <span>{文件夹.name}</span>
                            <em>
                              {加入状态 === "all"
                                ? t("已加入")
                                : 加入状态 === "partial"
                                  ? tr`部分已加入 · ${文件夹.items.length} 项`
                                  : tr`${文件夹.items.length} 项`}
                            </em>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <button
                    type="button"
                    className="bookshelf-target-menu-action bookshelf-target-shelf-action"
                    onClick={() => {
                      const 待加入项目 = 加入虚拟文件夹目标.items;
                      const 目标书架栏ID = 当前加入书架目标组?.bookshelf.id ?? 当前书架?.id ?? 书架列表[0]?.id;
                      设置加入虚拟文件夹目标(null);
                      设置加入书架搜索内容("");
                      设置加入书架目标书架栏ID(null);
                      打开虚拟文件夹弹窗({ mode: "create", items: 待加入项目, bookshelfId: 目标书架栏ID });
                    }}
                  >{t("新建书架并加入")}</button>
                </div>
              ) : (
                <>
                  <div className="bookshelf-target-single-menu">
                    <label className="virtual-folder-field virtual-folder-search-field">
                      <span>{t("搜索书架")}</span>
                      <input
                        value={加入书架搜索内容}
                        disabled={删除确认处理中}
                        placeholder={t("输入书架名称")}
                        onChange={(事件) => 设置加入书架搜索内容(事件.target.value)}
                      />
                    </label>
                    <div className="virtual-folder-target-list">
                      {加入书架可选目标列表.length === 0 ? (
                        <p className="drawer-muted">{虚拟文件夹列表.length === 0 ? t("暂无书架，请先新建。") : t("没有匹配的书架。")}</p>
                      ) : (
                        加入书架可选目标列表.map((文件夹) => {
                          const 加入状态 = 获取书架目标加入状态(文件夹, 加入虚拟文件夹目标.items);
                          const 已全部加入 = 加入状态 === "all";
                          return (
                            <button
                              type="button"
                              key={文件夹.id}
                              className={已全部加入 ? "is-already-added" : ""}
                              disabled={删除确认处理中 || 已全部加入}
                              onClick={() => void 加入到虚拟文件夹(文件夹.id, 加入虚拟文件夹目标.items)}
                            >
                              <span>{文件夹.name}</span>
                              <em>
                                {加入状态 === "all"
                                  ? t("已加入")
                                  : 加入状态 === "partial"
                                    ? tr`部分已加入 · ${文件夹.items.length} 项`
                                    : tr`${文件夹.items.length} 项`}
                              </em>
                            </button>
                          );
                        })
                      )}
                    </div>
                    <button
                      type="button"
                      className="bookshelf-target-menu-action bookshelf-target-single-action"
                      onClick={() => {
                        const 待加入项目 = 加入虚拟文件夹目标.items;
                        const 目标书架栏ID = 当前加入书架目标组?.bookshelf.id ?? 当前书架?.id ?? 书架列表[0]?.id;
                        设置加入虚拟文件夹目标(null);
                        设置加入书架搜索内容("");
                        设置加入书架目标书架栏ID(null);
                        打开虚拟文件夹弹窗({ mode: "create", items: 待加入项目, bookshelfId: 目标书架栏ID });
                      }}
                    >{t("新建书架并加入")}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {虚拟文件夹弹窗 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="virtual-folder-edit-title"
            onClick={() => {
              if (!删除确认处理中) 打开虚拟文件夹弹窗(null);
            }}
          >
            <div className="root-delete-dialog virtual-folder-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="virtual-folder-edit-title">
                {虚拟文件夹弹窗.mode === "create"
                  ? t("新建书架")
                  : 虚拟文件夹弹窗.mode === "rename"
                    ? t("重命名书架")
                    : t("编辑书架备注")}
              </h2>
              {(虚拟文件夹弹窗.mode === "create" || 虚拟文件夹弹窗.mode === "rename") && (
                <label className="virtual-folder-field">
                  <span>{t("名称")}</span>
                  <input
                    value={虚拟文件夹名称输入}
                    disabled={删除确认处理中}
                    autoFocus
                    onChange={(事件) => 设置虚拟文件夹名称输入(事件.target.value)}
                    onKeyDown={(事件) => {
                      if (事件.key === "Enter") void 保存虚拟文件夹弹窗();
                    }}
                  />
                </label>
              )}
              {(虚拟文件夹弹窗.mode === "create" || 虚拟文件夹弹窗.mode === "note") && (
                <label className="virtual-folder-field">
                  <span>{t("备注")}</span>
                  <textarea
                    value={虚拟文件夹备注输入}
                    disabled={删除确认处理中}
                    rows={4}
                    onChange={(事件) => 设置虚拟文件夹备注输入(事件.target.value)}
                  />
                </label>
              )}
              <p>{t("书架只保存 OmiComic 内部引用，不会创建真实文件夹，也不会移动、复制或修改漫画文件。")}</p>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 打开虚拟文件夹弹窗(null)}>{t("取消")}</button>
                <button type="button" className="primary-action" disabled={删除确认处理中} onClick={() => void 保存虚拟文件夹弹窗()}>{t("保存")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {待删除虚拟文件夹 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="virtual-folder-delete-title"
            onClick={() => {
              if (!删除确认处理中) 设置待删除虚拟文件夹(null);
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="virtual-folder-delete-title">{t("删除书架")}</h2>
              <p>{t("只删除 OmiComic 内部的书架记录和其中的资源引用，不会删除任何原始漫画文件。")}</p>
              <strong>{待删除虚拟文件夹.selection?.map(item=>item.name).join('、') ?? 待删除虚拟文件夹.name}</strong>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 设置待删除虚拟文件夹(null)}>{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 删除虚拟文件夹记录()}>{t("删除")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {待清空虚拟文件夹 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="virtual-folder-clear-title"
            onClick={() => {
              if (!删除确认处理中) 设置待清空虚拟文件夹(null);
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="virtual-folder-clear-title">{t("清空书架")}</h2>
              <p>{t("只清空 OmiComic 内部引用，不会删除任何原始漫画文件；不会移动、复制或修改任何漫画文件，只会更新 omicomic-data.json 中该书架的 items。")}</p>
              <strong>{待清空虚拟文件夹.folder.name}</strong>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 设置待清空虚拟文件夹(null)}>{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 清空虚拟文件夹记录()}>{t("清空")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {待清空无效资源 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invalid-resource-clear-title"
            onClick={() => {
              if (!删除确认处理中) {
                if (当前虚拟文件夹无效资源Key) 设置已忽略无效资源清理Key(当前虚拟文件夹无效资源Key);
                设置待清空无效资源(null);
              }
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="invalid-resource-clear-title">{t("清空无效资源")}</h2>
              <p>{t("检测到")}{待清空无效资源.resourceKeys.length}{t("个路径失效资源。清空只会移除当前书架中的 OmiComic 内部引用， 不会删除、移动、复制或修改任何原始漫画文件，也不会影响收藏、书签、阅读进度或资源信息。")}</p>
              <strong>{待清空无效资源.folder.name}</strong>
              <div className="root-delete-actions">
                <button
                  type="button"
                  disabled={删除确认处理中}
                  onClick={() => {
                    if (当前虚拟文件夹无效资源Key) 设置已忽略无效资源清理Key(当前虚拟文件夹无效资源Key);
                    设置待清空无效资源(null);
                  }}
                >{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 清空当前书架无效资源记录()}>{t("清空无效资源")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {待全局清空无效资源 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-invalid-resource-clear-title"
            onClick={() => {
              if (!删除确认处理中) 设置待全局清空无效资源(null);
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="global-invalid-resource-clear-title">{t("清空无效资源记录")}</h2>
              <p>{t("检测到")}{待全局清空无效资源.count}{t("个路径失效资源。清空只会移除 OmiComic 内部 omicomic-data.json 中的相关记录， 不会删除真实漫画文件，不会移动真实漫画文件，也不会复制真实漫画文件。")}</p>
              <strong>{t("包含最近阅读、收藏、书签、阅读进度、资源信息和书架引用。")}</strong>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 设置待全局清空无效资源(null)}>{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 清空全局无效资源记录()}>{t("确认清空")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {待删除根目录 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="root-delete-title"
            onClick={() => {
              if (!删除确认处理中) 设置待删除根目录(null);
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="root-delete-title">{t("移除资源库目录")}</h2>
              <p>{t("将从资源库移除此目录，并清理相关的最近阅读、收藏、书签、阅读进度、资源信息和书架引用；不会删除磁盘中的文件夹或漫画文件。")}</p>
              <strong
                data-tooltip-disabled
                onMouseEnter={(事件) => 开始路径悬停(`delete-root:${待删除根目录.path}`, 待删除根目录.path, 事件)}
                onMouseMove={(事件) => 更新路径悬停(`delete-root:${待删除根目录.path}`, 待删除根目录.path, 事件)}
                onMouseLeave={() => 结束路径悬停(`delete-root:${待删除根目录.path}`)}
              >
                {待删除根目录.path}
              </strong>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 设置待删除根目录(null)}>{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 确认删除根目录记录()}>{t("删除")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {待删除标签列表 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tag-delete-title"
            onClick={() => {
              if (!删除确认处理中) {
                设置待删除标签列表(null);
                设置删除标签不再提醒(false);
              }
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="tag-delete-title">{t("删除标签")}</h2>
              <p>{t("将从 OmiComic 的标签记录中移除这些标签，并从所有资源和书签的 tags 数组中移除； 不会删除任何漫画文件、资源、书签、收藏或阅读进度。")}</p>
              <div className="tag-delete-list">
                {待删除标签列表.map((标签) => (
                  <span className="tag-chip" key={标签}>{标签}</span>
                ))}
              </div>
              <label className="batch-delete-skip">
                <input
                  type="checkbox"
                  checked={删除标签不再提醒}
                  disabled={删除确认处理中}
                  onChange={(事件) => 设置删除标签不再提醒(事件.target.checked)}
                />
                <span>{t("不再提醒")}</span>
              </label>
              {整理错误 && <p className="organize-edit-error">{t(整理错误 ?? '')}</p>}
              <div className="root-delete-actions">
                <button
                  type="button"
                  disabled={删除确认处理中}
                  onClick={() => {
                    设置待删除标签列表(null);
                    设置删除标签不再提醒(false);
                  }}
                >{t("取消")}</button>
                <button
                  type="button"
                  className="danger-action"
                  disabled={删除确认处理中}
                  onClick={() => void 确认删除标签列表()}
                >{t("删除标签")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {批量删除确认 && 渲染对话框(
          <ModalOverlay
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="batch-delete-title"
            onClick={() => {
              if (!删除确认处理中) {
                设置批量删除确认(null);
                设置批量删除不再提醒(false);
              }
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="batch-delete-title">{t("删除选中")}</h2>
              <p>{t(获取批量删除标题(批量删除确认, 已选项目Key集合.size))}</p>
              <p>{t(获取批量删除说明(批量删除确认))}</p>
              <label className="batch-delete-skip">
                <input
                  type="checkbox"
                  checked={批量删除不再提醒}
                  disabled={删除确认处理中}
                  onChange={(事件) => 设置批量删除不再提醒(事件.target.checked)}
                />
                <span>{t("不再提醒")}</span>
              </label>
              <div className="root-delete-actions">
                <button
                  type="button"
                  disabled={删除确认处理中}
                  onClick={() => {
                    设置批量删除确认(null);
                    设置批量删除不再提醒(false);
                  }}
                >{t("取消")}</button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 确认批量删除()}>{t("删除")}</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {本地文件目标 && <LocalFileDialog target={本地文件目标} onClose={() => 设置本地文件目标(null)} onChanged={同步文件操作} />}
        {书架备注悬浮窗 && createPortal(
          <div
            className="bookshelf-note-popover"
            style={书架备注悬浮窗.style}
            role="tooltip"
            onMouseEnter={() => {
              if (书架备注悬停定时器.current !== null) {
                window.clearTimeout(书架备注悬停定时器.current);
                书架备注悬停定时器.current = null;
              }
            }}
            onMouseLeave={隐藏书架备注悬浮窗}
          >
            {书架备注悬浮窗.note}
          </div>,
          document.body,
        )}
      </div>
    </section>
  );
}

export default LibraryPage;
