import { uiOptions } from '../i18n';
import useMobileReaderAutoHide from '../hooks/useMobileReaderAutoHide';
import { tr, t } from '../i18n';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import ArrowIcon from "../ArrowIcon";
import GlassSelect from "../GlassSelect";
import { canPairPages, fitPage, fitSpread, fitPanorama, panoramaScrollBounds } from "../reader/layout";
import { clampPage as 限制索引, normalizeGroup as 规范化页组主索引, groupIndices as 计算页组索引, nextGroup as 计算下一页组主索引, previousGroup as 计算上一页组主索引 } from "../reader/pageGroups";
import ReaderChapter from "../components/ReaderChapter";
import ReaderCanvas from "../components/ReaderCanvas";
import ReaderTools from "../components/ReaderTools";
import { isAndroid } from "../platform";
import { androidCall, androidNotify, hasAndroidRenderer } from '../android/bridge';
import useNativeReaderSurface from '../android/useNativeReaderSurface';
import { nativePreloadWindow, desktopPreloadWindow } from '../reader/preloadWindow';
import useMobileLayout from "../hooks/useMobileLayout";
import { mobileNavigationEpoch } from '../hooks/mobileNavigation';
import useReaderVolumeKeys from "../hooks/useReaderVolumeKeys";
import ReaderControlsSurface from "../components/ReaderControlsSurface";
import ReaderProgressRail from "../components/ReaderProgressRail";
import MobileReaderPreviews from "../components/MobileReaderPreviews";
import { consumeDismissGesture } from "../hooks/consumeDismissGesture";
import useReaderZoom from "../hooks/useReaderZoom";
import ReaderImageEffects, { GammaFilter } from "../components/ReaderImageEffects";
import { useAutoRead } from "../reader/useAutoRead";
import { DEFAULT_ADJUSTMENTS, DEFAULT_AUTO_READ, normalizeAdjustments, normalizeAutoRead, normalizePageSort, pageIdentity, resolvePageIndex, type PageSort } from "../../electron/shared/readerPreferences";
import { useReaderDocument } from "../reader/useReaderDocument";
import { advanceInertia, estimateReleaseVelocity, trimPrefetchBuffer, mouseDragGain, acceleratedMouseVelocity, MAX_MOTION_SPEED, MIN_MOTION_SPEED, MOTION_SAMPLE_WINDOW_MS } from "../reader/motion";
import type {
  AppSettings,
  ReaderViewState,
  ReadingProgress,
  阅读流向,
  阅读打开上下文,
  阅读器缩放模式,
  阅读页面项,
  阅读资源结果,
} from "../types";

interface ReaderPageProps {
  resource: 阅读资源结果 | null;
  initialPageIndex: number;
  openContext: 阅读打开上下文 | null;
  isActive: boolean;
  interactive?: boolean;
  recordProgress?: boolean;
  onSwitchResource: (
    resource: 阅读资源结果,
    initialPageIndex: number,
    context: 阅读打开上下文,
    motionEpoch?: number,
  ) => void;
  onBack: () => void;
  onReady?: () => void;
  onProgressSaved: (progress: ReadingProgress) => void;
  onBookmarksChanged: () => void;
}

interface 可用区域尺寸 {
  width: number;
  height: number;
}

interface 页面图片状态 {
  url: string;
  error: string | null;
  loading: boolean;
  width?: number;
  height?: number;
  html?: string;
  decodedBytes?: number;
  decodedImage?: HTMLImageElement;
  canvas?: HTMLCanvasElement;
  native?: boolean;
  prefetchFailed?: boolean;
}

interface 页面原始尺寸 {
  width: number;
  height: number;
}

interface 可显示页组 {
  indices: number[];
  visualIndices: number[];
  pages: 阅读页面项[];
}

interface 页组加载状态 {
  status: "idle" | "loading" | "ready" | "error";
  requestId: number;
  pageGroupKey: string;
  message?: string;
}

interface 全景拖动状态 {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
  startOffset: number;
  distance: number;
  pointerType: string;
  samples: 全景速度采样[];
}

interface 全景速度采样 {
  x: number;
  y: number;
  time: number;
}

interface 模式2预热请求 {
  centerIndex: number;
  direction: -1 | 0 | 1;
  intensity: number;
}

type 页面图片任务结果 = { pageIndex: number; state: 页面图片状态 };
type 页面图片任务优先级 = 0 | 1;

interface 页面图片调度任务 {
  页面: 阅读页面项;
  优先级: 页面图片任务优先级;
  排队顺序: number;
  调度代号: number;
  promise: Promise<页面图片任务结果>;
  完成: (结果: 页面图片任务结果) => void;
  消费者取消检查: Array<() => boolean>;
  controller: AbortController;
}

interface 模式2页面几何 {
  页面尺寸: Array<{ width: number; height: number }>;
  页面长度: number[];
  页面前缀长度: number[];
  页面中心: number[];
}

interface 模式2几何上下文 {
  resourceKey: string | null;
  flow: 阅读流向;
}

const 跨页横图比例阈值 = 1.3;
const 页组加载超时毫秒 = 10000;
const NeeView惯性最小速度 = MIN_MOTION_SPEED;
const NeeView最大惯性速度 = MAX_MOTION_SPEED;
const NeeView速度采样窗口毫秒 = MOTION_SAMPLE_WINDOW_MS;
const NeeView速度采样上限 = 96;
const 模式2跳转动画毫秒 = 190;
const 模式2离场动画毫秒 = 210;
const 模式2滑入动画毫秒 = 320;
const 模式2聚拢动画毫秒 = 240;
const 模式2跳转缩放 = 0.97;
const 模式2快速预热最小间隔毫秒 = 70;
let 下一个阅读器会话Id = Date.now();

function 计算模式2几何补偿偏移(
  原几何: 模式2页面几何,
  新几何: 模式2页面几何,
  锚点索引: number,
  原偏移: number,
  视口长度: number,
): number {
  const 页面总数 = Math.min(原几何.页面长度.length, 新几何.页面长度.length);
  if (页面总数 <= 0) return 原偏移;
  const 安全锚点 = 限制索引(锚点索引, 页面总数);
  const 原锚点 = 原几何.页面中心[安全锚点];
  const 新锚点 = 新几何.页面中心[安全锚点];
  if (!Number.isFinite(原锚点) || !Number.isFinite(新锚点)) return 原偏移;

  const 原视口中心 = 原锚点 - 原偏移;
  let 左 = 0;
  let 右 = 页面总数;
  while (左 < 右) {
    const 中间 = Math.floor((左 + 右) / 2);
    if ((原几何.页面前缀长度[中间 + 1] ?? Number.POSITIVE_INFINITY) <= 原视口中心) 左 = 中间 + 1;
    else 右 = 中间;
  }
  const 视口页面索引 = 限制索引(左, 页面总数);
  const 原页面起点 = 原几何.页面前缀长度[视口页面索引] ?? 0;
  const 原页面长度 = Math.max(1, 原几何.页面长度[视口页面索引] ?? 1);
  const 页内比例 = Math.min(Math.max((原视口中心 - 原页面起点) / 原页面长度, 0), 1);
  const 新页面起点 = 新几何.页面前缀长度[视口页面索引] ?? 0;
  const 新页面长度 = Math.max(1, 新几何.页面长度[视口页面索引] ?? 1);
  const 新视口中心 = 新页面起点 + 新页面长度 * 页内比例;
  const 未限制偏移 = 新锚点 - 新视口中心;
  const 首页中心 = 新几何.页面中心[0] ?? 新锚点;
  const 尾页中心 = 新几何.页面中心[页面总数 - 1] ?? 新锚点;
  const 边界 = panoramaScrollBounds(首页中心, 尾页中心, 新几何.页面长度[0], 新几何.页面长度[页面总数 - 1], 视口长度, 新锚点);
  return Math.min(
    Math.max(未限制偏移, 边界.min),
    边界.max,
  );
}

const 默认阅读器设置: Pick<
  AppSettings,
  "readerDefaultFitMode" | "readerPageMode" | "doublePageFirstSingle" | "doublePageDirection"
  | "readerDefaultFlow" | "readerDefaultPanorama" | "readerDefaultImmersive"
  | "smartDetectSpreadPage" | "wheelPageTurn" | "immersiveAutoHide" | "immersiveAutoHideDelay"
  | "readerHideFooterControls" | "readerHideImmersiveProgress" | "readerMemoryCacheSizeMb"
  | "readerPreloadPages" | "readerImageLoadConcurrency" | "bookSwitchButtonOpacity"
  | "desktopReaderAutoHide" | "readerVolumeKeys" | "readerVolumeKeysReversed"
  | "readerVolumePanoramaPages" | "mobileReaderPreviews" | "mobilePreviewWidth" | "mobileReaderAutoHide"
> = {
  desktopReaderAutoHide: false,
  readerVolumePanoramaPages: 1,
  mobileReaderPreviews: true,
  mobileReaderAutoHide: true,
  mobilePreviewWidth: 88,
  readerVolumeKeys: false,
  readerVolumeKeysReversed: false,
  readerDefaultFitMode: "fit-window",
  readerPageMode: "single",
  readerDefaultFlow: "horizontal",
  readerDefaultPanorama: false,
  readerDefaultImmersive: false,
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
};

function 创建默认阅读视图(设置: AppSettings | typeof 默认阅读器设置): ReaderViewState {
  return {
    fitMode: 设置.readerDefaultFitMode,
    pageMode: 设置.readerPageMode,
    pageDirection: 设置.doublePageDirection,
    flow: 设置.readerDefaultFlow,
    panorama: 设置.readerDefaultPanorama,
    immersive: 设置.readerDefaultImmersive,
  };
}

