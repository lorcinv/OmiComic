import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import type {
  AppSettings,
  BookmarkItem,
  FavoriteItem,
  LibraryRoot,
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
  卡片尺寸,
  每页数量,
  双页阅读方向,
  沉浸自动隐藏延迟,
  整理侧边栏透明度,
  图书切换按钮透明度,
  书架备注悬停延迟,
  排序方式,
  资源类型,
  阅读打开上下文,
  阅读相邻资源项,
  阅读器页模式,
  阅读器缩放模式,
  阅读资源结果,
  批量删除确认设置,
  整理信息输入,
} from "../types";

interface LibraryPageProps {
  onOpenReader: (resource: 阅读资源结果, initialPageIndex: number, context?: 阅读打开上下文) => void;
  refreshToken: number;
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
type 选择视图 = Exclude<资源库视图, "bookshelf">;

type 右侧抽屉 = "settings" | "resource-info" | "tag-filter" | null;

type 资源信息目标 =
  | { kind: "resource"; input: ResourceMetaInput; fileType: 资源类型; progressText?: string | null; thumbnailUrl?: string | null }
  | { kind: "bookmark"; item: BookmarkItem; fileType: 资源类型; thumbnailUrl?: string | null };

interface 缩略图状态 {
  status: 缩略图加载状态;
  url: string | null;
}

interface 可阅读页数状态 {
  status: "loading" | "loaded" | "error";
  count: number | null;
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
  onMoreClick: (事件: ReactMouseEvent<HTMLButtonElement>, key: string, 标签列表: string[]) => void;
}

type 虚拟文件夹弹窗状态 =
  | { mode: "create"; items?: VirtualFolderItemInput[] }
  | { mode: "rename" | "note"; folder: VirtualFolder }
  | null;

const 每页数量选项: 每页数量[] = [60, 100, 150, 200];
const 图书切换按钮透明度选项: 图书切换按钮透明度[] = [20, 30, 40, 50, 60, 70, 80];
const 整理侧边栏透明度选项: 整理侧边栏透明度[] = [100, 90, 80, 70];
const 书架备注悬停延迟选项: 书架备注悬停延迟[] = [0, 500, 1000, 1500, 2000];
const 资源信息预览最小尺寸 = 120;
const 资源信息预览默认尺寸 = 144;
const 资源信息预览最大尺寸 = 180;
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
const 类型顺序: Record<资源类型, number> = {
  folder: 0,
  image: 1,
  archive: 2,
  pdf: 3,
  epub: 4,
  unknown: 5,
};

const 类型信息: Record<资源类型, { label: string; icon: string }> = {
  folder: { label: "文件夹", icon: "夹" },
  image: { label: "图片", icon: "图" },
  archive: { label: "压缩包", icon: "包" },
  pdf: { label: "PDF", icon: "文" },
  epub: { label: "EPUB", icon: "书" },
  unknown: { label: "未知文件", icon: "?" },
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
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive";
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
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive";
}

function 获取文件收藏输入(文件: 文件条目): Omit<FavoriteItem, "addedAt" | "updatedAt"> | null {
  if (!支持收藏(文件.type)) return null;
  const resourceKey = 获取文件资源Key(文件);
  if (!resourceKey) return null;
  const sourceType = 文件.type === "archive" ? "archive" : "folder";

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
    const 更新可见数量 = (): void => {
      const 行 = 行容器.current;
      const 测量 = 测量容器.current;
      if (!行 || !测量) return;

      const 行宽 = 行.clientWidth;
      if (行宽 <= 0) return;

      const 标签节点 = Array.from(测量.querySelectorAll<HTMLElement>("[data-preview-tag-measure='tag']"));
      const 更多节点 = 测量.querySelector<HTMLElement>("[data-preview-tag-measure='more']");
      const 间距 = 5;
      const 更多宽度 = (更多节点?.offsetWidth ?? 34) + 间距;

      const 计算可放数量 = (保留更多: boolean): number => {
        let 当前行 = 0;
        let 当前行宽 = 0;
        let 数量 = 0;

        for (const 标签节点项 of 标签节点) {
          const 标签宽度 = Math.min(标签节点项.offsetWidth, 行宽);
          const 当前行可用宽度 = 当前行 === 1 && 保留更多 ? 行宽 - 更多宽度 : 行宽;
          const 追加后宽度 = 当前行宽 === 0 ? 标签宽度 : 当前行宽 + 间距 + 标签宽度;

          if (追加后宽度 <= 当前行可用宽度) {
            当前行宽 = 追加后宽度;
            数量 += 1;
            continue;
          }

          当前行 += 1;
          if (当前行 > 1) break;

          const 新行可用宽度 = 保留更多 ? 行宽 - 更多宽度 : 行宽;
          if (标签宽度 > 新行可用宽度) break;
          当前行宽 = 标签宽度;
          数量 += 1;
        }

        return 数量;
      };

      const 全部可见数量 = 计算可放数量(false);
      const 下一数量 = 全部可见数量 >= 标签列表.length
        ? 标签列表.length
        : Math.max(0, Math.min(标签列表.length - 1, 计算可放数量(true)));
      设置可见数量((当前数量) => 当前数量 === 下一数量 ? 当前数量 : 下一数量);
    };

    更新可见数量();

    const 观察器 = new ResizeObserver(更新可见数量);
    if (行容器.current) 观察器.observe(行容器.current);
    window.addEventListener("resize", 更新可见数量);
    return () => {
      观察器.disconnect();
      window.removeEventListener("resize", 更新可见数量);
    };
  }, [标签列表]);

  if (标签列表.length === 0) return null;

  const 有更多 = 可见数量 < 标签列表.length;
  const 显示标签 = 标签列表.slice(0, 可见数量);
  const 隐藏标签 = 标签列表.slice(可见数量);

  return (
    <span className="preview-tag-row" aria-label="标签" ref={行容器}>
      {显示标签.map((标签) => (
        <span className="preview-tag-chip" title={标签} key={标签}>{标签}</span>
      ))}
      {有更多 && (
        <button
          type="button"
          className="preview-tag-chip preview-tag-more"
          aria-label="显示完整标签"
          onClick={(事件) => onMoreClick(事件, tagKey, 隐藏标签)}
        >
          ...
        </button>
      )}
      <span className="preview-tag-measure" aria-hidden="true" ref={测量容器}>
        {标签列表.map((标签) => (
          <span className="preview-tag-chip" data-preview-tag-measure="tag" key={标签}>{标签}</span>
        ))}
        <span className="preview-tag-chip preview-tag-more" data-preview-tag-measure="more">...</span>
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

function 匹配关键词(内容: string | undefined, 搜索词: string): boolean {
  return 搜索词 === "" || (内容 ?? "").toLocaleLowerCase("zh-CN").includes(搜索词);
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

function 资源包含全部标签(资源标签: string[], 筛选标签: string[]): boolean {
  if (筛选标签.length === 0) return true;
  return 筛选标签.every((标签) => 资源标签.includes(标签));
}

function 标签按模式匹配(资源标签: string[], 查询: string, 模式: 搜索匹配模式): boolean {
  const 修正查询 = 查询.trim();
  if (!修正查询) return true;
  if (模式 === "exact") return 资源标签.includes(修正查询);
  return 资源标签.some((标签) => 标签匹配查询(标签, 修正查询));
}

function 匹配整理搜索(
  搜索内容: string,
  文本列表: Array<string | undefined | null>,
  标签列表: string[],
  模式: 搜索匹配模式,
): boolean {
  const 搜索词 = 搜索内容.trim().toLocaleLowerCase("zh-CN");
  if (!搜索词) return true;

  const 标签查询列表 = 搜索内容.includes(",") || 搜索内容.includes("，")
    ? 解析标签输入(搜索内容)
    : [];
  if (标签查询列表.length > 0) {
    return 模式 === "exact"
      ? 标签查询列表.every((查询) => 标签按模式匹配(标签列表, 查询, 模式))
      : 标签查询列表.some((查询) => 标签按模式匹配(标签列表, 查询, 模式));
  }

  return 文本列表.some((文本) => 匹配关键词(文本 ?? "", 搜索词))
    || 标签按模式匹配(标签列表, 搜索词, 模式);
}

function 获取可阅读页数Key(文件: 文件条目): string | null {
  return 获取文件资源Key(文件) ?? null;
}

function 支持可阅读页数统计(类型: 资源类型): boolean {
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive";
}

function 可作为阅读资源(类型: 资源类型): boolean {
  return 类型 === "folder" || 类型 === "image" || 类型 === "archive";
}

function 获取文件阅读类型(文件: 文件条目): "folder" | "image" | "archive" | null {
  if (文件.type === "folder" || 文件.type === "image" || 文件.type === "archive") return 文件.type;
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
      文本: String(总页数),
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
      文本: String(总页数),
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

function LibraryPage({ onOpenReader, refreshToken }: LibraryPageProps) {
  const [根目录列表, 设置根目录列表] = useState<LibraryRoot[]>([]);
  const [当前根目录, 设置当前根目录] = useState<string | null>(null);
  const [当前目录, 设置当前目录] = useState<目录结果 | null>(null);
  const [历史记录, 设置历史记录] = useState<历史状态>({ entries: [], index: -1 });
  const [正在读取, 设置正在读取] = useState(false);
  const [错误信息, 设置错误信息] = useState<string | null>(null);
  const [搜索内容, 设置搜索内容] = useState("");
  const [收藏搜索内容, 设置收藏搜索内容] = useState("");
  const [书签搜索内容, 设置书签搜索内容] = useState("");
  const [搜索模式, 设置搜索模式] = useState<搜索匹配模式>("fuzzy");
  const [主搜索建议可见, 设置主搜索建议可见] = useState(false);
  const [已选标签列表, 设置已选标签列表] = useState<string[]>([]);
  const [标签搜索内容, 设置标签搜索内容] = useState("");
  const [标签搜索建议可见, 设置标签搜索建议可见] = useState(false);
  const [标签抽屉搜索模式, 设置标签抽屉搜索模式] = useState<搜索匹配模式>("fuzzy");
  const [排序, 设置排序] = useState<排序方式>(默认设置.sortMode);
  const [缩略图尺寸, 设置缩略图尺寸] = useState<卡片尺寸>(默认设置.cardSize);
  const [每页数量, 设置每页数量] = useState<每页数量>(默认设置.pageSize);
  const [显示进度条, 设置显示进度条] = useState(默认设置.showProgressBar);
  const [显示进度文本, 设置显示进度文本] = useState(默认设置.showProgressText);
  const [进度文本模式, 设置进度文本模式] = useState<进度文本模式>(默认设置.progressTextMode);
  const [进度条粗细, 设置进度条粗细] = useState<进度条粗细>(默认设置.progressBarThickness);
  const [文件夹优先, 设置文件夹优先] = useState(默认设置.folderFirst);
  const [隐藏已加入书架资源, 设置隐藏已加入书架资源] = useState(默认设置.hideBookshelfItemsInLibrary);
  const [阅读器默认缩放模式, 设置阅读器默认缩放模式] = useState<阅读器缩放模式>(默认设置.readerDefaultFitMode);
  const [阅读器默认页模式, 设置阅读器默认页模式] = useState<阅读器页模式>(默认设置.readerPageMode);
  const [双页首页单独显示, 设置双页首页单独显示] = useState(默认设置.doublePageFirstSingle);
  const [双页阅读方向, 设置双页阅读方向] = useState<双页阅读方向>(默认设置.doublePageDirection);
  const [智能识别跨页图, 设置智能识别跨页图] = useState(默认设置.smartDetectSpreadPage);
  const [滚轮翻页, 设置滚轮翻页] = useState(默认设置.wheelPageTurn);
  const [沉浸自动隐藏, 设置沉浸自动隐藏] = useState(默认设置.immersiveAutoHide);
  const [沉浸自动隐藏延迟, 设置沉浸自动隐藏延迟] = useState<沉浸自动隐藏延迟>(默认设置.immersiveAutoHideDelay);
  const [图书切换按钮透明度, 设置图书切换按钮透明度] = useState<图书切换按钮透明度>(默认设置.bookSwitchButtonOpacity);
  const [当前页, 设置当前页] = useState(1);
  const [页码输入, 设置页码输入] = useState("1");
  const [缩略图表, 设置缩略图表] = useState<Record<string, 缩略图状态>>({});
  const [书签预览表, 设置书签预览表] = useState<Record<string, 缩略图状态>>({});
  const [可阅读页数表, 设置可阅读页数表] = useState<Record<string, 可阅读页数状态>>({});
  const [阅读进度表, 设置阅读进度表] = useState<Record<string, ReadingProgress>>({});
  const [最近打开列表, 设置最近打开列表] = useState<RecentOpenedItem[]>([]);
  const [收藏列表, 设置收藏列表] = useState<FavoriteItem[]>([]);
  const [书签列表, 设置书签列表] = useState<BookmarkItem[]>([]);
  const [虚拟文件夹列表, 设置虚拟文件夹列表] = useState<VirtualFolder[]>([]);
  const [当前虚拟文件夹ID, 设置当前虚拟文件夹ID] = useState<string | null>(null);
  const [数据已加载, 设置数据已加载] = useState(false);
  const [当前视图, 设置当前视图] = useState<资源库视图>("directory");
  const [资源菜单, 设置资源菜单] = useState<{
    x: number;
    y: number;
    input: ResourceMetaInput;
    fileType: 资源类型;
    progressText?: string | null;
    thumbnailUrl?: string | null;
  } | null>(null);
  const [最近菜单, 设置最近菜单] = useState<{ x: number; y: number; 项目: RecentOpenedItem } | null>(null);
  const [收藏菜单, 设置收藏菜单] = useState<{ x: number; y: number; 项目: FavoriteItem } | null>(null);
  const [书签菜单, 设置书签菜单] = useState<{ x: number; y: number; 项目: BookmarkItem } | null>(null);
  const [虚拟文件夹菜单, 设置虚拟文件夹菜单] = useState<{ x: number; y: number; 项目: VirtualFolder } | null>(null);
  const [虚拟文件夹资源菜单, 设置虚拟文件夹资源菜单] = useState<{ x: number; y: number; 项目: VirtualFolderItem } | null>(null);
  const [根目录菜单, 设置根目录菜单] = useState<{ x: number; y: number; 项目: LibraryRoot } | null>(null);
  const [标签菜单, 设置标签菜单] = useState<{ x: number; y: number; 标签: string } | null>(null);
  const [待删除标签列表, 设置待删除标签列表] = useState<string[] | null>(null);
  const [标签删除选择模式, 设置标签删除选择模式] = useState(false);
  const [待删除标签选择集合, 设置待删除标签选择集合] = useState<Set<string>>(() => new Set());
  const [待删除根目录, 设置待删除根目录] = useState<LibraryRoot | null>(null);
  const [选择模式, 设置选择模式] = useState<选择视图 | null>(null);
  const [已选项目Key集合, 设置已选项目Key集合] = useState<Set<string>>(() => new Set());
  const [批量删除确认, 设置批量删除确认] = useState<管理视图 | null>(null);
  const [删除前确认设置, 设置删除前确认设置] = useState<批量删除确认设置>(默认设置.confirmBeforeBatchDelete);
  const [删除标签前确认, 设置删除标签前确认] = useState(默认设置.confirmBeforeDeleteTags);
  const [批量删除不再提醒, 设置批量删除不再提醒] = useState(false);
  const [删除标签不再提醒, 设置删除标签不再提醒] = useState(false);
  const [删除确认处理中, 设置删除确认处理中] = useState(false);
  const [虚拟文件夹弹窗, 设置虚拟文件夹弹窗] = useState<虚拟文件夹弹窗状态>(null);
  const [虚拟文件夹名称输入, 设置虚拟文件夹名称输入] = useState("");
  const [虚拟文件夹备注输入, 设置虚拟文件夹备注输入] = useState("");
  const [待删除虚拟文件夹, 设置待删除虚拟文件夹] = useState<VirtualFolder | null>(null);
  const [加入虚拟文件夹目标, 设置加入虚拟文件夹目标] = useState<{ items: VirtualFolderItemInput[]; title: string } | null>(null);
  const [当前右侧抽屉, 设置当前右侧抽屉] = useState<右侧抽屉>(null);
  const [资源信息目标, 设置资源信息目标] = useState<资源信息目标 | null>(null);
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
  const [书架备注悬浮窗, 设置书架备注悬浮窗] = useState<{ folderId: string; note: string; style: CSSProperties } | null>(null);
  const [资源信息预览尺寸, 设置资源信息预览尺寸] = useState(资源信息预览默认尺寸);
  const 读取序号 = useRef(0);
  const 缩略图请求序号 = useRef(0);
  const 书签预览请求序号 = useRef(0);
  const 可阅读页数请求序号 = useRef(0);
  const 列表容器 = useRef<HTMLDivElement>(null);
  const 网格容器 = useRef<HTMLDivElement>(null);
  const 主搜索输入框 = useRef<HTMLInputElement>(null);
  const 标签搜索输入框 = useRef<HTMLInputElement>(null);
  const 标签添加触发区 = useRef<HTMLSpanElement>(null);
  const 标签添加浮层 = useRef<HTMLSpanElement>(null);
  const 标签添加忽略外部点击截止 = useRef(0);
  const 书架备注悬停定时器 = useRef<number | null>(null);
  const 可见书签ID集合 = useRef<Set<string>>(new Set());
  const 书签预览状态Ref = useRef<Record<string, 缩略图状态>>({});
  const 自动翻页锁定 = useRef(false);
  const 自动翻页冷却截止 = useRef(0);
  const 滚轮停止定时器 = useRef<number | null>(null);
  const 待恢复滚动位置 = useRef<"top" | "bottom" | null>(null);
  const 打开阅读请求序号 = useRef(0);
  const [网格列数, 设置网格列数] = useState(1);

  function 应用界面设置(设置: AppSettings): void {
    设置缩略图尺寸(设置.cardSize);
    设置每页数量(设置.pageSize);
    设置排序(设置.sortMode);
    设置显示进度条(设置.showProgressBar);
    设置显示进度文本(设置.showProgressText);
    设置进度文本模式(设置.progressTextMode);
    设置进度条粗细(设置.progressBarThickness);
    设置文件夹优先(设置.folderFirst);
    设置隐藏已加入书架资源(设置.hideBookshelfItemsInLibrary);
    设置阅读器默认缩放模式(设置.readerDefaultFitMode);
    设置阅读器默认页模式(设置.readerPageMode);
    设置双页首页单独显示(设置.doublePageFirstSingle);
    设置双页阅读方向(设置.doublePageDirection);
    设置智能识别跨页图(设置.smartDetectSpreadPage);
    设置滚轮翻页(设置.wheelPageTurn);
    设置沉浸自动隐藏(设置.immersiveAutoHide);
    设置沉浸自动隐藏延迟(设置.immersiveAutoHideDelay);
    设置图书切换按钮透明度(设置.bookSwitchButtonOpacity);
    设置整理侧边栏透明度(设置.organizeDrawerOpacity);
    设置书架备注悬停延迟(设置.bookshelfNoteHoverDelayMs);
    设置搜索模式(设置.tagSearchMode);
    设置删除标签前确认(设置.confirmBeforeDeleteTags);
    设置删除前确认设置(设置.confirmBeforeBatchDelete);
  }

  function 保存界面设置(局部设置: Partial<AppSettings>): void {
    void window.omicomic.updateSettings(局部设置)
      .then((结果) => {
        if (结果.ok) {
          应用界面设置(结果.data);
        } else {
          设置错误信息(结果.error.message);
        }
      })
      .catch(() => 设置错误信息("设置保存失败，请稍后重试。"));
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

  function 设置当前视图搜索内容(值: string): void {
    if (当前视图 === "favorites") 设置收藏搜索内容(值);
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

  function 开始调整资源预览尺寸(事件: ReactPointerEvent<HTMLButtonElement>): void {
    事件.preventDefault();
    事件.stopPropagation();
    const 起始X = 事件.clientX;
    const 起始尺寸 = 资源信息预览尺寸;

    function 处理移动(移动事件: PointerEvent): void {
      const 新尺寸 = 限制数值(起始尺寸 + 移动事件.clientX - 起始X, 资源信息预览最小尺寸, 资源信息预览最大尺寸);
      设置资源信息预览尺寸(新尺寸);
    }

    function 结束调整(): void {
      window.removeEventListener("pointermove", 处理移动);
      window.removeEventListener("pointerup", 结束调整);
      window.removeEventListener("pointercancel", 结束调整);
    }

    window.addEventListener("pointermove", 处理移动);
    window.addEventListener("pointerup", 结束调整);
    window.addEventListener("pointercancel", 结束调整);
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

  const 筛选排序后项目 = useMemo(() => {
    const 项目 = (当前目录?.items ?? []).filter((文件) => {
      if (隐藏已加入书架资源) {
        const resourceKey = 获取文件资源Key(文件);
        if (resourceKey && 已加入书架资源集合.resourceKeys.has(resourceKey)) return false;
        if (已加入书架资源集合.sourcePaths.has(文件.path)) return false;
        if (文件.type === "image" && 已加入书架资源集合.sourcePaths.has(获取父目录路径(文件.path))) return false;
      }
      const 整理信息 = 获取文件整理信息(文件);
      const 标签列表 = 整理信息?.tags ?? [];
      const 标签匹配 = 资源包含全部标签(标签列表, 已选标签列表);
      const 搜索匹配 = 匹配整理搜索(
        搜索内容,
        [文件.name, 文件.path, 整理信息?.note],
        标签列表,
        搜索模式,
      );
      return 标签匹配 && 搜索匹配;
    });

    return [...项目].sort((左侧, 右侧) => {
      const 左侧为文件夹 = 左侧.type === "folder";
      const 右侧为文件夹 = 右侧.type === "folder";
      if (文件夹优先 && 左侧为文件夹 !== 右侧为文件夹) return 左侧为文件夹 ? -1 : 1;

      if (排序 === "name-desc") return 文件名排序器.compare(右侧.name, 左侧.name);
      if (排序 === "time-asc") {
        return (左侧.modifiedAt ?? 0) - (右侧.modifiedAt ?? 0)
          || 文件名排序器.compare(左侧.name, 右侧.name);
      }
      if (排序 === "time-desc") {
        return (右侧.modifiedAt ?? 0) - (左侧.modifiedAt ?? 0)
          || 文件名排序器.compare(左侧.name, 右侧.name);
      }
      if (排序 === "type") {
        return 类型顺序[左侧.type] - 类型顺序[右侧.type]
          || 文件名排序器.compare(左侧.name, 右侧.name);
      }
      return 文件名排序器.compare(左侧.name, 右侧.name);
    });
  }, [当前目录, 搜索内容, 排序, 文件夹优先, 资源元数据表, 已选标签列表, 搜索模式, 隐藏已加入书架资源, 已加入书架资源集合]);

  const 实际每页数量 = Math.max(网格列数, Math.floor(每页数量 / 网格列数) * 网格列数);
  const 总页数 = Math.max(1, Math.ceil(筛选排序后项目.length / 实际每页数量));
  const 安全当前页 = Math.min(Math.max(当前页, 1), 总页数);
  const 当前页项目 = useMemo(() => {
    const 起始位置 = (安全当前页 - 1) * 实际每页数量;
    return 筛选排序后项目.slice(起始位置, 起始位置 + 实际每页数量);
  }, [安全当前页, 实际每页数量, 筛选排序后项目]);
  const 筛选后收藏列表 = useMemo(() => {
    return 收藏列表.filter((项目) => {
      const 整理信息 = 获取资源整理信息({
        resourceKey: 项目.resourceKey,
        sourcePath: 项目.sourcePath,
        sourceType: 项目.sourceType,
        title: 项目.title,
      }, 项目);
      const 标签列表 = 整理信息.tags;
      const 标签匹配 = 资源包含全部标签(标签列表, 已选标签列表);
      const 搜索匹配 = 匹配整理搜索(
        收藏搜索内容,
        [项目.title, 项目.sourcePath, 整理信息.note],
        标签列表,
        搜索模式,
      );
      return 标签匹配 && 搜索匹配;
    });
  }, [收藏列表, 收藏搜索内容, 已选标签列表, 资源元数据表, 搜索模式]);
  const 筛选后书签列表 = useMemo(() => {
    return 书签列表.filter((项目) => {
      const 标签列表 = 获取整理标签(项目);
      const 标签匹配 = 资源包含全部标签(标签列表, 已选标签列表);
      const 搜索匹配 = 匹配整理搜索(
        书签搜索内容,
        [项目.title, 项目.sourcePath, 项目.pageName, 项目.note],
        标签列表,
        搜索模式,
      );
      return 标签匹配 && 搜索匹配;
    });
  }, [书签列表, 书签搜索内容, 已选标签列表, 搜索模式]);
  const 当前虚拟文件夹 = useMemo(
    () => 虚拟文件夹列表.find((项目) => 项目.id === 当前虚拟文件夹ID) ?? null,
    [虚拟文件夹列表, 当前虚拟文件夹ID],
  );
  const 筛选后书架文件夹列表 = useMemo(() => {
    const 搜索 = 搜索内容;
    return 虚拟文件夹列表
      .filter((文件夹) => 匹配整理搜索(
        搜索,
        [文件夹.name, 文件夹.note],
        文件夹.tags,
        搜索模式,
      ))
      .sort((左侧, 右侧) => {
        if (排序 === "name-desc") return 文件名排序器.compare(右侧.name, 左侧.name);
        if (排序 === "time-asc") return 左侧.createdAt - 右侧.createdAt || 文件名排序器.compare(左侧.name, 右侧.name);
        if (排序 === "time-desc" || 排序 === "type") {
          return 右侧.createdAt - 左侧.createdAt || 文件名排序器.compare(左侧.name, 右侧.name);
        }
        return 文件名排序器.compare(左侧.name, 右侧.name);
      });
  }, [虚拟文件夹列表, 搜索内容, 搜索模式, 排序]);
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
        const 标签匹配 = 资源包含全部标签(标签列表, 已选标签列表);
        const 搜索匹配 = 匹配整理搜索(
          搜索,
          [项目.title, 项目.sourcePath, 整理信息.note],
          标签列表,
          搜索模式,
        );
        return 标签匹配 && 搜索匹配;
      })
      .sort((左侧, 右侧) => {
        if (排序 === "name-desc") return 文件名排序器.compare(右侧.title, 左侧.title);
        if (排序 === "time-asc") return 左侧.addedAt - 右侧.addedAt || 文件名排序器.compare(左侧.title, 右侧.title);
        if (排序 === "time-desc") return 右侧.addedAt - 左侧.addedAt || 文件名排序器.compare(左侧.title, 右侧.title);
        if (排序 === "type") {
          return 类型顺序[左侧.sourceType] - 类型顺序[右侧.sourceType]
            || 文件名排序器.compare(左侧.title, 右侧.title);
        }
        return 文件名排序器.compare(左侧.title, 右侧.title);
      });
  }, [当前虚拟文件夹, 搜索内容, 已选标签列表, 资源元数据表, 搜索模式, 排序]);
  const 最近打开卡片项目 = useMemo(() => 最近打开列表.map((项目) => {
    const 文件类型: 资源类型 = 项目.sourceType === "archive"
      ? "archive"
      : 项目.sourceType === "image"
        ? "image"
        : "folder";
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
  }), [最近打开列表]);
  const 收藏卡片项目 = useMemo(() => 筛选后收藏列表.map((项目) => {
    const 文件类型: 资源类型 = 项目.sourceType === "archive"
      ? "archive"
      : 项目.sourceType === "image"
        ? "image"
        : "folder";
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
    const 文件类型: 资源类型 = 项目.sourceType === "archive"
      ? "archive"
      : 项目.sourceType === "image"
        ? "image"
        : "folder";
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
      const 预览资源 = 文件夹.items[0];
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
    return 合并标签顺序(Array.from(标签集合));
  }, [资源元数据表, 收藏列表, 书签列表, 标签顺序]);
  const 当前搜索内容 = 当前视图 === "favorites" ? 收藏搜索内容 : 当前视图 === "bookmarks" ? 书签搜索内容 : 搜索内容;
  const 标签建议列表 = useMemo(() => {
    return 获取标签建议(当前搜索内容, 全部标签列表, 搜索模式);
  }, [全部标签列表, 当前搜索内容, 搜索模式]);
  const 抽屉标签建议列表 = useMemo(
    () => 获取标签建议(标签搜索内容, 全部标签列表, 标签抽屉搜索模式),
    [全部标签列表, 标签搜索内容, 标签抽屉搜索模式],
  );
  const 收藏Key集合 = useMemo(
    () => new Set(收藏列表.map((项目) => 项目.resourceKey)),
    [收藏列表],
  );
  const 缩略图目标项目 = useMemo(
    () => {
      if (当前视图 === "recent") return 最近打开卡片项目.map(({ 文件 }) => 文件);
      if (当前视图 === "favorites") return 收藏卡片项目.map(({ 文件 }) => 文件);
      if (当前视图 === "bookshelf") return 书架文件夹预览项目.map(({ 文件 }) => 文件);
      if (当前视图 === "virtual-folder") return 虚拟文件夹卡片项目.map(({ 文件 }) => 文件);
      return 当前页项目;
    },
    [当前视图, 最近打开卡片项目, 收藏卡片项目, 书架文件夹预览项目, 虚拟文件夹卡片项目, 当前页项目],
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
    最近打开列表.map((项目) => ({
      key: 项目.resourceKey,
      path: 项目.sourcePath,
      type: 项目.sourceType,
      title: 项目.title,
    }))
  ), [最近打开列表]);
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
      .filter((项目) => 项目.sourceType === "folder" || 项目.sourceType === "image" || 项目.sourceType === "archive")
      .map((项目) => ({
        key: 项目.resourceKey,
        path: 项目.sourcePath,
        type: 项目.sourceType as "folder" | "image" | "archive",
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
    if (当前视图 === "directory") return 当前页项目.map((项目) => 项目.id);
    if (当前视图 === "recent") return 最近打开列表.map((项目) => 项目.resourceKey);
    if (当前视图 === "favorites") return 筛选后收藏列表.map((项目) => 项目.resourceKey);
    if (当前视图 === "bookmarks") return 筛选后书签列表.map((项目) => 项目.id);
    if (当前视图 === "virtual-folder") return 筛选后虚拟文件夹项目.map((项目) => 项目.resourceKey);
    return [];
  }, [当前视图, 当前页项目, 最近打开列表, 筛选后收藏列表, 筛选后书签列表, 筛选后虚拟文件夹项目]);
  const 是否显示分页 = 筛选排序后项目.length > 实际每页数量;

  useLayoutEffect(() => {
    if (当前视图 !== "directory") return;

    const 更新网格列数 = (): void => {
      const 网格 = 网格容器.current;
      if (!网格) {
        设置网格列数(1);
        return;
      }

      const 列模板 = window.getComputedStyle(网格).gridTemplateColumns;
      const 新列数 = 列模板 && 列模板 !== "none"
        ? 列模板.split(" ").filter(Boolean).length
        : 1;
      设置网格列数((原列数) => 原列数 === 新列数 ? 原列数 : Math.max(1, 新列数));
    };

    更新网格列数();

    const 观察器 = new ResizeObserver(更新网格列数);
    if (网格容器.current) 观察器.observe(网格容器.current);
    if (列表容器.current) 观察器.observe(列表容器.current);
    window.addEventListener("resize", 更新网格列数);

    return () => {
      观察器.disconnect();
      window.removeEventListener("resize", 更新网格列数);
    };
  }, [当前视图, 缩略图尺寸]);

  useEffect(() => {
    if (当前页 !== 安全当前页) {
      待恢复滚动位置.current = "top";
      设置当前页(安全当前页);
    }
    设置页码输入(String(安全当前页));
  }, [安全当前页, 当前页]);

  useLayoutEffect(() => {
    if (当前视图 !== "directory") return;
    if (待恢复滚动位置.current) return;

    自动翻页锁定.current = false;
    自动翻页冷却截止.current = 0;
    列表容器.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [
    当前视图,
    当前目录?.path,
    搜索内容,
    排序,
    文件夹优先,
    隐藏已加入书架资源,
    缩略图尺寸,
    每页数量,
    实际每页数量,
  ]);

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
    if (!当前选择视图 || 选择模式 !== 当前选择视图) return;

    const 处理选择快捷键 = (事件: KeyboardEvent): void => {
      const 目标 = 事件.target;
      if (目标 instanceof HTMLElement) {
        const 标签名 = 目标.tagName.toLowerCase();
        if (目标.isContentEditable || 标签名 === "input" || 标签名 === "textarea" || 标签名 === "select") return;
      }
      if (当前右侧抽屉 || 待删除标签列表 || 批量删除确认 || 待删除根目录 || 标签添加弹窗打开) return;

      if (事件.key === "Escape") {
        事件.preventDefault();
        if (已选项目Key集合.size > 0) {
          设置已选项目Key集合(new Set());
        } else {
          退出选择模式();
        }
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
    选择模式,
    已选项目Key集合,
    删除前确认设置,
    当前右侧抽屉,
    待删除标签列表,
    批量删除确认,
    待删除根目录,
    标签添加弹窗打开,
  ]);

  useLayoutEffect(() => {
    const 容器 = 列表容器.current;
    const 目标位置 = 待恢复滚动位置.current;
    if (!容器 || !目标位置) return;

    容器.scrollTo({
      top: 目标位置 === "bottom" ? 容器.scrollHeight : 0,
      behavior: "auto",
    });
    待恢复滚动位置.current = null;
  }, [安全当前页, 当前页项目]);

  useEffect(() => () => {
    if (滚轮停止定时器.current !== null) {
      window.clearTimeout(滚轮停止定时器.current);
    }
    if (书架备注悬停定时器.current !== null) {
      window.clearTimeout(书架备注悬停定时器.current);
    }
  }, []);

  useEffect(() => {
    隐藏书架备注悬浮窗();
  }, [当前视图, 搜索内容, 排序, 书架备注悬停延迟]);

  useEffect(() => {
    let 已取消 = false;

    async function 恢复本地数据(): Promise<void> {
      const 结果 = await window.omicomic.getAppData();
      if (已取消) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        设置数据已加载(true);
        return;
      }

      应用界面设置(结果.data.settings);
      设置根目录列表(结果.data.library.roots);
      设置阅读进度表(结果.data.readingProgress);
      设置最近打开列表(结果.data.recentOpened);
      设置收藏列表(结果.data.favorites);
      设置书签列表(结果.data.bookmarks);
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

    void 恢复本地数据();
    return () => {
      已取消 = true;
    };
  }, []);

  useEffect(() => {
    if (!数据已加载) return;
    let 已取消 = false;

    async function 刷新阅读数据(): Promise<void> {
      const 结果 = await window.omicomic.getAppData();
      if (已取消 || !结果.ok) return;
      设置阅读进度表(结果.data.readingProgress);
      设置最近打开列表(结果.data.recentOpened);
      设置收藏列表(结果.data.favorites);
      设置书签列表(结果.data.bookmarks);
      设置虚拟文件夹列表(结果.data.virtualFolders);
      设置资源元数据表(结果.data.resourceMeta);
      设置标签顺序(结果.data.tagOrder);
    }

    void 刷新阅读数据();
    return () => {
      已取消 = true;
    };
  }, [refreshToken, 数据已加载]);

  useEffect(() => {
    if (!资源菜单 && !最近菜单 && !收藏菜单 && !书签菜单 && !虚拟文件夹菜单 && !虚拟文件夹资源菜单 && !根目录菜单 && !标签菜单) return;

    function 关闭菜单(): void {
      设置资源菜单(null);
      设置最近菜单(null);
      设置收藏菜单(null);
      设置书签菜单(null);
      设置虚拟文件夹菜单(null);
      设置虚拟文件夹资源菜单(null);
      设置根目录菜单(null);
      设置标签菜单(null);
    }

    function 处理按键(事件: KeyboardEvent): void {
      if (事件.key === "Escape") {
        设置资源菜单(null);
        设置最近菜单(null);
        设置收藏菜单(null);
        设置书签菜单(null);
        设置虚拟文件夹菜单(null);
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
  }, [资源菜单, 最近菜单, 收藏菜单, 书签菜单, 虚拟文件夹菜单, 虚拟文件夹资源菜单, 根目录菜单, 标签菜单]);

  useEffect(() => {
    if (!当前右侧抽屉) return;

    function 处理抽屉快捷键(事件: KeyboardEvent): void {
      if (待删除标签列表 || 批量删除确认 || 待删除根目录) return;
      const 目标 = 事件.target;

      if (事件.key === "Escape") {
        事件.preventDefault();
        if (当前右侧抽屉 === "resource-info" && 标签添加弹窗打开) {
          关闭标签添加弹窗();
          return;
        }
        if (当前右侧抽屉 === "tag-filter" && 标签删除选择模式) {
          退出标签删除选择模式();
          return;
        }
        关闭右侧抽屉();
        return;
      }

      if (当前右侧抽屉 === "resource-info" && 事件.key === "Enter") {
        if (事件.isComposing || 整理保存中 || !资源信息目标 || 标签添加弹窗打开) return;

        if (目标 instanceof HTMLElement) {
          const 标签名 = 目标.tagName.toLowerCase();
          const 是备注框 = 标签名 === "textarea";
          const 在资源信息抽屉内 = Boolean(目标.closest(".resource-info-drawer"));
          const 是可输入控件 = 目标.isContentEditable
            || 标签名 === "input"
            || 标签名 === "textarea"
            || 标签名 === "select"
            || (在资源信息抽屉内 && (标签名 === "button" || 标签名 === "a"));
          if (是备注框 && (事件.ctrlKey || 事件.metaKey)) {
            事件.preventDefault();
            void 保存资源信息();
            return;
          }
          if (是可输入控件) return;
        }

        事件.preventDefault();
        void 保存资源信息();
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
    if (!完整标签浮层) return;

    function 关闭完整标签预览(): void {
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
  }, [当前视图, 当前根目录, 当前页, 搜索内容, 收藏搜索内容, 书签搜索内容, 排序, 每页数量, 当前右侧抽屉]);

  useEffect(() => {
    if (!资源信息目标 || 资源信息目标.thumbnailUrl) return;
    let 已取消 = false;

    async function 加载资源信息预览(): Promise<void> {
      if (!资源信息目标) return;
      if (资源信息目标.kind === "resource") {
        if (!支持真实缩略图(资源信息目标.fileType)) return;
        const 结果 = await window.omicomic.getThumbnail({
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

  useEffect(() => {
    if (!待删除标签列表 && !批量删除确认 && !待删除根目录 && !待删除虚拟文件夹 && !虚拟文件夹弹窗 && !加入虚拟文件夹目标) return;

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
        } else if (待删除虚拟文件夹) {
          设置待删除虚拟文件夹(null);
        } else if (虚拟文件夹弹窗) {
          打开虚拟文件夹弹窗(null);
        } else if (加入虚拟文件夹目标) {
          设置加入虚拟文件夹目标(null);
        }
        return;
      }

      if (事件.key !== "Delete" || 删除确认处理中) return;
      事件.preventDefault();
      if (待删除标签列表) void 确认删除标签列表();
      else if (批量删除确认) void 确认批量删除();
      else if (待删除根目录) void 确认删除根目录记录();
      else if (待删除虚拟文件夹) void 删除虚拟文件夹记录();
    }

    window.addEventListener("keydown", 处理删除确认快捷键);
    return () => window.removeEventListener("keydown", 处理删除确认快捷键);
  }, [待删除标签列表, 批量删除确认, 待删除根目录, 待删除虚拟文件夹, 虚拟文件夹弹窗, 加入虚拟文件夹目标, 删除确认处理中, 删除标签不再提醒, 批量删除不再提醒]);

  useEffect(() => {
    if (当前视图 !== "virtual-folder") return;

    function 正在编辑文本(目标: EventTarget | null): boolean {
      return 目标 instanceof HTMLElement
        && (目标.isContentEditable
          ||目标.tagName.toLowerCase() === "input"
          || 目标.tagName.toLowerCase() === "textarea"
          || 目标.tagName.toLowerCase() === "select");
    }

    function 处理书架内部返回快捷键(事件: KeyboardEvent): void {
      if (事件.key !== "Escape") return;
      if (正在编辑文本(事件.target)) return;
      if (
        当前右侧抽屉
        || 完整标签浮层
        || 资源菜单
        || 最近菜单
        || 收藏菜单
        || 书签菜单
        || 虚拟文件夹菜单
        || 虚拟文件夹资源菜单
        || 根目录菜单
        || 标签菜单
        || 待删除标签列表
        || 批量删除确认
        || 待删除根目录
        || 待删除虚拟文件夹
        || 虚拟文件夹弹窗
        || 加入虚拟文件夹目标
        || 选择模式
      ) return;

      事件.preventDefault();
      返回书架根层();
    }

    window.addEventListener("keydown", 处理书架内部返回快捷键);
    return () => window.removeEventListener("keydown", 处理书架内部返回快捷键);
  }, [
    当前视图,
    当前右侧抽屉,
    完整标签浮层,
    资源菜单,
    最近菜单,
    收藏菜单,
    书签菜单,
    虚拟文件夹菜单,
    虚拟文件夹资源菜单,
    根目录菜单,
    标签菜单,
    待删除标签列表,
    批量删除确认,
    待删除根目录,
    待删除虚拟文件夹,
    虚拟文件夹弹窗,
    加入虚拟文件夹目标,
    选择模式,
  ]);

  useEffect(() => {
    const 本次序号 = ++缩略图请求序号.current;
    const 可加载项目 = 缩略图目标项目.filter((文件) => 支持真实缩略图(文件.type));
    const 当前显示路径集合 = new Set(缩略图目标项目.map((文件) => 文件.path));

    设置缩略图表((原表) => {
      const 新表: Record<string, 缩略图状态> = {};
      for (const 文件 of 缩略图目标项目) {
        const 原状态 = 原表[文件.path];
        if (原状态 && 当前显示路径集合.has(文件.path)) {
          新表[文件.path] = 原状态;
        } else {
          新表[文件.path] = { status: 支持真实缩略图(文件.type) ? "loading" : "error", url: null };
        }
      }
      return 新表;
    });

    async function 加载缩略图批次(): Promise<void> {
      const 待加载项目 = 可加载项目.filter((文件) => {
        const 状态 = 缩略图表[文件.path];
        return 状态?.status !== "loaded" && 状态?.status !== "loading";
      });
      const 加载队列 = 待加载项目.length > 0 ? 待加载项目 : 可加载项目;
      const 并发数 = 6;
      let 游标 = 0;

      async function 工作线程(): Promise<void> {
        while (游标 < 加载队列.length) {
          const 文件 = 加载队列[游标];
          游标 += 1;

          if (本次序号 !== 缩略图请求序号.current) return;

          try {
            const 结果 = await window.omicomic.getThumbnail({ path: 文件.path, type: 文件.type });
            if (本次序号 !== 缩略图请求序号.current) return;

            设置缩略图表((原表) => {
              if (!(文件.path in 原表)) return 原表;
              return {
                ...原表,
                [文件.path]: 结果.ok && 结果.data.url
                  ? { status: "loaded", url: 结果.data.url }
                  : { status: "error", url: null },
              };
            });
          } catch {
            if (本次序号 !== 缩略图请求序号.current) return;
            设置缩略图表((原表) => {
              if (!(文件.path in 原表)) return 原表;
              return {
                ...原表,
                [文件.path]: { status: "error", url: null },
              };
            });
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(并发数, 加载队列.length) }, () => 工作线程()),
      );
    }

    void 加载缩略图批次();
  }, [缩略图目标项目]);

  useEffect(() => {
    const 本次序号 = ++书签预览请求序号.current;
    可见书签ID集合.current = new Set();

    if (当前视图 !== "bookmarks") {
      书签预览状态Ref.current = {};
      设置书签预览表({});
      return;
    }

    设置书签预览表((原表) => {
      const 新表: Record<string, 缩略图状态> = {};
      for (const { 项目 } of 书签卡片项目) {
        新表[项目.id] = 原表[项目.id]
          ?? (项目.thumbnailUrl
            ? { status: "loaded", url: 项目.thumbnailUrl }
            : { status: "idle", url: null });
      }
      书签预览状态Ref.current = 新表;
      return 新表;
    });

    async function 加载可见书签预览(): Promise<void> {
      if (本次序号 !== 书签预览请求序号.current) return;

      const 可加载书签 = 书签卡片项目
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
  }, [当前视图, 书签卡片项目]);

  useEffect(() => {
    const 本次序号 = ++可阅读页数请求序号.current;
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
        新表[key] = 原表[key] ?? { status: "loading", count: null };
      }
      return 新表;
    });

    async function 加载可阅读页数批次(): Promise<void> {
      const 待统计项目 = 可统计项目.filter((文件) => {
        const key = 获取可阅读页数Key(文件);
        if (!key) return false;
        const 状态 = 可阅读页数表[key];
        return 状态?.status !== "loaded";
      });
      const 统计队列 = 待统计项目.length > 0 ? 待统计项目 : 可统计项目;
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
                  ? { status: "loaded", count: 结果.data }
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
  }, [缩略图目标项目]);

  useEffect(() => {
    function 处理分页快捷键(事件: KeyboardEvent): void {
      if (!当前目录 || !是否显示分页) return;
      if (事件.key === "PageUp") {
        事件.preventDefault();
        待恢复滚动位置.current = "top";
        设置当前页((页码) => Math.max(1, 页码 - 1));
      } else if (事件.key === "PageDown") {
        事件.preventDefault();
        待恢复滚动位置.current = "top";
        设置当前页((页码) => Math.min(总页数, 页码 + 1));
      }
    }

    window.addEventListener("keydown", 处理分页快捷键);
    return () => window.removeEventListener("keydown", 处理分页快捷键);
  }, [当前目录, 是否显示分页, 总页数]);

  async function 打开目录(
    目录路径: string,
    根目录路径: string,
    历史处理: 历史操作 = "push",
    重置分页 = true,
  ): Promise<boolean> {
    const 本次序号 = ++读取序号.current;
    设置正在读取(true);
    设置错误信息(null);

    try {
      const 结果 = await window.omicomic.listDirectory(目录路径);
      if (本次序号 !== 读取序号.current) return false;

      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return false;
      }

      设置当前目录(结果.data);
      设置当前根目录(根目录路径);
      设置当前视图("directory");
      void window.omicomic.updateLibraryState({
        lastActiveRootPath: 根目录路径,
        lastCurrentPath: 结果.data.path,
      });
      if (重置分页) {
        回到第一页();
      }

      if (历史处理 === "push") {
        设置历史记录((原记录) => {
          const 已保留记录 = 原记录.entries.slice(0, 原记录.index + 1);
          const 最后一项 = 已保留记录.at(-1);
          if (最后一项?.path === 结果.data.path) return 原记录;

          const 新记录 = [...已保留记录, { path: 结果.data.path, rootPath: 根目录路径 }];
          return { entries: 新记录, index: 新记录.length - 1 };
        });
      }

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
      await 打开目录(根目录.path, 根目录.path);
    } catch {
      设置错误信息("无法添加该目录，请稍后重试。");
    }
  }

  async function 返回上一处(): Promise<void> {
    if (历史记录.index <= 0) return;
    const 目标位置 = 历史记录.index - 1;
    const 目标 = 历史记录.entries[目标位置];
    if (await 打开目录(目标.path, 目标.rootPath, "none")) {
      设置历史记录((原记录) => ({ ...原记录, index: 目标位置 }));
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

  async function 打开资源(文件: 文件条目): Promise<void> {
    if (!当前根目录) return;
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (文件.type === "pdf") {
      设置错误信息("PDF 阅读支持已暂时关闭，将在后续版本重新评估。");
      return;
    }
    if (文件.type === "epub") {
      设置错误信息("当前版本暂不支持 EPUB 阅读。");
      return;
    }
    if (
      文件.type !== "folder"
      && 文件.type !== "image"
      && 文件.type !== "archive"
    ) return;

    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.getResourcePages({ path: 文件.path, type: 文件.type });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        if (文件.type === "folder" && 结果.error.code === "NO_IMAGES") {
          const 已进入目录 = await 打开目录(文件.path, 当前根目录);
          if (本次打开序号 !== 打开阅读请求序号.current) return;
          if (已进入目录) {
            设置错误信息(结果.error.message);
          }
        } else {
          设置错误信息(结果.error.message);
        }
        return;
      }

      const 默认起始页 = 文件.type === "image"
        ? Math.max(0, 结果.data.pages.findIndex((页面) => 页面.sourcePath === 文件.path))
        : 0;
      const 进度结果 = await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 已保存进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = 已保存进度
        ? Math.min(Math.max(已保存进度.currentPageIndex, 0), Math.max(0, 结果.data.total - 1))
        : 默认起始页;
      void 保存资源当前进度(结果.data, 起始页);
      onOpenReader(
        结果.data,
        起始页,
        创建阅读上下文("directory", 结果.data.resourceKey, 当前目录阅读队列),
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      设置错误信息("无法打开该阅读资源，请稍后重试。");
    }
  }

  async function 打开最近项目(项目: RecentOpenedItem): Promise<void> {
    const 本次打开序号 = ++打开阅读请求序号.current;
    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.getResourcePages({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 进度结果 = await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = Math.min(
        Math.max(进度?.currentPageIndex ?? 项目.currentPageIndex ?? 0, 0),
        Math.max(0, 结果.data.total - 1),
      );
      void 保存资源当前进度(结果.data, 起始页);
      onOpenReader(
        结果.data,
        起始页,
        创建阅读上下文("recent", 结果.data.resourceKey, 最近打开阅读队列),
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      设置错误信息("最近打开的资源不存在或无法访问。");
    }
  }

  async function 打开收藏项目(项目: FavoriteItem): Promise<void> {
    const 本次打开序号 = ++打开阅读请求序号.current;
    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.getResourcePages({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 进度结果 = await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = Math.min(
        Math.max(进度?.currentPageIndex ?? 0, 0),
        Math.max(0, 结果.data.total - 1),
      );
      void 保存资源当前进度(结果.data, 起始页);
      onOpenReader(
        结果.data,
        起始页,
        创建阅读上下文("favorites", 结果.data.resourceKey, 收藏阅读队列),
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      设置错误信息("收藏资源不存在或无法访问。");
    }
  }

  async function 打开虚拟文件夹项目(项目: VirtualFolderItem): Promise<void> {
    const 本次打开序号 = ++打开阅读请求序号.current;
    if (项目.sourceType === "pdf") {
      设置错误信息("PDF 阅读支持已暂时关闭，将在后续版本重新评估。");
      return;
    }
    if (项目.sourceType === "epub") {
      设置错误信息("当前版本暂不支持 EPUB 阅读。");
      return;
    }
    if (项目.sourceType !== "folder" && 项目.sourceType !== "image" && 项目.sourceType !== "archive") return;

    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.getResourcePages({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 进度结果 = await window.omicomic.getReadingProgress(结果.data.resourceKey);
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 起始页 = Math.min(
        Math.max(进度?.currentPageIndex ?? 0, 0),
        Math.max(0, 结果.data.total - 1),
      );
      void 保存资源当前进度(结果.data, 起始页);
      onOpenReader(
        结果.data,
        起始页,
        创建阅读上下文("virtual-folder", 结果.data.resourceKey, 虚拟文件夹阅读队列),
      );
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      设置错误信息("书架文件夹中的资源不存在或无法访问。");
    }
  }

  async function 打开书签项目(项目: BookmarkItem): Promise<void> {
    const 本次打开序号 = ++打开阅读请求序号.current;
    设置错误信息(null);
    try {
      const 结果 = await window.omicomic.getResourcePages({
        path: 项目.sourcePath,
        type: 项目.sourceType,
      });
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 起始页 = Math.min(Math.max(项目.pageIndex, 0), Math.max(0, 结果.data.total - 1));
      if (项目.pageIndex !== 起始页) {
        设置错误信息("书签页码已超出当前资源页数，已跳转到最后一页。");
      }
      void 保存资源当前进度(结果.data, 起始页);
      onOpenReader(结果.data, 起始页);
    } catch {
      if (本次打开序号 !== 打开阅读请求序号.current) return;
      设置错误信息("书签资源不存在或无法访问。");
    }
  }

  function 应用页码输入(): void {
    const 输入页码 = Number.parseInt(页码输入, 10);
    const 修正页码 = Number.isFinite(输入页码)
      ? Math.min(Math.max(输入页码, 1), 总页数)
      : 安全当前页;
    待恢复滚动位置.current = "top";
    退出选择模式();
    设置当前页(修正页码);
    设置页码输入(String(修正页码));
  }

  function 跳转页码(目标页码: number): void {
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
    设置书架备注悬浮窗(null);
  }

  function 显示书架备注悬浮窗(文件夹: VirtualFolder, 元素: HTMLElement): void {
    const 备注 = 文件夹.note.trim();
    if (!备注) {
      隐藏书架备注悬浮窗();
      return;
    }

    if (书架备注悬停定时器.current !== null) {
      window.clearTimeout(书架备注悬停定时器.current);
      书架备注悬停定时器.current = null;
    }

    const 显示 = (): void => {
      const rect = 元素.getBoundingClientRect();
      const 最大宽度 = Math.min(280, Math.max(180, window.innerWidth - 32));
      const 估算高度 = Math.min(180, Math.max(48, Math.ceil(备注.length / 18) * 22 + 24));
      const 左侧 = Math.min(
        Math.max(16, rect.left + rect.width / 2 - 最大宽度 / 2),
        Math.max(16, window.innerWidth - 最大宽度 - 16),
      );
      const 下方Top = rect.bottom + 10;
      const 上方Top = rect.top - 估算高度 - 10;
      const top = 下方Top + 估算高度 <= window.innerHeight - 16
        ? 下方Top
        : Math.max(16, 上方Top);

      设置书架备注悬浮窗({
        folderId: 文件夹.id,
        note: 备注,
        style: {
          left: `${左侧}px`,
          top: `${top}px`,
          maxWidth: `${最大宽度}px`,
        },
      });
    };

    if (书架备注悬停延迟 === 0) {
      显示();
      return;
    }
    书架备注悬停定时器.current = window.setTimeout(显示, 书架备注悬停延迟);
  }

  function 打开书架(): void {
    if (排序 === "type") 设置排序("name-asc");
    设置当前视图("bookshelf");
    设置当前虚拟文件夹ID(null);
    设置错误信息(null);
    回到第一页();
  }

  function 进入书架文件夹(文件夹: VirtualFolder): void {
    设置当前虚拟文件夹ID(文件夹.id);
    设置当前视图("virtual-folder");
    设置错误信息(null);
    回到第一页();
  }

  function 返回书架根层(): void {
    if (排序 === "type") 设置排序("name-asc");
    设置当前视图("bookshelf");
    设置当前虚拟文件夹ID(null);
    设置错误信息(null);
    回到第一页();
  }

  async function 刷新最近打开(): Promise<void> {
    const 最近结果 = await window.omicomic.getRecentOpened();
    if (最近结果.ok) {
      设置最近打开列表(最近结果.data);
    }
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

  async function 切换收藏(收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt">): Promise<void> {
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
      设置错误信息("书架文件夹名称不能为空。");
      return;
    }
    if (
      名称
      && 虚拟文件夹列表.some((项目) => 项目.name === 名称 && (
        虚拟文件夹弹窗.mode === "create" || 项目.id !== 虚拟文件夹弹窗.folder.id
      ))
    ) {
      设置错误信息("已存在同名书架文件夹。");
      return;
    }

    设置删除确认处理中(true);
    try {
      if (虚拟文件夹弹窗.mode === "create") {
        const 结果 = await window.omicomic.createVirtualFolder({ name: 名称, note: 备注 });
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
        设置当前虚拟文件夹ID(null);
        设置当前视图("bookshelf");
        设置加入虚拟文件夹目标(null);
        打开虚拟文件夹弹窗(null);
        设置错误信息(虚拟文件夹弹窗.items?.length ? `已新建书架文件夹并加入 ${虚拟文件夹弹窗.items.length} 个资源。` : null);
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
    const 删除ID = 待删除虚拟文件夹.id;
    设置删除确认处理中(true);
    try {
      const 结果 = await window.omicomic.deleteVirtualFolder(删除ID);
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }
      设置虚拟文件夹列表(结果.data);
      设置待删除虚拟文件夹(null);
      if (当前视图 === "virtual-folder" && 当前虚拟文件夹ID === 删除ID) {
        设置当前虚拟文件夹ID(null);
        设置当前视图("bookshelf");
      }
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 选择已有虚拟文件夹加入(items: VirtualFolderItemInput[], title: string): void {
    if (虚拟文件夹列表.length === 0) {
      打开虚拟文件夹弹窗({ mode: "create", items });
      return;
    }
    设置加入虚拟文件夹目标({ items, title });
  }

  async function 加入到虚拟文件夹(folderId: string, items: VirtualFolderItemInput[]): Promise<void> {
    const 结果 = await window.omicomic.addVirtualFolderItems({ folderId, items });
    if (!结果.ok) {
      设置错误信息(结果.error.message);
      return;
    }
    设置虚拟文件夹列表((原列表) => 原列表.map((项目) => 项目.id === folderId ? 结果.data.folder : 项目));
    设置加入虚拟文件夹目标(null);
    设置最近菜单(null);
    设置收藏菜单(null);
    设置虚拟文件夹资源菜单(null);
    const 反馈 = 结果.data.addedCount > 0
      ? `已加入 ${结果.data.addedCount} 个资源到书架。`
      : "该资源已在目标书架文件夹中。";
    设置错误信息(反馈);
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
  }

  function 打开资源信息抽屉(目标: 资源信息目标): void {
    设置完整标签浮层(null);
    设置资源信息目标(目标);
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
    设置当前右侧抽屉("resource-info");
  }

  function 关闭右侧抽屉(): void {
    if (整理保存中) return;
    设置当前右侧抽屉(null);
    设置整理错误(null);
    设置标签添加弹窗打开(false);
    设置标签添加输入("");
    设置标签删除选择模式(false);
    设置待删除标签选择集合(new Set());
  }

  async function 保存资源信息(): Promise<void> {
    if (!资源信息目标 || 整理保存中) return;
    const 输入: 整理信息输入 = {
      note: 整理备注输入.trim(),
      tags: 解析标签输入(整理标签输入),
    };

    设置整理保存中(true);
    设置整理错误(null);
    try {
      if (资源信息目标.kind === "bookmark") {
        const 结果 = await window.omicomic.updateBookmarkMeta(资源信息目标.item.id, 输入);
        if (!结果.ok) {
          设置整理错误(结果.error.message);
          return;
        }
        设置书签列表((原列表) => [
          结果.data,
          ...原列表.filter((项目) => 项目.id !== 结果.data.id),
        ]);
        设置资源信息目标({ ...资源信息目标, item: 结果.data });
      } else {
        const 结果 = await window.omicomic.updateResourceMeta({
          ...资源信息目标.input,
          ...输入,
        });
        if (!结果.ok) {
          设置整理错误(结果.error.message);
          return;
        }
        设置资源元数据表((原表) => ({
          ...原表,
          [结果.data.resourceKey]: 结果.data,
        }));
      }
      推入本地标签顺序(输入.tags ?? []);
    } catch {
      设置整理错误("整理信息保存失败，请稍后重试。");
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
    void navigator.clipboard.writeText(路径).catch(() => 设置整理错误("路径复制失败，请手动复制。"));
  }

  function 打开完整标签浮层(事件: ReactMouseEvent<HTMLButtonElement>, key: string, 标签列表: string[]): void {
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

  function 全选当前选择视图(): void {
    设置已选项目Key集合(new Set(当前选择视图Key列表));
  }

  function 取消全选(): void {
    设置已选项目Key集合(new Set());
  }

  function 退出选择模式(): void {
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

  function 获取已选资源输入(视图: 选择视图): VirtualFolderItemInput[] {
    const 已选 = 已选项目Key集合;
    if (视图 === "directory") {
      return 当前页项目
        .filter((文件) => 已选.has(文件.id))
        .map((文件) => {
          const 输入 = 获取文件资源元数据输入(文件);
          return 输入 && 支持收藏(文件.type) ? 转为虚拟文件夹项目输入(输入) : null;
        })
        .filter((项目): 项目 is VirtualFolderItemInput => 项目 !== null);
    }
    if (视图 === "recent") {
      return 最近打开列表
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
      for (const key of 删除Key列表) {
        const 结果 = 视图 === "favorites"
          ? await window.omicomic.removeFavorite(key)
          : 视图 === "bookmarks"
            ? await window.omicomic.removeBookmark(key)
            : 视图 === "virtual-folder" && 当前虚拟文件夹
              ? await window.omicomic.removeVirtualFolderItem({ folderId: 当前虚拟文件夹.id, resourceKey: key })
              : await window.omicomic.removeRecentOpened(key);
        if (!结果.ok) {
          设置错误信息(结果.error.message);
          return;
        }
      }

      if (视图 === "favorites") {
        设置收藏列表((原列表) => 原列表.filter((项目) => !删除Key集合.has(项目.resourceKey)));
      } else if (视图 === "bookmarks") {
        设置书签列表((原列表) => 原列表.filter((项目) => !删除Key集合.has(项目.id)));
      } else if (视图 === "virtual-folder") {
        设置虚拟文件夹列表((原列表) => 原列表.map((文件夹) => (
          文件夹.id === 当前虚拟文件夹?.id
            ? { ...文件夹, items: 文件夹.items.filter((项目) => !删除Key集合.has(项目.resourceKey)) }
            : 文件夹
        )));
      } else {
        设置最近打开列表((原列表) => 原列表.filter((项目) => !删除Key集合.has(项目.resourceKey)));
      }
      退出选择模式();
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

      设置根目录列表(结果.data);
      设置待删除根目录(null);
      设置根目录菜单(null);

      if (!删除的是当前根目录) return;

      const 下一个根目录 = 结果.data[0];
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
      设置错误信息("根目录移除失败，请稍后重试。");
    } finally {
      设置删除确认处理中(false);
    }
  }

  function 渲染收藏按钮(收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt"> | null) {
    if (!收藏输入) return null;

    const 已收藏 = 收藏Key集合.has(收藏输入.resourceKey);
    return (
      <span
        className={`favorite-button ${已收藏 ? "is-active" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={已收藏 ? "取消收藏" : "收藏"}
        title={已收藏 ? "取消收藏" : "收藏"}
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
        {已收藏 ? "♥" : "♡"}
      </span>
    );
  }

  function 渲染资源信息按钮(目标: 资源信息目标 | null) {
    if (!目标) return null;

    return (
      <span
        className="resource-info-button"
        role="button"
        tabIndex={0}
        aria-label="打开资源信息"
        title="资源信息"
        onClick={(事件) => {
          事件.stopPropagation();
          打开资源信息抽屉(目标);
        }}
        onDoubleClick={(事件) => 事件.stopPropagation()}
        onKeyDown={(事件) => {
          if (事件.key !== "Enter" && 事件.key !== " ") return;
          事件.preventDefault();
          事件.stopPropagation();
          打开资源信息抽屉(目标);
        }}
      >
        ⋮
      </span>
    );
  }

  function 获取选择视图名称(视图: 选择视图): string {
    if (视图 === "favorites") return "收藏";
    if (视图 === "bookmarks") return "书签";
    if (视图 === "virtual-folder") return "书架文件夹";
    if (视图 === "directory") return "当前目录";
    return "最近打开";
  }

  function 获取批量删除标题(视图: 管理视图, 数量: number): string {
    if (视图 === "favorites") return `确认移除选中的 ${数量} 条收藏记录？`;
    if (视图 === "bookmarks") return `确认删除选中的 ${数量} 条书签？`;
    if (视图 === "virtual-folder") return `确认从当前书架文件夹移除选中的 ${数量} 个资源？`;
    return `确认删除选中的 ${数量} 条最近打开记录？`;
  }

  function 获取批量删除说明(视图: 管理视图): string {
    if (视图 === "favorites") return "此操作不会删除磁盘中的真实文件，也不会删除阅读进度、书签或最近打开记录。";
    if (视图 === "bookmarks") return "此操作不会删除磁盘中的真实文件，也不会删除阅读进度、收藏或最近打开记录。";
    if (视图 === "virtual-folder") return "只移除当前书架文件夹中的内部引用，不会删除原始漫画文件、收藏、书签或阅读进度。";
    return "此操作不会删除磁盘中的真实文件，也不会删除阅读进度、收藏或书签。";
  }

  function 渲染选择工具条(视图: 选择视图, 总数: number) {
    if (总数 <= 0) return null;
    const 正在选择 = 选择模式 === 视图;
    const 是目录视图 = 视图 === "directory";
    const 可加入虚拟文件夹 = 视图 !== "bookmarks";
    return (
      <div className="selection-toolbar" aria-label={`${获取选择视图名称(视图)}选择操作`}>
        {!正在选择 ? (
          <button type="button" className="compact-toolbar-button" onClick={() => 进入选择模式(视图)}>选择</button>
        ) : (
          <>
            <span>已选择 {已选项目Key集合.size} 项</span>
            <button type="button" onClick={全选当前选择视图}>全选</button>
            <button type="button" onClick={取消全选}>取消全选</button>
            {可加入虚拟文件夹 && (
              <button
                type="button"
                disabled={已选项目Key集合.size === 0}
                onClick={() => {
                  const 项目列表 = 获取已选资源输入(视图);
                  if (项目列表.length === 0) {
                    设置错误信息("当前选择中没有可加入书架的资源。");
                    return;
                  }
                  选择已有虚拟文件夹加入(项目列表, `已选择 ${项目列表.length} 个资源`);
                }}
              >
                加入书架
              </button>
            )}
            <button
              type="button"
              className="danger-action"
              disabled={已选项目Key集合.size === 0 || 是目录视图}
              title={是目录视图 ? "当前目录资源暂不支持批量删除真实文件" : undefined}
              onClick={() => 请求删除选中(视图)}
            >
              删除选中
            </button>
            <button type="button" onClick={退出选择模式}>退出选择</button>
          </>
        )}
      </div>
    );
  }

  function 渲染资源信息抽屉() {
    if (!资源信息目标) return null;

    const 是书签 = 资源信息目标.kind === "bookmark";
    const 标题 = 是书签 ? 资源信息目标.item.title : 资源信息目标.input.title;
    const 路径 = 是书签 ? 资源信息目标.item.sourcePath : 资源信息目标.input.sourcePath;
    const 类型 = 资源信息目标.fileType;
    const 信息 = 类型信息[类型];
    const 当前标签 = 解析标签输入(整理标签输入);
    const 进度文本 = 是书签
      ? `第 ${资源信息目标.item.pageIndex + 1} / ${资源信息目标.item.totalPages} 页`
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
                    <span className="tag-add-symbol" aria-hidden="true">+</span>
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
              <p className="drawer-path" title={路径}>{路径}</p>
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
    );
  }

  function 渲染标签筛选抽屉() {
    const 查询 = 标签搜索内容.trim();
    const 显示标签 = 查询 ? 筛选标签列表(标签搜索内容, 全部标签列表, 标签抽屉搜索模式) : 全部标签列表;
    const 有选中标签 = 已选标签列表.length > 0;
    const 待删除数量 = 待删除标签选择集合.size;

    return (
      <div
        className={`settings-overlay organize-drawer-overlay drawer-opacity-${整理侧边栏透明度}`}
        role="presentation"
        onMouseDown={关闭右侧抽屉}
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
              <h2 id="tag-filter-title">标签筛选</h2>
              <p>可多选，多个标签会同时生效。</p>
            </div>
            <button type="button" aria-label="关闭标签筛选" onClick={关闭右侧抽屉}>×</button>
          </header>
          <div className="settings-panel-body">
            <div className="tag-drawer-search-area">
              <label className="organize-field">
                <span>搜索标签</span>
                <span className="tag-drawer-search-box">
                  <input
                    ref={标签搜索输入框}
                    value={标签搜索内容}
                    placeholder="输入标签名或拼音片段"
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
                      aria-label="清空标签搜索"
                      title="清空标签搜索"
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
                <div className="tag-suggestions tag-drawer-suggestions" aria-label="标签建议">
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
              <span className="tag-drawer-mode-label">搜索模式</span>
              <div className="search-mode-toggle" role="group" aria-label="标签侧边栏搜索模式">
                <button
                  type="button"
                  className={标签抽屉搜索模式 === "fuzzy" ? "is-active" : ""}
                  onClick={() => 设置标签抽屉搜索模式("fuzzy")}
                >
                  模糊
                </button>
                <button
                  type="button"
                  className={标签抽屉搜索模式 === "exact" ? "is-active" : ""}
                  onClick={() => 设置标签抽屉搜索模式("exact")}
                >
                  精准
                </button>
              </div>
            </div>
            <section className="settings-section">
              <h3>当前筛选</h3>
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
                )) : <span className="drawer-muted">全部标签</span>}
              </div>
              <button type="button" className="secondary-action drawer-copy-button" onClick={() => {
                  设置已选标签列表([]);
                  回到第一页();
                }} disabled={!有选中标签}>
                清除选择
              </button>
            </section>
            <section className="settings-section tag-manage-section">
              <h3>标签管理</h3>
              <p className="settings-section-note">选择模式只用于删除标签本身，不改变当前筛选。</p>
              <div className="tag-filter-actions">
                <button
                  type="button"
                  className={`secondary-action drawer-copy-button ${标签删除选择模式 ? "is-active" : ""}`}
                  onClick={() => {
                    if (标签删除选择模式) 退出标签删除选择模式();
                    else 设置标签删除选择模式(true);
                  }}
                >
                  选择
                </button>
                <button
                  type="button"
                  className="secondary-action drawer-copy-button"
                  disabled={!标签删除选择模式 || 显示标签.length === 0}
                  onClick={() => 设置当前可见标签为待删除(显示标签)}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="danger-soft-action drawer-copy-button"
                  disabled={!标签删除选择模式 || 待删除数量 === 0}
                  onClick={请求删除已选择标签}
                >
                  删除{待删除数量 > 0 ? ` ${待删除数量}` : ""}
                </button>
                {标签删除选择模式 && (
                  <button
                    type="button"
                    className="secondary-action drawer-copy-button"
                    onClick={退出标签删除选择模式}
                  >
                    取消
                  </button>
                )}
              </div>
              {标签删除选择模式 && (
                <p className="drawer-muted">删除选择模式中，点击下方标签选择待删除项，按 Esc 退出，按 Del 删除。</p>
              )}
            </section>
            <section className="settings-section">
              <h3>全部标签</h3>
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
                    title={标签删除选择模式 ? "点击选择或取消待删除标签" : "拖拽调整标签顺序"}
                  >
                    {标签}
                  </button>
                )) : <span className="drawer-muted">暂无标签</span>}
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

  async function 保存资源当前进度(资源: 阅读资源结果, 当前页索引: number): Promise<void> {
    const 当前页面 = 资源.pages[当前页索引];
    if (!当前页面) return;

    const completed = 当前页索引 >= 资源.total - 1;
    const 结果 = await window.omicomic.saveReadingProgress({
      resourceKey: 资源.resourceKey,
      sourcePath: 资源.sourcePath,
      sourceType: 资源.sourceType,
      title: 资源.title,
      currentPageIndex: 当前页索引,
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
    if (!是否显示分页 || Math.abs(事件.deltaY) < 1) return;

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
  const 可以返回 = 当前视图 === "directory" && 历史记录.index > 0 && !正在读取;
  const 可以前进 = 历史记录.index >= 0
    && 历史记录.index < 历史记录.entries.length - 1
    && 当前视图 === "directory"
    && !正在读取;

  return (
    <section className="library-layout" aria-labelledby="library-title">
      <aside className="library-sidebar">
        <h2 id="library-title">资源库</h2>
        <button className="primary-action" onClick={() => void 添加目录()} disabled={正在读取}>
          ＋ 添加目录
        </button>

        <div className="sidebar-section sidebar-roots">
          <h3>根目录</h3>
          {根目录列表.length === 0 ? (
            <p className="sidebar-empty">尚未添加目录</p>
          ) : (
            根目录列表.map((根目录) => (
              <button
                key={根目录.path}
                className={`sidebar-item ${当前视图 === "directory" && 当前根目录 === 根目录.path ? "is-active" : ""}`}
                title={根目录.path}
                onClick={() => void 打开目录(根目录.path, 根目录.path)}
                onContextMenu={(事件) => {
                  事件.preventDefault();
                  设置根目录菜单({ x: 事件.clientX, y: 事件.clientY, 项目: 根目录 });
                }}
              >
                <span aria-hidden="true">▣</span>
                <span>{根目录.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="sidebar-section">
          <h3>浏览</h3>
          <button
            className={`sidebar-item ${当前视图 === "bookshelf" || 当前视图 === "virtual-folder" ? "is-active" : ""}`}
            onClick={打开书架}
          >
            <span aria-hidden="true">▤</span>
            <span>书架</span>
            <em className="sidebar-count">{虚拟文件夹列表.length}</em>
          </button>
          <button
            className={`sidebar-item ${当前视图 === "favorites" ? "is-active" : ""}`}
            onClick={() => {
              设置当前视图("favorites");
              设置错误信息(null);
            }}
          >
            <span aria-hidden="true">♥</span>
            <span>收藏</span>
            <em className="sidebar-count">{收藏列表.length}</em>
          </button>
          <button
            className={`sidebar-item ${当前视图 === "bookmarks" ? "is-active" : ""}`}
            onClick={() => {
              设置当前视图("bookmarks");
              设置错误信息(null);
            }}
          >
            <span aria-hidden="true">★</span>
            <span>书签</span>
            <em className="sidebar-count">{书签列表.length}</em>
          </button>
          <button
            className={`sidebar-item ${当前视图 === "recent" ? "is-active" : ""}`}
            onClick={() => {
              设置当前视图("recent");
              设置错误信息(null);
            }}
          >
            <span aria-hidden="true">◴</span>
            <span>最近打开</span>
            <em className="sidebar-count">{最近打开列表.length}</em>
          </button>
        </div>

        <div className="sidebar-footer-actions">
          <button
            className="secondary-action sidebar-settings-button"
            type="button"
            onClick={() => 设置当前右侧抽屉("settings")}
          >
            设置
          </button>
        </div>
        <p className="phase-note">双击文件夹浏览或阅读。图片、ZIP/CBZ 可直接阅读；PDF/EPUB 暂仅识别显示。</p>
      </aside>

      <div className="library-main">
        <div className="library-toolbar">
          <div className="navigation-actions" aria-label="目录导航">
            <button disabled={!可以返回} onClick={() => void 返回上一处()} title="返回">←</button>
            <button disabled={!可以前进} onClick={() => void 前进下一处()} title="前进">→</button>
            <button
              disabled={(!正在显示虚拟文件夹 && (正在显示非目录视图 || !当前目录?.parentPath || 正在读取 || !当前根目录))}
              onClick={() => {
                if (正在显示虚拟文件夹) {
                  返回书架根层();
                } else if (当前目录?.parentPath && 当前根目录) {
                  void 打开目录(当前目录.parentPath, 当前根目录);
                }
              }}
              title="上一级"
            >
              ↑
            </button>
            <button
              disabled={正在显示非目录视图 || !当前目录 || 正在读取 || !当前根目录}
              onClick={() => {
                if (当前目录 && 当前根目录) {
                  void 打开目录(当前目录.path, 当前根目录, "none", false);
                }
              }}
            >
              刷新
            </button>
          </div>
          {当前选择视图 && 渲染选择工具条(当前选择视图, 当前选择视图Key列表.length)}
          <div
            className="path-placeholder"
            title={正在显示最近打开 ? "最近打开" : 正在显示书架 ? "书架" : 正在显示收藏 ? "收藏" : 正在显示书签 ? "书签" : 正在显示虚拟文件夹 ? 当前虚拟文件夹?.note || 当前虚拟文件夹?.name : 当前目录?.path}
          >
            {正在显示最近打开 ? "最近打开" : 正在显示书架 ? "书架" : 正在显示收藏 ? "收藏" : 正在显示书签 ? "书签" : 正在显示虚拟文件夹 ? `书架 / ${当前虚拟文件夹?.name ?? "未选择"}` : 当前目录?.path ?? "尚未选择本地漫画目录"}
          </div>
        </div>

        <div className="library-controls">
          <div className="search-shell">
            <label className="search-control">
              <span aria-hidden="true">⌕</span>
              <input
                ref={主搜索输入框}
                aria-label={正在显示收藏 ? "搜索收藏" : 正在显示书签 ? "搜索书签" : 正在显示书架 ? "搜索书架文件夹" : 正在显示虚拟文件夹 ? "搜索当前书架文件夹" : "搜索当前目录"}
                placeholder={正在显示收藏 ? "搜索收藏文件名、备注或标签" : 正在显示书签 ? "搜索书签资源、页面、备注或标签" : 正在显示书架 ? "搜索书架文件夹名称或备注" : 正在显示虚拟文件夹 ? "搜索当前文件夹内资源、备注或标签" : "搜索当前目录、备注或标签"}
                value={正在显示收藏 ? 收藏搜索内容 : 正在显示书签 ? 书签搜索内容 : 搜索内容}
                disabled={正在显示最近打开 || (!正在显示收藏 && !正在显示书签 && !正在显示书架 && !正在显示虚拟文件夹 && !当前目录)}
                onFocus={() => 设置主搜索建议可见(true)}
                onBlur={() => window.setTimeout(() => 设置主搜索建议可见(false), 120)}
                onChange={(事件) => {
                  设置主搜索建议可见(true);
                  if (正在显示收藏) {
                    设置收藏搜索内容(事件.target.value);
                  } else if (正在显示书签) {
                    设置书签搜索内容(事件.target.value);
                  } else {
                    设置搜索内容(事件.target.value);
                  }
                  回到第一页();
                }}
              />
              {(正在显示收藏 ? 收藏搜索内容 : 正在显示书签 ? 书签搜索内容 : 搜索内容) && (
                <button
                  aria-label="清空搜索"
                  title="清空搜索"
                  onClick={() => {
                    if (正在显示收藏) 设置收藏搜索内容("");
                    else if (正在显示书签) 设置书签搜索内容("");
                    else 设置搜索内容("");
                    回到第一页();
                  }}
                >
                  ×
                </button>
              )}
            </label>
            {主搜索建议可见 && 标签建议列表.length > 0 && (
              <div className="tag-suggestions" aria-label="标签建议">
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
          >
            标签{已选标签列表.length > 0 ? ` ${已选标签列表.length}` : ""}
          </button>

          <label className="select-control">
            <span>排序</span>
            <select
              value={排序}
              disabled={正在显示最近打开 || 正在显示收藏 || 正在显示书签 || (!正在显示书架 && !正在显示虚拟文件夹 && !当前目录)}
              onChange={(事件) => {
                const 新排序 = 事件.target.value as 排序方式;
                设置排序(新排序);
                保存界面设置({ sortMode: 新排序 });
                回到第一页();
              }}
            >
              <option value="name-asc">名称升序</option>
              <option value="name-desc">名称降序</option>
              <option value="time-asc">修改时间升序</option>
              <option value="time-desc">修改时间降序</option>
              <option value="type">类型</option>
            </select>
          </label>

          <div className="thumbnail-size-control" aria-label="缩略图大小">
            <span>缩略图</span>
            {(["small", "medium", "large"] as const).map((尺寸, 索引) => (
              <button
                key={尺寸}
                className={缩略图尺寸 === 尺寸 ? "is-active" : ""}
                onClick={() => {
                  设置缩略图尺寸(尺寸);
                  保存界面设置({ cardSize: 尺寸 });
                  回到第一页();
                }}
                aria-pressed={缩略图尺寸 === 尺寸}
                disabled={!当前目录 && !正在显示非目录视图}
              >
                {(["小", "中", "大"] as const)[索引]}
              </button>
            ))}
          </div>

          <div className="progress-display-control" aria-label="阅读进度显示">
            <label>
              <input
                type="checkbox"
                checked={显示进度条}
                disabled={正在显示非目录视图 || !当前目录}
                onChange={(事件) => {
                  设置显示进度条(事件.target.checked);
                  保存界面设置({ showProgressBar: 事件.target.checked });
                }}
              />
              进度条
            </label>
            <label>
              <input
                type="checkbox"
                checked={显示进度文本}
                disabled={正在显示非目录视图 || !当前目录}
                onChange={(事件) => {
                  设置显示进度文本(事件.target.checked);
                  保存界面设置({ showProgressText: 事件.target.checked });
                }}
              />
              进度文本
            </label>
            <select
              value={进度文本模式}
              disabled={正在显示非目录视图 || !当前目录 || !显示进度文本}
              aria-label="进度文本模式"
              onChange={(事件) => {
                const 新模式 =事件.target.value as 进度文本模式;
                设置进度文本模式(新模式);
                保存界面设置({ progressTextMode: 新模式 });
              }}
            >
              <option value="page">页数</option>
              <option value="percent">百分比</option>
            </select>
            <select
              value={进度条粗细}
              disabled={正在显示非目录视图 || !当前目录 || !显示进度条}
              aria-label="进度条粗细"
              onChange={(事件) => {
                const 新粗细 = 事件.target.value as 进度条粗细;
                设置进度条粗细(新粗细);
                保存界面设置({ progressBarThickness: 新粗细 });
              }}
            >
              <option value="thin">细</option>
              <option value="normal">标准</option>
              <option value="thick">粗</option>
            </select>
          </div>

          <span className="filter-summary">
            {正在显示最近打开
              ? `最近打开 ${最近打开列表.length} 项`
              : 正在显示书架
              ? `书架 ${筛选后书架文件夹列表.length} / ${虚拟文件夹列表.length} 个文件夹`
              : 正在显示收藏
              ? `收藏 ${筛选后收藏列表.length} / ${收藏列表.length} 项`
              : 正在显示书签
              ? `书签 ${筛选后书签列表.length} / ${书签列表.length} 项`
              : 正在显示虚拟文件夹
              ? `${当前虚拟文件夹?.name ?? "书架文件夹"} ${筛选后虚拟文件夹项目.length} / ${当前虚拟文件夹?.items.length ?? 0} 项`
              : 搜索内容.trim()
              ? `找到 ${筛选排序后项目.length} 项`
              : `当前目录 ${当前目录?.total ?? 0} 项`}
          </span>
        </div>

        <div className="library-body">
          {错误信息 && (
            <div className="error-banner" role="alert">
              <span>{错误信息}</span>
              <button onClick={() => 设置错误信息(null)} aria-label="关闭错误提示">×</button>
            </div>
          )}

          {正在显示最近打开 ? (
            最近打开卡片项目.length === 0 ? (
              <div className="empty-library compact-empty">
                <div className="empty-illustration" aria-hidden="true">◴</div>
                <h2>暂无最近打开记录</h2>
                <p>阅读文件夹图片或 ZIP/CBZ 后，这里会显示最近资源卡片。</p>
              </div>
            ) : (
              <>
                <div
                  className="resource-list-scroll recent-resource-list-scroll"
                  aria-label="最近打开资源列表"
                >
                  <div className={`resource-list recent-resource-list size-${缩略图尺寸}`}>
                {最近打开卡片项目.map(({ 项目, 文件 }) => {
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
                  const 收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt"> = {
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

                  return (
                    <button
                      key={项目.resourceKey}
                      className={`resource-card resource-${文件.type} ${
                        进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                      } progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.resourceKey) ? "is-selected" : ""}`}
                      onClick={(事件) => {
                        if (选择模式 === "recent" && 事件.detail === 1) 切换选择项目(项目.resourceKey);
                      }}
                      onDoubleClick={() => {
                        if (选择模式 !== "recent") void 打开最近项目(项目);
                      }}
                      onContextMenu={(事件) => {
                        事件.preventDefault();
                        设置最近菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                      }}
                      title={`双击继续阅读：${项目.title}`}
                    >
                      {选择模式 === "recent" && (
                        <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${项目.title}`}
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
                            loading="lazy"
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
                        {渲染预览标签(整理信息.tags, 项目.resourceKey)}
                        {渲染资源信息按钮({
                          kind: "resource",
                          input: 资源整理输入,
                          fileType: 文件.type,
                          progressText: 进度显示状态.文本,
                          thumbnailUrl: 缩略图.url,
                        })}
                        {渲染收藏按钮(收藏输入)}
                      </span>
                      <span className="resource-details">
                        <strong>{项目.title}</strong>
                        <em className="recent-source" title={项目.sourcePath}>{项目.sourcePath}</em>
                      </span>
                      <span className="resource-card-info">
                        <span>{信息.label} · 最近打开</span>
                        {显示进度文本 && 进度显示状态.文本 && (
                          <span className={`resource-card-page${进度显示状态.显示胶囊 ? " is-pill" : ""}`}>
                            {进度显示状态.文本}
                          </span>
                        )}
                      </span>
                      {进度显示状态.显示进度条 && (
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
            <div className="bookshelf-root-view">
              <div className="bookshelf-header">
                <div>
                  <h2>书架</h2>
                  <p>{虚拟文件夹列表.length === 0 ? "创建软件内部虚拟文件夹，用来整理本地资源引用。" : `共 ${虚拟文件夹列表.length} 个书架文件夹`}</p>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => 打开虚拟文件夹弹窗({ mode: "create" })}
                >
                  新建文件夹
                </button>
              </div>

              {筛选后书架文件夹列表.length === 0 ? (
                <div className="empty-library compact-empty">
                  <div className="empty-illustration" aria-hidden="true">▤</div>
                  <h2>{虚拟文件夹列表.length === 0 ? "暂无书架文件夹" : "没有匹配的书架文件夹"}</h2>
                  <p>{虚拟文件夹列表.length === 0 ? "点击新建文件夹后，它会显示在书架根层。" : "请尝试清空搜索内容。"}</p>
                  <button
                    className="secondary-action empty-primary"
                    type="button"
                    onClick={() => {
                      if (虚拟文件夹列表.length === 0) 打开虚拟文件夹弹窗({ mode: "create" });
                      else 设置搜索内容("");
                    }}
                  >
                    {虚拟文件夹列表.length === 0 ? "新建文件夹" : "清空搜索"}
                  </button>
                </div>
              ) : (
                <div className="bookshelf-folder-grid" aria-label="书架文件夹列表">
                  {筛选后书架文件夹列表.map((文件夹) => {
                    const 预览资源 = 文件夹.items[0] ?? null;
                    const 缩略图 = 预览资源 ? 缩略图表[预览资源.sourcePath] : null;
                    const 是否有预览 = 缩略图?.status === "loaded" && !!缩略图.url;
                    const 第二预览资源 = 文件夹.items[1] ?? null;
                    const 第二缩略图 = 第二预览资源 ? 缩略图表[第二预览资源.sourcePath] : null;
                    const 是否有第二预览 = 第二缩略图?.status === "loaded" && !!第二缩略图.url;
                    const 最近更新 = new Date(文件夹.updatedAt || 文件夹.createdAt).toLocaleDateString("zh-CN");

                    return (
                      <article
                        key={文件夹.id}
                        className="bookshelf-folder-card"
                        tabIndex={0}
                        onClick={() => 进入书架文件夹(文件夹)}
                        onDoubleClick={() => 进入书架文件夹(文件夹)}
                        onMouseEnter={(事件) => 显示书架备注悬浮窗(文件夹, 事件.currentTarget)}
                        onMouseLeave={隐藏书架备注悬浮窗}
                        onFocus={(事件) => 显示书架备注悬浮窗(文件夹, 事件.currentTarget)}
                        onBlur={隐藏书架备注悬浮窗}
                        onKeyDown={(事件) => {
                          if (事件.key === "Enter" || 事件.key === " ") {
                            事件.preventDefault();
                            进入书架文件夹(文件夹);
                          }
                        }}
                        onContextMenu={(事件) => {
                          事件.preventDefault();
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
                              <span className="bookshelf-folder-empty-mark">▤</span>
                            )}
                          </span>
                          <span className="bookshelf-folder-front" />
                        </div>
                        <div className="bookshelf-folder-info">
                          <strong>{文件夹.name}</strong>
                          <span>{文件夹.items.length} 个资源 · 更新于 {最近更新}</span>
                        </div>
                        <div className="bookshelf-folder-actions">
                          <button
                            type="button"
                            onClick={(事件) => {
                              事件.stopPropagation();
                              打开虚拟文件夹弹窗({ mode: "rename", folder: 文件夹 });
                            }}
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            className="danger-link"
                            onClick={(事件) => {
                              事件.stopPropagation();
                              设置待删除虚拟文件夹(文件夹);
                            }}
                          >
                            删除
                          </button>
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
                <div className="empty-illustration" aria-hidden="true">♥</div>
                <h2>{收藏列表.length === 0 ? "暂无收藏" : "没有匹配的收藏"}</h2>
                <p>{收藏列表.length === 0 ? "在资源卡片右下角点击爱心后，收藏资源会显示在这里。" : "请尝试清空搜索内容或选择全部标签。"}</p>
              </div>
            ) : (
              <>
                <div
                  className="resource-list-scroll recent-resource-list-scroll"
                  aria-label="收藏资源列表"
                >
                  <div className={`resource-list recent-resource-list size-${缩略图尺寸}`}>
                {收藏卡片项目.map(({ 项目, 文件 }) => {
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
                  const 收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt"> = {
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

                  return (
                    <button
                      key={项目.resourceKey}
                      className={`resource-card resource-${文件.type} ${
                        进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                      } progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.resourceKey) ? "is-selected" : ""}`}
                      onClick={(事件) => {
                        if (选择模式 === "favorites" && 事件.detail === 1) 切换选择项目(项目.resourceKey);
                      }}
                      onDoubleClick={() => {
                        if (选择模式 !== "favorites") void 打开收藏项目(项目);
                      }}
                      onContextMenu={(事件) => {
                        事件.preventDefault();
                        设置收藏菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                      }}
                      title={`双击打开收藏：${项目.title}`}
                    >
                      {选择模式 === "favorites" && (
                        <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${项目.title}`}
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
                            loading="lazy"
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
                        {渲染预览标签(整理信息.tags, 项目.resourceKey)}
                        {渲染资源信息按钮({
                          kind: "resource",
                          input: 资源整理输入,
                          fileType: 文件.type,
                          progressText: 进度显示状态.文本,
                          thumbnailUrl: 缩略图.url,
                        })}
                        {渲染收藏按钮(收藏输入)}
                      </span>
                      <span className="resource-details">
                        <strong>{项目.title}</strong>
                        <em className="recent-source" title={项目.sourcePath}>{项目.sourcePath}</em>
                      </span>
                      <span className="resource-card-info">
                        <span>{信息.label} · 收藏</span>
                        {显示进度文本 && 进度显示状态.文本 && (
                          <span className={`resource-card-page${进度显示状态.显示胶囊 ? " is-pill" : ""}`}>
                            {进度显示状态.文本}
                          </span>
                        )}
                      </span>
                      {进度显示状态.显示进度条 && (
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
                <div className="empty-illustration" aria-hidden="true">★</div>
                <h2>{书签列表.length === 0 ? "暂无书签" : "没有匹配的书签"}</h2>
                <p>{书签列表.length === 0 ? "在阅读器中点击页码旁的书签按钮后，当前页会显示在这里。" : "请尝试清空搜索内容或选择全部标签。"}</p>
              </div>
            ) : (
              <>
                <div
                  ref={列表容器}
                  className="resource-list-scroll bookmark-list-scroll"
                  aria-label="书签卡片列表"
                >
                  <div className={`resource-list bookmark-resource-list size-${缩略图尺寸}`}>
                {书签卡片项目.map(({ 项目, 文件 }) => {
                  const 信息 = 类型信息[文件.type];
                  const 缩略图 = 书签预览表[项目.id] ?? (
                    项目.thumbnailUrl
                      ? { status: "loaded" as const, url: 项目.thumbnailUrl }
                      : { status: "idle" as const, url: null }
                  );
                  const 页码文本 = `第 ${项目.pageIndex + 1} / ${项目.totalPages} 页`;
                  const 标签列表 = 获取整理标签(项目);
                  return (
                    <button
                      key={项目.id}
                      data-bookmark-card-id={项目.id}
                      className={`resource-card bookmark-card resource-${文件.type} progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.id) ? "is-selected" : ""}`}
                      onClick={(事件) => {
                        if (选择模式 === "bookmarks" && 事件.detail === 1) 切换选择项目(项目.id);
                      }}
                      onDoubleClick={() => {
                        if (选择模式 !== "bookmarks") void 打开书签项目(项目);
                      }}
                      onContextMenu={(事件) => {
                        事件.preventDefault();
                        设置书签菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                      }}
                      title={`双击打开书签：${项目.title}`}
                    >
                      {选择模式 === "bookmarks" && (
                        <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${项目.title}`}
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
                            loading="lazy"
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
                        {渲染预览标签(标签列表, 项目.id)}
                        {渲染资源信息按钮({
                          kind: "bookmark",
                          item: 项目,
                          fileType: 文件.type,
                          thumbnailUrl: 缩略图.url,
                        })}
                      </span>
                      <span className="resource-details bookmark-card-details">
                        <strong>{项目.title}</strong>
                        <em className="recent-source" title={项目.pageName}>
                          {项目.pageName ?? "页面名称未知"}
                        </em>
                      </span>
                      <span className="resource-card-info bookmark-card-info">
                        <span>{信息.label} · {格式化日期时间(项目.updatedAt)}</span>
                        <span className="resource-card-page is-pill">{页码文本}</span>
                      </span>
                      <span className="bookmark-card-source" title={项目.sourcePath}>
                        {项目.sourcePath}
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
                <div className="empty-illustration" aria-hidden="true">▤</div>
                <h2>请选择书架文件夹</h2>
                <p>返回书架根层后，点击文件夹卡片进入内部资源视图。</p>
                <button className="secondary-action empty-primary" type="button" onClick={返回书架根层}>
                  返回书架
                </button>
              </div>
            ) : 虚拟文件夹卡片项目.length === 0 ? (
              <div className="empty-library compact-empty">
                <div className="empty-illustration" aria-hidden="true">▤</div>
                <h2>{当前虚拟文件夹.items.length === 0 ? "此书架文件夹为空" : "没有匹配的资源"}</h2>
                <p>{当前虚拟文件夹.items.length === 0 ? "在资源卡片右键菜单中选择加入书架。" : "请尝试清空搜索内容或选择全部标签。"}</p>
              </div>
            ) : (
              <div
                className="resource-list-scroll recent-resource-list-scroll"
                aria-label="书架文件夹资源列表"
              >
                <div className={`resource-list recent-resource-list size-${缩略图尺寸}`}>
                  {虚拟文件夹卡片项目.map(({ 项目, 文件 }) => {
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
                    const 收藏输入: Omit<FavoriteItem, "addedAt" | "updatedAt"> | null =
                      文件.type === "folder" || 文件.type === "archive" || 文件.type === "image"
                        ? {
                            resourceKey: 项目.resourceKey,
                            sourcePath: 项目.sourcePath,
                            sourceType: 文件.type === "archive" ? "archive" : "folder",
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

                    return (
                      <button
                        key={项目.id}
                        className={`resource-card resource-${文件.type} ${
                          进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                        } progress-thickness-${进度条粗细} ${已选项目Key集合.has(项目.resourceKey) ? "is-selected" : ""}`}
                        onClick={(事件) => {
                          if (选择模式 === "virtual-folder" && 事件.detail === 1) 切换选择项目(项目.resourceKey);
                        }}
                        onDoubleClick={() => {
                          if (选择模式 !== "virtual-folder") void 打开虚拟文件夹项目(项目);
                        }}
                        onContextMenu={(事件) => {
                          事件.preventDefault();
                          设置虚拟文件夹资源菜单({ x: 事件.clientX, y: 事件.clientY, 项目 });
                        }}
                        title={`双击打开原始资源：${项目.title}`}
                      >
                        {选择模式 === "virtual-folder" && (
                          <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`选择 ${项目.title}`}
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
                              loading="lazy"
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
                          {渲染预览标签(整理信息.tags, 项目.id)}
                          {渲染资源信息按钮({
                            kind: "resource",
                            input: 资源整理输入,
                            fileType: 文件.type,
                            progressText: 进度显示状态.文本,
                            thumbnailUrl: 缩略图.url,
                          })}
                          {渲染收藏按钮(收藏输入)}
                        </span>
                        <span className="resource-details">
                          <strong>{项目.title}</strong>
                          <em className="recent-source" title={项目.sourcePath}>{项目.sourcePath}</em>
                        </span>
                        <span className="resource-card-info">
                          <span>{信息.label} · 书架</span>
                          {显示进度文本 && 进度显示状态.文本 && (
                            <span className={`resource-card-page${进度显示状态.显示胶囊 ? " is-pill" : ""}`}>
                              {进度显示状态.文本}
                            </span>
                          )}
                        </span>
                        {进度显示状态.显示进度条 && (
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
          ) : 正在读取 ? (
            <div className="empty-library compact-empty">
              <div className="loading-mark" aria-hidden="true">…</div>
              <h2>正在读取目录</h2>
              <p>请稍候。</p>
            </div>
          ) : !当前目录 ? (
            <div className="empty-library">
              <div className="empty-illustration" aria-hidden="true">▦</div>
              <h2>从本地目录开始浏览</h2>
              <p>选择漫画根目录后，这里会显示文件夹、图片、ZIP、CBZ、PDF、EPUB 和未知文件。</p>
              <button className="primary-action empty-primary" onClick={() => void 添加目录()}>
                添加漫画目录
              </button>
            </div>
          ) : 当前目录.items.length === 0 ? (
            <div className="empty-library compact-empty">
              <div className="empty-illustration" aria-hidden="true">空</div>
              <h2>此文件夹为空</h2>
              <p>可以返回上一级或选择其他根目录。</p>
            </div>
          ) : 筛选排序后项目.length === 0 ? (
            <div className="empty-library compact-empty">
              <div className="empty-illustration" aria-hidden="true">⌕</div>
              <h2>没有匹配项目</h2>
              <p>请尝试缩短关键词或清空搜索内容。</p>
              <button
                className="secondary-action empty-primary"
                onClick={() => {
                  设置搜索内容("");
                  回到第一页();
                }}
              >
                清空搜索
              </button>
            </div>
          ) : (
            <div
              ref={列表容器}
              className="resource-list-scroll"
              aria-label="当前目录文件列表"
              onWheel={处理网格滚轮}
            >
              <div ref={网格容器} className={`resource-list size-${缩略图尺寸}`}>
              {当前页项目.map((文件) => {
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
                return (
                  <button
                    key={文件.id}
                    className={`resource-card resource-${文件.type} ${
                      进度显示状态.已完成 ? "progress-completed" : 进度显示状态.显示进度条 ? "progress-reading" : ""
                    } progress-thickness-${进度条粗细} ${已选项目Key集合.has(文件.id) ? "is-selected" : ""}`}
                    onClick={(事件) => {
                      if (选择模式 === "directory" && 事件.detail === 1) 切换选择项目(文件.id);
                    }}
                    onDoubleClick={() => {
                      if (选择模式 !== "directory") void 打开资源(文件);
                    }}
                    onContextMenu={(事件) => {
                      if (!资源整理输入) return;
                      事件.preventDefault();
                      设置资源菜单({
                        x: 事件.clientX,
                        y: 事件.clientY,
                        input: 资源整理输入,
                        fileType: 文件.type,
                        progressText: 进度显示状态.文本,
                        thumbnailUrl: 缩略图.url,
                      });
                    }}
                    title={
                      文件.type === "folder"
                        ? `双击打开文件夹：${文件.name}`
                        : 文件.type === "image"
                          ? `双击阅读：${文件.name}`
                          : 文件.type === "archive"
                            ? `双击阅读压缩包：${文件.name}`
                            : 文件.type === "pdf"
                              ? `PDF 暂不支持阅读：${文件.name}`
                              : 文件.type === "epub"
                                ? `EPUB 暂不支持阅读：${文件.name}`
                          : 文件.name
                    }
                  >
                    {选择模式 === "directory" && (
                      <span className="selection-check" onClick={(事件) => 事件.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`选择 ${文件.name}`}
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
                          loading="lazy"
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
                      {渲染预览标签(整理信息?.tags ?? [], 文件.id)}
                      {渲染资源信息按钮(资源整理输入 ? {
                        kind: "resource",
                        input: 资源整理输入,
                        fileType: 文件.type,
                        progressText: 进度显示状态.文本,
                        thumbnailUrl: 缩略图.url,
                      } : null)}
                      {渲染收藏按钮(收藏输入)}
                    </span>
                    <span className="resource-details">
                      <strong>{文件.name}</strong>
                      {文件.hasError && <em>{文件.errorMessage}</em>}
                    </span>
                    <span className="resource-card-info">
                      <span>
                        {信息.label}
                        {文件.type !== "folder" && ` · ${格式化大小(文件.size)}`}
                      </span>
                      {显示进度文本 && 进度显示状态.文本 && (
                        <span className={`resource-card-page${进度显示状态.显示胶囊 ? " is-pill" : ""}`}>
                          {进度显示状态.文本}
                        </span>
                      )}
                    </span>
                    {进度显示状态.显示进度条 && (
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
          )}
        </div>

        <footer className={`library-footer ${!正在显示非目录视图 && 是否显示分页 ? "has-pagination" : ""}`}>
          {正在显示最近打开 ? (
            <>
              <span>最近打开 {最近打开列表.length} 项</span>
              <span>双击继续阅读，右键可删除最近记录</span>
            </>
          ) : 正在显示收藏 ? (
            <>
              <span>收藏 {筛选后收藏列表.length} / {收藏列表.length} 项</span>
              <span>双击打开，右键可编辑备注标签或移除收藏</span>
            </>
          ) : 正在显示书架 ? (
            <>
              <span>书架 {筛选后书架文件夹列表.length} / {虚拟文件夹列表.length} 个文件夹</span>
              <span>点击进入文件夹；删除只移除 OmiComic 内部引用</span>
            </>
          ) : 正在显示书签 ? (
            <>
              <span>书签 {筛选后书签列表.length} / {书签列表.length} 项</span>
              <span>双击跳转到书签页，右键可编辑备注标签或删除书签</span>
            </>
          ) : 正在显示虚拟文件夹 ? (
            <>
              <span>{当前虚拟文件夹?.name ?? "书架文件夹"} {筛选后虚拟文件夹项目.length} / {当前虚拟文件夹?.items.length ?? 0} 项</span>
              <span>双击打开原始资源，右键可移除内部引用</span>
            </>
          ) : (
            <>
              <span>
                当前项目 {筛选排序后项目.length} 项
                {搜索内容.trim() && 当前目录 ? ` / 目录共 ${当前目录.total} 项` : ""}
              </span>

          {是否显示分页 ? (
            <div className="pagination-bar" aria-label="分页">
              <button type="button" onClick={回到当前页顶部}>顶部</button>
              <button disabled={安全当前页 === 1} onClick={() => 跳转页码(1)}>首页</button>
              <button disabled={安全当前页 === 1} onClick={() => 跳转页码(安全当前页 - 1)}>
                上一页
              </button>
              <label className="page-input">
                <span>第</span>
                <input
                  inputMode="numeric"
                  value={页码输入}
                  aria-label="当前页码"
                  onChange={(事件) => 设置页码输入(事件.target.value.replace(/\D/g, ""))}
                  onBlur={应用页码输入}
                  onKeyDown={(事件) => {
                    if (事件.key === "Enter") {
                      应用页码输入();
                      事件.currentTarget.blur();
                    }
                  }}
                />
              </label>
              <span>页 / 共 {总页数} 页</span>
              <button
                disabled={安全当前页 === 总页数}
                onClick={() => 跳转页码(安全当前页 + 1)}
              >
                下一页
              </button>
              <button disabled={安全当前页 === 总页数} onClick={() => 跳转页码(总页数)}>
                尾页
              </button>
              <label className="page-size-control">
                <span>每页</span>
                <select
                  value={每页数量}
                  onChange={(事件) => {
                    const 新每页数量 = Number(事件.target.value) as 每页数量;
                    设置每页数量(新每页数量);
                    保存界面设置({ pageSize: 新每页数量 });
                    回到第一页();
                  }}
                >
                  {每页数量选项.map((数量) => (
                    <option key={数量} value={数量}>{数量}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <span>{当前目录 ? "双击文件夹进入" : "请先添加根目录"}</span>
          )}
            </>
          )}
        </footer>
        {当前右侧抽屉 === "settings" && (
          <div className={`settings-overlay organize-drawer-overlay drawer-opacity-${整理侧边栏透明度}`} role="presentation" onMouseDown={关闭右侧抽屉}>
            <aside
              className="settings-panel organize-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
              onMouseDown={(事件) => 事件.stopPropagation()}
            >
              <header className="settings-panel-header">
                <div>
                  <h2 id="settings-title">设置</h2>
                  <p>基础阅读与资源库设置</p>
                </div>
                <button type="button" aria-label="关闭设置" onClick={关闭右侧抽屉}>×</button>
              </header>

              <div className="settings-panel-body">
                <section className="settings-section">
                  <h3>资源库设置</h3>
                  <label className="settings-row">
                    <span>卡片尺寸</span>
                    <select
                      value={缩略图尺寸}
                      onChange={(事件) => {
                        const 新尺寸 = 事件.target.value as 卡片尺寸;
                        设置缩略图尺寸(新尺寸);
                        保存界面设置({ cardSize: 新尺寸 });
                        回到第一页();
                      }}
                    >
                      <option value="small">小</option>
                      <option value="medium">中</option>
                      <option value="large">大</option>
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>每页数量</span>
                    <select
                      value={每页数量}
                      onChange={(事件) => {
                        const 新每页数量 = Number(事件.target.value) as 每页数量;
                        设置每页数量(新每页数量);
                        保存界面设置({ pageSize: 新每页数量 });
                        回到第一页();
                      }}
                    >
                      {每页数量选项.map((数量) => (
                        <option key={数量} value={数量}>{数量}</option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>默认排序</span>
                    <select
                      value={排序}
                      onChange={(事件) => {
                        const 新排序 = 事件.target.value as 排序方式;
                        设置排序(新排序);
                        保存界面设置({ sortMode: 新排序 });
                        回到第一页();
                      }}
                    >
                      <option value="name-asc">名称</option>
                      <option value="time-desc">修改时间</option>
                      <option value="type">类型</option>
                    </select>
                  </label>
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
                    <span>文件夹优先</span>
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
                    <span>根目录隐藏已加入书架的资源</span>
                  </label>
                  <label className="settings-row">
                    <span>整理侧边栏透明度</span>
                    <select
                      value={整理侧边栏透明度}
                      onChange={(事件) => {
                        const 新透明度 = Number(事件.target.value) as 整理侧边栏透明度;
                        设置整理侧边栏透明度(新透明度);
                        保存界面设置({ organizeDrawerOpacity: 新透明度 });
                      }}
                    >
                      {整理侧边栏透明度选项.map((透明度) => (
                        <option key={透明度} value={透明度}>{透明度}%</option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>书架备注悬停延迟</span>
                    <select
                      value={书架备注悬停延迟}
                      onChange={(事件) => {
                        const 新延迟 = Number(事件.target.value) as 书架备注悬停延迟;
                        设置书架备注悬停延迟(新延迟);
                        保存界面设置({ bookshelfNoteHoverDelayMs: 新延迟 });
                      }}
                    >
                      {书架备注悬停延迟选项.map((延迟) => (
                        <option key={延迟} value={延迟}>
                          {延迟 === 0 ? "立即显示" : `${延迟 / 1000} 秒`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>标签搜索模式</span>
                    <select
                      value={搜索模式}
                      onChange={(事件) => {
                        const 新模式 = 事件.target.value as 搜索匹配模式;
                        设置搜索模式(新模式);
                        保存界面设置({ tagSearchMode: 新模式 });
                        回到第一页();
                      }}
                    >
                      <option value="fuzzy">模糊</option>
                      <option value="exact">精准</option>
                    </select>
                  </label>
                </section>

                <section className="settings-section">
                  <h3>进度显示设置</h3>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={显示进度条}
                      onChange={(事件) => {
                        设置显示进度条(事件.target.checked);
                        保存界面设置({ showProgressBar: 事件.target.checked });
                      }}
                    />
                    <span>显示进度条</span>
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
                    <span>显示进度文本</span>
                  </label>
                  <label className="settings-row">
                    <span>进度文本模式</span>
                    <select
                      value={进度文本模式}
                      disabled={!显示进度文本}
                      onChange={(事件) => {
                        const 新模式 = 事件.target.value as 进度文本模式;
                        设置进度文本模式(新模式);
                        保存界面设置({ progressTextMode: 新模式 });
                      }}
                    >
                      <option value="page">页数</option>
                      <option value="percent">百分比</option>
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>进度条粗细</span>
                    <select
                      value={进度条粗细}
                      disabled={!显示进度条}
                      onChange={(事件) => {
                        const 新粗细 = 事件.target.value as 进度条粗细;
                        设置进度条粗细(新粗细);
                        保存界面设置({ progressBarThickness: 新粗细 });
                      }}
                    >
                      <option value="thin">细</option>
                      <option value="normal">标准</option>
                      <option value="thick">粗</option>
                    </select>
                  </label>
                </section>

                <section className="settings-section">
                  <h3>安全与确认</h3>
                  <p className="settings-section-note">这些开关只控制删除软件记录前是否确认，不会删除磁盘中的真实文件。</p>
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
                    <span>收藏批量删除前确认</span>
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
                    <span>书签批量删除前确认</span>
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
                    <span>最近打开批量删除前确认</span>
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
                    <span>删除标签前确认</span>
                  </label>
                </section>

                <section className="settings-section">
                  <h3>阅读器设置</h3>
                  <label className="settings-row">
                    <span>默认缩放模式</span>
                    <select
                      value={阅读器默认缩放模式}
                      onChange={(事件) => {
                        const 新模式 = 事件.target.value as 阅读器缩放模式;
                        设置阅读器默认缩放模式(新模式);
                        保存界面设置({ readerDefaultFitMode: 新模式 });
                      }}
                    >
                      <option value="fit-height">适应高度</option>
                      <option value="fit-width">适应宽度</option>
                      <option value="original">原始尺寸</option>
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>默认阅读模式</span>
                    <select
                      value={阅读器默认页模式}
                      onChange={(事件) => {
                        const 新模式 = 事件.target.value as 阅读器页模式;
                        设置阅读器默认页模式(新模式);
                        保存界面设置({ readerPageMode: 新模式 });
                      }}
                    >
                      <option value="single">单页</option>
                      <option value="double">双页</option>
                    </select>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={双页首页单独显示}
                      onChange={(事件) => {
                        设置双页首页单独显示(事件.target.checked);
                        保存界面设置({ doublePageFirstSingle: 事件.target.checked });
                      }}
                    />
                    <span>双页首页单独显示</span>
                  </label>
                  <label className="settings-row">
                    <span>双页阅读方向</span>
                    <select
                      value={双页阅读方向}
                      onChange={(事件) => {
                        const 新方向 = 事件.target.value as 双页阅读方向;
                        设置双页阅读方向(新方向);
                        保存界面设置({ doublePageDirection: 新方向 });
                      }}
                    >
                      <option value="right-to-left">从右到左</option>
                      <option value="left-to-right">从左到右</option>
                    </select>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={智能识别跨页图}
                      onChange={(事件) => {
                        设置智能识别跨页图(事件.target.checked);
                        保存界面设置({ smartDetectSpreadPage: 事件.target.checked });
                      }}
                    />
                    <span>智能识别跨页图：{智能识别跨页图 ? "开" : "关"}</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={滚轮翻页}
                      onChange={(事件) => {
                        设置滚轮翻页(事件.target.checked);
                        保存界面设置({ wheelPageTurn: 事件.target.checked });
                      }}
                    />
                    <span>鼠标滚轮翻页</span>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={沉浸自动隐藏}
                      onChange={(事件) => {
                        设置沉浸自动隐藏(事件.target.checked);
                        保存界面设置({ immersiveAutoHide: 事件.target.checked });
                      }}
                    />
                    <span>沉浸模式自动隐藏 UI</span>
                  </label>
                  <label className="settings-row">
                    <span>自动隐藏延迟</span>
                    <select
                      value={沉浸自动隐藏延迟}
                      onChange={(事件) => {
                        const 新延迟 = Number(事件.target.value) as 沉浸自动隐藏延迟;
                        设置沉浸自动隐藏延迟(新延迟);
                        保存界面设置({ immersiveAutoHideDelay: 新延迟 });
                      }}
                    >
                      <option value={500}>0.5 秒</option>
                      <option value={1000}>1 秒</option>
                      <option value={1500}>1.5 秒</option>
                      <option value={2000}>2 秒</option>
                      <option value={2500}>2.5 秒</option>
                      <option value={3000}>3 秒</option>
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>上/下一本按钮透明度</span>
                    <select
                      value={图书切换按钮透明度}
                      onChange={(事件) => {
                        const 新透明度 = Number(事件.target.value) as 图书切换按钮透明度;
                        设置图书切换按钮透明度(新透明度);
                        保存界面设置({ bookSwitchButtonOpacity: 新透明度 });
                      }}
                    >
                      {图书切换按钮透明度选项.map((透明度) => (
                        <option key={透明度} value={透明度}>{透明度}%</option>
                      ))}
                    </select>
                  </label>
                </section>
              </div>
            </aside>
          </div>
        )}
        {当前右侧抽屉 === "resource-info" && 渲染资源信息抽屉()}
        {当前右侧抽屉 === "tag-filter" && 渲染标签筛选抽屉()}
        {完整标签浮层 && createPortal(
          <div className="preview-tag-popover" style={完整标签浮层.style} role="dialog" aria-label="隐藏标签列表">
            {完整标签浮层.tags.map((标签) => (
              <span className="preview-tag-popover-chip" key={标签}>{标签}</span>
            ))}
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
            >
              删除此根目录
            </button>
          </div>
        )}
        {资源菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 资源菜单.x, top: 资源菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开资源信息抽屉({
                  kind: "resource",
                  input: 资源菜单.input,
                  fileType: 资源菜单.fileType,
                  progressText: 资源菜单.progressText,
                  thumbnailUrl: 资源菜单.thumbnailUrl,
                });
                设置资源菜单(null);
              }}
            >
              查看资源信息
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                选择已有虚拟文件夹加入([转为虚拟文件夹项目输入(资源菜单.input)], 资源菜单.input.title);
                设置资源菜单(null);
              }}
            >
              加入书架
            </button>
          </div>
        )}
        {最近菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 最近菜单.x, top: 最近菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                选择已有虚拟文件夹加入([{
                  resourceKey: 最近菜单.项目.resourceKey,
                  sourcePath: 最近菜单.项目.sourcePath,
                  sourceType: 最近菜单.项目.sourceType,
                  title: 最近菜单.项目.title,
                }], 最近菜单.项目.title);
                设置最近菜单(null);
              }}
            >
              加入书架
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 删除最近打开记录(最近菜单.项目.resourceKey)}
            >
              删除此最近记录
            </button>
          </div>
        )}
        {收藏菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 收藏菜单.x, top: 收藏菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => 打开资源信息抽屉({
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
              })}
            >
              编辑备注和标签
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                选择已有虚拟文件夹加入([{
                  resourceKey: 收藏菜单.项目.resourceKey,
                  sourcePath: 收藏菜单.项目.sourcePath,
                  sourceType: 收藏菜单.项目.sourceType,
                  title: 收藏菜单.项目.title,
                }], 收藏菜单.项目.title);
                设置收藏菜单(null);
              }}
            >
              加入书架
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 删除收藏记录(收藏菜单.项目.resourceKey)}
            >
              移除收藏
            </button>
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
            >
              重命名
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                打开虚拟文件夹弹窗({ mode: "note", folder: 虚拟文件夹菜单.项目 });
                设置虚拟文件夹菜单(null);
              }}
            >
              编辑备注
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                设置待删除虚拟文件夹(虚拟文件夹菜单.项目);
                设置虚拟文件夹菜单(null);
              }}
            >
              删除
            </button>
          </div>
        )}
        {虚拟文件夹资源菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 虚拟文件夹资源菜单.x, top: 虚拟文件夹资源菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const 项目 = 虚拟文件夹资源菜单.项目;
                打开资源信息抽屉({
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
            >
              查看资源信息
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 从当前虚拟文件夹移除(虚拟文件夹资源菜单.项目.resourceKey)}
            >
              从当前书架文件夹移除
            </button>
          </div>
        )}
        {书签菜单 && (
          <div
            className="recent-context-menu"
            style={{ left: 书签菜单.x, top: 书签菜单.y }}
            role="menu"
            onClick={(事件) => 事件.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => 打开资源信息抽屉({
                kind: "bookmark",
                item: 书签菜单.项目,
                fileType: 书签菜单.项目.sourceType,
                thumbnailUrl: 书签预览表[书签菜单.项目.id]?.url ?? 书签菜单.项目.thumbnailUrl ?? null,
              })}
            >
              编辑备注和标签
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => void 删除书签记录(书签菜单.项目.id)}
            >
              删除此书签
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
            >
              删除此标签
            </button>
          </div>
        )}
        {加入虚拟文件夹目标 && (
          <div
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="virtual-folder-add-title"
            onClick={() => 设置加入虚拟文件夹目标(null)}
          >
            <div className="root-delete-dialog virtual-folder-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="virtual-folder-add-title">加入书架</h2>
              <p>{加入虚拟文件夹目标.title}</p>
              <div className="virtual-folder-target-list">
                {虚拟文件夹列表.map((文件夹) => (
                  <button
                    type="button"
                    key={文件夹.id}
                    onClick={() => void 加入到虚拟文件夹(文件夹.id, 加入虚拟文件夹目标.items)}
                  >
                    <span>{文件夹.name}</span>
                    <em>{文件夹.items.length} 项</em>
                  </button>
                ))}
              </div>
              <div className="root-delete-actions">
                <button type="button" onClick={() => 打开虚拟文件夹弹窗({ mode: "create", items: 加入虚拟文件夹目标.items })}>
                  新建书架文件夹并加入
                </button>
                <button type="button" onClick={() => 设置加入虚拟文件夹目标(null)}>取消</button>
              </div>
            </div>
          </div>
        )}
        {虚拟文件夹弹窗 && (
          <div
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
                  ? "新建书架文件夹"
                  : 虚拟文件夹弹窗.mode === "rename"
                    ? "重命名书架文件夹"
                    : "编辑书架文件夹备注"}
              </h2>
              {(虚拟文件夹弹窗.mode === "create" || 虚拟文件夹弹窗.mode === "rename") && (
                <label className="virtual-folder-field">
                  <span>名称</span>
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
                  <span>备注</span>
                  <textarea
                    value={虚拟文件夹备注输入}
                    disabled={删除确认处理中}
                    rows={4}
                    onChange={(事件) => 设置虚拟文件夹备注输入(事件.target.value)}
                  />
                </label>
              )}
              <p>书架文件夹只保存 OmiComic 内部引用，不会创建真实文件夹，也不会移动、复制或修改漫画文件。</p>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 打开虚拟文件夹弹窗(null)}>
                  取消
                </button>
                <button type="button" className="primary-action" disabled={删除确认处理中} onClick={() => void 保存虚拟文件夹弹窗()}>
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
        {待删除虚拟文件夹 && (
          <div
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="virtual-folder-delete-title"
            onClick={() => {
              if (!删除确认处理中) 设置待删除虚拟文件夹(null);
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="virtual-folder-delete-title">删除书架文件夹</h2>
              <p>只删除 OmiComic 内部的书架文件夹记录和其中的资源引用，不会删除任何原始漫画文件。</p>
              <strong>{待删除虚拟文件夹.name}</strong>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 设置待删除虚拟文件夹(null)}>
                  取消
                </button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 删除虚拟文件夹记录()}>
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
        {待删除根目录 && (
          <div
            className="root-delete-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="root-delete-title"
            onClick={() => {
              if (!删除确认处理中) 设置待删除根目录(null);
            }}
          >
            <div className="root-delete-dialog" onClick={(事件) => 事件.stopPropagation()}>
              <h2 id="root-delete-title">删除根目录</h2>
              <p>仅从 OmiComic 的根目录列表中移除此目录，不会删除磁盘中的真实文件夹。是否继续？</p>
              <strong title={待删除根目录.path}>{待删除根目录.path}</strong>
              <div className="root-delete-actions">
                <button type="button" disabled={删除确认处理中} onClick={() => 设置待删除根目录(null)}>
                  取消
                </button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 确认删除根目录记录()}>
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
        {待删除标签列表 && (
          <div
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
              <h2 id="tag-delete-title">删除标签</h2>
              <p>
                将从 OmiComic 的标签记录中移除这些标签，并从所有资源和书签的 tags 数组中移除；
                不会删除任何漫画文件、资源、书签、收藏或阅读进度。
              </p>
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
                <span>不再提醒</span>
              </label>
              {整理错误 && <p className="organize-edit-error">{整理错误}</p>}
              <div className="root-delete-actions">
                <button
                  type="button"
                  disabled={删除确认处理中}
                  onClick={() => {
                    设置待删除标签列表(null);
                    设置删除标签不再提醒(false);
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="danger-action"
                  disabled={删除确认处理中}
                  onClick={() => void 确认删除标签列表()}
                >
                  删除标签
                </button>
              </div>
            </div>
          </div>
        )}
        {批量删除确认 && (
          <div
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
              <h2 id="batch-delete-title">删除选中</h2>
              <p>{获取批量删除标题(批量删除确认, 已选项目Key集合.size)}</p>
              <p>{获取批量删除说明(批量删除确认)}</p>
              <label className="batch-delete-skip">
                <input
                  type="checkbox"
                  checked={批量删除不再提醒}
                  disabled={删除确认处理中}
                  onChange={(事件) => 设置批量删除不再提醒(事件.target.checked)}
                />
                <span>不再提醒</span>
              </label>
              <div className="root-delete-actions">
                <button
                  type="button"
                  disabled={删除确认处理中}
                  onClick={() => {
                    设置批量删除确认(null);
                    设置批量删除不再提醒(false);
                  }}
                >
                  取消
                </button>
                <button type="button" className="danger-action" disabled={删除确认处理中} onClick={() => void 确认批量删除()}>
                  删除
                </button>
              </div>
            </div>
          </div>
        )}
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
