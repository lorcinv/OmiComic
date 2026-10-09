import { lazy, Suspense, useState } from "react";
import { flushSync } from "react-dom";
import GlobalTooltip from "./GlobalTooltip";
import type { OmiBrandOriginGetter } from "./OmiBrandIcon";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";
import HomePage from "./pages/HomePage";
import WindowControls from "./WindowControls";
import type { ReadingProgress, 阅读打开上下文, 阅读资源结果, 页面名称 } from "./types";

const DocumentReader = lazy(() => import("./components/DocumentReader"));

function App() {
  const [当前页面, 设置当前页面] = useState<页面名称>("首页");
  const [阅读资源, 设置阅读资源] = useState<阅读资源结果 | null>(null);
  const [阅读起始页, 设置阅读起始页] = useState(0);
  const [阅读上下文, 设置阅读上下文] = useState<阅读打开上下文 | null>(null);
  const [阅读打开序号, 设置阅读打开序号] = useState(0);
  const [进度刷新令牌, 设置进度刷新令牌] = useState(0);
  const [进度保存错误, 设置进度保存错误] = useState<string | null>(null);

  function 提交阅读器页面(
    资源: 阅读资源结果,
    起始页: number,
    上下文?: 阅读打开上下文,
  ): void {
    设置进度保存错误(null);
    设置阅读资源(资源);
    设置阅读起始页(起始页);
    设置阅读上下文(上下文 ?? null);
    设置阅读打开序号((序号) => 序号 + 1);
    设置当前页面("阅读器");
  }

  function 打开阅读器页面(
    资源: 阅读资源结果,
    起始页: number,
    上下文?: 阅读打开上下文,
    获取转场原点?: OmiBrandOriginGetter,
  ): void {
    const 减少动画 = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const 转场原点 = 获取转场原点?.();
    if (!转场原点 || 减少动画 || typeof document.startViewTransition !== "function") {
      提交阅读器页面(资源, 起始页, 上下文);
      return;
    }

    const 根节点 = document.documentElement;
    根节点.classList.add("is-reader-gradient-transition");
    const 清理转场 = (): void => {
      根节点.classList.remove("is-reader-gradient-transition");
    };
    try {
      const 转场 = document.startViewTransition(() => {
        flushSync(() => 提交阅读器页面(资源, 起始页, 上下文));
      });
      void 转场.finished.then(清理转场, 清理转场);
    } catch {
      清理转场();
      提交阅读器页面(资源, 起始页, 上下文);
    }
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        {当前页面 === "首页" && <HomePage refreshToken={进度刷新令牌} onBrowse={() => 设置当前页面("资源库")} onOpenReader={打开阅读器页面} />}

        <div className={`page-panel ${当前页面 === "资源库" ? "is-visible" : "is-hidden"}`}>
          <LibraryPage
            onHome={() => 设置当前页面("首页")}
            refreshToken={进度刷新令牌}
            isActive={当前页面 === "资源库"}
            onOpenReader={打开阅读器页面}
          />
        </div>
        <div className={`page-panel ${当前页面 === "阅读器" ? "is-visible" : "is-hidden"}`}>
          {当前页面 === "阅读器" && 进度保存错误 && <div className="document-save-error" role="alert">{进度保存错误}<button aria-label="关闭进度提示" onClick={() => 设置进度保存错误(null)}>×</button></div>}
          {当前页面 === "阅读器" && 阅读资源 && (阅读资源.sourceType === "pdf" || 阅读资源.sourceType === "epub") ? (
            <Suspense fallback={<div className="document-loading" role="status">正在准备阅读器…</div>}><DocumentReader key={`${阅读打开序号}:${阅读资源.resourceKey}`}
              sourcePath={阅读资源.sourcePath} type={阅读资源.sourceType} initialPageIndex={阅读起始页}
              onClose={() => 设置当前页面("资源库")}
              onPageChange={(index, total) => {
                if (!total) return;
                void window.omicomic.saveReadingProgress({ resourceKey: 阅读资源.resourceKey, sourcePath: 阅读资源.sourcePath,
                  sourceType: 阅读资源.sourceType, title: 阅读资源.title, currentPageIndex: index, totalPages: total,
                  percent: Math.round((index + 1) / total * 100), completed: index >= total - 1,
                  hasStartedReading: true, firstReadAt: Date.now(), updatedAt: Date.now(),
                }).then((result) => {
                  if (result.ok) { 设置进度保存错误(null); 设置进度刷新令牌((value) => value + 1); }
                  else 设置进度保存错误("阅读进度未保存，请检查应用数据目录的可用空间与权限。");
                }).catch(() => 设置进度保存错误("阅读进度暂时无法保存，请稍后重试。"));
              }} /></Suspense>
          ) : 当前页面 === "阅读器" && <ReaderPage
            key={阅读资源 ? `${阅读打开序号}:${阅读资源.resourceKey}:${阅读资源.sourcePath}:${阅读起始页}:${阅读资源.total}` : "reader-empty"}
            resource={阅读资源}
            initialPageIndex={阅读起始页}
            openContext={阅读上下文}
            isActive={当前页面 === "阅读器"}
            onSwitchResource={(资源, 起始页, 上下文) => {
              设置阅读资源(资源);
              设置阅读起始页(起始页);
              设置阅读上下文(上下文);
              设置阅读打开序号((序号) => 序号 + 1);
            }}
            onBack={() => 设置当前页面("资源库")}
            onProgressSaved={(_进度: ReadingProgress) => {
              设置进度刷新令牌((令牌) => 令牌 + 1);
            }}
            onBookmarksChanged={() => {
              设置进度刷新令牌((令牌) => 令牌 + 1);
            }}
          />}
        </div>
      </main>
      <GlobalTooltip />
      <WindowControls />
    </div>
  );
}

export default App;
