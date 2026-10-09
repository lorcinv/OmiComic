import { useEffect, useRef, useState } from "react";
import type { 阅读页面项 } from "../types";
type 缩略图状态 = { status: "idle" | "loading" | "loaded" | "error"; url: string | null };

interface 资源详情缩略图Props {
  page: 阅读页面项;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
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

export default function 资源详情缩略图({ page, selected, onSelect, onOpen }: 资源详情缩略图Props) {
  const 容器 = useRef<HTMLButtonElement>(null);
  const [状态, 设置状态] = useState<缩略图状态>({ status: "idle", url: null });

  useEffect(() => {
    const 元素 = 容器.current;
    if (!元素) return;
    let 已取消 = false;
    let 已开始 = false;
    let 取消排队: (() => void) | null = null;

    function 加载(): void {
      if (已开始) return;
      已开始 = true;
      设置状态({ status: "loading", url: null });
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

    if (typeof IntersectionObserver !== "function") {
      加载();
      return () => {
        已取消 = true;
        取消排队?.();
      };
    }

    const 观察器 = new IntersectionObserver((记录) => {
      if (!记录.some((项目) => 项目.isIntersecting)) return;
      观察器.disconnect();
      加载();
    }, { rootMargin: "280px" });
    观察器.observe(元素);
    return () => {
      已取消 = true;
      取消排队?.();
      观察器.disconnect();
    };
  }, [page.archiveInnerPath, page.sourcePath, page.type, page.virtualPath]);

  return (
    <button
      ref={容器}
      type="button"
      className={`resource-detail-thumbnail ${selected ? "is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`第 ${page.index + 1} 页：${page.name}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <span className={`resource-detail-thumbnail-image thumbnail-${状态.status}`}>
        {状态.status === "loaded" && 状态.url ? (
          <img src={状态.url} alt="" draggable={false} decoding="async" />
        ) : 状态.status === "error" ? (
          <span title="预览不可用，双击仍可尝试阅读" aria-hidden="true">!</span>
        ) : (
          <span className="resource-detail-thumbnail-skeleton" aria-hidden="true" />
        )}
      </span>
      <span className="resource-detail-thumbnail-caption">
        <strong>{String(page.index + 1).padStart(3, "0")}</strong>
        <span>{page.name}</span>
      </span>
    </button>
  );
}
