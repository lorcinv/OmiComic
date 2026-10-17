import { t, tr } from '../i18n';
import { useEffect, useRef, useState } from "react";
import { isAndroid, singleTapNavigation } from "../platform";
import { requestMobilePagePreview, type MobilePagePreviewRequest } from "../reader/mobilePagePreviews";
import type { 阅读页面项 } from "../types";
type 缩略图状态 = { status: "idle" | "loading" | "loaded" | "error"; url: string | null };

interface 资源详情缩略图Props {
  page: 阅读页面项;
  selected: boolean;
  selectable?: boolean;
  onSelect: () => void;
  onOpen: () => void;
  previewPriority?: number;
  eager?: boolean;
  nativeImage?: string | null;
}

interface 资源详情缩略图加载任务 {
  cancelled: () => boolean;
  run: () => Promise<void>;
}

const 资源详情缩略图加载队列: 资源详情缩略图加载任务[] = [];
const 资源详情缩略图最大并发数 = 4;
let 资源详情缩略图加载中数量 = 0;

function 推进资源详情缩略图加载队列(): void {
  while (资源详情缩略图加载中数量 < 资源详情缩略图最大并发数 && 资源详情缩略图加载队列.length > 0) {
    const 任务 = 资源详情缩略图加载队列.shift();
    if (!任务 || 任务.cancelled()) continue;
    资源详情缩略图加载中数量 += 1;
    void 任务.run()
      .catch(() => undefined)
      .finally(() => {
        资源详情缩略图加载中数量 -= 1;
        推进资源详情缩略图加载队列();
      });
  }
}

function 调度资源详情缩略图加载(run: () => Promise<void>): () => void {
  let 已取消 = false;
  const 任务 = { cancelled: () => 已取消, run };
  资源详情缩略图加载队列.push(任务);
  推进资源详情缩略图加载队列();
  return () => {
    已取消 = true;
    const 索引 = 资源详情缩略图加载队列.indexOf(任务);
    if (索引 >= 0) 资源详情缩略图加载队列.splice(索引, 1);
  };
}

export default function 资源详情缩略图({ page, selected, selectable = true, onSelect, onOpen, previewPriority, eager = false, nativeImage }: 资源详情缩略图Props) {
  const 容器 = useRef<HTMLButtonElement>(null);
  const [状态, 设置状态] = useState<缩略图状态>({ status: "idle", url: null });
  const 手机请求 = useRef<MobilePagePreviewRequest>();
  const 优先级 = useRef(16);
  const 手机模式 = isAndroid();
  优先级.current = previewPriority ?? (selected ? 0 : 16);

  useEffect(() => { 手机请求.current?.setPriority(优先级.current); }, [previewPriority, selected]);

  useEffect(() => {
    if (nativeImage !== undefined) return;
    const 元素 = 容器.current;
    if (!元素) return;
    let 已取消 = false;
    let 已开始 = false;
    let 已完成 = false;
    let 取消排队: (() => void) | null = null;

    function 加载(): void {
      if (已开始) return;
      已开始 = true;
      设置状态({ status: "loading", url: null });
      if (手机模式) {
        const 请求 = requestMobilePagePreview(page, 优先级.current);
        手机请求.current = 请求;
        取消排队 = () => { 请求.cancel(); if (手机请求.current === 请求) 手机请求.current = undefined; };
        void 请求.promise.then(url => {
          if (!已取消 && 手机请求.current === 请求) { 已完成 = true; 设置状态({ status: "loaded", url }); }
        }, () => {
          if (!已取消 && 手机请求.current === 请求) 设置状态({ status: "error", url: null });
        });
        return;
      }
      取消排队 = 调度资源详情缩略图加载(async () => {
        if (已取消) return;
        try {
          const 结果 = await window.omicomic.getPageImage({
            sourcePath: page.sourcePath,
            virtualPath: page.virtualPath,
            archiveInnerPath: page.archiveInnerPath,
            type: page.type,
            preview: true,
          });
          if (已取消) return;
          设置状态(结果.ok && 结果.data.url
            ? { status: "loaded", url: 结果.data.url }
            : { status: "error", url: null });
        } catch {
          if (!已取消) 设置状态({ status: "error", url: null });
        }
      });
    }

    if (eager || typeof IntersectionObserver !== "function") {
      加载();
      return () => {
        已取消 = true;
        取消排队?.();
      };
    }

    const 观察器 = new IntersectionObserver((记录) => {
      if (!记录.some((项目) => 项目.isIntersecting)) {
        if (手机模式 && 已开始 && !已完成) {
          取消排队?.(); 取消排队 = null; 已开始 = false;
        }
        return;
      }
      if (!手机模式) 观察器.disconnect();
      加载();
    }, { rootMargin: "280px" });
    观察器.observe(元素);
    return () => {
      已取消 = true;
      取消排队?.();
      观察器.disconnect();
    };
  }, [page.archiveInnerPath, page.sourcePath, page.type, page.virtualPath, 手机模式 ? page.modifiedAt : undefined, 手机模式 ? page.pageId : undefined, eager, nativeImage !== undefined]);

  return (
    <button
      ref={容器}
      type="button"
      className={`resource-detail-thumbnail ${selectable && selected ? "is-selected" : ""}`}
      aria-pressed={selectable ? selected : undefined}
      aria-label={tr`第 ${page.index + 1} 页：${page.name}`}
      onClick={event => {
        if (selectable) onSelect();
        if (singleTapNavigation() || (!selectable && event.detail === 0)) onOpen();
      }}
      onDoubleClick={() => { if (!singleTapNavigation()) onOpen(); }}
    >
      <span className={`resource-detail-thumbnail-image thumbnail-${nativeImage ? 'native' : 状态.status}`} data-native-preview={nativeImage || undefined}>
        {nativeImage !== undefined ? null : 状态.status === "loaded" && 状态.url ? (
          <img src={状态.url} alt="" draggable={false} decoding="async" />
        ) : 状态.status === "error" ? (
          <span title={tr`预览不可用，${t(singleTapNavigation() ? "点击" : "双击")}仍可尝试阅读`} aria-hidden="true">!</span>
        ) : (
          <span className="resource-detail-thumbnail-skeleton" aria-hidden="true" />
        )}
      </span>
      <span className="resource-detail-thumbnail-caption">
        <strong>{page.index + 1}</strong>
        <span className="resource-detail-thumbnail-name" title={page.name}>{page.name}</span>
      </span>
    </button>
  );
}
