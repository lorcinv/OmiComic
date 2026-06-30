import { useEffect, useState } from "react";
import LibraryPage from "./pages/LibraryPage";
import ReaderPage from "./pages/ReaderPage";
import type { ReadingProgress, 阅读打开上下文, 阅读资源结果, 页面名称 } from "./types";

function App() {
  const [当前页面, 设置当前页面] = useState<页面名称>("资源库");
  const [通道状态, 设置通道状态] = useState("正在检查安全通道…");
  const [阅读资源, 设置阅读资源] = useState<阅读资源结果 | null>(null);
  const [阅读起始页, 设置阅读起始页] = useState(0);
  const [阅读上下文, 设置阅读上下文] = useState<阅读打开上下文 | null>(null);
  const [阅读打开序号, 设置阅读打开序号] = useState(0);
  const [进度刷新令牌, 设置进度刷新令牌] = useState(0);

  useEffect(() => {
    window.omicomic
      .getAppInfo()
      .then((信息) => 设置通道状态(`安全通道已连接 · 版本 ${信息.version}`))
      .catch(() => 设置通道状态("安全通道连接失败"));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">漫</span>
          <div>
            <h1>OmiComic</h1>
            <p>本地漫画阅读器</p>
          </div>
        </div>

        <nav className="page-tabs" aria-label="主页面导航">
          <button
            className={当前页面 === "资源库" ? "is-active" : ""}
            onClick={() => 设置当前页面("资源库")}
          >
            资源库
          </button>
          <button
            className={当前页面 === "阅读器" ? "is-active" : ""}
            onClick={() => 设置当前页面("阅读器")}
          >
            阅读器预览
          </button>
        </nav>

        <span className="channel-status">{通道状态}</span>
      </header>

      <main className="app-content">
        <div className={`page-panel ${当前页面 === "资源库" ? "is-visible" : "is-hidden"}`}>
          <LibraryPage
            refreshToken={进度刷新令牌}
            onOpenReader={(资源, 起始页, 上下文) => {
              设置阅读资源(资源);
              设置阅读起始页(起始页);
              设置阅读上下文(上下文 ?? null);
              设置阅读打开序号((序号) => 序号 + 1);
              设置当前页面("阅读器");
            }}
          />
        </div>
        <div className={`page-panel ${当前页面 === "阅读器" ? "is-visible" : "is-hidden"}`}>
          <ReaderPage
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
          />
        </div>
      </main>
    </div>
  );
}

export default App;
