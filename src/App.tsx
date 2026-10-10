import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import GlobalTooltip from "./GlobalTooltip";
import type { OmiBrandOriginGetter } from "./OmiBrandIcon";
import HomePage from "./pages/HomePage";
import WindowControls from "./WindowControls";
import type { ReadingProgress, 阅读打开上下文, 阅读资源结果, 页面名称 } from "./types";
import "./styles/pageTransitions.css";

function App() {
  const [LibraryPage, 设置资源库组件] = useState<(typeof import("./pages/LibraryPage"))["default"] | null>(null);
  const [ReaderPage, 设置阅读器组件] = useState<(typeof import("./pages/ReaderPage"))["default"] | null>(null);
  const [当前页面, 设置当前页面] = useState<页面名称>("首页");
  const [阅读资源, 设置阅读资源] = useState<阅读资源结果 | null>(null);
  const [阅读起始页, 设置阅读起始页] = useState(0);
  const [阅读上下文, 设置阅读上下文] = useState<阅读打开上下文 | null>(null);
  const [阅读打开序号, 设置阅读打开序号] = useState(0);
  const [进度刷新令牌, 设置进度刷新令牌] = useState(0);
  const 主界面转场中 = useRef(false);
  const [外部打开错误, 设置外部打开错误] = useState<string | null>(null);
  const 外部请求处理中 = useRef(false);
  const 应用已挂载 = useRef(false);

  useEffect(() => {
    应用已挂载.current = true;
    const 接收文件 = async () => {
      if (外部请求处理中.current) return;
      外部请求处理中.current = true;
      try {
        while (应用已挂载.current) {
          const 结果 = await window.omicomic.takeExternalOpen();
          if (!应用已挂载.current) break;
          if (!结果.ok) { 设置外部打开错误(结果.error.message); continue; }
          if (!结果.data) break;
          设置外部打开错误(null);
          设置进度刷新令牌(值 => 值 + 1);
          await 加载阅读器();
          if (应用已挂载.current) 提交阅读器页面(结果.data.resource, 结果.data.initialPageIndex);
        }
      } catch { if (应用已挂载.current) 设置外部打开错误("接收外部文件失败，请重新打开。"); }
      finally { 外部请求处理中.current = false; }
    };
    const 取消监听 = window.omicomic.onExternalOpen(() => void 接收文件());
    void 接收文件();
    return () => { 应用已挂载.current = false; 取消监听(); };
  }, []);

  async function 加载阅读器(): Promise<void> {
    const 页面 = await import("./pages/ReaderPage");
    if (应用已挂载.current) flushSync(() => 设置阅读器组件(() => 页面.default));
  }

  async function 切换主界面(目标页面: "首页" | "资源库"): Promise<void> {
    if (主界面转场中.current || 当前页面 === 目标页面) return;
    if (目标页面 === "资源库" && !LibraryPage) {
      主界面转场中.current = true;
      try {
        const 页面 = await import("./pages/LibraryPage");
        if (!应用已挂载.current) return;
        // 首次进入才初始化目录；之后保留实例，维持返回位置和筛选状态。
        flushSync(() => 设置资源库组件(() => 页面.default));
      } catch {
        设置外部打开错误("资源库加载失败，请重试。");
        return;
      } finally { 主界面转场中.current = false; }
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
      设置当前页面(目标页面);
      return;
    }

    const 当前品牌 = document.querySelector(当前页面 === "首页" ? ".omi-home .omi-page-brand" : ".page-panel.is-visible .omi-page-brand");
    const 图标位置 = 当前品牌?.querySelector(".omi-brand-icon")?.getBoundingClientRect();
    if (!图标位置) {
      设置当前页面(目标页面);
      return;
    }

    const 根节点 = document.documentElement;
    const x = 图标位置.left + 图标位置.width / 2;
    const y = 图标位置.top + 图标位置.height / 2;
    const 半径 = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    根节点.style.setProperty("--page-origin-x", `${x}px`);
    根节点.style.setProperty("--page-origin-y", `${y}px`);
    根节点.style.setProperty("--page-reveal-max", `${半径 + 200}px`);
    根节点.classList.add("is-home-library-transition");
    根节点.classList.toggle("is-revealing-home", 目标页面 === "首页");
    主界面转场中.current = true;
    const 清理 = (): void => {
      根节点.classList.remove("is-home-library-transition");
      根节点.classList.remove("is-revealing-home");
      for (const 名称 of ["--page-origin-x", "--page-origin-y", "--page-reveal-max"]) 根节点.style.removeProperty(名称);
      主界面转场中.current = false;
    };
    try {
      const 转场 = document.startViewTransition(() => {
        flushSync(() => 设置当前页面(目标页面));
      });
      void 转场.finished.then(清理, 清理);
    } catch {
      清理();
      设置当前页面(目标页面);
    }
  }

  function 提交阅读器页面(
    资源: 阅读资源结果,
    起始页: number,
    上下文?: 阅读打开上下文,
  ): void {
    设置阅读资源(资源);
    设置阅读起始页(起始页);
    设置阅读上下文(上下文 ?? null);
    设置阅读打开序号((序号) => 序号 + 1);
    设置当前页面("阅读器");
  }

  async function 打开阅读器页面(
    资源: 阅读资源结果,
    起始页: number,
    上下文?: 阅读打开上下文,
    获取转场原点?: OmiBrandOriginGetter,
  ): Promise<void> {
    await 加载阅读器();
    if (!应用已挂载.current) return;
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
        {当前页面 === "首页" && <HomePage refreshToken={进度刷新令牌} onBrowse={() => 切换主界面("资源库")} onOpenReader={打开阅读器页面} />}

        <div className={`page-panel ${当前页面 === "资源库" ? "is-visible" : "is-hidden"}`}>
          {LibraryPage && <LibraryPage
            onHome={() => 切换主界面("首页")}
            refreshToken={进度刷新令牌}
            isActive={当前页面 === "资源库"}
            onOpenReader={打开阅读器页面}
          />}
        </div>
        <div className={`page-panel ${当前页面 === "阅读器" ? "is-visible" : "is-hidden"}`}>
          {当前页面 === "阅读器" && ReaderPage && <ReaderPage
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
            onBack={() => void 切换主界面("资源库")}
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
      {外部打开错误 && <div className="external-open-error" role="alert">{外部打开错误}<button aria-label="关闭打开提示" onClick={() => 设置外部打开错误(null)}>×</button></div>}
      <WindowControls />
    </div>
  );
}

export default App;