function ReaderPage({
  resource: 输入资源,
  initialPageIndex,
  openContext,
  isActive,
  interactive = true,
  recordProgress = true,
  onSwitchResource,
  onBack,
  onReady,
  onProgressSaved,
  onBookmarksChanged,
}: ReaderPageProps) {
  const 手机布局 = useMobileLayout();
  const [手机工具栏可见, 设置手机工具栏可见] = useState(false);
  const [手机阅读设置打开, 设置手机阅读设置打开] = useState(false);
  const [手机页面预览打开, 设置手机页面预览打开] = useState(false);
  const { resource, source: 文档源, loading: 文档加载中, error: 文档错误 } = useReaderDocument(输入资源);
  const 原生图片核心 = isAndroid() && hasAndroidRenderer() && resource?.sourceType !== 'pdf' && resource?.sourceType !== 'epub';
  const [当前索引, 设置当前索引] = useState(0);
  const [页面图片状态表, 提交页面图片状态表] = useState<Record<number, 页面图片状态>>({});
  const [可显示页组, 设置可显示页组] = useState<可显示页组 | null>(null);
  const [手机解码完成, 设置手机解码完成] = useState<Record<number,string>>({});
  const 手机页面元素 = useRef(new Map<number,HTMLImageElement>());
  const [, 设置页组加载状态] = useState<页组加载状态>({
    status: "idle",
    requestId: 0,
    pageGroupKey: "",
  });
  const [页面尺寸表, 提交页面尺寸表] = useState<Record<string, 页面原始尺寸>>({});
  const [错误信息, 设置错误信息] = useState<string | null>(null);
  const [书签错误, 设置书签错误] = useState<string | null>(null);
  const [进度保存错误, 设置进度保存错误] = useState<string | null>(null);
  const [当前页已书签, 设置当前页已书签] = useState(false);
  const [书签处理中, 设置书签处理中] = useState(false);
  const [缩放模式, 设置缩放模式] = useState<阅读器缩放模式>("fit-window");
  const [可用区域, 设置可用区域] = useState<可用区域尺寸>({ width: 0, height: 0 });
  const [页码输入, 设置页码输入] = useState("1");
  const [阅读器设置, 设置阅读器设置] = useState(默认阅读器设置);
  const [沉浸模式, 设置沉浸模式] = useState(false);
  const [顶部栏可见, 设置顶部栏可见] = useState(true);
  const [底部栏可见, 设置底部栏可见] = useState(true);
  const [页码输入聚焦, 设置页码输入聚焦] = useState(false);
  const [阅读流向, 设置阅读流向] = useState<阅读流向>("horizontal");
  const [全景模式, 设置全景模式] = useState(false);
  const [双页配对起点, 设置双页配对起点] = useState(initialPageIndex);
  const [页面排序, 设置页面排序] = useState<PageSort>('name-asc');
  const [画面调整, 设置画面调整] = useState({ ...DEFAULT_ADJUSTMENTS });
  const 全局调整待保存 = useRef<typeof DEFAULT_ADJUSTMENTS | null>(null);
  const 全局调整保存计时 = useRef<ReturnType<typeof setTimeout>>();
  function 保存全局调整(): void {
    clearTimeout(全局调整保存计时.current);
    const value = 全局调整待保存.current;
    全局调整待保存.current = null;
    if (value) void window.omicomic.updateSettings({mobileImageAdjustments:value}).then(result => {
      if (!result.ok) 设置进度保存错误(result.error.message);
    }).catch(() => 设置进度保存错误("画面设置保存失败，请重试。"));
  }
  useEffect(() => {
    window.addEventListener('omi-pause',保存全局调整);
    return () => { window.removeEventListener('omi-pause',保存全局调整); 保存全局调整(); };
  }, []);
  const [自动阅读设置, 设置自动阅读设置] = useState({ ...DEFAULT_AUTO_READ });
  const 阅读面板打开 = useRef(false);
  const 伽马滤镜Id = `reader-gamma-${useId().replace(/:/g, '')}`;
  const [跨本提示, 设置跨本提示] = useState<"previous" | "next" | null>(null);
  const [阅读视图已加载资源Key, 设置阅读视图已加载资源Key] = useState<string | null>(null);
  const [全景拖动中, 设置全景拖动中] = useState(false);
  const [全景窗口中心索引, 设置全景窗口中心索引] = useState(0);
  const [全景可见索引, 设置全景可见索引] = useState(0);
  const [全景动画启用, 设置全景动画启用] = useState(true);
  const [进度拖动比例, 设置进度拖动比例] = useState<number | null>(null);
  const 加载序号 = useRef(0);
  const 阅读视图初始化序号 = useRef(0);
  const 阅读视图已加载资源Key引用 = useRef<string | null>(null);
  const 沉浸全屏同步序号 = useRef(0);
  const 上次滚轮时间 = useRef(0);
  const 相邻资源切换中 = useRef(false);
  const 阅读区域 = useRef<HTMLDivElement>(null);
  const 自由缩放 = useReaderZoom(阅读区域, `${resource?.resourceKey}:${缩放模式}:${全景模式}:${阅读流向}`);
  const 全景页面流 = useRef<HTMLDivElement>(null);
  const 保存进度定时器 = useRef<number | null>(null);
  const 待保存进度 = useRef<ReadingProgress | null>(null);
  const 最新阅读进度快照 = useRef<ReadingProgress | null>(null);
  const 顶部栏隐藏定时器 = useRef<number | null>(null);
  const 底部栏隐藏定时器 = useRef<number | null>(null);
  const 阅读器会话Id = useRef(下一个阅读器会话Id++);
  useNativeReaderSurface(阅读区域,阅读器会话Id.current,原生图片核心,isActive&&interactive,阅读器设置,画面调整);
  const 进度拖动指针Id = useRef<number | null>(null);
  const 进度手势 = useRef<{x:number; moved:boolean} | null>(null);
  const 进度跳转序号 = useRef(0);
  const 全景拖动 = useRef<全景拖动状态>({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    velocityX: 0,
    velocityY: 0,
    startOffset: 0,
    distance: 0,
    pointerType: "mouse",
    samples: [],
  });
  const 全景拖动动画帧 = useRef<number | null>(null);
  const 全景惯性动画帧 = useRef<number | null>(null);
  const 全景惯性上帧时间 = useRef(0);
  const 全景切换定时器 = useRef<number | null>(null);
  const 全景滚轮结束定时器 = useRef<number | null>(null);
  const 全景跳转动画列表 = useRef<Animation[]>([]);
  const 全景单页动画 = useRef<{ frame: number; cancel: () => void } | null>(null);
  const 全景跳转幽灵 = useRef<HTMLElement | null>(null);
  const 阅读区尺寸刷新动画帧 = useRef<number | null>(null);
  const 全景偏移引用 = useRef(0);
  const 全景当前锚点引用 = useRef(0);
  const 全景窗口中心索引引用 = useRef(0);
  const 全景切换中 = useRef(false);
  const 全景模式引用 = useRef(false);
  const 全景模式启用中 = useRef(false);
  const 全景导航序号 = useRef(0);
  const 全景导航目标索引 = useRef<number | null>(null);
  const 全景导航解码图片 = useRef<HTMLImageElement | null>(null);
  const 全景动画恢复序号 = useRef(0);
  const 模式2动态预热状态 = useRef<模式2预热请求 | null>(null);
  const 模式2待预热请求 = useRef<模式2预热请求 | null>(null);
  const 模式2预热运行中 = useRef(false);
  const 模式2预热调度帧 = useRef<number | null>(null);
  const 模式2预热延时定时器 = useRef<number | null>(null);
  const 模式2预热结果缓冲 = useRef<Map<number, 页面图片状态>>(new Map());
  const 模式2预热结果提交定时器 = useRef<number | null>(null);
  const 模式2预热代号 = useRef(0);
  const 模式2上次快速预热时间 = useRef(0);
  const 模式2上次运动预热时间 = useRef(0);
  const 安全索引引用 = useRef(0);
  const 资源Key引用 = useRef<string | null>(null);
  const 页面图片状态引用 = useRef<Record<number, 页面图片状态>>({});
  const 页面尺寸表引用 = useRef<Record<string, 页面原始尺寸>>({});
  const 页面图片读取任务 = useRef<Map<number, Promise<页面图片任务结果>>>(new Map());
  const 页面图片排队任务 = useRef<Map<number, 页面图片调度任务>>(new Map());
  const 页面图片加载队列 = useRef<页面图片调度任务[]>([]);
  const 页面图片运行任务 = useRef<Map<number, 页面图片调度任务>>(new Map());
  const 页面图片运行任务数 = useRef(0);
  const 页面图片任务排队顺序 = useRef(0);
  const 页面图片调度代号 = useRef(0);
  const 页面图片并发上限 = useRef(默认阅读器设置.readerImageLoadConcurrency);
  const 普通预加载代号 = useRef(0);
  const 模式2页面几何引用 = useRef<模式2页面几何>({
    页面尺寸: [],
    页面长度: [],
    页面前缀长度: [0],
    页面中心: [],
  });
  const 模式2几何上下文引用 = useRef<模式2几何上下文>({
    resourceKey: null,
    flow: "horizontal",
  });
  const 活动页面加载索引 = useRef<Set<number>>(new Set());

  function 设置页面图片状态表(
    更新: Record<number, 页面图片状态> | ((原表: Record<number, 页面图片状态>) => Record<number, 页面图片状态>),
  ): void {
    const 新表 = typeof 更新 === "function" ? 更新(页面图片状态引用.current) : 更新;
    页面图片状态引用.current = 新表;
    let 新尺寸表: Record<string, 页面原始尺寸> | null = null;
    for (const [页面索引文本, 状态] of Object.entries(新表)) {
      if (!状态.width || !状态.height || 状态.width <= 0 || 状态.height <= 0) continue;
      const 尺寸Key = `${resource?.resourceKey ?? "none"}:${页面索引文本}`;
      const 原尺寸 = 页面尺寸表引用.current[尺寸Key];
      if (原尺寸?.width === 状态.width && 原尺寸.height === 状态.height) continue;
      新尺寸表 ??= { ...页面尺寸表引用.current };
      新尺寸表[尺寸Key] = { width: 状态.width, height: 状态.height };
    }
    if (新尺寸表) {
      页面尺寸表引用.current = 新尺寸表;
      提交页面尺寸表(新尺寸表);
    }
    提交页面图片状态表(新表);
  }

  function 设置页面尺寸表(
    更新: Record<string, 页面原始尺寸> | ((原表: Record<string, 页面原始尺寸>) => Record<string, 页面原始尺寸>),
  ): void {
    const 新表 = typeof 更新 === "function" ? 更新(页面尺寸表引用.current) : 更新;
    页面尺寸表引用.current = 新表;
    提交页面尺寸表(新表);
  }

  const 总页数 = resource?.total ?? 0;
  const 阅读单位 = t(resource?.sourceType === "epub" ? "章" : "页");
  const 获取页面尺寸Key = (索引: number): string => `${resource?.resourceKey ?? "none"}:${索引}`;
  const 获取已知页面原始尺寸 = (索引: number): 页面原始尺寸 | undefined => {
    const 状态 = 页面图片状态引用.current[索引] ?? 页面图片状态表[索引];
    return 页面尺寸表引用.current[获取页面尺寸Key(索引)]
      ?? 页面尺寸表[获取页面尺寸Key(索引)]
      ?? (
        状态?.width && 状态.height
          ? { width: 状态.width, height: 状态.height }
          : undefined
      );
  };
  const 页面是跨页横图 = (索引: number): boolean => {
    const 尺寸 = 获取已知页面原始尺寸(索引);
    if (!尺寸 || 尺寸.width <= 0 || 尺寸.height <= 0) return false;
    return 尺寸.width / 尺寸.height >= 跨页横图比例阈值;
  };
  const 全景竖向强制单页 = 全景模式 && 阅读流向 === "vertical";
  const 阅读视图初始化中 = Boolean(
    文档加载中 || 文档错误 || (resource && 阅读视图已加载资源Key !== resource.resourceKey),
  );
  const 有效页模式 = 全景竖向强制单页 ? "single" : 阅读器设置.readerPageMode;
  const 有效阅读器设置 = {
    ...阅读器设置,
    readerPageMode: 有效页模式,
    pairingAnchor: 双页配对起点,
    canPair: (first: number, second: number) => canPairPages(
      获取已知页面原始尺寸(first), 获取已知页面原始尺寸(second), 可用区域, 全景模式 ? "fit-height" : 缩放模式,
    ),
  };
  const 是跨页横图 = (索引: number): boolean => (
    有效阅读器设置.smartDetectSpreadPage
    && 有效阅读器设置.readerPageMode === "double"
    && 页面是跨页横图(索引)
  );
  const 安全索引 = 全景模式
    ? 限制索引(当前索引, 总页数)
    : 规范化页组主索引(
        当前索引,
        总页数,
        有效阅读器设置,
        页面是跨页横图,
      );
  资源Key引用.current = resource?.resourceKey ?? null;
  页面图片状态引用.current = 页面图片状态表;
  页面尺寸表引用.current = 页面尺寸表;
  全景模式引用.current = 全景模式;
  全景窗口中心索引引用.current = 全景窗口中心索引;
  安全索引引用.current = 安全索引;
  const 当前页组索引 = 计算页组索引(安全索引, 总页数, 有效阅读器设置, 页面是跨页横图);
  const 视觉页组索引 = 有效阅读器设置.readerPageMode === "double"
    && 阅读器设置.doublePageDirection === "right-to-left"
    && 当前页组索引.length === 2
    ? [...当前页组索引].reverse()
    : 当前页组索引;
  const 当前页面 = resource?.pages[安全索引] ?? null;
  const 显示阅读索引 = 全景模式 ? 限制索引(全景可见索引, 总页数) : 安全索引;
  const 显示阅读页面 = resource?.pages[显示阅读索引] ?? null;
  const 当前页组页面 = 视觉页组索引
    .map((索引) => resource?.pages[索引] ?? null)
    .filter((页面): 页面 is 阅读页面项 => 页面 !== null);
  const 当前页组Key = 当前页组索引.join("|");
  const 目标页组已准备 = 当前页组页面.length > 0 && 当前页组页面.every((页面) => {
    const 状态 = 页面图片状态引用.current[页面.index];
    return Boolean(状态 && !状态.loading && (状态.error || 状态.canvas || 状态.html || 状态.native || 状态.url && (!手机布局 || 手机解码完成[页面.index] === 状态.url && 手机页面元素.current.get(页面.index)?.isConnected)));
  });
  const 显示页组 = 目标页组已准备
    ? { indices: 当前页组索引, visualIndices: 视觉页组索引, pages: 当前页组页面 }
    : 可显示页组;
  const 显示页组页面 = 显示页组?.pages ?? 当前页组页面;
  const 显示页组索引 = 显示页组?.indices ?? 当前页组索引;
  const 当前显示跨页横图 = 有效阅读器设置.readerPageMode === "double"
    && 显示页组索引.length === 1
    && 是跨页横图(显示页组索引[0] ?? -1);
  const 当前页组包含首页 = 全景模式 ? 显示阅读索引 === 0 : 当前页组索引.includes(0);
  const 当前页组包含尾页 = 总页数 > 0 && (
    全景模式 ? 显示阅读索引 === 总页数 - 1 : 当前页组索引.includes(总页数 - 1)
  );
  const 显示进度索引 = 当前页组包含尾页 ? 总页数 - 1 : 显示阅读索引;
  const 页模式按钮文本 = 有效阅读器设置.readerPageMode === "double" ? "2" : "1";
  const 从右到左阅读 = 阅读器设置.doublePageDirection === "right-to-left";
  const 文件名栏文本 = resource
    ? `${resource.title}${显示阅读页面?.name ? ` / ${显示阅读页面.name}` : ""}`
    : 输入资源?.title ?? "阅读器";
  const 上下文当前位置 = resource && openContext
    ? openContext.items.findIndex((项目) => 项目.key === openContext.currentKey)
    : -1;
  const 上一本资源 = openContext && 上下文当前位置 > 0
    ? openContext.items[上下文当前位置 - 1]
    : null;
  const 下一本资源 = openContext && 上下文当前位置 >= 0 && 上下文当前位置 < openContext.items.length - 1
    ? openContext.items[上下文当前位置 + 1]
    : null;
  const 图书切换按钮基础透明度 = 阅读器设置.bookSwitchButtonOpacity / 100;

  const 页组间距 = 0;
  const 垂直阅读 = 阅读流向 === "vertical";
  const 模式2 = 全景模式;
  const 原生跳页代号 = useRef(0);
  const 预加载页数 = Math.min(Math.max(Math.round(阅读器设置.readerPreloadPages), 0), isAndroid() ? 20 : 120);
  const 图片加载线程数 = Math.min(Math.max(Math.round(阅读器设置.readerImageLoadConcurrency), 1), 文档源 ? (isAndroid() ? 2 : 4) : (isAndroid() ? 8 : 24));
  const 内存缓存上限字节 = Math.max(0, Math.round(阅读器设置.readerMemoryCacheSizeMb) * 1024 * 1024);
  const 原生预读窗口 = useRef(new Set<number>());
  const 原生阅读方向 = useRef({resourceKey:'',index:0,direction:1});
  const 原生前次位置 = 原生阅读方向.current;
  const 原生前进方向 = 原生前次位置.resourceKey === resource?.resourceKey
    ? Math.sign(安全索引 - 原生前次位置.index) || 原生前次位置.direction : 1;
  const 原生单页预算 = Math.min(4000000,Math.max(1000000,(可用区域.width||window.innerWidth)*devicePixelRatio*1.5*(可用区域.height||window.innerHeight)*devicePixelRatio))*4;
  const 原生预读索引 = nativePreloadWindow(当前页组索引,resource?.total??0,原生前进方向,预加载页数,内存缓存上限字节,原生单页预算);
  const 原生窗口索引 = [...当前页组索引,...原生预读索引];
  const 原生窗口Key = JSON.stringify(原生窗口索引);
  const 原生页面Key = (页面:阅读页面项) => JSON.stringify([页面.sourcePath,页面.archiveInnerPath??'',页面.type]);
  useLayoutEffect(() => {
    if (resource) 原生阅读方向.current = {resourceKey:resource.resourceKey,index:安全索引,direction:原生前进方向};
    if (!原生图片核心 || 模式2 || !isActive || !resource) {原生预读窗口.current.clear();return;}
    原生预读窗口.current = new Set(原生窗口索引);
    原生跳页代号.current++;
    androidNotify('readerSeek', {session:阅读器会话Id.current,seek:原生跳页代号.current,
      keep:原生窗口索引.map(index=>resource.pages[index]).filter(Boolean).map(原生页面Key)});
    // A page job belongs to the book/window, not to the render that requested it.
    // Distant seeks still retire unrelated work before scheduling the new page.
    保留页面图片加载调度(原生预读窗口.current);
  }, [原生图片核心,模式2,isActive,interactive,resource?.resourceKey,当前页组Key,原生窗口Key]);
  const 桌面预读窗口 = useRef(new Set<number>());
  const 桌面预读任务 = useRef(new Map<string, Promise<unknown>>());
  const 已知页面 = Object.values(页面图片状态表).filter(state => state.url);
  const 桌面单页预算 = 已知页面.length ? Math.max(1, ...已知页面.map(估算页面图片缓存字节)) : 16 * 1024 * 1024;
  const 桌面预读索引 = desktopPreloadWindow(当前页组索引,resource?.total??0,原生前进方向,预加载页数,内存缓存上限字节,桌面单页预算);
  const 桌面窗口Key = JSON.stringify([...当前页组索引,...桌面预读索引]);
  useLayoutEffect(() => {
    if (isAndroid() || !isActive || !resource || 模式2) { 桌面预读窗口.current.clear(); return; }
    桌面预读窗口.current = new Set([...当前页组索引,...桌面预读索引]);
    保留页面图片加载调度(桌面预读窗口.current);
  }, [isActive, resource?.resourceKey, 模式2, 桌面窗口Key]);
  const 桌面自动隐藏 = !手机布局 && 阅读器设置.desktopReaderAutoHide === true;
  const 可隐藏工具栏 = 沉浸模式 || 桌面自动隐藏;
  const 桌面按住指针 = useRef(new Set<number>());
  const 模式2窗口半径 = Math.min(10, Math.max(6, Math.ceil(预加载页数 * 1.2)));
  const 模式2预热窗口半径 = 内存缓存上限字节 <= 0
    ? 模式2窗口半径
    : Math.min(32, 模式2窗口半径 + 预加载页数);
  const 模式2图片加载线程数 = 图片加载线程数;
  页面图片并发上限.current = 图片加载线程数;
  const 模式2窗口起点 = resource && 模式2
    ? Math.max(0, 全景窗口中心索引 - 模式2窗口半径)
    : 0;
  const 模式2窗口终点 = resource && 模式2
    ? Math.min(resource.total - 1, 全景窗口中心索引 + 模式2窗口半径)
    : -1;
  const 模式2可用宽度 = Math.max(1, 可用区域.width);
  const 模式2可用高度 = Math.max(1, 可用区域.height);
  const 模式2页面几何 = useMemo(() => {
    const 页面尺寸: Array<{ width: number; height: number }> = [];
    const 页面长度: number[] = [];
    const 页面前缀长度: number[] = [0];
    const 页面中心: number[] = [];
    const 页面总数 = 模式2 ? resource?.total ?? 0 : 0;

    for (let 索引 = 0; 索引 < 页面总数; 索引 += 1) {
      const 原始尺寸 = 页面尺寸表[`${resource?.resourceKey ?? "none"}:${索引}`]
        ?? undefined;
      let 尺寸: { width: number; height: number };
      if (!原始尺寸 || 原始尺寸.width <= 0 || 原始尺寸.height <= 0) {
        尺寸 = { width: 模式2可用宽度, height: 模式2可用高度 };
      } else {
        尺寸 = fitPanorama(原始尺寸, { width: 模式2可用宽度, height: 模式2可用高度 }, 垂直阅读);
      }

      const 长度 = 垂直阅读 ? 尺寸.height : 尺寸.width;
      页面尺寸.push(尺寸);
      页面长度.push(长度);
      页面中心.push(页面前缀长度[索引] + 长度 / 2);
      页面前缀长度.push(页面前缀长度[索引] + 长度);
    }

    return { 页面尺寸, 页面长度, 页面前缀长度, 页面中心 };
  }, [
    resource,
    模式2,
    页面尺寸表,
    缩放模式,
    模式2可用宽度,
    模式2可用高度,
    垂直阅读,
  ]);
  const 上次模式2几何 = 模式2页面几何引用.current;
  const 几何上下文未切换 = 模式2几何上下文引用.current.resourceKey === (resource?.resourceKey ?? null)
    && 模式2几何上下文引用.current.flow === 阅读流向;
  if (
    模式2
    && 几何上下文未切换
    && 上次模式2几何 !== 模式2页面几何
    && 上次模式2几何.页面长度.length === 模式2页面几何.页面长度.length
    && 模式2页面几何.页面长度.length > 0
  ) {
    const 原偏移 = 全景偏移引用.current;
    const 补偿偏移 = 计算模式2几何补偿偏移(
      上次模式2几何,
      模式2页面几何,
      安全索引,
      原偏移,
      垂直阅读 ? 模式2可用高度 : 模式2可用宽度,
    );
    const 补偿差值 = 补偿偏移 - 原偏移;
    if (Math.abs(补偿差值) > 0.01) {
      全景偏移引用.current = 补偿偏移;
      if (全景拖动.current.active) {
        全景拖动.current.startOffset += 补偿差值;
      }
    }
  }
  模式2页面几何引用.current = 模式2页面几何;
  模式2几何上下文引用.current = {
    resourceKey: resource?.resourceKey ?? null,
    flow: 阅读流向,
  };
  // Keep navigation in logical page order; only horizontal presentation is reversed.
  const 全景横向符号 = !垂直阅读 && 从右到左阅读 ? -1 : 1;
  // Keep a bounded set of real image elements decoded, not only their URLs.
  // A warm neighbour becomes the visible page without remounting its image.
  const 手机预解码页面: 阅读页面项[] = [];
  if (手机布局 && !模式2 && resource && 内存缓存上限字节 > 0) {
    let bytes = 当前页组页面.reduce((sum,page) => sum + 估算页面图片缓存字节(页面图片状态表[page.index] ?? {url:'',loading:true,error:null}),0);
    for (let distance=1;distance<=Math.min(4,预加载页数);distance++) {
      for (const index of [安全索引+distance,安全索引-distance]) {
        const page=resource.pages[index],state=页面图片状态表[index];
        if (!page || !state?.url || state.loading || state.canvas || state.html) continue;
        const size=估算页面图片缓存字节(state);
        if (bytes+size>内存缓存上限字节) continue;
        bytes+=size;手机预解码页面.push(page);
      }
    }
  }
  const 模式2显示页面 = 模式2 && resource
    ? (全景横向符号 === -1 ? resource.pages.slice(模式2窗口起点, 模式2窗口终点 + 1).reverse() : resource.pages.slice(模式2窗口起点, 模式2窗口终点 + 1))
    : 手机布局 ? [...new Map([...显示页组页面,...当前页组页面,...手机预解码页面].map(page=>[page.index,page])).values()] : 显示页组页面;
  const 模式2当前锚点 = 模式2 ? 计算模式2页面锚点(安全索引) : 0;
  全景当前锚点引用.current = 模式2当前锚点;
  const 页面流样式 = 模式2
    ? ({
        gap: "0px",
        "--reader-panorama-width": `${模式2可用宽度}px`,
        "--reader-panorama-height": `${模式2可用高度}px`,
        "--reader-panorama-translate": `${全景偏移引用.current * 全景横向符号 - 模式2当前锚点}px`,
      } as CSSProperties)
    : ({ gap: `${页组间距}px` } as CSSProperties);
  const 进度百分比 = 总页数 > 1 ? (显示进度索引 / (总页数 - 1)) * 100 : 总页数 === 1 ? 100 : 0;
  const 显示进度百分比 = 进度拖动比例 === null ? 进度百分比 : 进度拖动比例 * 100;
  const 进度预览索引 = 进度拖动比例 === null ? 显示进度索引 : Math.round(进度拖动比例 * Math.max(0, 总页数 - 1));
  const 进度预览组 = 全景模式 ? [进度预览索引] : 计算页组索引(规范化页组主索引(进度预览索引, 总页数, 有效阅读器设置, 页面是跨页横图), 总页数, 有效阅读器设置, 页面是跨页横图);
  const 手机进度文本 = `${总页数 ? (进度预览组[0] ?? 0) + 1 : 0}${进度预览组.length > 1 ? `~${进度预览组.at(-1)! + 1}` : ''}/${总页数}`;
  const 电脑进度文本 = (从右到左阅读 ? [...进度预览组].reverse() : 进度预览组).map(index => String(index+1)).join(' | ');

  function 调整画面(value: typeof 画面调整) {
    const next = 手机布局 ? { ...value, enabled: true } : value;
    设置画面调整(next);
    if (手机布局) {
      全局调整待保存.current = next;
      clearTimeout(全局调整保存计时.current);
      全局调整保存计时.current = setTimeout(保存全局调整,250);
    }
  }

  function 计算模式2页面尺寸(页面索引: number): { width: number; height: number } {
    return 模式2页面几何引用.current.页面尺寸[页面索引]
      ?? { width: 模式2可用宽度, height: 模式2可用高度 };
  }

  function 计算模式2窗口范围(中心索引: number, 半径 = 模式2窗口半径): { 起点: number; 终点: number } {
    if (!resource || resource.total <= 0) return { 起点: 0, 终点: -1 };
    const 中心页 = 限制索引(中心索引, resource.total);
    return {
      起点: Math.max(0, 中心页 - 半径),
      终点: Math.min(resource.total - 1, 中心页 + 半径),
    };
  }

  function 计算模式2页面锚点在窗口(页面索引: number, 窗口起点: number, 窗口终点: number): number {
    if (!resource || 窗口起点 > 窗口终点) return 0;
    const 目标索引 = 限制索引(页面索引, resource.total);
    const 几何 = 模式2页面几何引用.current;
    const 中心 = 几何.页面中心[目标索引] ?? 0;
    return 全景横向符号 === -1
      ? (几何.页面前缀长度[窗口终点 + 1] ?? 0) - 中心
      : 中心 - (几何.页面前缀长度[窗口起点] ?? 0);
  }

  function 计算模式2页面锚点(页面索引: number): number {
    if (!模式2) return 0;
    return 计算模式2页面锚点在窗口(页面索引, 模式2窗口起点, 模式2窗口终点);
  }

  function 计算模式2页面中心差(页面索引: number): number {
    const 页面中心 = 模式2页面几何引用.current.页面中心;
    const 当前索引 = 安全索引引用.current;
    return (页面中心[页面索引] ?? 0) - (页面中心[当前索引] ?? 0);
  }

  function 限制模式2偏移在窗口(偏移: number, 锚点索引: number, 窗口起点: number, 窗口终点: number): number {
    if (!resource || 窗口起点 > 窗口终点) return 偏移;
    const 页面中心 = 模式2页面几何引用.current.页面中心;
    const 锚点 = 页面中心[限制索引(锚点索引, resource.total)] ?? 0;
    const 首页面中心 = 页面中心[0] ?? 锚点;
    const 尾页面中心 = 页面中心[Math.max(0, resource.total - 1)] ?? 锚点;
    const 长度 = 模式2页面几何引用.current.页面长度;
    const 边界 = panoramaScrollBounds(首页面中心, 尾页面中心, 长度[0], 长度[resource.total - 1], 垂直阅读 ? 模式2可用高度 : 模式2可用宽度, 锚点);
    return Math.min(Math.max(偏移, 边界.min), 边界.max);
  }

  function 限制模式2偏移(偏移: number): number {
    if (!resource || !模式2 || 模式2窗口起点 > 模式2窗口终点) return 偏移;
    return 限制模式2偏移在窗口(偏移, 安全索引引用.current, 0, resource.total - 1);
  }

  function 规范化模式2方向(方向: number): -1 | 0 | 1 {
    if (方向 > 0) return 1;
    if (方向 < 0) return -1;
    return 0;
  }

  function 计算模式2索引方向(轴向速度: number, 轴向位移 = 0): -1 | 0 | 1 {
    if (Math.abs(轴向速度) > 0.08) return 轴向速度 < 0 ? 1 : -1;
    if (Math.abs(轴向位移) > 12) return 轴向位移 < 0 ? 1 : -1;
    return 0;
  }

  function 计算模式2速度强度(轴向速度: number, 甩动强度 = 0): number {
    return Math.max(
      Math.min(1, Math.abs(轴向速度) / Math.max(0.01, NeeView最大惯性速度)),
      Math.min(1, 甩动强度),
    );
  }

  function 计算模式2偏移最近索引(): number {
    if (!resource || !模式2 || 模式2窗口起点 > 模式2窗口终点) return 安全索引;
    const 当前索引 = 安全索引引用.current;
    const 当前锚点 = 模式2页面几何引用.current.页面中心[当前索引] ?? 0;
    const 视口中心 = 当前锚点 - 全景偏移引用.current;
    const 页面边界 = 模式2页面几何引用.current.页面前缀长度;
    let 左 = 0;
    let 右 = Math.max(0, resource.total - 1);

    while (左 < 右) {
      const 中间 = Math.floor((左 + 右) / 2);
      if ((页面边界[中间 + 1] ?? 0) <= 视口中心) 左 = 中间 + 1;
      else 右 = 中间;
    }

    // A long chapter remains current until its actual edge crosses the viewport.
    return 限制索引(左, resource.total);
  }

  function 尝试重心化模式2窗口(): void {
    if (!resource || !模式2 || resource.total <= 0) return;
    const 最近索引 = 计算模式2偏移最近索引();
    设置全景可见索引(最近索引);
    const 当前窗口中心 = 全景窗口中心索引引用.current;
    const 当前窗口 = 计算模式2窗口范围(当前窗口中心);
    const 防护页数 = Math.max(2, Math.ceil(模式2窗口半径 * 0.35));
    const 接近前缘 = 当前窗口.起点 > 0 && 最近索引 <= 当前窗口.起点 + 防护页数;
    const 接近后缘 = 当前窗口.终点 < resource.total - 1 && 最近索引 >= 当前窗口.终点 - 防护页数;
    if (!接近前缘 && !接近后缘) return;
    if (最近索引 === 当前窗口中心) return;
    全景窗口中心索引引用.current = 最近索引;
    设置全景窗口中心索引(最近索引);
  }

  function 获取模式2预热索引(中心索引: number, 方向: -1 | 0 | 1 = 0, 强度 = 0): number[] {
    if (!resource || resource.total <= 0) return [];
    const 中心页 = 限制索引(中心索引, resource.total);
    const 修正强度 = Math.min(Math.max(强度, 0), 1);
    const 前方半径 = 方向 === 0
      ? 模式2预热窗口半径
      : Math.min(40, 模式2预热窗口半径 + 6 + Math.round(10 * 修正强度));
    const 后方半径 = 方向 === 0
      ? 模式2预热窗口半径
      : Math.max(模式2窗口半径 + 2, Math.ceil(模式2预热窗口半径 * 0.38));
    const 起点 = 方向 >= 0
      ? Math.max(0, 中心页 - 后方半径)
      : Math.max(0, 中心页 - 前方半径);
    const 终点 = 方向 <= 0
      ? Math.min(resource.total - 1, 中心页 + 后方半径)
      : Math.min(resource.total - 1, 中心页 + 前方半径);
    const 索引集合 = new Set<number>();

    for (let 索引 = 起点; 索引 <= 终点; 索引 += 1) 索引集合.add(索引);
    for (let 索引 = 模式2窗口起点; 索引 <= 模式2窗口终点; 索引 += 1) 索引集合.add(索引);
    for (const 索引 of 当前页组索引) 索引集合.add(索引);

    return Array.from(索引集合)
      .filter((索引) => 索引 >= 0 && 索引 < resource.total)
      .sort((左侧, 右侧) => {
        const 计算分数 = (索引: number) => {
          if (索引 === 中心页) return -1;
          if (方向 === 0) return Math.abs(索引 - 中心页);
          const 轴向距离 = (索引 - 中心页) * 方向;
          return 轴向距离 >= 0 ? 轴向距离 : 1000 + Math.abs(轴向距离);
        };
        return 计算分数(左侧) - 计算分数(右侧) || 左侧 - 右侧;
      });
  }

  function 计算模式2页面框架样式(页面索引: number): CSSProperties | undefined {
    if (!模式2) return undefined;
    const 尺寸 = 计算模式2页面尺寸(页面索引);
    return {
      width: `${尺寸.width}px`,
      height: `${尺寸.height}px`,
    };
  }

  function 计算页面图片样式(页面索引: number): CSSProperties {
    let 尺寸 = 获取已知页面原始尺寸(页面索引);
    if (模式2) {
      尺寸 = 计算模式2页面尺寸(页面索引);
    } else if (尺寸) {
      const 页组尺寸 = 显示页组索引.map(获取已知页面原始尺寸);
      尺寸 = 页组尺寸.every((size): size is 页面原始尺寸 => Boolean(size))
        ? fitSpread(页组尺寸, 可用区域, 缩放模式)[显示页组索引.indexOf(页面索引)]
        : fitPage(尺寸, 可用区域, 缩放模式);
    }
    return 尺寸
      ? { width: `${尺寸.width}px`, height: `${尺寸.height}px`, maxWidth: "none", maxHeight: "none" }
      : { width: "auto", height: "auto", maxWidth: `${可用区域.width / Math.max(1, 显示页组索引.length)}px`, maxHeight: `${可用区域.height}px` };
  }

  function 创建当前阅读进度(): ReadingProgress | null {
    if (!resource || !显示阅读页面 || resource.total <= 0) return null;
    const percent = Math.round(((显示进度索引 + 1) / Math.max(1, resource.total)) * 100);
    const 当前时间 = Date.now();
    const completed = 当前页组包含尾页;
    return {
      resourceKey: resource.resourceKey,
      sourcePath: resource.sourcePath,
      sourceType: resource.sourceType,
      title: resource.title,
      currentPageIndex: 显示进度索引,
      currentPageId: pageIdentity(resource.pages[显示进度索引] ?? 显示阅读页面),
      totalPages: resource.total,
      currentPageName: resource.pages[显示进度索引]?.name ?? 显示阅读页面.name,
      percent,
      completed,
      hasStartedReading: 显示阅读索引 > 0 || completed,
      firstReadAt: 当前时间,
      updatedAt: 当前时间,
      readerViewState: {
        fitMode: 缩放模式,
        pageMode: 阅读器设置.readerPageMode,
        pairingAnchor: 双页配对起点,
        pairingAnchorId: resource.pages[双页配对起点] ? pageIdentity(resource.pages[双页配对起点]) : undefined,
        pageSort: 页面排序,
        adjustments: 画面调整,
        autoRead: 自动阅读设置,
        pageDirection: 阅读器设置.doublePageDirection,
        flow: 阅读流向,
        panorama: 全景模式,
        immersive: 沉浸模式,
      },
    };
  }

  const 允许进度记录 = useRef(recordProgress);
  允许进度记录.current = recordProgress;
  const 当前阅读进度快照 = recordProgress && resource
    && 阅读视图已加载资源Key引用.current === resource.resourceKey
    ? 创建当前阅读进度()
    : null;
  if (当前阅读进度快照) 最新阅读进度快照.current = 当前阅读进度快照;

  async function 写入阅读进度(进度: ReadingProgress): Promise<void> {
    try {
      const 结果 = await window.omicomic.saveReadingProgress(进度);
      if (!结果.ok) throw new Error(结果.error.message);
      设置进度保存错误(null);
      onProgressSaved(结果.data);
    } catch {
      设置进度保存错误("阅读进度未保存，请检查应用数据目录的可用空间与权限。");
    }
  }

  function 立即保存待保存进度(允许根据当前状态创建 = true): void {
    if (!允许进度记录.current) return;
    if (保存进度定时器.current !== null) {
      window.clearTimeout(保存进度定时器.current);
      保存进度定时器.current = null;
    }
    const 当前资源已初始化 = Boolean(
      resource
      && 阅读视图已加载资源Key引用.current === resource.resourceKey,
    );
    const 进度 = (
      允许根据当前状态创建 && 当前资源已初始化
        ? 创建当前阅读进度()
        : null
    ) ?? 最新阅读进度快照.current ?? 待保存进度.current;
    最新阅读进度快照.current = null;
    待保存进度.current = null;
    if (进度) {
      void 写入阅读进度(进度);
    }
  }

  function 返回资源库(): void {
    立即保存待保存进度(false);
    取消全景异步导航(true);
    取消模式2预热调度();
    if (沉浸模式) {
      沉浸全屏同步序号.current += 1;
      void window.omicomic.setFullscreen(false);
    }
    onBack();
  }

  useEffect(() => {
    const pause = () => 立即保存待保存进度(false);
    const back = () => {
      if (document.querySelector('.mobile-sheet-overlay')) return;
      if (阅读面板打开.current) window.dispatchEvent(new Event("omi-reader-close-panel"));
      else if (手机页面预览打开) 设置手机页面预览打开(false);
      else 返回资源库();
    };
    window.addEventListener("omi-reader-back", back);
    window.addEventListener("omi-pause", pause);
    window.addEventListener("pagehide", pause);
    return () => {
      window.removeEventListener("omi-reader-back", back);
      window.removeEventListener("omi-pause", pause);
      window.removeEventListener("pagehide", pause);
    };
  });

  const 手机触点 = useRef<{ id: number; x: number; y: number; time: number } | null>(null);
  useMobileReaderAutoHide(手机布局 && isActive && interactive, 手机工具栏可见, 阅读器设置.mobileReaderAutoHide !== false,
    手机阅读设置打开 || 手机页面预览打开 || 进度拖动比例 !== null || 阅读视图初始化中, () => 设置手机工具栏可见(false));
  useEffect(() => {
    if(!手机布局 || !手机页面预览打开)return;
    const outside=(event:PointerEvent)=>{
      if((event.target as Element)?.closest('.mobile-reader-previews,.reader-progress-rail,.mobile-sheet-overlay'))return;
      consumeDismissGesture(event);手机触点.current=null;设置手机页面预览打开(false);
    };
    window.addEventListener('pointerdown',outside,true);return()=>window.removeEventListener('pointerdown',outside,true);
  },[手机布局,手机页面预览打开]);
  useEffect(()=>{设置手机解码完成({});},[resource?.resourceKey]);
  function 开始手机触控(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch" || (event.target as HTMLElement).closest("button,input")) return;
    if (!event.isPrimary) { 手机触点.current = null; return; }
    手机触点.current = {id:event.pointerId,x:event.clientX,y:event.clientY,time:event.timeStamp};
  }
  function 结束手机触控(event: ReactPointerEvent<HTMLDivElement>) {
    const start=手机触点.current;手机触点.current=null;
    if(!start||start.id!==event.pointerId||阅读视图初始化中)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(!模式2&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5&&event.timeStamp-start.time<1000){
      const next=阅读器设置.doublePageDirection === "right-to-left"?dx>0:dx<0;
      if(next)下一页();else 上一页();
    }else if(Math.hypot(dx,dy)<12&&event.timeStamp-start.time<400){
      const rect=event.currentTarget.getBoundingClientRect(),fraction=(event.clientX-rect.left)/rect.width;
      if(!模式2&&(fraction<.25||fraction>.75)){
        const next=阅读器设置.doublePageDirection === "right-to-left"?fraction<.25:fraction>.75;
        if(next)下一页();else 上一页();
      }else if(手机布局){设置手机工具栏可见(value => !value);}else{显示顶部栏();显示底部栏();}
    }
  }

  function 应用沉浸界面状态(启用: boolean): void {
    设置沉浸模式(启用);
    设置顶部栏可见(!启用);
    设置底部栏可见(!启用);
    安排刷新阅读区可用尺寸();
  }

  async function 同步沉浸全屏(启用: boolean, 失败回退 = !启用): Promise<boolean> {
    const 本次同步序号 = ++沉浸全屏同步序号.current;
    应用沉浸界面状态(启用);
    try {
      const 结果 = await window.omicomic.setFullscreen(启用);
      if (本次同步序号 !== 沉浸全屏同步序号.current) return false;
      if (结果.ok) return true;
      应用沉浸界面状态(失败回退);
      设置错误信息(结果.error.message);
      return false;
    } catch {
      if (本次同步序号 !== 沉浸全屏同步序号.current) return false;
      应用沉浸界面状态(失败回退);
      设置错误信息("系统全屏切换失败。");
      return false;
    }
  }

  function 设置沉浸全屏(启用: boolean): void {
    if (阅读视图初始化中) return;
    void 同步沉浸全屏(启用);
  }

  function 清理顶部栏隐藏定时器(): void {
    if (顶部栏隐藏定时器.current !== null) {
      window.clearTimeout(顶部栏隐藏定时器.current);
      顶部栏隐藏定时器.current = null;
    }
  }

  function 清理底部栏隐藏定时器(): void {
    if (底部栏隐藏定时器.current !== null) {
      window.clearTimeout(底部栏隐藏定时器.current);
      底部栏隐藏定时器.current = null;
    }
  }

  function 清理全景切换定时器(): void {
    全景单页动画.current?.cancel();
    if (全景切换定时器.current !== null) {
      window.clearTimeout(全景切换定时器.current);
      全景切换定时器.current = null;
    }
    for (const 动画 of 全景跳转动画列表.current) 动画.cancel();
    全景跳转动画列表.current = [];
    if (全景导航解码图片.current) {
      全景导航解码图片.current.src = "";
      全景导航解码图片.current = null;
    }
    全景跳转幽灵.current?.remove();
    全景跳转幽灵.current = null;
    全景导航目标索引.current = null;
    全景页面流.current?.style.removeProperty("z-index");
    全景页面流.current?.style.removeProperty("visibility");
    全景页面流.current?.removeAttribute("data-panorama-transition-role");
    阅读区域.current?.removeAttribute("data-panorama-jump-direction");
    阅读区域.current?.removeAttribute("data-panorama-jump-phase");
    全景切换中.current = false;
  }

  function 清理全景滚轮结束定时器(): void {
    if (全景滚轮结束定时器.current !== null) {
      window.clearTimeout(全景滚轮结束定时器.current);
      全景滚轮结束定时器.current = null;
    }
  }

  function 取消全景拖动动画帧(): void {
    if (全景拖动动画帧.current !== null) {
      window.cancelAnimationFrame(全景拖动动画帧.current);
      全景拖动动画帧.current = null;
    }
  }

  function 取消全景惯性动画帧(): void {
    if (全景惯性动画帧.current !== null) {
      window.cancelAnimationFrame(全景惯性动画帧.current);
      全景惯性动画帧.current = null;
    }
    全景惯性上帧时间.current = 0;
  }

  function 取消全景异步导航(保留视觉位置 = true): void {
    if (全景拖动.current.active) 取消全景拖动操作(false);
    const 当前视觉偏移 = 保留视觉位置 ? 读取全景当前视觉偏移() : null;
    全景导航序号.current += 1;
    全景模式启用中.current = false;
    取消全景惯性动画帧();
    清理全景滚轮结束定时器();
    清理全景切换定时器();
    暂停全景动画();
    if (当前视觉偏移 !== null && 全景模式引用.current) {
      设置全景偏移值(当前视觉偏移);
    }
  }

  function 取消阅读区尺寸刷新动画帧(): void {
    if (阅读区尺寸刷新动画帧.current !== null) {
      window.cancelAnimationFrame(阅读区尺寸刷新动画帧.current);
      阅读区尺寸刷新动画帧.current = null;
    }
  }

  function 同步全景位移样式(偏移: number): void {
    const 页面流 = 全景页面流.current;
    if (!页面流) return;
    页面流.style.setProperty(
      "--reader-panorama-translate",
      `${偏移 * 全景横向符号 - 全景当前锚点引用.current}px`,
    );
  }

  function 读取全景当前视觉偏移(): number | null {
    const 页面流 = 全景页面流.current;
    if (!页面流) return null;
    const 计算样式 = window.getComputedStyle(页面流);
    const transform = 计算样式.transform;
    if (!transform || transform === "none") return null;
    try {
      const 矩阵 = new DOMMatrixReadOnly(transform);
      const 独立平移分量 = 计算样式.translate && 计算样式.translate !== "none"
        ? 计算样式.translate.split(/\s+/).map((分量) => Number.parseFloat(分量) || 0)
        : [0, 0];
      const 独立平移 = 垂直阅读
        ? (独立平移分量[1] ?? 0)
        : (独立平移分量[0] ?? 0);
      const 视觉平移 = (垂直阅读 ? 矩阵.m42 : 矩阵.m41) + 独立平移;
      return (视觉平移 + 全景当前锚点引用.current) * 全景横向符号;
    } catch {
      return null;
    }
  }

  function 设置全景偏移值(偏移: number): void {
    const 安全偏移 = 限制模式2偏移(偏移);
    全景偏移引用.current = 安全偏移;
    同步全景位移样式(安全偏移);
  }

  function 暂停全景动画(): void {
    全景动画恢复序号.current += 1;
    全景页面流.current?.style.setProperty("transition", "none");
    设置全景动画启用(false);
  }

  function 延后启用全景动画(): void {
    const 序号 = ++全景动画恢复序号.current;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (
          全景动画恢复序号.current === 序号
          && !全景拖动.current.active
          && 全景惯性动画帧.current === null
          && !全景切换中.current
        ) {
          全景页面流.current?.style.removeProperty("transition");
          设置全景动画启用(true);
        }
      });
    });
  }

  function 记录全景速度采样(拖动: 全景拖动状态, x: number, y: number, time: number): void {
    const 末采样 = 拖动.samples[拖动.samples.length - 1];
    const 安全时间 = Number.isFinite(time) && time > 0 ? time : performance.now();
    if (末采样 && 安全时间 <= 末采样.time) return;
    if (末采样 && 末采样.x === x && 末采样.y === y && Math.abs(末采样.time - 安全时间) < 0.01) return;
    拖动.samples.push({ x, y, time: 安全时间 });
    while (拖动.samples.length > NeeView速度采样上限) {
      拖动.samples.shift();
    }
    while (拖动.samples.length > 1 && 安全时间 - 拖动.samples[0].time > NeeView速度采样窗口毫秒) {
      拖动.samples.shift();
    }
  }

  function 记录全景指针采样(
    拖动: 全景拖动状态,
    事件: ReactPointerEvent<HTMLDivElement>,
  ): void {
    const 原生事件 = 事件.nativeEvent;
    const 合并事件 = typeof 原生事件.getCoalescedEvents === "function"
      ? 原生事件.getCoalescedEvents()
      : [];
    const 采样事件 = 合并事件.length > 0 ? 合并事件 : [原生事件];
    for (const 采样 of 采样事件) {
      const 时间 = Number.isFinite(采样.timeStamp) ? 采样.timeStamp : performance.now();
      记录全景速度采样(拖动, 采样.clientX, 采样.clientY, 时间);
    }
  }

  function 计算全景采样速度(采样列表: 全景速度采样[]): { x: number; y: number } {
    return estimateReleaseVelocity(采样列表, 垂直阅读);
  }

  function 计算全景甩动强度(采样列表: 全景速度采样[]): number {
    const 速度 = 计算全景采样速度(采样列表);
    const 轴向速度 = Math.abs(垂直阅读 ? 速度.y : 速度.x);
    return Math.min(1, Math.max(0, (轴向速度 - 0.35) / (NeeView最大惯性速度 - 0.35)));
  }

  function 应用全景拖动位置(拖动: 全景拖动状态): void {
    const 速度 = 计算全景采样速度(拖动.samples);
    const 增益 = 拖动.pointerType === "mouse" ? mouseDragGain(垂直阅读 ? 速度.y : 速度.x) : 1;
    拖动.velocityX = (拖动.pointerType === "mouse" ? acceleratedMouseVelocity(速度.x) : 速度.x) * 全景横向符号;
    拖动.velocityY = 拖动.pointerType === "mouse" ? acceleratedMouseVelocity(速度.y) : 速度.y;
    const 拖动距离 = (垂直阅读 ? 拖动.currentY - 拖动.lastY : (拖动.currentX - 拖动.lastX) * 全景横向符号) * 增益;
    拖动.lastX = 拖动.currentX;
    拖动.lastY = 拖动.currentY;
    拖动.distance += 拖动距离;
    设置全景偏移值(拖动.startOffset + 拖动.distance);
    // Do not accumulate invisible overscroll at either end of the book.
    拖动.distance = 全景偏移引用.current - 拖动.startOffset;
    尝试重心化模式2窗口();
    安排模式2运动预热(
      垂直阅读 ? 拖动.velocityY : 拖动.velocityX,
      Math.min(1, Math.abs(垂直阅读 ? 速度.y : 速度.x) / NeeView最大惯性速度),
      拖动距离,
    );
  }

  function 启动全景惯性滚动(velocityX: number, velocityY: number, 甩动强度 = 0): void {
    取消全景惯性动画帧();
    暂停全景动画();
    const 初始速度 = 垂直阅读 ? velocityY : velocityX;
    if (Math.abs(初始速度) < NeeView惯性最小速度) {
      提交模式2自由位置();
      return;
    }

    let 当前速度 = Math.max(-NeeView最大惯性速度, Math.min(NeeView最大惯性速度, 初始速度));
    const 开始时间 = performance.now();
    全景惯性上帧时间.current = 开始时间;

    const 推进惯性 = (当前时间: number) => {
      const 间隔 = Math.max(0, 当前时间 - 全景惯性上帧时间.current);
      // A callback scheduled during a frame can share its timestamp. No elapsed
      // time means no motion yet, not that the page has reached a boundary.
      if (间隔 === 0) {
        全景惯性动画帧.current = window.requestAnimationFrame(推进惯性);
        return;
      }
      全景惯性上帧时间.current = 当前时间;
      const 速度绝对值 = Math.abs(当前速度);
      if (
        速度绝对值 < NeeView惯性最小速度
        || 间隔 > 250 // A suspended/backgrounded frame should settle, not jump.
      ) {
        全景惯性动画帧.current = null;
        全景惯性上帧时间.current = 0;
        提交模式2自由位置();
        return;
      }

      const 下一步 = advanceInertia(当前速度, 间隔);
      const 移动距离 = 下一步.distance;
      const 原偏移 = 全景偏移引用.current;
      设置全景偏移值(原偏移 + 移动距离);
      尝试重心化模式2窗口();
      安排模式2运动预热(当前速度, 甩动强度, 移动距离);

      const 已到边界 = Math.abs(全景偏移引用.current - 原偏移) < 0.01;
      当前速度 = 已到边界 ? 0 : 下一步.velocity;

      if (Math.abs(当前速度) < NeeView惯性最小速度) {
        全景惯性动画帧.current = null;
        全景惯性上帧时间.current = 0;
        提交模式2自由位置();
        return;
      }

      全景惯性动画帧.current = window.requestAnimationFrame(推进惯性);
    };

    全景惯性动画帧.current = window.requestAnimationFrame(推进惯性);
  }

  function 获取沉浸隐藏延迟(): number {
    return 阅读器设置.immersiveAutoHideDelay ?? 3000;
  }

  function 安排顶部栏隐藏(): void {
    清理顶部栏隐藏定时器();
    if (!可隐藏工具栏 || 桌面按住指针.current.size || 阅读面板打开.current || document.activeElement?.matches(".reader-toolbar input,.reader-toolbar textarea")) return;
    顶部栏隐藏定时器.current = window.setTimeout(() => {
      设置顶部栏可见(false);
      顶部栏隐藏定时器.current = null;
    }, 获取沉浸隐藏延迟());
  }

  function 安排底部栏隐藏(忽略输入聚焦 = false): void {
    清理底部栏隐藏定时器();
    if (!可隐藏工具栏 || 桌面按住指针.current.size || 进度拖动比例 !== null || (!忽略输入聚焦 && 页码输入聚焦)) return;
    底部栏隐藏定时器.current = window.setTimeout(() => {
      设置底部栏可见(false);
      底部栏隐藏定时器.current = null;
    }, 获取沉浸隐藏延迟());
  }

  function 显示顶部栏(): void {
    if (!可隐藏工具栏) return;
    设置顶部栏可见(true);
    安排顶部栏隐藏();
  }

  function 显示底部栏(): void {
    if (!可隐藏工具栏) return;
    设置底部栏可见(true);
    安排底部栏隐藏();
  }

  function 计算阅读区可用尺寸(区域元素: HTMLDivElement): 可用区域尺寸 {
    const 样式 = window.getComputedStyle(区域元素);
    const 水平内边距 = Number.parseFloat(样式.paddingLeft) + Number.parseFloat(样式.paddingRight);
    const 垂直内边距 = Number.parseFloat(样式.paddingTop) + Number.parseFloat(样式.paddingBottom);
    return {
      width: Math.max(0, 区域元素.clientWidth - 水平内边距),
      height: Math.max(0, 区域元素.clientHeight - 垂直内边距),
    };
  }

  function 刷新阅读区可用尺寸(): void {
    const 区域元素 = 阅读区域.current;
    if (!区域元素) return;
    const 新尺寸 = 计算阅读区可用尺寸(区域元素);

    设置可用区域((原尺寸) => {
      const 是瞬时无效尺寸 = (新尺寸.width < 2 || 新尺寸.height < 2) && 原尺寸.width > 0 && 原尺寸.height > 0;
      if (是瞬时无效尺寸 || (原尺寸.width === 新尺寸.width && 原尺寸.height === 新尺寸.height)) {
        return 原尺寸;
      }
      if (全景模式引用.current) {
        暂停全景动画();
        延后启用全景动画();
      }
      return 新尺寸;
    });
  }

  function 安排刷新阅读区可用尺寸(): void {
    取消阅读区尺寸刷新动画帧();
    阅读区尺寸刷新动画帧.current = window.requestAnimationFrame(() => {
      阅读区尺寸刷新动画帧.current = null;
      刷新阅读区可用尺寸();
    });
  }

  function 选择缩放模式(模式: 阅读器缩放模式): void {
    if (阅读视图初始化中 || 全景模式引用.current || 全景模式启用中.current) return;
    设置缩放模式(模式);
    安排刷新阅读区可用尺寸();
  }

  async function 读取页面图片状态(页面: 阅读页面项, signal?: AbortSignal, prefetch=false): Promise<{ pageIndex: number; state: 页面图片状态 }> {
    try {
      if (文档源) {
        const 内容 = await 文档源.readPage(页面.index, signal);
        return { pageIndex: 页面.index, state: { ...内容, error: null, loading: false } };
      }
      if(原生图片核心&&!/\.gif$/i.test(页面.name)){
        const prepared=await androidCall<Pick<页面图片状态,'url'|'width'|'height'|'decodedBytes'|'native'>>('readerPrepare',{
          sourcePath:页面.sourcePath,archiveInnerPath:页面.archiveInnerPath,type:页面.type,session:阅读器会话Id.current,prefetch,
          workKey:原生页面Key(页面),
          seek:模式2 ? undefined : 原生跳页代号.current,
          width:Math.round((可用区域.width||window.innerWidth)*devicePixelRatio),height:Math.round((可用区域.height||window.innerHeight)*devicePixelRatio),
        });
        if(signal?.aborted)return 创建已取消页面图片结果(页面.index);
        if(prepared.width&&prepared.height)写入页面原始尺寸(页面.index,prepared.width,prepared.height);
        return {pageIndex:页面.index,state:{...prepared,error:null,loading:false}};
      }
      const 结果 = await window.omicomic.getPageImage({
        sourcePath: 页面.sourcePath,
        virtualPath: 页面.virtualPath,
        archiveInnerPath: 页面.archiveInnerPath,
        readerSessionId: 阅读器会话Id.current,
        prefetch,
        type: 页面.type,
      });
      if (signal?.aborted) return 创建已取消页面图片结果(页面.index);
      let decodedImage: HTMLImageElement | undefined;
      if (!isAndroid() && 结果.ok && 结果.data.url) {
        // Keep a decoded image in the same byte-bounded state as its URL. Read-ahead
        // now prepares pixels, rather than deferring the expensive decode to a turn.
        const image = new Image(); image.decoding = 'async'; image.fetchPriority = prefetch ? 'low' : 'high';
        if (结果.data.url.startsWith('omicomic-image:')) image.crossOrigin = 'anonymous';
        const abort = () => { image.src = ''; };
        signal?.addEventListener('abort', abort, { once: true });
        try { image.src = 结果.data.url; await image.decode(); decodedImage = image; }
        finally { signal?.removeEventListener('abort', abort); }
        if (signal?.aborted) return 创建已取消页面图片结果(页面.index);
      }
      return {
        pageIndex: 页面.index,
        state: 结果.ok
          ? {
              url: 结果.data.url,
              error: null,
              loading: false,
              width: decodedImage?.naturalWidth || 结果.data.width,
              height: decodedImage?.naturalHeight || 结果.data.height,
              decodedImage,
            }
          : { url: "", error: 结果.error.message, loading: false },
      };
    } catch (reason) {
      if (signal?.aborted) return 创建已取消页面图片结果(页面.index);
      return {
        pageIndex: 页面.index,
        state: {
          url: "",
          error: reason instanceof Error ? reason.message : "当前页加载失败，请尝试重新打开该资源。",
          loading: false,
        },
      };
    }
  }

  function 创建已取消页面图片结果(页面索引: number): 页面图片任务结果 {
    return {
      pageIndex: 页面索引,
      state: { url: "", error: null, loading: false },
    };
  }

  function 排序页面图片加载队列(): void {
    页面图片加载队列.current.sort((左侧, 右侧) => (
      左侧.优先级 - 右侧.优先级 || 左侧.排队顺序 - 右侧.排队顺序
    ));
  }

  function 完成页面图片调度任务(任务: 页面图片调度任务, 结果: 页面图片任务结果): void {
    if (页面图片运行任务.current.get(任务.页面.index) === 任务) 页面图片运行任务.current.delete(任务.页面.index);
    页面图片运行任务数.current = Math.max(0, 页面图片运行任务数.current - 1);
    if (页面图片读取任务.current.get(任务.页面.index) === 任务.promise) {
      页面图片读取任务.current.delete(任务.页面.index);
      活动页面加载索引.current.delete(任务.页面.index);
    }
    任务.完成(结果);
    推进页面图片加载队列();
  }

  function 推进页面图片加载队列(): void {
    const 并发上限 = Math.min(Math.max(Math.round(页面图片并发上限.current), 1), isAndroid() ? 8 : 24);
    while (页面图片加载队列.current.length > 0) {
      // Reserve a foreground lane; slow speculative reads must not block a jump.
      const 下一任务 = 页面图片加载队列.current[0];
      const 可用并发 = 下一任务.优先级 === 0 ? Math.max(2, 并发上限) : Math.max(1, 并发上限 - 1);
      if (页面图片运行任务数.current >= 可用并发) break;
      const 任务 = 页面图片加载队列.current.shift();
      if (!任务) break;
      页面图片排队任务.current.delete(任务.页面.index);
      if (任务.调度代号 !== 页面图片调度代号.current || 任务.消费者取消检查.every((已取消) => 已取消())) {
        if (页面图片读取任务.current.get(任务.页面.index) === 任务.promise) {
          页面图片读取任务.current.delete(任务.页面.index);
          活动页面加载索引.current.delete(任务.页面.index);
        }
        任务.完成(创建已取消页面图片结果(任务.页面.index));
        continue;
      }

      页面图片运行任务数.current += 1;
      页面图片运行任务.current.set(任务.页面.index, 任务);
      void 读取页面图片状态(任务.页面, 任务.controller.signal,任务.优先级!==0)
        .then((结果) => 完成页面图片调度任务(任务, 结果))
        .catch(() => 完成页面图片调度任务(任务, {
          pageIndex: 任务.页面.index,
          state: {
            url: "",
            error: "当前页加载失败，请尝试重新打开该资源。",
            loading: false,
          },
        }));
    }
  }

  function 取消页面图片加载调度(): void {
    for (const 任务 of 页面图片运行任务.current.values()) 任务.controller.abort();
    页面图片调度代号.current += 1;
    const 排队任务 = 页面图片加载队列.current;
    页面图片加载队列.current = [];
    页面图片排队任务.current.clear();
    页面图片读取任务.current.clear();
    活动页面加载索引.current.clear();
    for (const 任务 of 排队任务) {
      任务.完成(创建已取消页面图片结果(任务.页面.index));
    }
  }

  function 保留页面图片加载调度(保留:Set<number>): void {
    for (const 任务 of 页面图片运行任务.current.values()) {
      if (保留.has(任务.页面.index)) continue;
      任务.controller.abort();
      if (页面图片读取任务.current.get(任务.页面.index) === 任务.promise) {
        页面图片读取任务.current.delete(任务.页面.index);
        活动页面加载索引.current.delete(任务.页面.index);
      }
    }
    页面图片加载队列.current = 页面图片加载队列.current.filter(任务 => {
      if (保留.has(任务.页面.index)) return true;
      页面图片排队任务.current.delete(任务.页面.index);
      if (页面图片读取任务.current.get(任务.页面.index) === 任务.promise) {
        页面图片读取任务.current.delete(任务.页面.index);
        活动页面加载索引.current.delete(任务.页面.index);
      }
      任务.完成(创建已取消页面图片结果(任务.页面.index));
      return false;
    });
  }

  function 清除过期排队图片(): void {
    if (文档源) {
      for (const 任务 of 页面图片运行任务.current.values()) {
        if (任务.消费者取消检查.every(已取消 => 已取消())) 任务.controller.abort();
      }
    }
    页面图片加载队列.current = 页面图片加载队列.current.filter((任务) => {
      if (!任务.消费者取消检查.every((已取消) => 已取消())) return true;
      if (页面图片读取任务.current.get(任务.页面.index) === 任务.promise) {
        页面图片读取任务.current.delete(任务.页面.index);
        页面图片排队任务.current.delete(任务.页面.index);
        活动页面加载索引.current.delete(任务.页面.index);
      }
      任务.完成(创建已取消页面图片结果(任务.页面.index));
      return false;
    });
  }

  function 读取页面图片状态任务(
    页面: 阅读页面项,
    优先级: 页面图片任务优先级 = 1,
    已取消: () => boolean = () => false,
  ): Promise<页面图片任务结果> {
    const 已有任务 = 页面图片读取任务.current.get(页面.index);
    const 运行任务 = 页面图片运行任务.current.get(页面.index);
    if (已有任务 && !运行任务?.controller.signal.aborted) {
      const 已排队任务 = 页面图片排队任务.current.get(页面.index) ?? 运行任务;
      已排队任务?.消费者取消检查.push(已取消);
      if (已排队任务 && 优先级 < 已排队任务.优先级) {
        已排队任务.优先级 = 优先级;
        排序页面图片加载队列();
        推进页面图片加载队列();
      }
      return 已有任务;
    }
    清除过期排队图片();

    let 完成任务!: (结果: 页面图片任务结果) => void;
    const promise = new Promise<页面图片任务结果>((完成) => {
      完成任务 = 完成;
    });
    const 任务: 页面图片调度任务 = {
      页面,
      优先级,
      排队顺序: 页面图片任务排队顺序.current++,
      调度代号: 页面图片调度代号.current,
      promise,
      完成: 完成任务,
      消费者取消检查: [已取消],
      controller: new AbortController(),
    };
    页面图片读取任务.current.set(页面.index, promise);
    页面图片排队任务.current.set(页面.index, 任务);
    页面图片加载队列.current.push(任务);
    活动页面加载索引.current.add(页面.index);
    排序页面图片加载队列();
    推进页面图片加载队列();
    return promise;
  }

  function 估算图片Url字节(url: string): number {
    if (!url) return 0;
    // 页面 data URL 仅包含 ASCII，V8 通常以单字节字符串驻留；其他 URL 按 UTF-16 保守估算。
    if (url.startsWith("data:")) return url.length;
    return url.length * 2;
  }

  function 估算页面图片缓存字节(状态: 页面图片状态): number {
    if (状态.html) return 状态.html.length * 2;
    const 压缩字节 = 估算图片Url字节(状态.url);
    const 解码字节 = 状态.width && 状态.height
      ? Math.max(0, 状态.width * 状态.height * 4)
      : 0;
    return 压缩字节 + (状态.decodedBytes ?? 解码字节);
  }

  function 计算缓存必留索引集合(): Set<number> {
    const 索引集合 = new Set<number>();
    for (const 索引 of 当前页组索引) 索引集合.add(索引);
    for (const 索引 of 可显示页组?.indices ?? []) 索引集合.add(索引);
    if (!resource || resource.total <= 0) return 索引集合;

    if (模式2) {
      for (let 索引 = 模式2窗口起点; 索引 <= 模式2窗口终点; 索引 += 1) {
        索引集合.add(索引);
      }
    }
    for (const 索引 of 活动页面加载索引.current) 索引集合.add(索引);
    return 索引集合;
  }

  async function 并发读取页面图片(
    页面列表: 阅读页面项[],
    并发数: number,
    写入结果: (结果: { pageIndex: number; state: 页面图片状态 }) => void,
    已取消: () => boolean,
    选项: { 提交已完成结果?: boolean; 优先级?: 页面图片任务优先级 } = {},
  ): Promise<void> {
    let 游标 = 0;
    const 工作者数量 = Math.min(Math.max(并发数, 1), Math.max(页面列表.length, 1));
    await Promise.all(Array.from({ length: 工作者数量 }, async () => {
      while (!已取消()) {
        const 页面 = 页面列表[游标];
        游标 += 1;
        if (!页面) return;
        const 结果 = await 读取页面图片状态任务(页面, 选项.优先级 ?? 1, 已取消);
        if (!已取消() || 选项.提交已完成结果) 写入结果(结果);
      }
    }));
  }

  function 标记页面加载开始(页面列表: 阅读页面项[]): void {
    for (const 页面 of 页面列表) {
      活动页面加载索引.current.add(页面.index);
    }
  }

  function 标记页面加载结束(页面列表: 阅读页面项[]): void {
    for (const 页面 of 页面列表) {
      活动页面加载索引.current.delete(页面.index);
    }
  }

  function 页面仍在活动加载(页面索引: number): boolean {
    return 活动页面加载索引.current.has(页面索引);
  }

  function 重置取消的页面加载状态(页面列表: 阅读页面项[]): void {
    if (页面列表.length === 0) return;
    标记页面加载结束(页面列表);
    const 页面索引集合 = new Set(页面列表.map((页面) => 页面.index));
    设置页面图片状态表((原表) => {
      let 已变更 = false;
      const 新表 = { ...原表 };
      for (const 页面索引 of 页面索引集合) {
        const 状态 = 新表[页面索引];
        if (状态?.loading && !状态.url && !状态.error) {
          新表[页面索引] = { url: "", error: null, loading: false };
          已变更 = true;
        }
      }
      return 已变更 ? 新表 : 原表;
    });
  }

  async function 确保页面图片就绪(页面索引: number, 已取消: () => boolean = () => false): Promise<boolean> {
    if (!resource || resource.total <= 0) return false;
    const 操作资源Key = resource.resourceKey;
    const 安全页 = 限制索引(页面索引, resource.total);
    const 页面 = resource.pages[安全页];
    if (!页面) return false;

    const 已缓冲 = 模式2预热结果缓冲.current.get(安全页);
    if (已缓冲?.url || 已缓冲?.error) {
      模式2预热结果缓冲.current.delete(安全页);
      设置页面图片状态表((原表) => ({ ...原表, [安全页]: 已缓冲 }));
      return !已取消() && 资源Key引用.current === 操作资源Key;
    }
    const 已有状态 = 页面图片状态引用.current[安全页];
    if (已有状态?.error) return true;
    if (已有状态?.url) return 资源Key引用.current === 操作资源Key;

    设置页面图片状态表((原表) => ({
      ...原表,
      [安全页]: { url: "", error: null, loading: true },
    }));

    const 结果 = await 读取页面图片状态任务(页面, 0, 已取消);
    if (已取消() || 资源Key引用.current !== 操作资源Key) return false;
    设置页面图片状态表((原表) => ({
      ...原表,
      [结果.pageIndex]: 结果.state,
    }));
    if (资源Key引用.current !== 操作资源Key) return false;
    return Boolean(结果.state.url || 结果.state.error);
  }

  function 清理模式2动态缓存(中心索引: number, 方向: -1 | 0 | 1, 强度: number): void {
    if (!resource || resource.total <= 0) return;
    const 中心页 = 限制索引(中心索引, resource.total);
    const 修正强度 = Math.min(Math.max(强度, 0), 1);
    const 必留索引 = 计算缓存必留索引集合();
    for (const 索引 of 当前页组索引) 必留索引.add(索引);
    for (let 索引 = 模式2窗口起点; 索引 <= 模式2窗口终点; 索引 += 1) 必留索引.add(索引);
    for (const 索引 of 活动页面加载索引.current) 必留索引.add(索引);

    const 身后保留页数 = Math.max(6, 模式2窗口半径 + 2);
    const 快速动态清理 = 方向 !== 0 && 修正强度 >= 0.28;
    const 目标缓存字节 = Math.floor(
      内存缓存上限字节 * (快速动态清理 ? 0.82 : 1),
    );

    设置页面图片状态表((原表) => {
      let 总字节 = 0;
      let 已变更 = false;
      const 可移除项: Array<{ 索引: number; 字节: number; 距离: number; 身后: boolean }> = [];

      for (const [索引文本, 状态] of Object.entries(原表)) {
        if (!状态.url) continue;
        const 索引 = Number(索引文本);
        if (!Number.isFinite(索引)) continue;
        const 字节 = 估算页面图片缓存字节(状态);
        总字节 += 字节;
        if (必留索引.has(索引)) continue;

        const 身后 = 方向 > 0
          ? 索引 < 中心页 - 身后保留页数
          : 方向 < 0
            ? 索引 > 中心页 + 身后保留页数
            : false;
        可移除项.push({
          索引,
          字节,
          距离: Math.abs(索引 - 中心页),
          身后,
        });
      }

      const 超出字节上限 = 总字节 > 目标缓存字节;
      if (!快速动态清理 && !超出字节上限) return 原表;
      const 新表 = { ...原表 };
      可移除项.sort((左侧, 右侧) => {
        if (左侧.身后 !== 右侧.身后) return 左侧.身后 ? -1 : 1;
        return 右侧.距离 - 左侧.距离 || 右侧.索引 - 左侧.索引;
      });

      for (const 项 of 可移除项) {
        const 需要删除 = 快速动态清理 && 项.身后;
        const 当前超出字节上限 = 总字节 > 目标缓存字节;
        if (!需要删除 && !当前超出字节上限) break;
        delete 新表[项.索引];
        总字节 -= 项.字节;
        已变更 = true;
      }

      return 已变更 ? 新表 : 原表;
    });
  }

  function 刷新模式2预热结果(仅提交运动关键页面 = false): void {
    if (模式2预热结果提交定时器.current !== null) {
      window.clearTimeout(模式2预热结果提交定时器.current);
      模式2预热结果提交定时器.current = null;
    }
    if (模式2预热结果缓冲.current.size === 0) return;

    const 视口中心索引 = 仅提交运动关键页面 ? 计算模式2偏移最近索引() : -1;
    const 结果列表 = Array.from(模式2预热结果缓冲.current.entries())
      .filter(([页面索引]) => !仅提交运动关键页面 || Math.abs(页面索引 - 视口中心索引) <= 2);
    if (结果列表.length === 0) return;
    for (const [页面索引] of 结果列表) {
      模式2预热结果缓冲.current.delete(页面索引);
    }
    设置页面图片状态表((原表) => {
      const 新表 = { ...原表 };
      for (const [页面索引, 状态] of 结果列表) {
        新表[页面索引] = 状态;
      }
      return 新表;
    });
  }

  function 安排刷新模式2预热结果(): void {
    if (模式2预热结果提交定时器.current !== null) return;
    const 正在运动 = 全景拖动.current.active || 全景惯性动画帧.current !== null;
    const 提交延迟 = 正在运动 ? 120 : 32;
    模式2预热结果提交定时器.current = window.setTimeout(() => {
      模式2预热结果提交定时器.current = null;
      const 届时仍在运动 = 全景拖动.current.active || 全景惯性动画帧.current !== null;
      刷新模式2预热结果(届时仍在运动);
    }, 提交延迟);
  }

  function 取消模式2预热调度(): void {
    模式2预热代号.current += 1;
    模式2待预热请求.current = null;
    if (模式2预热调度帧.current !== null) {
      window.cancelAnimationFrame(模式2预热调度帧.current);
      模式2预热调度帧.current = null;
    }
    if (模式2预热延时定时器.current !== null) {
      window.clearTimeout(模式2预热延时定时器.current);
      模式2预热延时定时器.current = null;
    }
    if (模式2预热结果提交定时器.current !== null) {
      window.clearTimeout(模式2预热结果提交定时器.current);
      模式2预热结果提交定时器.current = null;
    }
    模式2预热结果缓冲.current.clear();
  }

  async function 执行模式2预热请求(请求: 模式2预热请求, 执行代号: number): Promise<void> {
    if (!resource || resource.total <= 0) return;
    const 操作资源Key = resource.resourceKey;
    const 索引列表 = 获取模式2预热索引(请求.centerIndex, 请求.direction, 请求.intensity);
    const 缓冲上限 = Math.min((isAndroid() ? 32 : 192) * 1024 * 1024, 内存缓存上限字节 * 0.2);
    let 缓冲字节 = 0;
    let 已用字节 = 0;
    let 单页估计 = 4 * 1024 * 1024;
    for (const 状态 of Object.values(页面图片状态引用.current)) {
      const 字节 = 估算页面图片缓存字节(状态);
      已用字节 += 字节;
      单页估计 = Math.max(单页估计, 字节);
    }
    for (const 状态 of 模式2预热结果缓冲.current.values()) {
      const 字节 = 估算页面图片缓存字节(状态);
      缓冲字节 += 字节;
      单页估计 = Math.max(单页估计, 字节);
    }
    已用字节 += 缓冲字节;

    const 待加载页面 = 索引列表
      .map((索引) => resource.pages[索引])
      .filter((页面): 页面 is 阅读页面项 => Boolean(页面))
      .filter((页面) => {
        if (页面仍在活动加载(页面.index)) return false;
        if (Math.abs(页面.index - 请求.centerIndex) > 2
          && (已用字节 + 单页估计 > 内存缓存上限字节 || 缓冲字节 + 单页估计 > 缓冲上限)) return false;
        const 状态 = 模式2预热结果缓冲.current.get(页面.index) ?? 页面图片状态引用.current[页面.index];
        return !状态 || (!状态.url && !状态.error);
      });
    if (待加载页面.length === 0) return;

    const 高强度预热 = 请求.intensity >= 0.45;
    const 批量上限 = Math.min(
      待加载页面.length,
      Math.max(1, 模式2图片加载线程数 * (高强度预热 ? 2 : 1)),
    );
    const 本批页面 = 待加载页面.slice(0, 批量上限);
    const 预热并发数 = 模式2图片加载线程数;
    标记页面加载开始(本批页面);

    try {
      await 并发读取页面图片(
        本批页面,
        预热并发数,
        (结果) => {
          活动页面加载索引.current.delete(结果.pageIndex);
          if (
            资源Key引用.current !== 操作资源Key
            || 模式2预热代号.current !== 执行代号
            || !全景模式引用.current
          ) {
            return;
          }
          模式2预热结果缓冲.current.set(结果.pageIndex, 结果.state);
          trimPrefetchBuffer(模式2预热结果缓冲.current, 请求.centerIndex, Math.min((isAndroid() ? 32 : 1024) * 1024 * 1024, 内存缓存上限字节 * 0.25), 估算页面图片缓存字节);
          安排刷新模式2预热结果();
        },
        () => 资源Key引用.current !== 操作资源Key || 模式2预热代号.current !== 执行代号,
        { 提交已完成结果: true },
      );
    } finally {
      标记页面加载结束(本批页面);
    }

    const 请求仍有效 = (
      资源Key引用.current === 操作资源Key
      && 模式2预热代号.current === 执行代号
      && 全景模式引用.current
    );
    if (请求仍有效) {
      if (
        待加载页面.length > 本批页面.length
        && 模式2待预热请求.current === null
      ) {
        模式2待预热请求.current = 请求;
      }
      清理模式2动态缓存(请求.centerIndex, 请求.direction, 请求.intensity);
    }
  }

  async function 执行模式2预热队列(): Promise<void> {
    if (模式2预热运行中.current) return;
    模式2预热运行中.current = true;
    const 执行代号 = 模式2预热代号.current;
    try {
      if (模式2待预热请求.current && 模式2预热代号.current === 执行代号) {
        const 请求 = 模式2待预热请求.current;
        模式2待预热请求.current = null;
        模式2上次快速预热时间.current = performance.now();
        await 执行模式2预热请求(请求, 执行代号);
      }
    } finally {
      模式2预热运行中.current = false;
      if (模式2待预热请求.current) {
        const 剩余间隔 = Math.max(
          0,
          模式2快速预热最小间隔毫秒 - (performance.now() - 模式2上次快速预热时间.current),
        );
        安排模式2预热执行(剩余间隔);
      }
    }
  }

  function 安排模式2预热执行(延迟毫秒 = 0): void {
    if (模式2预热调度帧.current !== null || 模式2预热运行中.current) return;
    if (延迟毫秒 > 0) {
      if (模式2预热延时定时器.current !== null) return;
      模式2预热延时定时器.current = window.setTimeout(() => {
        模式2预热延时定时器.current = null;
        安排模式2预热执行();
      }, 延迟毫秒);
      return;
    }
    if (模式2预热延时定时器.current !== null) {
      window.clearTimeout(模式2预热延时定时器.current);
      模式2预热延时定时器.current = null;
    }
    模式2预热调度帧.current = window.requestAnimationFrame(() => {
      模式2预热调度帧.current = null;
      void 执行模式2预热队列();
    });
  }

  function 预热模式2窗口(
    中心索引: number,
    选项: { 方向?: -1 | 0 | 1; 强度?: number; 立即?: boolean } = {},
  ): void {
    if (!resource || resource.total <= 0) return;
    const 请求: 模式2预热请求 = {
      centerIndex: 限制索引(中心索引, resource.total),
      direction: 选项.方向 ?? 0,
      intensity: Math.min(Math.max(选项.强度 ?? 0, 0), 1),
    };
    const 上次请求 = 模式2动态预热状态.current;
    const 需要接管正在运行的预热 = 模式2预热运行中.current
      && 上次请求 !== null
      && (
        请求.direction !== 上次请求.direction
        || Math.abs(请求.centerIndex - 上次请求.centerIndex) >= (请求.intensity >= 0.45 ? 1 : 3)
      );
    if (需要接管正在运行的预热) {
      模式2预热代号.current += 1;
    }
    模式2动态预热状态.current = 请求;
    模式2待预热请求.current = 请求;

    const 当前时间 = performance.now();
    const 需要节流 = !选项.立即
      && 当前时间 - 模式2上次快速预热时间.current < 模式2快速预热最小间隔毫秒;
    if (!需要节流) {
      安排模式2预热执行();
    } else {
      安排模式2预热执行(
        模式2快速预热最小间隔毫秒 - (当前时间 - 模式2上次快速预热时间.current),
      );
    }
  }

  function 安排模式2运动预热(轴向速度: number, 甩动强度 = 0, 轴向位移 = 0): void {
    if (!resource || !模式2 || resource.total <= 0) return;
    const 当前时间 = performance.now();
    if (当前时间 - 模式2上次运动预热时间.current < 模式2快速预热最小间隔毫秒) return;
    模式2上次运动预热时间.current = 当前时间;
    const 方向 = 计算模式2索引方向(轴向速度, 轴向位移);
    if (方向 === 0) return;
    预热模式2窗口(计算模式2偏移最近索引(), {
      方向,
      强度: 计算模式2速度强度(轴向速度, 甩动强度),
    });
  }

  function 等待下一绘制(): Promise<void> {
    return new Promise((完成) => {
      window.requestAnimationFrame(() => 完成());
    });
  }

  async function 准备模式2导航页面(
    目标索引: number,
    操作资源Key: string,
    导航序号: number,
  ): Promise<boolean> {
    if (!resource || resource.total <= 0) return false;
    const 目标页 = 限制索引(目标索引, resource.total);
    const 已准备 = await 确保页面图片就绪(目标页, () => 资源Key引用.current !== 操作资源Key || 全景导航序号.current !== 导航序号);
    if (
      !已准备
      || 资源Key引用.current !== 操作资源Key
      || 全景导航序号.current !== 导航序号
    ) {
      return false;
    }

    const 状态 = 页面图片状态引用.current[目标页];
    if (状态?.error) return true;
    if (状态?.native) return true;
    if (状态?.html || 状态?.canvas) return true;
    if (!状态?.url) return false;
    const 已显示图片 = 阅读区域.current?.querySelector<HTMLImageElement>(
      `[data-reader-page-index="${目标页}"] img`,
    );
    if (已显示图片?.complete && 已显示图片.naturalWidth > 0) {
      try {
        await 已显示图片.decode();
      } catch {
        if (!已显示图片.complete || 已显示图片.naturalWidth <= 0) return false;
      }
      return 资源Key引用.current === 操作资源Key
        && 全景导航序号.current === 导航序号;
    }

    const 解码图片 = new Image();
    解码图片.decoding = "async";
    if (状态.url.startsWith('omicomic-image:')) 解码图片.crossOrigin = 'anonymous';
    解码图片.src = 状态.url;
    全景导航解码图片.current = 解码图片;
    try {
      await 解码图片.decode();
    } catch {
      if (!解码图片.complete || 解码图片.naturalWidth <= 0) return false;
    } finally {
      if (全景导航解码图片.current === 解码图片) {
        全景导航解码图片.current = null;
      }
    }
    return 资源Key引用.current === 操作资源Key
      && 全景导航序号.current === 导航序号;
  }

  function 提交模式2自由位置(): void {
    if (!resource || !模式2 || resource.total <= 0) {
      延后启用全景动画();
      return;
    }
    const 原索引 = 安全索引引用.current;
    const 最近索引 = 计算模式2偏移最近索引();
    const 页面中心 = 模式2页面几何引用.current.页面中心;
    const 重基准偏移 = 全景偏移引用.current
      + (页面中心[最近索引] ?? 0)
      - (页面中心[原索引] ?? 0);
    全景偏移引用.current = 限制模式2偏移在窗口(
      重基准偏移,
      最近索引,
      0,
      resource.total - 1,
    );
    安全索引引用.current = 最近索引;
    全景窗口中心索引引用.current = 最近索引;
    设置当前索引(最近索引);
    设置全景窗口中心索引(最近索引);
    预热模式2窗口(最近索引, { 强度: 0.2 });
    刷新模式2预热结果();
    window.requestAnimationFrame(() => {
      if (!全景模式引用.current || 安全索引引用.current !== 最近索引) return;
      同步全景位移样式(全景偏移引用.current);
      延后启用全景动画();
    });
  }

  function 提交模式2定位(目标索引: number): void {
    if (!resource || resource.total <= 0) return;
    const 原索引 = 安全索引引用.current;
    const 目标页 = 限制索引(目标索引, resource.total);
    暂停全景动画();
    全景偏移引用.current = 0;
    安全索引引用.current = 目标页;
    全景窗口中心索引引用.current = 目标页;
    设置当前索引(目标页);
    设置全景窗口中心索引(目标页);
    预热模式2窗口(目标页, {
      方向: 规范化模式2方向(目标页 - 原索引),
      强度: 0.55,
    });
  }

  function 创建全景跳转幽灵(立即附加 = true): HTMLElement | null {
    const 页面流 = 全景页面流.current;
    const 区域 = 阅读区域.current;
    if (!页面流 || !区域) return null;
    const 区域矩形 = 区域.getBoundingClientRect();
    const 可见页面 = Array.from(
      页面流.querySelectorAll<HTMLElement>(".reader-page-frame"),
    ).filter((页面) => {
      const 矩形 = 页面.getBoundingClientRect();
      return 矩形.right > 区域矩形.left
        && 矩形.left < 区域矩形.right
        && 矩形.bottom > 区域矩形.top
        && 矩形.top < 区域矩形.bottom;
    });
    if (可见页面.length === 0) return null;

    const 幽灵 = document.createElement("div");
    幽灵.className = "reader-panorama-jump-ghost";
    幽灵.setAttribute("aria-hidden", "true");
    幽灵.dataset.panoramaTransitionRole = "outgoing";
    幽灵.style.background = window.getComputedStyle(区域).background;
    for (const 页面 of 可见页面) {
      const 页面矩形 = 页面.getBoundingClientRect();
      const 页面副本 = 页面.cloneNode(true) as HTMLElement;
      页面副本.style.position = "absolute";
      页面副本.style.left = `${页面矩形.left - 区域矩形.left}px`;
      页面副本.style.top = `${页面矩形.top - 区域矩形.top}px`;
      页面副本.style.width = `${页面矩形.width}px`;
      页面副本.style.height = `${页面矩形.height}px`;
      页面副本.style.margin = "0";
      页面副本.querySelectorAll<HTMLImageElement>("img").forEach((图片) => {
        图片.loading = "eager";
      });
      const 原画布 = 页面.querySelectorAll("canvas");
      页面副本.querySelectorAll("canvas").forEach((画布, index) => {
        const 原图 = 原画布[index];
        if (原图?.width && 原图.height) 画布.getContext("2d")?.drawImage(原图, 0, 0);
      });
      幽灵.appendChild(页面副本);
    }
    if (立即附加) {
      区域.appendChild(幽灵);
      全景跳转幽灵.current = 幽灵;
    }
    return 幽灵;
  }

  function 获取模式2跳转位移(原索引: number, 目标索引: number): { x: number; y: number } {
    const 区域 = 阅读区域.current;
    const 索引方向 = 目标索引 >= 原索引 ? 1 : -1;
    const 视觉方向 = !垂直阅读 && 从右到左阅读 ? -索引方向 : 索引方向;
    const 轴长 = 区域 ? (垂直阅读 ? 区域.clientHeight : 区域.clientWidth) : 0;
    const 距离 = Math.min(420, Math.max(160, 轴长 * 0.24));
    return { x: 垂直阅读 ? 0 : 距离 * 视觉方向, y: 垂直阅读 ? 距离 * 视觉方向 : 0 };
  }

  function 开始模式2跳转离场(幽灵: HTMLElement, 原索引: number, 目标索引: number): Promise<unknown> {
    const 页面流 = 全景页面流.current;
    const 区域 = 阅读区域.current;
    if (!页面流 || !区域 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
    const { x, y } = 获取模式2跳转位移(原索引, 目标索引);
    区域.dataset.panoramaJumpDirection = 目标索引 > 原索引 ? "forward" : "backward";
    区域.dataset.panoramaJumpPhase = "departing";
    // 用可见页快照保留旧内容；目标加载期间保持轻微缩放，不露出空白阅读区。
    页面流.style.visibility = "hidden";
    const 离场动画 = 幽灵.animate([
      { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
      { transform: `translate3d(${x}px, ${y}px, 0) scale(${模式2跳转缩放})`, opacity: 0.94 },
    ], { duration: 模式2离场动画毫秒, easing: "cubic-bezier(0.3, 0, 0.3, 1)", fill: "both" });
    全景跳转动画列表.current.push(离场动画);
    return 离场动画.finished.catch(() => undefined);
  }

  async function 播放模式2方向跳转动画(
    幽灵: HTMLElement,
    原索引: number,
    目标索引: number,
  ): Promise<void> {
    const 页面流 = 全景页面流.current;
    const 区域 = 阅读区域.current;
    if (!页面流 || !区域 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const { x, y } = 获取模式2跳转位移(原索引, 目标索引);
    区域.dataset.panoramaJumpPhase = "arriving";
    页面流.style.removeProperty("visibility");
    页面流.style.zIndex = "3";
    页面流.dataset.panoramaTransitionRole = "incoming";
    const 区域矩形 = 区域.getBoundingClientRect();
    const 中心页 = 页面流.querySelector<HTMLElement>(`[data-reader-page-index="${目标索引}"]`);
    const 中心矩形 = 中心页?.getBoundingClientRect() ?? 区域矩形;
    const 聚拢距离 = Math.min(52, Math.max(28, (垂直阅读 ? 区域.clientHeight : 区域.clientWidth) * 0.035));
    // 只动画目标页、相邻页和实际可见页面，避免把预加载窗口全部提升成动画图层。
    const 页面列表 = Array.from(页面流.querySelectorAll<HTMLElement>(".reader-page-frame"))
      .map(页面 => ({ 页面, 矩形: 页面.getBoundingClientRect(), 索引: Number(页面.dataset.readerPageIndex) }))
      .filter(({ 索引, 矩形 }) => Math.abs(索引 - 目标索引) <= 1 || (
        矩形.right > 区域矩形.left && 矩形.left < 区域矩形.right
        && 矩形.bottom > 区域矩形.top && 矩形.top < 区域矩形.bottom
      ));
    // 整段页面一起滑入，保持页间关系；邻页的聚拢稍后接上，不以淡入代替位移。
    const 滑入动画 = 页面流.animate([
      { translate: `${-x}px ${-y}px` },
      { translate: "0px 0px" },
    ], {
      duration: 模式2滑入动画毫秒,
      easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "both",
    });
    const 新页动画 = 页面列表.map(({ 页面, 矩形, 索引 }) => {
      const 是中心页 = 索引 === 目标索引;
      const 侧向 = Math.sign(垂直阅读
        ? 矩形.top + 矩形.height / 2 - 中心矩形.top - 中心矩形.height / 2
        : 矩形.left + 矩形.width / 2 - 中心矩形.left - 中心矩形.width / 2);
      const 起始X = 是中心页 || 垂直阅读 ? 0 : 侧向 * 聚拢距离;
      const 起始Y = 是中心页 || !垂直阅读 ? 0 : 侧向 * 聚拢距离;
      return 页面.animate([
        { transform: `translate3d(${起始X}px, ${起始Y}px, 0) scale(${模式2跳转缩放})`, opacity: 是中心页 ? 1 : 0.84 },
        { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1 },
      ], {
        duration: 是中心页 ? 220 : 模式2聚拢动画毫秒,
        delay: 是中心页 ? 0 : 120,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both",
      });
    });
    const 旧页动画 = 幽灵.animate(
      [
        { transform: `translate3d(${x}px, ${y}px, 0) scale(${模式2跳转缩放})`, opacity: 0.94 },
        { transform: `translate3d(${x * 2.2}px, ${y * 2.2}px, 0) scale(${模式2跳转缩放})`, opacity: 0 },
      ],
      { duration: 260, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)", fill: "both" },
    );
    全景跳转动画列表.current.push(滑入动画, ...新页动画, 旧页动画);
    await Promise.allSettled([滑入动画, ...新页动画, 旧页动画].map(动画 => 动画.finished));
  }

  function 完成模式2定位(目标索引: number): void {
    清理全景切换定时器();
    // 页窗口与新锚点在同一次提交中生效，不能在下一帧先清零旧窗口的位移。
    flushSync(() => 提交模式2定位(目标索引));
    同步全景位移样式(0);
    延后启用全景动画();
  }

  function 滑动模式2到页面(目标索引: number): Promise<boolean> {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      设置全景偏移值(-计算模式2页面中心差(目标索引));
      return Promise.resolve(true);
    }
    return new Promise((完成) => {
      let 起始时间: number | null = null;
      let 上次进度 = 0;
      const 动画 = {
        frame: 0,
        cancel: () => {
          window.cancelAnimationFrame(动画.frame);
          if (全景单页动画.current === 动画) 全景单页动画.current = null;
          完成(false);
        },
      };
      const 绘制 = (时间: number) => {
        if (全景单页动画.current !== 动画) return;
        起始时间 ??= 时间;
        const 比例 = Math.min(1, Math.max(0, (时间 - 起始时间) / 模式2跳转动画毫秒));
        const 进度 = 1 - (1 - 比例) ** 4;
        const 剩余步长 = (进度 - 上次进度) / Math.max(1e-6, 1 - 上次进度);
        const 目标偏移 = -计算模式2页面中心差(目标索引);
        // 只移动真实页面，不预先跳到终点再叠加 translate 抵消。
        // 从最新位置收敛，邻页尺寸迟到或连续翻页时也能接上当前画面。
        设置全景偏移值(比例 === 1 ? 目标偏移
          : 全景偏移引用.current + (目标偏移 - 全景偏移引用.current) * 剩余步长);
        上次进度 = 进度;
        if (比例 === 1) {
          全景单页动画.current = null;
          完成(true);
        } else {
          动画.frame = window.requestAnimationFrame(绘制);
        }
      };
      全景单页动画.current = 动画;
      动画.frame = window.requestAnimationFrame(绘制);
    });
  }

  async function 切换模式2页面(目标索引: number, 方式: "slide" | "jump" = "slide"): Promise<void> {
    if (!resource || resource.total <= 0) return;
    if (全景拖动.current.active) 取消全景拖动操作(false);
    const 当前视觉偏移 = 读取全景当前视觉偏移();
    const 操作资源Key = resource.resourceKey;
    const 原索引 = 计算模式2偏移最近索引();
    const 本次导航序号 = ++全景导航序号.current;
    const 目标页 = 限制索引(目标索引, resource.total);
    const 实际方式: "slide" | "jump" = 方式 === "jump" && 目标页 !== 原索引
      ? "jump"
      : "slide";
    const 使用跳转动画 = 实际方式 === "jump" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 连续点击时先恢复真实页面，快照不继承上一次动画的缩放或隐藏状态。
    取消全景惯性动画帧();
    清理全景滚轮结束定时器();
    清理全景切换定时器();
    if (当前视觉偏移 !== null) 设置全景偏移值(当前视觉偏移);
    const 预先冻结幽灵 = 使用跳转动画 ? 创建全景跳转幽灵(false) : null;
    if (预先冻结幽灵 && 阅读区域.current) {
      阅读区域.current.appendChild(预先冻结幽灵);
      全景跳转幽灵.current = 预先冻结幽灵;
    }
    全景导航目标索引.current = 目标页;
    暂停全景动画();
    全景切换中.current = true;
    const 离场完成 = 预先冻结幽灵
      ? 开始模式2跳转离场(预先冻结幽灵, 原索引, 目标页)
      : Promise.resolve();
    预热模式2窗口(目标页, {
      方向: 规范化模式2方向(目标页 - 原索引),
      强度: 实际方式 === "jump" ? 1 : 0.45,
      立即: 实际方式 === "jump",
    });

    const 目标已准备 = await 准备模式2导航页面(目标页, 操作资源Key, 本次导航序号);
    if (
      !目标已准备
      || 资源Key引用.current !== 操作资源Key
      || 全景导航序号.current !== 本次导航序号
    ) {
      if (全景导航序号.current === 本次导航序号) {
        清理全景切换定时器();
        延后启用全景动画();
      }
      return;
    }
    await 离场完成;
    await 等待下一绘制();
    if (资源Key引用.current !== 操作资源Key || 全景导航序号.current !== 本次导航序号) return;

    const 可在当前窗口滑动 = 实际方式 !== "jump"
      && 目标页 >= 模式2窗口起点
      && 目标页 <= 模式2窗口终点;
    if (!可在当前窗口滑动) {
      const 幽灵 = 全景跳转幽灵.current;
      提交模式2定位(目标页);
      try {
        await 等待下一绘制();
        if (
          资源Key引用.current !== 操作资源Key
          || 全景导航序号.current !== 本次导航序号
        ) {
          return;
        }
        if (幽灵) await 播放模式2方向跳转动画(幽灵, 原索引, 目标页);
      } catch {
        // 动画能力异常时保留已经就绪的目标页，清理工作交给 finally。
      } finally {
        if (
          资源Key引用.current === 操作资源Key
          && 全景导航序号.current === 本次导航序号
        ) {
          清理全景切换定时器();
          同步全景位移样式(0);
          延后启用全景动画();
        }
      }
      return;
    }

    const 页面流 = 全景页面流.current;
    if (!页面流) {
      完成模式2定位(目标页);
      return;
    }
    const 已完成 = await 滑动模式2到页面(目标页);
    if (!已完成 || 全景导航序号.current !== 本次导航序号 || 资源Key引用.current !== 操作资源Key) return;
    完成模式2定位(目标页);
  }

  function 全景滚屏到相邻页(方向: 1 | -1): boolean {
    if (!全景模式 || !resource || resource.total <= 1) return false;
    const 基准索引 = 全景导航目标索引.current ?? 计算模式2偏移最近索引();
    const 目标索引 = 限制索引(基准索引 + 方向, resource.total);
    if (目标索引 === 基准索引) return false;
    void 切换模式2页面(目标索引, "slide");
    return true;
  }

  function 跳转到页面索引(索引: number, 回退比例?: number, 重新配对 = false): Promise<void> {
    if (阅读视图初始化中) return Promise.resolve();
    if (!resource || resource.total <= 0) return Promise.resolve();
    if (重新配对) 设置双页配对起点(限制索引(索引, resource.total));
    设置跨本提示(null);
    const 目标索引 = 模式2 || 重新配对
      ? 限制索引(索引, resource.total)
      : 规范化页组主索引(
          索引,
          resource.total,
          有效阅读器设置,
          页面是跨页横图,
        );
    if (模式2) {
      const 来自进度跳页 = typeof 回退比例 === "number";
      const 方式 = 来自进度跳页 ? "jump" : "slide";
      return 切换模式2页面(目标索引, 方式);
    }
    设置当前索引(目标索引);
    return Promise.resolve();
  }

  function 跳转到阅读比例(比例: number): Promise<void> {
    if (!resource || resource.total <= 0) return Promise.resolve();
    const 修正比例 = Math.min(Math.max(比例, 0), 1);
    return 跳转到页面索引(
      Math.round(修正比例 * Math.max(0, resource.total - 1)),
      修正比例,
    );
  }

  function 读取进度条比例(事件: ReactPointerEvent<HTMLDivElement>): number {
    const 矩形 = 事件.currentTarget.getBoundingClientRect();
    const 比例 = 从右到左阅读
      ? 1 - ((事件.clientX - 矩形.left) / Math.max(1, 矩形.width))
      : (事件.clientX - 矩形.left) / Math.max(1, 矩形.width);
    return Math.min(Math.max(比例, 0), 1);
  }

  function 预览进度条拖动(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (进度拖动指针Id.current !== 事件.pointerId) return;
    if (!进度手势.current) return;
    if (Math.abs(事件.clientX-进度手势.current.x)>3) 进度手势.current.moved=true;
    if (!进度手势.current.moved) return;
    const 比例 = 读取进度条比例(事件);
    设置进度拖动比例(比例);
    实时拖动阅读比例(比例);
    if (手机布局 && 阅读器设置.mobileReaderPreviews !== false && resource?.sourceType !== 'epub' && resource?.sourceType !== 'pdf') 设置手机页面预览打开(true);
  }

  function 实时拖动阅读比例(比例: number): void {
    if (!resource || 阅读视图初始化中) return;
    const fraction=Math.min(1,Math.max(0,比例))*Math.max(0,resource.total-1);
    if (!模式2) { void 跳转到页面索引(Math.round(fraction)); return; }
    取消全景异步导航(true);
    const centers=模式2页面几何引用.current.页面中心, low=Math.floor(fraction), high=Math.min(resource.total-1,low+1);
    const target=(centers[low] ?? 0)+((centers[high] ?? 0)-(centers[low] ?? 0))*(fraction-low);
    暂停全景动画();
    设置全景偏移值((centers[安全索引引用.current] ?? 0)-target);
    尝试重心化模式2窗口();
    预热模式2窗口(Math.round(fraction),{强度:0.2});
  }

  function 开始进度条拖动(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (阅读视图初始化中 || !resource) return;
    事件.preventDefault();
    事件.stopPropagation();
    事件.currentTarget.setPointerCapture(事件.pointerId);
    进度跳转序号.current += 1;
    进度拖动指针Id.current = 事件.pointerId;
    进度手势.current = {x:事件.clientX,moved:false};
    const 比例 = 读取进度条比例(事件);
    设置进度拖动比例(比例);
    if (!模式2) 实时拖动阅读比例(比例);
  }

  function 延后清空进度拖动比例(跳转序号: number): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (
          进度拖动指针Id.current === null
          && 进度跳转序号.current === 跳转序号
        ) {
          设置进度拖动比例(null);
        }
      });
    });
  }

  function 完成进度条拖动(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (进度拖动指针Id.current !== 事件.pointerId) return;
    const 比例 = 读取进度条比例(事件);
    const 跳转序号 = 进度跳转序号.current;
    const 拖动 = 进度手势.current?.moved;
    进度手势.current = null;
    进度拖动指针Id.current = null;
    if (事件.currentTarget.hasPointerCapture(事件.pointerId)) 事件.currentTarget.releasePointerCapture(事件.pointerId);
    if (拖动) {
      实时拖动阅读比例(比例);
      if (模式2) 提交模式2自由位置();
      延后清空进度拖动比例(跳转序号);
      return;
    }
    if (模式2) {
      设置进度拖动比例(比例);
      void 跳转到阅读比例(比例).finally(() => 延后清空进度拖动比例(跳转序号));
      return;
    }
    设置进度拖动比例(null);
    void 跳转到阅读比例(比例);
  }

  function 取消进度条拖动(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (进度拖动指针Id.current !== 事件.pointerId) return;
    进度跳转序号.current += 1;
    进度拖动指针Id.current = null;
    进度手势.current = null;
    if (模式2) 提交模式2自由位置();
    设置进度拖动比例(null);
  }

  function 切换阅读流向(): void {
    if (阅读视图初始化中) return;
    const 新流向 = 阅读流向 === "horizontal" ? "vertical" : "horizontal";
    取消全景异步导航(true);
    if (模式2) 提交模式2自由位置();
    设置阅读流向(新流向);
    if (模式2) {
      暂停全景动画();
      设置全景偏移值(0);
      延后启用全景动画();
    }
  }

  function 提交启用模式2(进入索引: number): void {
    全景偏移引用.current = 0;
    安全索引引用.current = 进入索引;
    全景窗口中心索引引用.current = 进入索引;
    设置全景窗口中心索引(进入索引);
    全景模式引用.current = true;
    设置全景模式(true);
    预热模式2窗口(进入索引, { 立即: true });
    安排刷新阅读区可用尺寸();
  }

  async function 启用模式2(): Promise<void> {
    if (!resource || resource.total <= 0 || 全景模式启用中.current) return;
    const 进入资源Key = resource.resourceKey;
    const 进入索引 = 安全索引;
    const 本次导航序号 = ++全景导航序号.current;
    全景模式启用中.current = true;
    取消全景惯性动画帧();
    清理全景滚轮结束定时器();
    清理全景切换定时器();
    取消模式2预热调度();
    暂停全景动画();
    设置全景偏移值(0);
    刷新阅读区可用尺寸();
    await 等待下一绘制();

    const 当前页已准备 = await 准备模式2导航页面(
      进入索引,
      进入资源Key,
      本次导航序号,
    );
    if (
      资源Key引用.current !== 进入资源Key
      || 全景导航序号.current !== 本次导航序号
      || 全景模式引用.current
      || 安全索引引用.current !== 进入索引
      || !当前页已准备
    ) {
      全景模式启用中.current = false;
      延后启用全景动画();
      return;
    }

    提交启用模式2(进入索引);
  }

  function 切换全景模式(): void {
    if (阅读视图初始化中) return;
    if (全景模式启用中.current && !全景模式引用.current) {
      全景导航序号.current += 1;
      全景模式启用中.current = false;
      清理全景切换定时器();
      取消模式2预热调度();
      延后启用全景动画();
    }
    const 新启用 = !全景模式引用.current;
    取消全景惯性动画帧();
    清理全景切换定时器();
    if (新启用) {
      const 当前已显示图片 = 阅读区域.current?.querySelector<HTMLImageElement>(
        `[data-reader-page-index="${安全索引引用.current}"] img`,
      );
      if (当前已显示图片?.complete && 当前已显示图片.naturalWidth > 0) {
        全景导航序号.current += 1;
        全景模式启用中.current = false;
        取消模式2预热调度();
        暂停全景动画();
        设置全景偏移值(0);
        刷新阅读区可用尺寸();
        提交启用模式2(安全索引引用.current);
        return;
      }
      void 启用模式2();
      return;
    } else {
      const 退出索引 = 计算模式2偏移最近索引();
      全景导航序号.current += 1;
      全景模式启用中.current = false;
      模式2动态预热状态.current = null;
      取消模式2预热调度();
      清理全景滚轮结束定时器();
      全景偏移引用.current = 0;
      安全索引引用.current = 退出索引;
      全景窗口中心索引引用.current = 退出索引;
      设置当前索引(退出索引);
      设置全景窗口中心索引(退出索引);
      全景模式引用.current = false;
      设置全景模式(false);
      设置全景动画启用(true);
    }
    安排刷新阅读区可用尺寸();
  }

  function 结束全景拖动(): void {
    if (!全景拖动.current.active) return;
    const 拖动 = 全景拖动.current;
    应用全景拖动位置(拖动);
    全景拖动.current.active = false;
    全景拖动.current.pointerId = -1;
    取消全景拖动动画帧();
    设置全景拖动中(false);
    const 甩动强度 = 计算全景甩动强度(拖动.samples);
    启动全景惯性滚动(拖动.velocityX, 拖动.velocityY, 甩动强度);
  }

  function 取消全景拖动操作(需要提交位置 = true): void {
    if (!全景拖动.current.active) return;
    const 拖动 = 全景拖动.current;
    应用全景拖动位置(拖动);
    全景拖动.current.active = false;
    全景拖动.current.pointerId = -1;
    取消全景拖动动画帧();
    设置全景拖动中(false);
    if (需要提交位置) 提交模式2自由位置();
  }

  function 开始全景拖动(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (阅读视图初始化中 || !模式2 || !事件.isPrimary || 事件.button !== 0 || 全景拖动.current.active) return;
    const 目标 = 事件.target as HTMLElement | null;
    if (目标?.closest("button, input, .reader-progress-rail")) return;
    const 当前视觉偏移 = 读取全景当前视觉偏移();
    全景导航序号.current += 1;
    取消全景惯性动画帧();
    清理全景滚轮结束定时器();
    清理全景切换定时器();
    暂停全景动画();
    if (当前视觉偏移 !== null) {
      设置全景偏移值(当前视觉偏移);
    }
    const 当前时间 = 事件.nativeEvent.timeStamp;
    全景拖动.current = {
      active: true,
      pointerId: 事件.pointerId,
      startX: 事件.clientX,
      startY: 事件.clientY,
      currentX: 事件.clientX,
      currentY: 事件.clientY,
      lastX: 事件.clientX,
      lastY: 事件.clientY,
      lastTime: 当前时间,
      velocityX: 0,
      velocityY: 0,
      startOffset: 全景偏移引用.current,
      distance: 0,
      pointerType: 事件.pointerType,
      samples: [{ x: 事件.clientX, y: 事件.clientY, time: 当前时间 }],
    };
    事件.currentTarget.setPointerCapture(事件.pointerId);
    设置全景拖动中(true);
    事件.preventDefault();
  }

  function 拖动全景(事件: ReactPointerEvent<HTMLDivElement>): void {
    const 拖动 = 全景拖动.current;
    if (!拖动.active || 拖动.pointerId !== 事件.pointerId) return;
    记录全景指针采样(拖动, 事件);
    const 当前时间 = 事件.nativeEvent.timeStamp;
    拖动.lastTime = 当前时间;
    拖动.currentX = 事件.clientX;
    拖动.currentY = 事件.clientY;
    if (全景拖动动画帧.current === null) {
      全景拖动动画帧.current = window.requestAnimationFrame(() => {
        全景拖动动画帧.current = null;
        const 当前拖动 = 全景拖动.current;
        if (!当前拖动.active) return;
        应用全景拖动位置(当前拖动);
      });
    }
    事件.preventDefault();
  }

  function 结束全景指针(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (全景拖动.current.pointerId === 事件.pointerId) {
      const 拖动 = 全景拖动.current;
      if (拖动.active) {
        const 当前时间 = 事件.nativeEvent.timeStamp;
        拖动.currentX = 事件.clientX;
        拖动.currentY = 事件.clientY;
        const 末采样 = 拖动.samples[拖动.samples.length - 1];
        if (
          !末采样
          || Math.hypot(事件.clientX - 末采样.x, 事件.clientY - 末采样.y) > 0.1
          || 当前时间 - 末采样.time >= 16
        ) {
          记录全景速度采样(拖动, 事件.clientX, 事件.clientY, 当前时间);
        }
      }
      结束全景拖动();
      if (事件.currentTarget.hasPointerCapture(事件.pointerId)) {
        事件.currentTarget.releasePointerCapture(事件.pointerId);
      }
    }
  }

  function 取消全景指针(事件: ReactPointerEvent<HTMLDivElement>): void {
    if (全景拖动.current.pointerId !== 事件.pointerId) return;
    取消全景拖动操作();
  }

  function 滚动全景(事件: ReactWheelEvent<HTMLDivElement>): void {
    if (!resource || !模式2) return;
    const 原始增量 = Math.abs(事件.deltaX) > Math.abs(事件.deltaY)
      ? 事件.deltaX * 全景横向符号
      : 事件.deltaY;
    if (Math.abs(原始增量) < 0.01) return;
    事件.preventDefault();
    if (全景拖动.current.active) return;
    if (原始增量 < 0 && 当前页组包含首页 && 上一本资源) 设置跨本提示("previous");
    else if (原始增量 > 0 && 当前页组包含尾页 && 下一本资源) 设置跨本提示("next");
    else 设置跨本提示(null);

    const 新滚轮会话 = 全景滚轮结束定时器.current === null;
    if (新滚轮会话) {
      const 当前视觉偏移 = 读取全景当前视觉偏移();
      全景导航序号.current += 1;
      取消全景惯性动画帧();
      清理全景切换定时器();
      暂停全景动画();
      if (当前视觉偏移 !== null) 设置全景偏移值(当前视觉偏移);
    }
    清理全景滚轮结束定时器();

    const 轴长 = 垂直阅读
      ? Math.max(1, 阅读区域.current?.clientHeight ?? 模式2可用高度)
      : Math.max(1, 阅读区域.current?.clientWidth ?? 模式2可用宽度);
    const 模式倍率 = 事件.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : 事件.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 轴长
        : 1;
    const 像素增量 = 原始增量 * 模式倍率;
    const 单次上限 = Math.max(48, 轴长 * 0.28);
    const 修正增量 = Math.max(-单次上限, Math.min(单次上限, 像素增量));
    设置全景偏移值(全景偏移引用.current - 修正增量);
    尝试重心化模式2窗口();
    安排模式2运动预热(-修正增量 / 16, 0, -修正增量);
    全景滚轮结束定时器.current = window.setTimeout(() => {
      全景滚轮结束定时器.current = null;
      提交模式2自由位置();
    }, 120);
  }

  useLayoutEffect(() => {
    if (!全景模式) return;
    全景模式引用.current = true;
    全景模式启用中.current = false;
    同步全景位移样式(全景偏移引用.current);
    延后启用全景动画();
  }, [全景模式, resource?.resourceKey]);

  useLayoutEffect(() => {
    设置全景可见索引(安全索引);
  }, [安全索引, 全景模式, resource?.resourceKey]);

  useEffect(() => {
    页面图片并发上限.current = 图片加载线程数;
    推进页面图片加载队列();
  }, [图片加载线程数]);

  useEffect(() => {
    if (isActive) return;
    加载序号.current += 1;
    普通预加载代号.current += 1;
    进度跳转序号.current += 1;
    进度拖动指针Id.current = null;
    设置进度拖动比例(null);
    取消全景异步导航(true);
    取消模式2预热调度();
    取消页面图片加载调度();
    设置页面图片状态表({});
    设置页面尺寸表({});
    设置可显示页组(null);
    阅读器会话Id.current = 下一个阅读器会话Id++;
    void window.omicomic.setReaderSession(阅读器会话Id.current);
    延后启用全景动画();
  }, [isActive]);

  useEffect(() => {
    立即保存待保存进度();
    待保存进度.current = null;
    // React's development effect replay runs the unmount cleanup first.
    // Re-establish the session key before asynchronous initialization resumes.
    资源Key引用.current = resource?.resourceKey ?? null;
    阅读视图初始化序号.current += 1;
    阅读视图已加载资源Key引用.current = null;
    设置阅读视图已加载资源Key(null);
    void window.omicomic.setReaderSession(阅读器会话Id.current);
    加载序号.current += 1;
    const 最大索引 = Math.max(0, (resource?.total ?? 1) - 1);
    const 起始索引 = Math.min(Math.max(initialPageIndex, 0), 最大索引);
    取消全景拖动操作(false);
    清理全景切换定时器();
    清理全景滚轮结束定时器();
    全景模式启用中.current = false;
    模式2动态预热状态.current = null;
    取消模式2预热调度();
    全景导航序号.current += 1;
    全景模式引用.current = false;
    设置全景模式(false);
    普通预加载代号.current += 1;
    取消页面图片加载调度();
    void 同步沉浸全屏(false, false);
    暂停全景动画();
    全景偏移引用.current = 0;
    全景窗口中心索引引用.current = 起始索引;
    设置全景窗口中心索引(起始索引);
    设置当前索引(起始索引);
    设置页码输入(String(起始索引 + 1));
    设置页面图片状态表({});
    设置可显示页组(null);
    设置页组加载状态({ status: "idle", requestId: 加载序号.current, pageGroupKey: "" });
    设置页面尺寸表({});
    设置错误信息(null);
    设置书签错误(null);
    设置当前页已书签(false);
    设置阅读流向("horizontal");
    设置缩放模式(默认阅读器设置.readerDefaultFitMode);
    设置顶部栏可见(true);
    设置底部栏可见(true);
    延后启用全景动画();
  }, [initialPageIndex, resource]);

  useEffect(() => {
    if (!isActive || !resource) return;
    const 初始化资源Key = resource.resourceKey;
    const 本次初始化序号 = ++阅读视图初始化序号.current;
    let 已取消 = false;

    void Promise.all([
      window.omicomic.getAppData().catch(() => null),
      window.omicomic.getReadingProgress(初始化资源Key).catch(() => null),
    ])
      .then(async ([应用数据结果, 阅读进度结果]) => {
        if (
          已取消
          || 阅读视图初始化序号.current !== 本次初始化序号
          || 资源Key引用.current !== 初始化资源Key
        ) return;

        if (!应用数据结果?.ok) {
          设置错误信息(
            应用数据结果 && !应用数据结果.ok
              ? 应用数据结果.error.message
              : "阅读设置读取失败，请返回资源库后重试。",
          );
          return;
        }
        const 应用设置 = 应用数据结果.data.settings;
        const 已保存进度 = (
          阅读进度结果?.ok ? 阅读进度结果.data : null
        ) ?? 应用数据结果.data.readingProgress[初始化资源Key] ?? null;
        const 阅读视图 = 已保存进度?.readerViewState ?? 创建默认阅读视图(应用设置);
        const 新阅读器设置 = {
          readerDefaultFitMode: 应用设置.readerDefaultFitMode,
          readerPageMode: 阅读视图.pageMode,
          readerDefaultFlow: 应用设置.readerDefaultFlow,
          readerDefaultPanorama: 应用设置.readerDefaultPanorama,
          readerDefaultImmersive: 应用设置.readerDefaultImmersive,
          doublePageFirstSingle: 应用设置.doublePageFirstSingle,
          doublePageDirection: 阅读视图.pageDirection,
          smartDetectSpreadPage: 应用设置.smartDetectSpreadPage,
          wheelPageTurn: 应用设置.wheelPageTurn,
          immersiveAutoHide: 应用设置.immersiveAutoHide,
          immersiveAutoHideDelay: 应用设置.immersiveAutoHideDelay,
          readerHideFooterControls: 应用设置.readerHideFooterControls,
          readerHideImmersiveProgress: 应用设置.readerHideImmersiveProgress,
          readerMemoryCacheSizeMb: 应用设置.readerMemoryCacheSizeMb,
          readerPreloadPages: 应用设置.readerPreloadPages,
          readerImageLoadConcurrency: 应用设置.readerImageLoadConcurrency,
          bookSwitchButtonOpacity: 应用设置.bookSwitchButtonOpacity,
          readerVolumeKeys: Boolean(应用设置.readerVolumeKeys),
          readerVolumeKeysReversed: Boolean(应用设置.readerVolumeKeysReversed),
          readerVolumePanoramaPages: 应用设置.readerVolumePanoramaPages ?? 1,
          mobileReaderPreviews: 应用设置.mobileReaderPreviews !== false,
          mobileReaderAutoHide: 应用设置.mobileReaderAutoHide !== false,
          desktopReaderAutoHide: 应用设置.desktopReaderAutoHide === true,
          mobilePreviewWidth: 应用设置.mobilePreviewWidth ?? 88,
        };
        const 恢复保存位置 = !resource.requestedPageId && 已保存进度?.currentPageIndex === initialPageIndex;
        const 待恢复索引 = resolvePageIndex(resource.pages,
          resource.requestedPageId ?? (恢复保存位置 ? 已保存进度?.currentPageId : undefined),
          恢复保存位置 ? 已保存进度?.currentPageName : undefined, initialPageIndex);
        const 配对起点 = 已保存进度?.currentPageIndex === 待恢复索引
          ? resolvePageIndex(resource.pages, 阅读视图.pairingAnchorId, undefined, 阅读视图.pairingAnchor ?? 待恢复索引) : 待恢复索引;
        设置页面排序(normalizePageSort(阅读视图.pageSort));
        设置画面调整(手机布局 ? { ...normalizeAdjustments(应用设置.mobileImageAdjustments), enabled: true } : normalizeAdjustments(阅读视图.adjustments));
        设置自动阅读设置(normalizeAutoRead(阅读视图.autoRead));
        设置双页配对起点(配对起点);
        // Keep the saved page until dimensions decide whether it can pair.
        // Pre-normalizing here could discard the last page on a narrower window.
        const 恢复索引 = 限制索引(待恢复索引, resource.total);

        设置阅读器设置(新阅读器设置);
        设置缩放模式(手机布局 ? "fit-window" : 阅读视图.fitMode);
        设置手机页面预览打开(false);
        设置阅读流向(阅读视图.flow);
        设置当前索引(恢复索引);
        设置页码输入(String(恢复索引 + 1));
        全景偏移引用.current = 0;
        全景窗口中心索引引用.current = 恢复索引;
        设置全景窗口中心索引(恢复索引);
        全景模式引用.current = 阅读视图.panorama;
        全景模式启用中.current = false;
        设置全景模式(阅读视图.panorama);
        安排刷新阅读区可用尺寸();

        await 同步沉浸全屏(阅读视图.immersive, false);
        if (
          已取消
          || 阅读视图初始化序号.current !== 本次初始化序号
          || 资源Key引用.current !== 初始化资源Key
        ) return;
        阅读视图已加载资源Key引用.current = 初始化资源Key;
        设置阅读视图已加载资源Key(初始化资源Key);
      })
      .catch(() => undefined);

    return () => {
      已取消 = true;
    };
  }, [isActive, resource?.resourceKey, initialPageIndex]);

  useEffect(() => {
    if (
      !resource
      || !recordProgress
      || 阅读视图已加载资源Key !== resource.resourceKey
      || 阅读视图已加载资源Key引用.current !== resource.resourceKey
    ) return;
    const 进度 = 创建当前阅读进度();
    if (!进度) return;
    待保存进度.current = 进度;

    if (保存进度定时器.current !== null) {
      window.clearTimeout(保存进度定时器.current);
    }
    保存进度定时器.current = window.setTimeout(() => {
      保存进度定时器.current = null;
      const 待写入 = 待保存进度.current;
      if (待写入 && 允许进度记录.current) void 写入阅读进度(待写入);
    }, 600);
  }, [
    recordProgress,
    resource,
    安全索引,
    当前页面,
    阅读视图已加载资源Key,
    显示阅读索引,
    显示进度索引,
    双页配对起点,
    页面排序,
    画面调整,
    自动阅读设置,
    缩放模式,
    阅读器设置.readerPageMode,
    阅读器设置.doublePageDirection,
    阅读流向,
    全景模式,
    沉浸模式,
  ]);

  useEffect(() => () => {
    立即保存待保存进度(false);
    全景导航序号.current += 1;
    加载序号.current += 1;
    阅读视图初始化序号.current += 1;
    阅读视图已加载资源Key引用.current = null;
    全景动画恢复序号.current += 1;
    进度跳转序号.current += 1;
    资源Key引用.current = null;
    全景模式引用.current = false;
    全景模式启用中.current = false;
    清理顶部栏隐藏定时器();
    清理底部栏隐藏定时器();
    清理全景切换定时器();
    清理全景滚轮结束定时器();
    取消模式2预热调度();
    取消全景拖动动画帧();
    取消全景惯性动画帧();
    取消阅读区尺寸刷新动画帧();
    沉浸全屏同步序号.current += 1;
    void window.omicomic.setFullscreen(false);
  }, []);

  useEffect(() => {
    if (!沉浸模式) {
      设置顶部栏可见(true);
      设置底部栏可见(true);
      清理顶部栏隐藏定时器();
      清理底部栏隐藏定时器();
      if (桌面自动隐藏) { 安排顶部栏隐藏(); 安排底部栏隐藏(); }
      return;
    }

    设置顶部栏可见(false);
    设置底部栏可见(false);
    清理顶部栏隐藏定时器();
    清理底部栏隐藏定时器();
    return () => {
      清理顶部栏隐藏定时器();
      清理底部栏隐藏定时器();
    };
  }, [
    沉浸模式,
    阅读器设置.immersiveAutoHideDelay,
    桌面自动隐藏,
  ]);

  useEffect(() => {
    if (!桌面自动隐藏 || !isActive) return;
    const down = (event:PointerEvent) => {
      if (!(event.target as Element)?.closest('.reader-layout')) return;
      桌面按住指针.current.add(event.pointerId);清理顶部栏隐藏定时器();清理底部栏隐藏定时器();
    };
    const up = (event:PointerEvent) => {
      if (!桌面按住指针.current.delete(event.pointerId)) return;
      安排顶部栏隐藏();安排底部栏隐藏();
    };
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',up,true);
    return () => {document.removeEventListener('pointerdown',down,true);document.removeEventListener('pointerup',up,true);document.removeEventListener('pointercancel',up,true);桌面按住指针.current.clear();清理顶部栏隐藏定时器();清理底部栏隐藏定时器();};
  },[桌面自动隐藏,isActive,进度拖动比例,页码输入聚焦]);

  useEffect(() => { 设置跨本提示(null); }, [resource?.resourceKey, 当前页组Key, 全景模式, 从右到左阅读]);

  useEffect(() => {
    if (!全景模式) {
      取消全景拖动操作(false);
      取消全景拖动动画帧();
      取消全景惯性动画帧();
      清理全景切换定时器();
      清理全景滚轮结束定时器();
      全景偏移引用.current = 0;
    }
  }, [全景模式]);

  useEffect(() => {
    if (!全景模式) return;
    const 取消未完成手势 = () => {
      取消全景异步导航(true);
      提交模式2自由位置();
      延后启用全景动画();
    };
    const 处理可见性变化 = () => {
      if (document.visibilityState !== "visible") 取消未完成手势();
    };
    window.addEventListener("blur", 取消未完成手势);
    document.addEventListener("visibilitychange", 处理可见性变化);
    return () => {
      window.removeEventListener("blur", 取消未完成手势);
      document.removeEventListener("visibilitychange", 处理可见性变化);
    };
  }, [全景模式, 阅读流向, resource?.resourceKey, resource?.total]);

  useEffect(() => {
    设置页码输入(String(安全索引 + 1));
  }, [安全索引]);


  useEffect(() => {
    if (!resource || resource.total <= 0) {
      设置当前页已书签(false);
      return;
    }

    let 已取消 = false;
    void window.omicomic.isPageBookmarked(resource.resourceKey, 显示阅读索引, 显示阅读页面 ? pageIdentity(显示阅读页面) : undefined)
      .then((结果) => {
        if (已取消) return;
        if (结果.ok) {
          设置当前页已书签(结果.data);
        } else {
          设置当前页已书签(false);
          设置书签错误(结果.error.message);
        }
      })
      .catch(() => {
        if (!已取消) {
          设置当前页已书签(false);
          设置书签错误("书签状态读取失败。");
        }
      });

    return () => {
      已取消 = true;
    };
  }, [resource, 显示阅读索引]);

  useEffect(() => {
    if (!isActive || !阅读区域.current) return;

    const 区域元素 = 阅读区域.current;
    const 更新可用区域 = () => 安排刷新阅读区可用尺寸();

    const 尺寸观察器 = new ResizeObserver(更新可用区域);
    尺寸观察器.observe(区域元素);
    更新可用区域();

    return () => {
      取消阅读区尺寸刷新动画帧();
      尺寸观察器.disconnect();
    };
  }, [isActive]);

  useLayoutEffect(() => {
    const 区域 = 阅读区域.current;
    if (!区域) return;
    区域.scrollLeft = 0;
    区域.scrollTop = 0;
    安排刷新阅读区可用尺寸();
  }, [全景模式, 阅读流向, 缩放模式, 当前页组Key]);

  useEffect(() => {
    if (!isActive || !resource || 阅读视图初始化中 || 当前页组页面.length === 0) {
      设置页面图片状态表({});
      设置可显示页组(null);
      const 空请求序号 = ++加载序号.current;
      设置页组加载状态({ status: "idle", requestId: 空请求序号, pageGroupKey: "" });
      return;
    }

    const 本次序号 = ++加载序号.current;
    const 页面列表 = 当前页组页面;
    设置错误信息(null);
    const 需要加载页面 = 页面列表.filter((页面) => {
      const 状态 = 页面图片状态引用.current[页面.index];
      return !状态 || (!状态.url && !状态.error);
    });
    标记页面加载开始(需要加载页面);
    设置页面图片状态表((原表) => {
      const 新表 = { ...原表 };
      for (const 页面 of 页面列表) {
        const 原状态 = 新表[页面.index];
        if (!原状态 || (!原状态.url && !原状态.error)) {
          新表[页面.index] = { url: "", error: null, loading: true };
        }
      }
      return 新表;
    });

    if (需要加载页面.length === 0) {
      设置页组加载状态({
        status: "ready",
        requestId: 本次序号,
        pageGroupKey: 当前页组Key,
      });
      return;
    }

    设置页组加载状态({
      status: "loading",
      requestId: 本次序号,
      pageGroupKey: 当前页组Key,
    });

    let 已结束 = false;
    const 超时定时器 = window.setTimeout(() => {
      if (已结束 || 本次序号 !== 加载序号.current) return;
      已结束 = true;
      标记页面加载结束(需要加载页面);
      设置页面图片状态表((原表) => {
        const 新表 = { ...原表 };
        for (const 页面 of 需要加载页面) {
          const 原状态 = 新表[页面.index];
          if (!原状态 || 原状态.loading) {
            新表[页面.index] = {
              url: 原状态?.url ?? "",
              error: "当前页加载超时，请重试或翻页后返回。",
              loading: false,
            };
          }
        }
        return 新表;
      });
      设置页组加载状态({
        status: "error",
        requestId: 本次序号,
        pageGroupKey: 当前页组Key,
        message: "当前页加载超时，请重试或翻页后返回。",
      });
    }, 页组加载超时毫秒);

    const 加载结果: 页面图片任务结果[] = [];
    void 并发读取页面图片(
      需要加载页面,
      图片加载线程数,
      (结果) => 加载结果.push(结果),
      () => 已结束 || 本次序号 !== 加载序号.current,
      { 优先级: 0 },
    ).then(() => {
      if (已结束 || 本次序号 !== 加载序号.current) return;
      已结束 = true;
      标记页面加载结束(需要加载页面);
      window.clearTimeout(超时定时器);
      设置页面图片状态表((原表) => {
        const 新表 = { ...原表 };
        for (const 结果 of 加载结果) {
          新表[结果.pageIndex] = 结果.state;
        }
        return 新表;
      });
      设置页组加载状态({
        status: 加载结果.some((结果) => 结果.state.url) ? "ready" : "error",
        requestId: 本次序号,
        pageGroupKey: 当前页组Key,
        message: 加载结果.length > 0 && 加载结果.every((结果) => 结果.state.error)
          ? "当前页组加载失败，请重试或翻页后返回。"
          : undefined,
      });
    });

    return () => {
      已结束 = true;
      window.clearTimeout(超时定时器);
      重置取消的页面加载状态(需要加载页面);
    };
  }, [isActive, resource, 当前页组Key, 阅读视图初始化中]);

  useEffect(() => {
    普通预加载代号.current += 1;
    if (
      !isActive
      || !resource
      || 模式2
      || 阅读视图初始化中
      || 预加载页数 <= 0
      || 内存缓存上限字节 <= 0
    ) return;

    const 操作资源Key = resource.resourceKey;
    const 本次预加载代号 = 普通预加载代号.current;
    if (原生图片核心) {
      if (!目标页组已准备) return;
      for (const index of 原生预读索引) {
        const 页面 = resource.pages[index],状态 = 页面图片状态引用.current[index];
        if (!页面 || 状态?.url || 状态?.error) continue;
        const 已取消 = () => 资源Key引用.current !== 操作资源Key || 全景模式引用.current || !原生预读窗口.current.has(index);
        void 读取页面图片状态任务(页面,1,已取消).then(结果 => {
          if (已取消()) return;
          // A speculative failure must allow thumbnail fallback without making
          // the next foreground request permanently inherit a prefetch error.
          const state = 结果.state.url ? 结果.state : {...结果.state,error:null,prefetchFailed:true};
          设置页面图片状态表(原表 => ({...原表,[index]:state}));
        });
      }
      清除过期排队图片();
      return;
    }
    if (!isAndroid()) {
      if (!目标页组已准备) return;
      for (const index of 桌面预读索引) {
        const 页面 = resource.pages[index], state = 页面图片状态引用.current[index];
        const key = JSON.stringify([操作资源Key, index]);
        if (!页面 || state?.url || state?.prefetchFailed || 桌面预读任务.current.has(key)) continue;
        const cancelled = () => 资源Key引用.current !== 操作资源Key || 全景模式引用.current || !桌面预读窗口.current.has(index);
        const job = 读取页面图片状态任务(页面,1,cancelled).then(result => {
          if (cancelled()) return;
          const next = result.state.url ? result.state : {...result.state,error:null,prefetchFailed:true};
          设置页面图片状态表(previous => ({...previous,[index]:next}));
        }).finally(() => { if (桌面预读任务.current.get(key) === job) 桌面预读任务.current.delete(key); });
        桌面预读任务.current.set(key,job);
      }
      清除过期排队图片();
      return;
    }
    const 索引列表: number[] = [];
    const 页组起点 = 当前页组索引.length > 0 ? Math.min(...当前页组索引) : 安全索引;
    const 页组终点 = 当前页组索引.length > 0 ? Math.max(...当前页组索引) : 安全索引;
    for (let 距离 = 1; 距离 <= 预加载页数; 距离 += 1) {
      const 后页 = 页组终点 + 距离;
      const 前页 = 页组起点 - 距离;
      if (后页 < resource.total) 索引列表.push(后页);
      if (前页 >= 0) 索引列表.push(前页);
    }
    const 待预加载页面 = 索引列表
      .filter((索引) => !当前页组索引.includes(索引))
      .map((索引) => resource.pages[索引])
      .filter((页面): 页面 is 阅读页面项 => Boolean(页面))
      .filter((页面) => {
        if (页面仍在活动加载(页面.index)) return false;
        const 状态 = 模式2预热结果缓冲.current.get(页面.index) ?? 页面图片状态引用.current[页面.index];
        return !状态 || (!状态.url && !状态.error);
      });
    if (待预加载页面.length === 0) return;

    const 已取消 = () => (
      !isActive
      || 资源Key引用.current !== 操作资源Key
      || 普通预加载代号.current !== 本次预加载代号
      || 全景模式引用.current
    );
    void 并发读取页面图片(
      待预加载页面,
      图片加载线程数,
      (结果) => {
        if (已取消()) return;
        设置页面图片状态表((原表) => ({
          ...原表,
          [结果.pageIndex]: 结果.state,
        }));
      },
      已取消,
      { 优先级: 1 },
    );

    return () => {
      if (普通预加载代号.current === 本次预加载代号) {
        普通预加载代号.current += 1;
      }
    };
  }, [
    isActive,
    resource,
    模式2,
    安全索引,
    当前页组Key,
    预加载页数,
    图片加载线程数,
    内存缓存上限字节,
    阅读视图初始化中,
    原生图片核心,
    原生窗口Key,
    目标页组已准备,
    桌面窗口Key,
  ]);

  useEffect(() => {
    if (!isActive || !resource || !模式2 || 阅读视图初始化中) return;
    预热模式2窗口(安全索引, { 立即: true });
  }, [isActive, resource, 模式2, 安全索引, 当前页组Key, 模式2预热窗口半径, 模式2图片加载线程数, 阅读视图初始化中]);

  useEffect(() => {
    if (!isActive || !resource || !模式2 || 阅读视图初始化中) return;
    let 已取消 = false;
    const 操作资源Key = resource.resourceKey;
    const 几何 = 模式2页面几何引用.current;
    const 视口中心 = (几何.页面中心[安全索引引用.current] ?? 0) - 全景偏移引用.current;
    const 半轴长 = (垂直阅读 ? 模式2可用高度 : 模式2可用宽度) / 2;
    const 索引 = Array.from({ length: 模式2窗口终点 - 模式2窗口起点 + 1 }, (_, i) => 模式2窗口起点 + i)
      .filter(i => i === 显示阅读索引 || (几何.页面前缀长度[i] < 视口中心 + 半轴长 && 几何.页面前缀长度[i + 1] > 视口中心 - 半轴长))
      .sort((a, b) => Math.abs(a - 显示阅读索引) - Math.abs(b - 显示阅读索引));
    // Visible content has its own foreground lane. It never waits for a stale
    // panorama prefetch batch or for the drag/inertia gesture to finish.
    for (const i of 索引) {
      const 缓冲 = 模式2预热结果缓冲.current.get(i);
      if (缓冲?.url) {
        模式2预热结果缓冲.current.delete(i);
        设置页面图片状态表(原表 => ({ ...原表, [i]: 缓冲 }));
        continue;
      }
      const 状态 = 页面图片状态引用.current[i];
      if (状态?.url || 状态?.error) continue;
      const 页面 = resource.pages[i];
      if (!页面) continue;
      void 读取页面图片状态任务(页面, 0, () => 已取消 || 资源Key引用.current !== 操作资源Key)
        .then(结果 => {
          if (已取消 || 资源Key引用.current !== 操作资源Key || (!结果.state.url && !结果.state.error)) return;
          设置页面图片状态表(原表 => ({ ...原表, [i]: 结果.state }));
        });
    }
    清除过期排队图片();
    return () => { 已取消 = true; };
  }, [isActive, resource, 模式2, 阅读视图初始化中, 显示阅读索引, 模式2窗口起点, 模式2窗口终点, 缩放模式, 阅读流向, 可用区域]);

  useEffect(() => {
    if (!isActive || !resource) return;

    const 必留索引 = 计算缓存必留索引集合();
    设置页面图片状态表((原表) => {
      let 总字节 = 0;
      const 过期空项: string[] = [];
      const 可移除项: Array<{ 索引: number; 字节: number; 距离: number }> = [];

      for (const [索引文本, 状态] of Object.entries(原表)) {
        const 索引 = Number(索引文本);
        if (!状态.url) {
          if (!必留索引.has(索引) && !页面图片读取任务.current.has(索引)
            && (!状态.error || Math.abs(索引 - 安全索引) > 40)) 过期空项.push(索引文本);
          continue;
        }
        if (!Number.isFinite(索引)) continue;
        const 字节 = 估算页面图片缓存字节(状态);
        总字节 += 字节;
        if (必留索引.has(索引)) continue;
        可移除项.push({ 索引, 字节, 距离: Math.abs(索引 - 安全索引) });
      }

      if (总字节 <= 内存缓存上限字节 && 过期空项.length === 0) return 原表;
      const 新表 = { ...原表 };
      for (const 索引 of 过期空项) delete 新表[Number(索引)];
      let 已变更 = 过期空项.length > 0;
      可移除项.sort((左侧, 右侧) => 右侧.距离 - 左侧.距离 || 右侧.索引 - 左侧.索引);

      for (const 项 of 可移除项) {
        if (总字节 <= 内存缓存上限字节) break;
        delete 新表[项.索引];
        总字节 -= 项.字节;
        已变更 = true;
      }

      return 已变更 ? 新表 : 原表;
    });
  }, [isActive, resource, 页面图片状态表, 可显示页组, 安全索引, 当前页组Key, 模式2, 模式2窗口起点, 模式2窗口终点, 内存缓存上限字节]);

  useLayoutEffect(() => {
    if (!resource || 当前页组页面.length === 0 || !目标页组已准备) return;
    设置可显示页组({
      indices: 当前页组索引,
      visualIndices: 视觉页组索引,
      pages: 当前页组页面,
    });
    设置页组加载状态((原状态) => ({
      status: "ready",
      requestId: 原状态.requestId,
      pageGroupKey: 当前页组Key,
    }));
  }, [resource, 当前页组Key, 目标页组已准备]);

  useEffect(() => {
    if (!手机布局 || !onReady || 阅读视图初始化中 || 文档加载中 || (!目标页组已准备 && !文档错误)) return;
    let frame=0;
    // Layout and the decoded image get a paint opportunity before App reveals
    // this same reader surface over the still-visible library.
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>onReady());});
    return()=>cancelAnimationFrame(frame);
  }, [手机布局,onReady,阅读视图初始化中,文档加载中,目标页组已准备,文档错误]);

  useEffect(() => {
    if (!isActive || 阅读视图初始化中) return;

    function 处理快捷键(事件: KeyboardEvent): void {
      if (!interactive) return;
      const 目标元素 = 事件.target as HTMLElement | null;
      if (事件.defaultPrevented || (事件.key !== "Escape" && 目标元素?.closest('[role="combobox"], [role="listbox"]'))) return;
      if (
        目标元素
        && 目标元素.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="spinbutton"]')
        && 事件.key !== "Escape"
      ) {
        return;
      }

      if (事件.key === "Escape") {
        事件.preventDefault();
        if (沉浸模式) {
          设置沉浸全屏(false);
          return;
        }
        返回资源库();
        return;
      }
      if (!resource || resource.total === 0) return;

      if (事件.key.toLocaleLowerCase() === "f") {
        事件.preventDefault();
        设置沉浸全屏(!沉浸模式);
      } else if (!事件.altKey && !事件.ctrlKey && !事件.metaKey && 事件.key === "ArrowUp") {
        事件.preventDefault();
        if (!事件.repeat) void 切换相邻资源("previous");
      } else if (!事件.altKey && !事件.ctrlKey && !事件.metaKey && 事件.key === "ArrowDown") {
        事件.preventDefault();
        if (!事件.repeat) void 切换相邻资源("next");
      } else if (事件.key === "ArrowLeft") {
        事件.preventDefault();
        if (从右到左阅读) 下一页();
        else 上一页();
      } else if (事件.key === "ArrowRight") {
        事件.preventDefault();
        if (从右到左阅读) 上一页();
        else 下一页();
      } else if (事件.key === "Backspace" || 事件.key === "PageUp") {
        事件.preventDefault();
        上一页();
      } else if (事件.key === " " || 事件.key === "PageDown") {
        事件.preventDefault();
        下一页();
      } else if (事件.key === "Home") {
        事件.preventDefault();
        跳到首页();
      } else if (事件.key === "End") {
        事件.preventDefault();
        跳到尾页();
      }
    }

    window.addEventListener("keydown", 处理快捷键);
    return () => window.removeEventListener("keydown", 处理快捷键);
  }, [
    isActive,
    interactive,
    onBack,
    openContext,
    onSwitchResource,
    resource,
    安全索引,
    当前页面,
    沉浸模式,
    从右到左阅读,
    垂直阅读,
    全景模式,
    缩放模式,
    有效页模式,
    阅读器设置.doublePageFirstSingle,
    阅读器设置.smartDetectSpreadPage,
    当前页组Key,
    当前页组包含首页,
    当前页组包含尾页,
    双页配对起点,
    阅读视图初始化中,
    可用区域,
    页面尺寸表,
  ]);

  function 上一页(): void {
    if (阅读视图初始化中) return;
    if (当前页组包含首页) { if (上一本资源) 设置跨本提示("previous"); return; }
    设置跨本提示(null);
    if (全景滚屏到相邻页(-1)) return;
    跳转到页面索引(计算上一页组主索引(安全索引, 总页数, 有效阅读器设置, 是跨页横图));
  }

  function 下一页(): void {
    if (阅读视图初始化中) return;
    if (当前页组包含尾页) { if (下一本资源) 设置跨本提示("next"); return; }
    设置跨本提示(null);
    if (全景滚屏到相邻页(1)) return;
    跳转到页面索引(计算下一页组主索引(安全索引, 总页数, 有效阅读器设置, 是跨页横图));
  }

  function 跳到首页(): void {
    void 跳转到页面索引(0, undefined, true);
  }

  function 跳到尾页(): void {
    跳转到页面索引(Math.max(0, 总页数 - 1));
  }

  async function 切换相邻资源(方向: "previous" | "next"): Promise<void> {
    const motion = mobileNavigationEpoch();
    const 目标资源 = directionToTarget(方向);
    if (!目标资源 || !openContext || 相邻资源切换中.current) return;

    相邻资源切换中.current = true;
    try {
      立即保存待保存进度();
      设置错误信息(null);
      const 结果 = await window.omicomic.getResourcePages({
        path: 目标资源.path,
        type: 目标资源.type,
      });
      if (!结果.ok) {
        设置错误信息(结果.error.message);
        return;
      }

      const 新上下文: 阅读打开上下文 = {
        ...openContext,
        currentKey: 目标资源.key,
      };
      const 进度结果 = await window.omicomic.getReadingProgress(结果.data.resourceKey);
      const 进度 = 进度结果.ok ? 进度结果.data : null;
      const 文档页面 = 结果.data.sourceType === "pdf" || 结果.data.sourceType === "epub";
      const 目标页码 = openContext.source === "bookmarks"
        ? 文档页面 ? 目标资源.pageIndex ?? 0 : resolvePageIndex(结果.data.pages, 目标资源.pageId, 目标资源.pageName, 目标资源.pageIndex ?? 0)
        : 进度?.currentPageIndex ?? 0;
      const 起始页 = Math.min(Math.max(目标页码, 0), 文档页面 ? Number.MAX_SAFE_INTEGER : Math.max(0, 结果.data.total - 1));
      if (手机布局) onSwitchResource(结果.data, 起始页, 新上下文, motion);
      else onSwitchResource(结果.data, 起始页, 新上下文);
    } finally {
      相邻资源切换中.current = false;
    }
  }

  function directionToTarget(方向: "previous" | "next") {
    return 方向 === "previous" ? 上一本资源 : 下一本资源;
  }

  function 应用页码输入(): void {
    if (阅读视图初始化中) return;
    if (!resource || resource.total === 0) {
      设置页码输入("0");
      return;
    }

    const 输入文本 = 页码输入.trim();
    const 输入页码 = Number.parseInt(输入文本, 10);
    if (!输入文本 || !Number.isFinite(输入页码)) {
      设置页码输入(String(安全索引 + 1));
      return;
    }

    const 修正页码 = Math.min(Math.max(输入页码, 1), resource.total);
    const 目标索引 = 限制索引(修正页码 - 1, resource.total);
    if (目标索引 === 显示进度索引) return;
    void 跳转到页面索引(目标索引, undefined, true);
    设置页码输入(String(目标索引 + 1));
  }

  async function 切换当前页书签(): Promise<void> {
    if (!resource || !显示阅读页面 || resource.total <= 0) return;
    设置书签处理中(true);
    设置书签错误(null);

    const 结果 = await window.omicomic.toggleBookmark({
      resourceKey: resource.resourceKey,
      sourcePath: resource.sourcePath,
      sourceType: resource.sourceType,
      title: resource.title,
      pageIndex: 显示阅读索引,
      pageId: pageIdentity(显示阅读页面),
      totalPages: resource.total,
      pageName: 显示阅读页面.name,
      archiveInnerPath: 显示阅读页面.archiveInnerPath,
    });

    设置书签处理中(false);
    if (!结果.ok) {
      设置书签错误(结果.error.message);
      return;
    }

    设置当前页已书签(结果.data.bookmarked);
    onBookmarksChanged();
  }

  function 写入页面原始尺寸(页面索引: number, width: number, height: number): void {
    if (width <= 0 || height <= 0) return;

    const 尺寸Key = 获取页面尺寸Key(页面索引);
    设置页面尺寸表((原表) => {
      const 原尺寸 = 原表[尺寸Key];
      if (原尺寸?.width === width && 原尺寸.height === height) return 原表;
      return {
        ...原表,
        [尺寸Key]: { width, height },
      };
    });
  }

  function 记录页面原始尺寸(页面索引: number, 图片元素: HTMLImageElement): void {
    // PDF bitmaps are rendered at higher density than their logical page size.
    if (文档源) return;
    const 已知尺寸 = 页面尺寸表引用.current[获取页面尺寸Key(页面索引)];
    if (
      已知尺寸?.width === 图片元素.naturalWidth
      && 已知尺寸.height === 图片元素.naturalHeight
    ) {
      return;
    }
    写入页面原始尺寸(页面索引, 图片元素.naturalWidth, 图片元素.naturalHeight);
  }

  function 更新阅读器设置(局部设置: Partial<AppSettings>): void {
    if (阅读视图初始化中) return;
    if (
      全景模式引用.current
      && (
        局部设置.readerPageMode !== undefined
        || 局部设置.doublePageFirstSingle !== undefined
        || 局部设置.doublePageDirection !== undefined
        || 局部设置.smartDetectSpreadPage !== undefined
      )
    ) {
      取消全景异步导航(true);
      提交模式2自由位置();
    }
    const 新配对起点 = 局部设置.readerPageMode === "double" ? 安全索引 : 双页配对起点;
    if (局部设置.readerPageMode === "double") 设置双页配对起点(新配对起点);
    const 新设置 = { ...阅读器设置, ...局部设置 };
    设置阅读器设置(新设置);
    if (局部设置.readerPageMode || 局部设置.smartDetectSpreadPage !== undefined) {
      设置当前索引(安全索引);
    }
  }

  function 切换单双页模式(): void {
    if (全景竖向强制单页) return;
    更新阅读器设置({
      readerPageMode: 阅读器设置.readerPageMode === "single" ? "double" : "single",
    });
  }

  function 切换双页阅读方向(): void {
    更新阅读器设置({
      doublePageDirection: 阅读器设置.doublePageDirection === "left-to-right"
        ? "right-to-left"
        : "left-to-right",
    });
  }

  const 自动阅读 = useAutoRead({
    keepPlayingOnInteraction: 手机布局,
    active: isActive && interactive && !阅读视图初始化中,
    modeKey: `${resource?.resourceKey}:${阅读流向}:${全景模式}:${有效页模式}:${从右到左阅读}:${缩放模式}:${页面排序}`,
    pageKey: 当前页组Key,
    ready: 全景模式 ? Boolean(页面图片状态表[显示阅读索引]?.url && !页面图片状态表[显示阅读索引]?.loading) : 目标页组已准备,
    failed: Boolean(文档错误 || 错误信息 || 当前页组索引.some(index => 页面图片状态表[index]?.error)),
    continuous: 全景模式, atEnd: 当前页组包含尾页, settings: 自动阅读设置,
    advance: 下一页,
    displayReady: () => (全景模式 ? [显示阅读索引] : 当前页组索引).every(index => {
      const frame = 阅读区域.current?.querySelector(`[data-reader-page-index="${index}"]`);
      const image = frame?.querySelector<HTMLImageElement>('.reader-effects-original img');
      return Boolean(frame && (!image || image.complete && image.naturalWidth > 0) && !frame.querySelector('[data-processing="pending"]'));
    }),
    scroll: pixels => {
      if (!resource || !模式2) return 'end';
      const next = 限制模式2偏移(全景偏移引用.current - pixels);
      if (Math.abs(next - 全景偏移引用.current) < .01) return 'end';
      const geometry = 模式2页面几何引用.current;
      const center = (geometry.页面中心[安全索引引用.current] ?? 0) - next;
      const half = (垂直阅读 ? 模式2可用高度 : 模式2可用宽度) / 2;
      // Only enter a viewport whose intersecting pages are ready. Preloading
      // still runs through the existing bounded reader queue and cache.
      let ready = true;
      for (let index = Math.max(0, 显示阅读索引 - 1); index < resource.total; index++) {
        if (geometry.页面前缀长度[index] >= center + half) break;
        if (geometry.页面前缀长度[index + 1] <= center - half) continue;
        const state = 页面图片状态引用.current[index];
        if (state?.error) return 'end';
        const image = 阅读区域.current?.querySelector<HTMLImageElement>(`[data-reader-page-index="${index}"] .reader-effects-original img`);
        if (!state?.url || state.loading || image && (!image.complete || !image.naturalWidth)) {
          ready = false;
          if (!state?.loading) void 确保页面图片就绪(index);
        }
      }
      if (!ready) return 'loading';
      暂停全景动画(); 设置全景偏移值(next); 尝试重心化模式2窗口();
      安排模式2运动预热(-自动阅读设置.scrollPixelsPerSecond / 1000, 0, -pixels);
      return 'moved';
    },
  });
  useEffect(() => {
    if (!自动阅读.running && 全景模式 && !阅读视图初始化中) 提交模式2自由位置();
  }, [自动阅读.running]);

  function 渲染书签按钮(附加类名: string) {
    return (
      <div className={`reader-bookmark-slot ${附加类名}`}>
        <button
          type="button"
          className={`reader-bookmark-button ${当前页已书签 ? "is-active" : ""}`}
          disabled={!resource || !当前页面 || 书签处理中}
          aria-pressed={当前页已书签}
          aria-label={当前页已书签 ? tr`取消当前${t(阅读单位)}书签` : tr`添加当前${t(阅读单位)}书签`}
          title={当前页已书签 ? tr`取消当前${t(阅读单位)}书签` : tr`添加当前${t(阅读单位)}书签`}
          onClick={() => void 切换当前页书签()}
        >
          <svg className="reader-bookmark-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6.5 4.5h11v15l-5.5-3.6-5.5 3.6z" />
          </svg>
        </button>
        {书签错误 && <em className="reader-bookmark-error" title={t(书签错误 ?? '')}>{t(书签错误 ?? '')}</em>}
      </div>
    );
  }

  function 音量翻页(direction: 1 | -1) {
    if (!全景模式) { direction === 1 ? 下一页() : 上一页(); return; }
    const fraction=(阅读器设置.readerVolumePanoramaPages ?? 1)*direction;
    const centers=模式2页面几何引用.current.页面中心;
    const position=(centers[安全索引引用.current] ?? 0)-全景偏移引用.current;
    let low=0,high=Math.max(0,总页数-1);
    while(low<high){const mid=Math.ceil((low+high)/2);if((centers[mid]??0)<=position)low=mid;else high=mid-1;}
    const distance=(centers[low+1]??centers[low])-(centers[low]??0);
    const current=low+(distance>0?Math.max(0,(position-(centers[low]??0))/distance):0);
    const next=Math.min(Math.max(0,current+fraction),总页数-1);
    if (Number.isInteger(next)) void 切换模式2页面(next,'slide');
    else { 实时拖动阅读比例(next/Math.max(1,总页数-1)); 提交模式2自由位置(); }
  }
  useReaderVolumeKeys(Boolean(isActive && interactive && 阅读器设置.readerVolumeKeys && !阅读视图初始化中 && !手机阅读设置打开), Boolean(阅读器设置.readerVolumeKeysReversed), () => 音量翻页(-1), () => 音量翻页(1));

  async function 保存音量键设置(patch: Pick<Partial<AppSettings>, 'readerVolumeKeys' | 'readerVolumeKeysReversed' | 'readerVolumePanoramaPages' | 'mobileReaderPreviews' | 'mobilePreviewWidth'>) {
    const result = await window.omicomic.updateSettings(patch);
    if (result.ok) 设置阅读器设置(previous => ({ ...previous, ...patch }));
    else 设置进度保存错误(result.error.message);
  }

  return (
    <section
      className={`reader-layout ${手机布局 ? `is-mobile-reader ${手机工具栏可见 ? "is-mobile-chrome-visible" : ""}` : ""} ${沉浸模式 ? "is-immersive" : 桌面自动隐藏 ? "is-auto-hide" : ""} ${
        !手机布局 && 可隐藏工具栏 && !顶部栏可见 ? "is-top-ui-hidden" : ""
      } ${!手机布局 && 可隐藏工具栏 && !底部栏可见 ? "is-bottom-ui-hidden" : ""} ${
        全景模式 ? "is-panorama" : ""
      } is-flow-${阅读流向}`}
      aria-labelledby="reader-title"
      aria-busy={!文档错误 && 阅读视图初始化中}
    >
      <GammaFilter id={伽马滤镜Id} gamma={画面调整.gamma} />
      {进度保存错误 && <div className="document-save-error" role="alert">{t(进度保存错误 ?? '')}<button aria-label={t("关闭进度提示")} onClick={() => 设置进度保存错误(null)}>×</button></div>}
      {可隐藏工具栏 && !手机布局 && (
        <>
          <div
            className="reader-hot-zone reader-hot-zone-top"
            onMouseEnter={显示顶部栏}
            onMouseMove={显示顶部栏}
            aria-hidden="true"
          />
          <div
            className="reader-hot-zone reader-hot-zone-bottom"
            onMouseEnter={显示底部栏}
            onMouseMove={显示底部栏}
            aria-hidden="true"
          />
        </>
      )}
      <header
        className="reader-toolbar"
        onMouseEnter={显示顶部栏}
        onMouseMove={显示顶部栏}
        onMouseLeave={安排顶部栏隐藏}
      >
        <div className="reader-toolbar-leading">
          {!手机布局 && <button className="reader-back" onClick={返回资源库}>
            <ArrowIcon direction="left" />
            <span>{t("返回")}</span>
          </button>}
          {渲染书签按钮("is-toolbar-bookmark")}
        </div>
        {手机布局 && <><strong className="mobile-reader-title">{resource?.title ?? ""}</strong><button className="mobile-reader-more" aria-label={t("阅读设置")} aria-haspopup="dialog" onClick={() => { 设置手机阅读设置打开(true); }}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button></>}
        <ReaderControlsSurface mobile={手机布局} open={手机阅读设置打开} onClose={() => 设置手机阅读设置打开(false)}>
        <div className="reader-actions" aria-label={t("阅读器控制")}>
          {手机布局 && <p className="mobile-reader-help">{t("轻点画面中央显示或收起工具栏，左右滑动翻页。")}</p>}
          <div className="reader-reading-actions" aria-label={t("阅读模式与方向")}>
            <button
              className={`reader-flow-toggle is-${阅读流向}`}
              onClick={切换阅读流向}
              disabled={阅读视图初始化中}
              title={垂直阅读 ? t("当前纵向阅读，点击切换横向阅读") : t("当前横向阅读，点击切换纵向阅读")}
              aria-label={垂直阅读 ? t("当前纵向阅读，点击切换横向阅读") : t("当前横向阅读，点击切换纵向阅读")}
              aria-pressed={垂直阅读}
            >
              <svg
                className="reader-flow-icon"
                aria-hidden="true"
                viewBox="0 0 20 20"
                focusable="false"
              >
                <path d="M3 5.5c4.6 1.55 9.4 1.55 14 0v9c-4.6-1.55-9.4-1.55-14 0v-9Z" />
              </svg>
              {手机布局 && <span className="mobile-mode-label">{垂直阅读 ? t("纵向") : t("横向")}</span>}
            </button>
            <button
              className="reader-page-count-toggle is-active"
              onClick={切换单双页模式}
              disabled={阅读视图初始化中 || 全景竖向强制单页}
              title={全景竖向强制单页
                ? t("全景纵向阅读固定为单页，退出后恢复原单双页设置")
                : 有效阅读器设置.readerPageMode === "double"
                  ? t("当前双页，点击切换单页")
                  : t("当前单页，点击切换双页")}
              aria-label={全景竖向强制单页
                ? t("全景纵向阅读固定为单页，退出后恢复原单双页设置")
                : 有效阅读器设置.readerPageMode === "double"
                  ? t("当前双页，点击切换单页")
                  : t("当前单页，点击切换双页")}
              aria-pressed={有效阅读器设置.readerPageMode === "double"}
            >
              {手机布局 ? 有效阅读器设置.readerPageMode === "double" ? t("双页") : t("单页") : 页模式按钮文本}
            </button>
            <button
              className={`reader-direction-toggle ${
                阅读器设置.doublePageDirection === "left-to-right" ? "is-ltr" : "is-rtl"
              }`}
              onClick={切换双页阅读方向}
              disabled={阅读视图初始化中}
              title={阅读器设置.doublePageDirection === "left-to-right"
                ? t("当前从左到右阅读，点击切换为从右到左")
                : t("当前从右到左阅读，点击切换为从左到右")}
              aria-label={阅读器设置.doublePageDirection === "left-to-right"
                ? t("当前从左到右阅读，点击切换为从右到左")
                : t("当前从右到左阅读，点击切换为从左到右")}
              aria-pressed={阅读器设置.doublePageDirection === "right-to-left"}
            >
              <svg
                className="reader-direction-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                focusable="false"
              >
                <path
                  className="direction-stroke direction-left"
                  d="M14 7H6m0 0 4-4M6 7l4 4"
                />
                <path
                  className="direction-stroke direction-right"
                  d="M10 17h8m0 0-4-4M18 17l-4 4"
                />
              </svg>
              {手机布局 && <span className="mobile-mode-label">{从右到左阅读 ? t("从右到左") : t("从左到右")}</span>}
            </button>
          </div>
          <div className="reader-zoom-actions" aria-label={t("缩放模式")}>
            <button
              className={`reader-panorama-toggle ${全景模式 ? "is-active" : ""}`}
              onClick={切换全景模式}
              disabled={阅读视图初始化中}
              title={全景模式 ? t("关闭全景连环画") : t("开启全景连环画")}
              aria-label={全景模式 ? t("关闭全景连环画") : t("开启全景连环画")}
              aria-pressed={全景模式}
            >
              <svg
                className="reader-panorama-icon"
                aria-hidden="true"
                viewBox="0 0 24 24"
                focusable="false"
              >
                <rect x="5" y="6" width="14" height="12" rx="1.5" />
                <path d="m8 15 3.2-3 2.4 2.2 1.6-1.6 2.8 2.4" />
                <path d="M8.4 9.2h.1" />
              </svg>
              {手机布局 && <span className="mobile-mode-label">{t("连续")}</span>}
            </button>
            <GlassSelect<阅读器缩放模式>
              className="reader-fit-select"
              value={全景模式 ? 垂直阅读 ? "fit-width" : "fit-height" : 缩放模式}
              options={uiOptions([
                { value: "fit-window", label: "适应窗口" },
                { value: "fit-width", label: "适应宽度" },
                { value: "fit-height", label: "适应高度" },
                { value: "original", label: "原始尺寸" },
              ])}
              ariaLabel={t("缩放方式")}
              title={全景模式 ? tr`全景${t(垂直阅读 ? "纵向自动适应宽度" : "横向自动适应高度")}` : t("普通阅读缩放方式")}
              disabled={阅读视图初始化中 || 全景模式}
              onChange={选择缩放模式}
            />
            <button
              className={沉浸模式 ? "is-active" : ""}
              onClick={() => {
                设置沉浸全屏(!沉浸模式);
              }}
              disabled={阅读视图初始化中}
              aria-pressed={沉浸模式}
            >{t("沉浸")}</button>
          </div>
          <ReaderTools mobile={手机布局} disabled={阅读视图初始化中} epub={resource?.sourceType === 'epub'} adjustments={画面调整} onAdjustments={调整画面} running={自动阅读.running}
            onPlay={() => {
              取消全景异步导航(true);
              if (手机布局) { 设置手机阅读设置打开(false); 设置手机工具栏可见(false); }
              自动阅读.toggle();
            }}
            onPanel={open => { 阅读面板打开.current = open; if (open) { if(!手机布局)自动阅读.pause(); 清理顶部栏隐藏定时器(); 设置顶部栏可见(true); } else 安排顶部栏隐藏(); }} />
          {isAndroid() && <div className="mobile-volume-settings">
            <label className="settings-toggle"><input type="checkbox" checked={Boolean(阅读器设置.readerVolumeKeys)} onChange={event => void 保存音量键设置({ readerVolumeKeys: event.target.checked })}/><span>{t("音量键翻页")}</span></label>
            <label className="settings-toggle"><input type="checkbox" checked={Boolean(阅读器设置.readerVolumeKeysReversed)} disabled={!阅读器设置.readerVolumeKeys} onChange={event => void 保存音量键设置({ readerVolumeKeysReversed: event.target.checked })}/><span>{t("反转音量键翻页方向")}</span></label>
            <label className="mobile-option-row"><span>{t("全景音量键翻页间隔 ")}<b>{阅读器设置.readerVolumePanoramaPages ?? 1}{t(" 页")}</b></span><input aria-label={t("全景音量键翻页间隔")} type="range" min="0.25" max="2" step="0.25" value={阅读器设置.readerVolumePanoramaPages ?? 1} onChange={event => void 保存音量键设置({readerVolumePanoramaPages:Number(event.target.value)})}/></label>
          </div>}
          {手机布局 && <label className="settings-toggle"><input type="checkbox" checked={阅读器设置.mobileReaderPreviews !== false} onChange={event => { void 保存音量键设置({mobileReaderPreviews:event.target.checked}); if(!event.target.checked) 设置手机页面预览打开(false); }}/><span>{t("拖动进度时显示页面预览")}</span></label>}
        </div>
        </ReaderControlsSurface>
      </header>
      <div
        id="reader-title"
        className="reader-filename-strip"
        title={文件名栏文本}
        onMouseEnter={显示顶部栏}
        onMouseMove={显示顶部栏}
        onMouseLeave={安排顶部栏隐藏}
      >
        {文件名栏文本}
      </div>

      <div
        ref={阅读区域}
        className={`reader-stage zoom-stage-${全景模式 ? 垂直阅读 ? "fit-width" : "fit-height" : 缩放模式} is-flow-${阅读流向} ${
          模式2 ? "is-panorama" : ""
        } ${全景拖动中 ? "is-panorama-dragging" : ""} ${
          全景动画启用 ? "is-panorama-animated" : "is-panorama-static"
        }`}
        onPointerDown={(event) => { if(自由缩放.down(event)){手机触点.current=null;return;} 开始手机触控(event); 开始全景拖动(event); }}
        onPointerMove={event => { if(自由缩放.move(event)){手机触点.current=null;取消全景指针(event);return;} 拖动全景(event); }}
        onPointerUp={(event) => { if(自由缩放.up(event)){手机触点.current=null;取消全景指针(event);return;} 结束全景指针(event); 结束手机触控(event); }}
        onPointerCancel={(event) => { 自由缩放.cancel(event); 手机触点.current=null; 取消全景指针(event); }}
        onDoubleClick={event => { if(自由缩放.active){event.preventDefault();自由缩放.reset();} }}
        onLostPointerCapture={event => { 自由缩放.cancel(event); 取消全景指针(event); }}
        onPointerLeave={(事件) => {
          if (事件.buttons === 0) 结束全景指针(事件);
        }}
        onWheel={(事件) => {
          if (事件.ctrlKey || 自由缩放.active) return;
          if (!resource) return;
          if (模式2) {
            滚动全景(事件);
            return;
          }
          if (Math.abs(事件.deltaY) < 8) return;

          if (缩放模式 === "fit-width" || 缩放模式 === "original") {
            const 最大滚动距离 = 事件.currentTarget.scrollHeight - 事件.currentTarget.clientHeight;
            const 可以继续向下滚动 = 事件.deltaY > 0
              && 事件.currentTarget.scrollTop < 最大滚动距离 - 2;
            const 可以继续向上滚动 = 事件.deltaY < 0 && 事件.currentTarget.scrollTop > 2;
            if (可以继续向下滚动 || 可以继续向上滚动) return;
          }

          if (!阅读器设置.wheelPageTurn) return;

          const 当前时间 = Date.now();
          if (当前时间 - 上次滚轮时间.current < 350) return;
          上次滚轮时间.current = 当前时间;
          if (事件.deltaY > 0) 下一页();
          else 上一页();
        }}
      >
        {resource && 跨本提示 === "previous" && 当前页组包含首页 && 上一本资源 && (
          <button
            type="button"
            className={`reader-book-switch reader-book-switch-${从右到左阅读 ? "right" : "left"}`}
            style={{ "--book-switch-opacity": 图书切换按钮基础透明度 } as CSSProperties}
            title={tr`上一本：${上一本资源.title}（↑）`}
            aria-label={tr`上一本：${上一本资源.title}`}
            onClick={() => void 切换相邻资源("previous")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={从右到左阅读 ? "M8 5L18 12L8 19Z" : "M16 5L6 12L16 19Z"} /></svg>
          </button>
        )}
        {resource && 跨本提示 === "next" && 当前页组包含尾页 && 下一本资源 && (
          <button
            type="button"
            className={`reader-book-switch reader-book-switch-${从右到左阅读 ? "left" : "right"}`}
            style={{ "--book-switch-opacity": 图书切换按钮基础透明度 } as CSSProperties}
            title={tr`下一本：${下一本资源.title}（↓）`}
            aria-label={tr`下一本：${下一本资源.title}`}
            onClick={() => void 切换相邻资源("next")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={从右到左阅读 ? "M16 5L6 12L16 19Z" : "M8 5L18 12L8 19Z"} /></svg>
          </button>
        )}
        {文档错误 ? (
          <div className="reader-error" role="alert"><span aria-hidden="true">!</span><h3>{t("文档打开失败")}</h3><p>{t(文档错误 ?? '')}</p></div>
        ) : 文档加载中 ? (
          手机布局 ? null : <div className="reader-placeholder" role="status"><h3>{t("正在打开文档…")}</h3></div>
        ) : !resource ? (
          <div className="reader-placeholder">
            <span aria-hidden="true">{t("阅")}</span>
            <h3>{t("尚未打开图片")}</h3>
            <p>{t("请从资源库双击图片或包含图片的文件夹。")}</p>
          </div>
        ) : (
          <>
            {错误信息 && 显示页组页面.length === 0 ? (
              <div className="reader-error" role="alert">
                <span aria-hidden="true">!</span>
                <h3>{t("无法显示当前页")}</h3>
                <p>{t(错误信息 ?? '')}</p>
              </div>
            ) : (
              <div
                ref={全景页面流}
                className={`reader-page-spread ${
                  模式2
                    ? `is-comic-strip is-${阅读流向}-strip is-panorama-strip`
                    : 当前显示跨页横图 ? "is-spread-single" : 显示页组页面.length === 1 ? "is-single-page" : "is-double-page"
                }`}
                style={{...页面流样式, ...自由缩放.style}}
              >
                {模式2显示页面.map((页面) => {
                  const 状态 = 页面图片状态引用.current[页面.index] ?? {
                    url: "",
                    error: null,
                    loading: !模式2 || 页面.index === 安全索引,
                  };
                  const 模式2位置类名 = !模式2
                    ? ""
                    : [
                        页面.index === 显示阅读索引
                          ? "is-current-page"
                          : 页面.index < 显示阅读索引
                            ? "is-before-current-page"
                            : "is-after-current-page",
                        Math.abs(页面.index - 显示阅读索引) === 1 ? "is-neighbor-page" : "",
                      ].filter(Boolean).join(" ");
                  return (
                    <figure
                      className={`reader-page-frame ${模式2位置类名}`}
                      data-reader-page-index={页面.index}
                      key={页面.index}
                      aria-hidden={手机布局 && !模式2 && !显示页组索引.includes(页面.index) ? true : undefined}
                      style={手机布局 && !模式2 && !显示页组索引.includes(页面.index) ? {position:'absolute',visibility:'hidden',pointerEvents:'none'} : 计算模式2页面框架样式(页面.index)}
                    >
                      <ReaderImageEffects settings={状态.native ? DEFAULT_ADJUSTMENTS : 画面调整} gammaId={伽马滤镜Id} processable={!状态.native && 页面.type !== 'epub-chapter' && Boolean(状态.url)} sourceKey={`${pageIdentity(页面)}:${状态.url ? 'ready' : 'loading'}:${状态.width}:${状态.height}`}>
                      {状态.error ? (
                        <div className="reader-page-error" role="alert">
                          <span>{t("第 ")}{页面.index + 1} {阅读单位}{t("加载失败")}</span>
                          <em>{t(状态.error ?? '')}</em>
                        </div>
                      ) : 状态.canvas ? (
                        <ReaderCanvas canvas={状态.canvas} title={页面.name} style={计算页面图片样式(页面.index)} />
                      ) : 状态.html && 状态.width && 状态.height ? (
                        <ReaderChapter html={状态.html} title={页面.name} width={状态.width} height={状态.height} style={计算页面图片样式(页面.index)} />
                      ) : 状态.native ? (
                        <span className="reader-image reader-native-image" data-native-image={状态.url} role="img" aria-label={页面.name} style={计算页面图片样式(页面.index)} />
                      ) : 状态.url ? (
                        <img
                          ref={element=>{if(element)手机页面元素.current.set(页面.index,element);else 手机页面元素.current.delete(页面.index);}}
                          className={`reader-image zoom-${全景模式 ? 垂直阅读 ? "fit-width" : "fit-height" : 缩放模式}`}
                          src={状态.url}
                          crossOrigin={状态.url.startsWith('omicomic-image:') ? 'anonymous' : undefined}
                          alt={页面.name}
                          style={计算页面图片样式(页面.index)}
                          draggable={false}
                          loading={
                            !模式2 || Math.abs(页面.index - 全景窗口中心索引) <= 2
                              ? "eager"
                              : "lazy"
                          }
                          fetchPriority={页面.index === 安全索引 ? "high" : "low"}
                          decoding="async"
                          onError={() => {
                            设置页面图片状态表((原表) => ({
                              ...原表,
                              [页面.index]: {
                                url: "",
                                error: "当前页可能已损坏或格式无法显示。",
                                loading: false,
                              },
                            }));
                          }}
                          onLoad={async (事件) => {
                            const img=事件.currentTarget,url=状态.url;
                            记录页面原始尺寸(页面.index,img);
                            if(!手机布局)return;
                            try { await img.decode(); } catch { if(!img.complete||!img.naturalWidth)return; }
                            if(!img.isConnected || 页面图片状态引用.current[页面.index]?.url!==url)return;
                            // Keep the old DOM/page until this exact image is decoded.
                            requestAnimationFrame(()=>requestAnimationFrame(()=>{
                              if(!img.isConnected || 页面图片状态引用.current[页面.index]?.url!==url)return;
                              设置手机解码完成(old=>old[页面.index]===url?old:({...Object.fromEntries(Object.entries(old).filter(([key])=>手机页面元素.current.has(Number(key)))),[页面.index]:url}));
                            }));
                          }}
                        />
                      ) : (
                        <div className="reader-page-loading">
                          {!手机布局 && <>{t("第 ")}{页面.index + 1} {阅读单位}{状态.loading ? t("加载中…") : t("等待加载…")}</>}
                        </div>
                      )}
                      </ReaderImageEffects>
                    </figure>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {!手机布局 && 自由缩放.active && <button className="reader-reset-zoom" onClick={自由缩放.reset}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>{t("重置大小")}</button>}
      {手机布局 && 手机页面预览打开 && 手机工具栏可见 && resource && <MobileReaderPreviews pages={resource.pages} current={进度预览索引} width={阅读器设置.mobilePreviewWidth ?? 88}
        nativeImage={原生图片核心 && !/\.gif$/i.test(resource.pages[进度预览索引]?.name ?? '') ? 页面图片状态表[进度预览索引]?.url || null : undefined}
        nativeImages={页面图片状态表} nativePages={原生图片核心&&!模式2?原生窗口索引:undefined} nativeRadius={!模式2 && 内存缓存上限字节 > 0 ? Math.min(2,预加载页数) : 0}
        onPage={index => { 实时拖动阅读比例(index/Math.max(1,总页数-1)); if(模式2) 提交模式2自由位置(); }}/>}
      <footer
        className={`reader-footer ${手机布局 && 从右到左阅读 ? "is-rtl" : ""} ${阅读器设置.readerHideFooterControls ? "is-controls-hidden" : ""} ${
          沉浸模式 && 阅读器设置.readerHideImmersiveProgress ? "is-progress-hidden" : ""
        }`}
        onMouseEnter={显示底部栏}
        onMouseMove={显示底部栏}
        onMouseLeave={() => 安排底部栏隐藏()}
      >
        {手机布局 && <output className="mobile-reader-current">{手机进度文本.split('/')[0]}</output>}
        <ReaderProgressRail mobile={手机布局} percent={显示进度百分比} current={进度预览索引+1} total={总页数}
          label={手机布局 ? 手机进度文本 : 电脑进度文本} rtl={从右到左阅读} dragging={进度拖动比例 !== null}
          onStart={开始进度条拖动} onMove={预览进度条拖动} onEnd={完成进度条拖动} onCancel={取消进度条拖动} onJump={index => void 跳转到页面索引(index)} />
        {手机布局 && <output className="mobile-reader-total">{总页数}</output>}
        {手机布局 && <button className="mobile-reader-play" data-reader-auto-play aria-label={自动阅读.running ? t("暂停自动阅读") : t("开始自动阅读")} aria-pressed={自动阅读.running} onClick={() => { 取消全景异步导航(true); 自动阅读.toggle(); }} disabled={阅读视图初始化中}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{自动阅读.running ? <path d="M7 5h3v14H7zM14 5h3v14h-3z"/> : <path d="m8 5 11 7-11 7Z"/>}</svg>
        </button>}
        {!手机布局 && <>
        {阅读器设置.readerHideFooterControls && (
          <span className="reader-progress-count">{总页数 > 0 ? 显示进度索引 + 1 : 0} / {总页数}</span>
        )}
        <div className="reader-footer-controls previous-controls" aria-hidden={阅读器设置.readerHideFooterControls}>
          {从右到左阅读 ? (
            <>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含尾页} onClick={跳到尾页}>{t("尾页")}</button>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含尾页} onClick={下一页}>{t("下一页")}</button>
            </>
          ) : (
            <>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含首页} onClick={跳到首页}>{t("首页")}</button>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含首页} onClick={上一页}>{t("上一页")}</button>
            </>
          )}
        </div>
        <div className="reader-page-info" aria-hidden={阅读器设置.readerHideFooterControls}>
          <label className="reader-page-jump">
            <input
              inputMode="numeric"
              aria-label={resource?.sourceType === "epub" ? t("跳转到章节") : t("跳转到页码")}
              disabled={阅读视图初始化中 || !resource}
              value={resource ? (页码输入聚焦 ? 页码输入 : String(显示进度索引 + 1)) : "0"}
              onChange={(事件) => 设置页码输入(事件.target.value)}
              onFocus={(事件) => {
                设置页码输入聚焦(true);
                设置页码输入(String(显示进度索引 + 1));
                设置底部栏可见(true);
                清理底部栏隐藏定时器();
                事件.currentTarget.select();
              }}
              onBlur={() => {
                设置页码输入聚焦(false);
                应用页码输入();
                安排底部栏隐藏(true);
              }}
              onKeyDown={(事件) => {
                事件.stopPropagation();
                if (事件.key === "Enter") {
                  应用页码输入();
                  事件.currentTarget.blur();
                } else if (事件.key === "Escape") {
                  if (沉浸模式) {
                    设置沉浸全屏(false);
                    事件.currentTarget.blur();
                    return;
                  }
                  设置页码输入(String(安全索引 + 1));
                  事件.currentTarget.blur();
                }
              }}
            />
            <strong>/ {总页数}</strong>
          </label>
        </div>
        <div className="reader-footer-controls next-controls" aria-hidden={阅读器设置.readerHideFooterControls}>
          {从右到左阅读 ? (
            <>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含首页} onClick={上一页}>{t("上一页")}</button>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含首页} onClick={跳到首页}>{t("首页")}</button>
            </>
          ) : (
            <>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含尾页} onClick={下一页}>{t("下一页")}</button>
              <button disabled={阅读视图初始化中 || !resource || 当前页组包含尾页} onClick={跳到尾页}>{t("尾页")}</button>
            </>
          )}
        </div>
        </>}
      </footer>
    </section>
  );
}

export default ReaderPage;
