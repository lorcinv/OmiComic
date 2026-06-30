import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type {
  AppSettings,
  ReadingProgress,
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
  onSwitchResource: (
    resource: 阅读资源结果,
    initialPageIndex: number,
    context: 阅读打开上下文,
  ) => void;
  onBack: () => void;
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

const 跨页横图比例阈值 = 1.3;
const 页组加载超时毫秒 = 10000;
let 下一个阅读器会话Id = Date.now();

const 默认阅读器设置: Pick<
  AppSettings,
  "readerDefaultFitMode" | "readerPageMode" | "doublePageFirstSingle" | "doublePageDirection"
  | "smartDetectSpreadPage" | "wheelPageTurn" | "immersiveAutoHide" | "immersiveAutoHideDelay"
  | "bookSwitchButtonOpacity"
> = {
  readerDefaultFitMode: "fit-height",
  readerPageMode: "single",
  doublePageFirstSingle: true,
  doublePageDirection: "right-to-left",
  smartDetectSpreadPage: true,
  wheelPageTurn: true,
  immersiveAutoHide: false,
  immersiveAutoHideDelay: 3000,
  bookSwitchButtonOpacity: 40,
};

function 限制索引(索引: number, 总页数: number): number {
  if (总页数 <= 0) return 0;
  return Math.min(Math.max(Math.floor(索引), 0), 总页数 - 1);
}

function 规范化页组主索引(
  索引: number,
  总页数: number,
  设置: Pick<AppSettings, "readerPageMode" | "doublePageFirstSingle">,
): number {
  if (设置.readerPageMode === "single") return 限制索引(索引, 总页数);
  return 限制索引(索引, 总页数);
}

function 计算页组索引(
  主索引: number,
  总页数: number,
  设置: Pick<AppSettings, "readerPageMode" | "doublePageFirstSingle" | "smartDetectSpreadPage">,
  是跨页横图: (索引: number) => boolean = () => false,
): number[] {
  if (总页数 <= 0) return [];
  const 起点 = 规范化页组主索引(主索引, 总页数, 设置);
  if (设置.readerPageMode === "single") return [起点];
  if (设置.smartDetectSpreadPage && 是跨页横图(起点)) return [起点];
  if (设置.smartDetectSpreadPage && 起点 + 1 < 总页数 && 是跨页横图(起点 + 1)) return [起点];
  return [起点, 起点 + 1].filter((索引) => 索引 < 总页数);
}

function 计算下一页组主索引(
  主索引: number,
  总页数: number,
  设置: Pick<AppSettings, "readerPageMode" | "doublePageFirstSingle" | "smartDetectSpreadPage">,
  是跨页横图: (索引: number) => boolean,
): number {
  if (设置.readerPageMode === "single") return 规范化页组主索引(主索引 + 1, 总页数, 设置);
  const 当前页组长度 = Math.max(1, 计算页组索引(主索引, 总页数, 设置, 是跨页横图).length);
  return 规范化页组主索引(主索引 + 当前页组长度, 总页数, 设置);
}

function 计算上一页组主索引(
  主索引: number,
  总页数: number,
  设置: Pick<AppSettings, "readerPageMode" | "doublePageFirstSingle" | "smartDetectSpreadPage">,
  是跨页横图: (索引: number) => boolean,
): number {
  if (设置.readerPageMode === "single") return 规范化页组主索引(主索引 - 1, 总页数, 设置);
  const 安全索引 = 规范化页组主索引(主索引, 总页数, 设置);
  if (安全索引 <= 0) return 0;

  let 游标 = 0;
  let 上一组起点 = 0;
  while (游标 < 安全索引) {
    上一组起点 = 游标;
    const 页组长度 = Math.max(1, 计算页组索引(游标, 总页数, 设置, 是跨页横图).length);
    游标 += 页组长度;
  }

  return 规范化页组主索引(上一组起点, 总页数, 设置);
}

function ReaderPage({
  resource,
  initialPageIndex,
  openContext,
  isActive,
  onSwitchResource,
  onBack,
  onProgressSaved,
  onBookmarksChanged,
}: ReaderPageProps) {
  const [当前索引, 设置当前索引] = useState(0);
  const [页面图片状态表, 设置页面图片状态表] = useState<Record<number, 页面图片状态>>({});
  const [可显示页组, 设置可显示页组] = useState<可显示页组 | null>(null);
  const [页组加载状态, 设置页组加载状态] = useState<页组加载状态>({
    status: "idle",
    requestId: 0,
    pageGroupKey: "",
  });
  const [页面尺寸表, 设置页面尺寸表] = useState<Record<string, 页面原始尺寸>>({});
  const [错误信息, 设置错误信息] = useState<string | null>(null);
  const [书签错误, 设置书签错误] = useState<string | null>(null);
  const [当前页已书签, 设置当前页已书签] = useState(false);
  const [书签处理中, 设置书签处理中] = useState(false);
  const [缩放模式, 设置缩放模式] = useState<阅读器缩放模式>("fit-height");
  const [可用区域, 设置可用区域] = useState<可用区域尺寸>({ width: 0, height: 0 });
  const [页码输入, 设置页码输入] = useState("1");
  const [阅读器设置, 设置阅读器设置] = useState(默认阅读器设置);
  const [沉浸模式, 设置沉浸模式] = useState(false);
  const [顶部栏可见, 设置顶部栏可见] = useState(true);
  const [底部栏可见, 设置底部栏可见] = useState(true);
  const [页码输入聚焦, 设置页码输入聚焦] = useState(false);
  const 加载序号 = useRef(0);
  const 上次滚轮时间 = useRef(0);
  const 阅读区域 = useRef<HTMLDivElement>(null);
  const 保存进度定时器 = useRef<number | null>(null);
  const 待保存进度 = useRef<ReadingProgress | null>(null);
  const 顶部栏隐藏定时器 = useRef<number | null>(null);
  const 底部栏隐藏定时器 = useRef<number | null>(null);
  const 阅读器会话Id = useRef(下一个阅读器会话Id++);

  const 总页数 = resource?.total ?? 0;
  const 获取页面尺寸Key = (索引: number): string => `${resource?.resourceKey ?? "none"}:${索引}`;
  const 是跨页横图 = (索引: number): boolean => {
    if (!阅读器设置.smartDetectSpreadPage || 阅读器设置.readerPageMode !== "double") return false;
    const 尺寸 = 页面尺寸表[获取页面尺寸Key(索引)];
    if (!尺寸 || 尺寸.width <= 0 || 尺寸.height <= 0) return false;
    return 尺寸.width / 尺寸.height >= 跨页横图比例阈值;
  };
  const 安全索引 = 规范化页组主索引(当前索引, 总页数, 阅读器设置);
  const 当前页组索引 = 计算页组索引(安全索引, 总页数, 阅读器设置, 是跨页横图);
  const 视觉页组索引 = 阅读器设置.readerPageMode === "double"
    && 阅读器设置.doublePageDirection === "right-to-left"
    && 当前页组索引.length === 2
    ? [...当前页组索引].reverse()
    : 当前页组索引;
  const 当前页面 = resource?.pages[安全索引] ?? null;
  const 当前页组页面 = 视觉页组索引
    .map((索引) => resource?.pages[索引] ?? null)
    .filter((页面): 页面 is 阅读页面项 => 页面 !== null);
  const 当前页组Key = 当前页组索引.join("|");
  const 目标页组已准备 = 当前页组页面.length > 0 && 当前页组页面.every((页面) => {
    const 状态 = 页面图片状态表[页面.index];
    return Boolean(状态 && !状态.loading && (状态.url || 状态.error));
  });
  const 显示页组 = 目标页组已准备
    ? { indices: 当前页组索引, visualIndices: 视觉页组索引, pages: 当前页组页面 }
    : 可显示页组;
  const 显示页组页面 = 显示页组?.pages ?? 当前页组页面;
  const 显示页组索引 = 显示页组?.indices ?? 当前页组索引;
  const 当前目标页组正在后台加载 = 页组加载状态.status === "loading"
    && 页组加载状态.pageGroupKey === 当前页组Key
    && 当前页组页面.length > 0
    && !目标页组已准备;
  const 当前显示跨页横图 = 阅读器设置.readerPageMode === "double"
    && 显示页组索引.length === 1
    && 是跨页横图(显示页组索引[0] ?? -1);
  const 当前页组包含首页 = 当前页组索引.includes(0);
  const 当前页组包含尾页 = 总页数 > 0 && 当前页组索引.includes(总页数 - 1);
  const 页模式按钮文本 = 阅读器设置.readerPageMode === "double" ? "2" : "1";
  const 从右到左阅读 = 阅读器设置.doublePageDirection === "right-to-left";
  const 文件名栏文本 = resource
    ? `${resource.title}${当前页面?.name ? ` / ${当前页面.name}` : ""}`
    : "阅读器";
  const 上下文当前位置 = resource && openContext
    ? openContext.items.findIndex((项目) => 项目.key === resource.resourceKey)
    : -1;
  const 上一本资源 = openContext && 上下文当前位置 > 0
    ? openContext.items[上下文当前位置 - 1]
    : null;
  const 下一本资源 = openContext && 上下文当前位置 >= 0 && 上下文当前位置 < openContext.items.length - 1
    ? openContext.items[上下文当前位置 + 1]
    : null;
  const 图书切换按钮基础透明度 = 阅读器设置.bookSwitchButtonOpacity / 100;

  const 页组间距 = 0;
  const 当前显示跨页尺寸 = 当前显示跨页横图
    ? 页面尺寸表[获取页面尺寸Key(显示页组索引[0] ?? -1)]
    : null;
  const 单页可用宽度 = 阅读器设置.readerPageMode === "double" && 显示页组页面.length === 2
    ? Math.max(0, (可用区域.width - 页组间距) / 2)
    : 可用区域.width;
  const 图片样式: CSSProperties = 缩放模式 === "fit-height"
    ? {
        width: "auto",
        height: "auto",
        maxWidth: 单页可用宽度 > 0 ? `${单页可用宽度}px` : "100%",
        maxHeight: 可用区域.height > 0 ? `${可用区域.height}px` : "100%",
      }
    : 缩放模式 === "fit-width"
      ? {
          width: 单页可用宽度 > 0 ? `${单页可用宽度}px` : "100%",
          height: "auto",
          maxWidth: "none",
          maxHeight: "none",
        }
      : {
          width: "auto",
          height: "auto",
          maxWidth: "none",
          maxHeight: "none",
      };
  const 跨页图片样式: CSSProperties | null = 当前显示跨页横图 && 当前显示跨页尺寸
    ? 缩放模式 === "fit-height"
      ? (() => {
          const 缩放比例 = Math.min(
            可用区域.width > 0 ? 可用区域.width / 当前显示跨页尺寸.width : 1,
            可用区域.height > 0 ? 可用区域.height / 当前显示跨页尺寸.height : 1,
          );
          return {
            width: `${Math.max(1, Math.floor(当前显示跨页尺寸.width * 缩放比例))}px`,
            height: `${Math.max(1, Math.floor(当前显示跨页尺寸.height * 缩放比例))}px`,
            maxWidth: "none",
            maxHeight: "none",
          };
        })()
      : 缩放模式 === "fit-width"
        ? {
            width: 单页可用宽度 > 0 ? `${单页可用宽度}px` : "100%",
            height: "auto",
            maxWidth: "none",
            maxHeight: "none",
          }
        : null
    : null;
  const 当前图片样式 = 跨页图片样式 ?? 图片样式;

  function 创建当前阅读进度(): ReadingProgress | null {
    if (!resource || !当前页面 || resource.total <= 0) return null;
    const percent = Math.round(((安全索引 + 1) / Math.max(1, resource.total)) * 100);
    const 当前时间 = Date.now();
    const completed = 安全索引 >= resource.total - 1;
    return {
      resourceKey: resource.resourceKey,
      sourcePath: resource.sourcePath,
      sourceType: resource.sourceType,
      title: resource.title,
      currentPageIndex: 安全索引,
      totalPages: resource.total,
      currentPageName: 当前页面.name,
      percent,
      completed,
      hasStartedReading: 安全索引 > 0 || completed,
      firstReadAt: 当前时间,
      updatedAt: 当前时间,
    };
  }

  async function 写入阅读进度(进度: ReadingProgress): Promise<void> {
    const 结果 = await window.omicomic.saveReadingProgress(进度);
    if (结果.ok) {
      onProgressSaved(结果.data);
    }
  }

  function 立即保存待保存进度(): void {
    if (保存进度定时器.current !== null) {
      window.clearTimeout(保存进度定时器.current);
      保存进度定时器.current = null;
    }
    const 进度 = 待保存进度.current;
    if (进度) {
      void 写入阅读进度(进度);
    }
  }

  function 返回资源库(): void {
    立即保存待保存进度();
    if (沉浸模式) void window.omicomic.setFullscreen(false);
    onBack();
  }

  function 设置沉浸全屏(启用: boolean): void {
    设置沉浸模式(启用);
    设置顶部栏可见(!启用);
    设置底部栏可见(!启用);
    void window.omicomic.setFullscreen(启用).then((结果) => {
      if (!结果.ok) 设置错误信息(结果.error.message);
    }).catch(() => 设置错误信息("系统全屏切换失败。"));
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

  function 获取沉浸隐藏延迟(): number {
    return 阅读器设置.immersiveAutoHideDelay ?? 3000;
  }

  function 安排顶部栏隐藏(): void {
    清理顶部栏隐藏定时器();
    if (!沉浸模式) return;
    顶部栏隐藏定时器.current = window.setTimeout(() => {
      设置顶部栏可见(false);
      顶部栏隐藏定时器.current = null;
    }, 获取沉浸隐藏延迟());
  }

  function 安排底部栏隐藏(忽略输入聚焦 = false): void {
    清理底部栏隐藏定时器();
    if (!沉浸模式 || (!忽略输入聚焦 && 页码输入聚焦)) return;
    底部栏隐藏定时器.current = window.setTimeout(() => {
      设置底部栏可见(false);
      底部栏隐藏定时器.current = null;
    }, 获取沉浸隐藏延迟());
  }

  function 显示顶部栏(): void {
    if (!沉浸模式) return;
    设置顶部栏可见(true);
    安排顶部栏隐藏();
  }

  function 显示底部栏(): void {
    if (!沉浸模式) return;
    设置底部栏可见(true);
    安排底部栏隐藏();
  }

  useEffect(() => {
    void window.omicomic.setReaderSession(阅读器会话Id.current);
    加载序号.current += 1;
    const 最大索引 = Math.max(0, (resource?.total ?? 1) - 1);
    const 起始索引 = 规范化页组主索引(Math.min(Math.max(initialPageIndex, 0), 最大索引), resource?.total ?? 0, 阅读器设置);
    设置当前索引(起始索引);
    设置页码输入(String(起始索引 + 1));
    设置页面图片状态表({});
    设置可显示页组(null);
    设置页组加载状态({ status: "idle", requestId: 加载序号.current, pageGroupKey: "" });
    设置页面尺寸表({});
    设置错误信息(null);
    设置书签错误(null);
    设置当前页已书签(false);
    设置缩放模式(阅读器设置.readerDefaultFitMode);
    设置沉浸全屏(false);
    设置顶部栏可见(true);
    设置底部栏可见(true);
  }, [initialPageIndex, resource]);

  useEffect(() => {
    if (!isActive) return;
    let 已取消 = false;

    void window.omicomic.getAppData()
      .then((结果) => {
        if (已取消 || !结果.ok) return;
        设置阅读器设置({
          readerDefaultFitMode: 结果.data.settings.readerDefaultFitMode,
          readerPageMode: 结果.data.settings.readerPageMode,
          doublePageFirstSingle: 结果.data.settings.doublePageFirstSingle,
          doublePageDirection: 结果.data.settings.doublePageDirection,
          smartDetectSpreadPage: 结果.data.settings.smartDetectSpreadPage,
          wheelPageTurn: 结果.data.settings.wheelPageTurn,
          immersiveAutoHide: 结果.data.settings.immersiveAutoHide,
          immersiveAutoHideDelay: 结果.data.settings.immersiveAutoHideDelay,
          bookSwitchButtonOpacity: 结果.data.settings.bookSwitchButtonOpacity,
        });
        设置缩放模式(结果.data.settings.readerDefaultFitMode);
        设置当前索引((索引) => 规范化页组主索引(索引, 总页数, 结果.data.settings));
      })
      .catch(() => undefined);

    return () => {
      已取消 = true;
    };
  }, [isActive, resource]);

  useEffect(() => {
    const 进度 = 创建当前阅读进度();
    if (!进度) return;
    待保存进度.current = 进度;

    if (保存进度定时器.current !== null) {
      window.clearTimeout(保存进度定时器.current);
    }
    保存进度定时器.current = window.setTimeout(() => {
      保存进度定时器.current = null;
      const 待写入 = 待保存进度.current;
      if (待写入) void 写入阅读进度(待写入);
    }, 600);
  }, [resource, 安全索引, 当前页面]);

  useEffect(() => () => {
    立即保存待保存进度();
    清理顶部栏隐藏定时器();
    清理底部栏隐藏定时器();
    void window.omicomic.setFullscreen(false);
  }, []);

  useEffect(() => {
    if (!沉浸模式) {
      设置顶部栏可见(true);
      设置底部栏可见(true);
      清理顶部栏隐藏定时器();
      清理底部栏隐藏定时器();
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
  ]);

  useEffect(() => {
    设置页码输入(String(安全索引 + 1));
  }, [安全索引]);

  useEffect(() => {
    设置当前索引((索引) => 规范化页组主索引(索引, 总页数, 阅读器设置));
  }, [
    总页数,
    阅读器设置.readerPageMode,
    阅读器设置.doublePageFirstSingle,
    阅读器设置.smartDetectSpreadPage,
  ]);

  useEffect(() => {
    if (!resource || resource.total <= 0) {
      设置当前页已书签(false);
      return;
    }

    let 已取消 = false;
    void window.omicomic.isPageBookmarked(resource.resourceKey, 安全索引)
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
  }, [resource, 安全索引]);

  useEffect(() => {
    阅读区域.current?.scrollTo({ top: 0, left: 0 });
  }, [安全索引, 缩放模式, 阅读器设置.readerPageMode]);

  useEffect(() => {
    if (!isActive || !阅读区域.current) return;

    const 区域元素 = 阅读区域.current;
    function 更新可用区域(): void {
      const 样式 = window.getComputedStyle(区域元素);
      const 水平内边距 = Number.parseFloat(样式.paddingLeft) + Number.parseFloat(样式.paddingRight);
      const 垂直内边距 = Number.parseFloat(样式.paddingTop) + Number.parseFloat(样式.paddingBottom);
      const width = Math.max(0, 区域元素.clientWidth - 水平内边距);
      const height = Math.max(0, 区域元素.clientHeight - 垂直内边距);

      设置可用区域((原尺寸) =>
        原尺寸.width === width && 原尺寸.height === height ? 原尺寸 : { width, height },
      );
    }

    const 尺寸观察器 = new ResizeObserver(更新可用区域);
    尺寸观察器.observe(区域元素);
    const 动画帧 = window.requestAnimationFrame(更新可用区域);

    return () => {
      window.cancelAnimationFrame(动画帧);
      尺寸观察器.disconnect();
    };
  }, [isActive]);

  useEffect(() => {
    if (!resource || 当前页组页面.length === 0) {
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
      const 状态 = 页面图片状态表[页面.index];
      return !状态 || (!状态.url && !状态.error);
    });
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

    Promise.all(需要加载页面.map(async (页面) => {
      try {
        const 结果 = await window.omicomic.getPageImage({
          sourcePath: 页面.sourcePath,
          virtualPath: 页面.virtualPath,
          archiveInnerPath: 页面.archiveInnerPath,
          readerSessionId: 阅读器会话Id.current,
          type: 页面.type,
        });
        return {
          pageIndex: 页面.index,
          state: 结果.ok
            ? { url: 结果.data.url, error: null, loading: false }
            : { url: "", error: 结果.error.message, loading: false },
        } satisfies { pageIndex: number; state: 页面图片状态 };
      } catch {
        return {
          pageIndex: 页面.index,
          state: {
            url: "",
            error: "当前页加载失败，请尝试重新打开该资源。",
            loading: false,
          },
        } satisfies { pageIndex: number; state: 页面图片状态 };
      }
    })).then((加载结果) => {
      if (已结束 || 本次序号 !== 加载序号.current) return;
      已结束 = true;
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
        message: 加载结果.every((结果) => 结果.state.error)
          ? "当前页组加载失败，请重试或翻页后返回。"
          : undefined,
      });
    });

    return () => {
      已结束 = true;
      window.clearTimeout(超时定时器);
    };
  }, [resource, 当前页组Key]);

  useEffect(() => {
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
    if (!isActive) return;

    function 处理快捷键(事件: KeyboardEvent): void {
      const 目标元素 = 事件.target as HTMLElement | null;
      if (
        目标元素
        && (目标元素.tagName === "INPUT" || 目标元素.tagName === "TEXTAREA")
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
      } else if (事件.key === "ArrowLeft") {
        事件.preventDefault();
        if (从右到左阅读) 下一页();
        else 上一页();
      } else if (事件.key === "ArrowRight") {
        事件.preventDefault();
        if (从右到左阅读) 上一页();
        else 下一页();
      } else if (事件.key === "Backspace") {
        事件.preventDefault();
        上一页();
      } else if (事件.key === " ") {
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
  }, [isActive, onBack, resource, 安全索引, 当前页面, 沉浸模式, 从右到左阅读]);

  function 上一页(): void {
    设置当前索引((索引) => {
      return 计算上一页组主索引(索引, 总页数, 阅读器设置, 是跨页横图);
    });
  }

  function 下一页(): void {
    设置当前索引((索引) => {
      return 计算下一页组主索引(索引, 总页数, 阅读器设置, 是跨页横图);
    });
  }

  function 跳到首页(): void {
    设置当前索引(0);
  }

  function 跳到尾页(): void {
    设置当前索引(规范化页组主索引(Math.max(0, 总页数 - 1), 总页数, 阅读器设置));
  }

  async function 切换相邻资源(方向: "previous" | "next"): Promise<void> {
    const 目标资源 = directionToTarget(方向);
    if (!目标资源 || !openContext) return;

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
      currentKey: 结果.data.resourceKey,
    };
    const 进度结果 = await window.omicomic.getReadingProgress(结果.data.resourceKey);
    const 进度 = 进度结果.ok ? 进度结果.data : null;
    const 起始页 = Math.min(
      Math.max(进度?.currentPageIndex ?? 0, 0),
      Math.max(0, 结果.data.total - 1),
    );
    onSwitchResource(结果.data, 起始页, 新上下文);
  }

  function directionToTarget(方向: "previous" | "next") {
    return 方向 === "previous" ? 上一本资源 : 下一本资源;
  }

  function 应用页码输入(): void {
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
    const 目标索引 = 规范化页组主索引(修正页码 - 1, resource.total, 阅读器设置);
    设置当前索引(目标索引);
    设置页码输入(String(目标索引 + 1));
  }

  async function 切换当前页书签(): Promise<void> {
    if (!resource || !当前页面 || resource.total <= 0) return;
    设置书签处理中(true);
    设置书签错误(null);

    const 结果 = await window.omicomic.toggleBookmark({
      resourceKey: resource.resourceKey,
      sourcePath: resource.sourcePath,
      sourceType: resource.sourceType,
      title: resource.title,
      pageIndex: 安全索引,
      totalPages: resource.total,
      pageName: 当前页面.name,
      archiveInnerPath: 当前页面.archiveInnerPath,
    });

    设置书签处理中(false);
    if (!结果.ok) {
      设置书签错误(结果.error.message);
      return;
    }

    设置当前页已书签(结果.data.bookmarked);
    onBookmarksChanged();
  }

  function 记录页面原始尺寸(页面索引: number, 图片元素: HTMLImageElement): void {
    const width = 图片元素.naturalWidth;
    const height = 图片元素.naturalHeight;
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

  function 更新阅读器设置(局部设置: Partial<AppSettings>): void {
    const 新设置 = { ...阅读器设置, ...局部设置 };
    设置阅读器设置(新设置);
    if (
      局部设置.readerPageMode
      || 局部设置.doublePageFirstSingle !== undefined
      || 局部设置.smartDetectSpreadPage !== undefined
    ) {
      设置当前索引((索引) => 规范化页组主索引(索引, 总页数, 新设置));
    }
    void window.omicomic.updateSettings(局部设置)
      .then((结果) => {
        if (结果.ok) {
          设置阅读器设置({
            readerDefaultFitMode: 结果.data.readerDefaultFitMode,
            readerPageMode: 结果.data.readerPageMode,
            doublePageFirstSingle: 结果.data.doublePageFirstSingle,
            doublePageDirection: 结果.data.doublePageDirection,
            smartDetectSpreadPage: 结果.data.smartDetectSpreadPage,
            wheelPageTurn: 结果.data.wheelPageTurn,
            immersiveAutoHide: 结果.data.immersiveAutoHide,
            immersiveAutoHideDelay: 结果.data.immersiveAutoHideDelay,
            bookSwitchButtonOpacity: 结果.data.bookSwitchButtonOpacity,
          });
        } else {
          设置错误信息(结果.error.message);
        }
      })
      .catch(() => 设置错误信息("阅读器设置保存失败，请稍后重试。"));
  }

  function 切换单双页模式(): void {
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

  return (
    <section
      className={`reader-layout ${沉浸模式 ? "is-immersive" : ""} ${
        沉浸模式 && !顶部栏可见 ? "is-top-ui-hidden" : ""
      } ${沉浸模式 && !底部栏可见 ? "is-bottom-ui-hidden" : ""}`}
      aria-labelledby="reader-title"
    >
      {沉浸模式 && (
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
      <header
        className="reader-toolbar"
        onMouseEnter={显示顶部栏}
        onMouseMove={显示顶部栏}
        onMouseLeave={安排顶部栏隐藏}
      >
        <button className="reader-back" onClick={返回资源库}>← 返回资源库</button>
        <div className="reader-actions" aria-label="阅读器控制">
          <div className="reader-reading-actions" aria-label="阅读模式与方向">
            <button
              className="reader-page-count-toggle is-active"
              onClick={切换单双页模式}
              title={阅读器设置.readerPageMode === "double" ? "当前双页，点击切换单页" : "当前单页，点击切换双页"}
              aria-label={阅读器设置.readerPageMode === "double" ? "当前双页，点击切换单页" : "当前单页，点击切换双页"}
              aria-pressed={阅读器设置.readerPageMode === "double"}
            >
              {页模式按钮文本}
            </button>
            <button
              className={`reader-direction-toggle ${
                阅读器设置.doublePageDirection === "left-to-right" ? "is-ltr" : "is-rtl"
              }`}
              onClick={切换双页阅读方向}
              title={阅读器设置.doublePageDirection === "left-to-right"
                ? "当前从左到右阅读，点击切换为从右到左"
                : "当前从右到左阅读，点击切换为从左到右"}
              aria-label={阅读器设置.doublePageDirection === "left-to-right"
                ? "当前从左到右阅读，点击切换为从右到左"
                : "当前从右到左阅读，点击切换为从左到右"}
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
                  d="M15 7H5.5m0 0 3.2-3.2M5.5 7l3.2 3.2"
                />
                <path
                  className="direction-stroke direction-right"
                  d="M9 17h9.5m0 0-3.2-3.2M18.5 17l-3.2 3.2"
                />
              </svg>
            </button>
          </div>
          <div className="reader-zoom-actions" aria-label="缩放模式">
            <button
              className={缩放模式 === "fit-width" ? "is-active" : ""}
              onClick={() => 设置缩放模式("fit-width")}
              aria-pressed={缩放模式 === "fit-width"}
            >
              适应宽度
            </button>
            <button
              className={缩放模式 === "fit-height" ? "is-active" : ""}
              onClick={() => 设置缩放模式("fit-height")}
              aria-pressed={缩放模式 === "fit-height"}
            >
              适应高度
            </button>
            <button
              className={缩放模式 === "original" ? "is-active" : ""}
              onClick={() => 设置缩放模式("original")}
              aria-pressed={缩放模式 === "original"}
            >
              原始尺寸
            </button>
            <button
              className={沉浸模式 ? "is-active" : ""}
              onClick={() => {
                设置沉浸全屏(!沉浸模式);
              }}
              aria-pressed={沉浸模式}
            >
              沉浸
            </button>
          </div>
        </div>
      </header>

      <div
        ref={阅读区域}
        className={`reader-stage zoom-stage-${缩放模式}`}
        onWheel={(事件) => {
          if (!resource || Math.abs(事件.deltaY) < 8) return;

          if (缩放模式 !== "fit-height") {
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
        {resource && 当前页组包含首页 && 上一本资源 && (
          <button
            type="button"
            className="reader-book-switch reader-book-switch-previous"
            style={{ "--book-switch-opacity": 图书切换按钮基础透明度 } as CSSProperties}
            title={`上一本：${上一本资源.title}`}
            aria-label={`上一本：${上一本资源.title}`}
            onClick={() => void 切换相邻资源("previous")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </button>
        )}
        {resource && 当前页组包含尾页 && 下一本资源 && (
          <button
            type="button"
            className="reader-book-switch reader-book-switch-next"
            style={{ "--book-switch-opacity": 图书切换按钮基础透明度 } as CSSProperties}
            title={`下一本：${下一本资源.title}`}
            aria-label={`下一本：${下一本资源.title}`}
            onClick={() => void 切换相邻资源("next")}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path d="M9.5 5.5 16 12l-6.5 6.5" />
            </svg>
          </button>
        )}
        <div className="reader-bookmark-slot">
          <button
            type="button"
            className={`reader-bookmark-button ${当前页已书签 ? "is-active" : ""}`}
            disabled={!resource || !当前页面 || 书签处理中}
            aria-pressed={当前页已书签}
            title={当前页已书签 ? "取消当前页书签" : "添加当前页书签"}
            onClick={() => void 切换当前页书签()}
          >
            {当前页已书签 ? "★" : "☆"}
          </button>
          {书签错误 && <em className="reader-bookmark-error" title={书签错误}>{书签错误}</em>}
        </div>
        {!resource ? (
          <div className="reader-placeholder">
            <span aria-hidden="true">阅</span>
            <h3>尚未打开图片</h3>
            <p>请从资源库双击图片或包含图片的文件夹。</p>
          </div>
        ) : (
          <>
            {当前目标页组正在后台加载 && 显示页组页面.length > 0 && (
              <div className="reader-loading">正在加载当前页组…</div>
            )}
            {错误信息 && 显示页组页面.length === 0 ? (
              <div className="reader-error" role="alert">
                <span aria-hidden="true">!</span>
                <h3>无法显示当前页</h3>
                <p>{错误信息}</p>
              </div>
            ) : (
              <div
                className={`reader-page-spread ${
                  当前显示跨页横图 ? "is-spread-single" : 显示页组页面.length === 1 ? "is-single-page" : "is-double-page"
                }`}
                style={{ gap: `${页组间距}px` }}
              >
                {显示页组页面.map((页面) => {
                  const 状态 = 页面图片状态表[页面.index] ?? { url: "", error: null, loading: true };
                  return (
                    <figure className="reader-page-frame" key={页面.index}>
                      {状态.error ? (
                        <div className="reader-page-error" role="alert">
                          <span>第 {页面.index + 1} 页加载失败</span>
                          <em>{状态.error}</em>
                        </div>
                      ) : 状态.url ? (
                        <img
                          className={`reader-image zoom-${缩放模式}`}
                          src={状态.url}
                          alt={页面.name}
                          style={当前图片样式}
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
                          onLoad={(事件) => 记录页面原始尺寸(页面.index, 事件.currentTarget)}
                        />
                      ) : 状态.loading ? (
                        <div className="reader-page-loading">第 {页面.index + 1} 页加载中…</div>
                      ) : null}
                    </figure>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <footer
        className="reader-footer"
        onMouseEnter={显示底部栏}
        onMouseMove={显示底部栏}
        onMouseLeave={() => 安排底部栏隐藏()}
      >
        <div className="reader-footer-controls previous-controls">
          {从右到左阅读 ? (
            <>
              <button disabled={!resource || 当前页组包含尾页} onClick={跳到尾页}>尾页</button>
              <button disabled={!resource || 当前页组包含尾页} onClick={下一页}>下一页</button>
            </>
          ) : (
            <>
              <button disabled={!resource || 当前页组包含首页} onClick={跳到首页}>首页</button>
              <button disabled={!resource || 当前页组包含首页} onClick={上一页}>上一页</button>
            </>
          )}
        </div>
        <div className="reader-page-info">
          <label className="reader-page-jump">
            <input
              inputMode="numeric"
              aria-label="跳转到页码"
              disabled={!resource}
              value={resource ? 页码输入 : "0"}
              onChange={(事件) => 设置页码输入(事件.target.value)}
              onFocus={(事件) => {
                设置页码输入聚焦(true);
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
        <div className="reader-footer-controls next-controls">
          {从右到左阅读 ? (
            <>
              <button disabled={!resource || 当前页组包含首页} onClick={上一页}>上一页</button>
              <button disabled={!resource || 当前页组包含首页} onClick={跳到首页}>首页</button>
            </>
          ) : (
            <>
              <button disabled={!resource || 当前页组包含尾页} onClick={下一页}>下一页</button>
              <button disabled={!resource || 当前页组包含尾页} onClick={跳到尾页}>尾页</button>
            </>
          )}
        </div>
      </footer>
    </section>
  );
}

export default ReaderPage;
