import { t } from './i18n';
import { useUiLanguage, setUiLanguage } from './i18n';
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import GlobalTooltip from "./GlobalTooltip";
import type { OmiBrandOriginGetter } from "./OmiBrandIcon";
import HomePage from "./pages/HomePage";
import WindowControls from "./WindowControls";
import DesktopDirectoryDrop from './components/DesktopDirectoryDrop';
import MobileSettings from './components/MobileSettings';
import BookReaderSettings from './components/BookReaderSettings';
import { 应用主题配色, applyDesktopTypography } from './theme';
import { isAndroid } from "./platform";
import { androidCall, hasAndroidRenderer } from './android/bridge';
import useMobileLayout from "./hooks/useMobileLayout";
import { mobileNavigate, mobileNavigationEpoch, observeMobileNavigationLifecycle } from "./hooks/mobileNavigation";
import type { AppSettings, OmiComicAppData, ReadingProgress, 操作结果, 阅读打开上下文, 阅读资源结果, 页面名称 } from "./types";
import "./styles/pageTransitions.css";

function App() {
  const mobile = useMobileLayout();
  useEffect(() => { document.documentElement.dataset.omiLayout = mobile ? 'mobile' : 'desktop'; }, [mobile]);
  useEffect(() => mobile ? observeMobileNavigationLifecycle() : undefined, [mobile]);
  useUiLanguage(mobile, false);
  const [homeSettings, setHomeSettings] = useState<AppSettings | null>(null);
  const openingSettings = useRef(false);
  async function openHomeSettings() {
    if (!mobile) { await 切换主界面('资源库'); window.dispatchEvent(new Event('omi-open-settings')); return; }
    if (openingSettings.current || homeSettings) return;
    const motion = mobileNavigationEpoch();
    openingSettings.current = true;
    try {
      const result = await window.omicomic.getAppData();
      if (!result.ok) { 设置外部打开错误(result.error.message); return; }
      await mobileNavigate(() => setHomeSettings(result.data.settings), 'forward', undefined, undefined, motion);
    } finally { openingSettings.current = false; }
  }
  useEffect(() => {
    if (!mobile) return;
    const restrictSelection = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('#resource-detail-title,input,textarea,[contenteditable="true"]')) return;
      event.preventDefault();
    };
    document.addEventListener('contextmenu', restrictSelection);
    document.addEventListener('selectstart', restrictSelection);
    return () => {
      document.removeEventListener('contextmenu', restrictSelection);
      document.removeEventListener('selectstart', restrictSelection);
    };
  }, [mobile]);
  useEffect(()=>{
    if(!isAndroid())return;
    const timer=window.setTimeout(()=>{void import('./pages/ReaderPage');},350);
    return()=>clearTimeout(timer);
  },[]);
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
  const [手机阅读器准备中, 设置手机阅读器准备中] = useState(false);
  const [手机阅读转场中, 设置手机阅读转场中] = useState(false);
  const 阅读打开请求 = useRef(0);
  const 等待阅读画面 = useRef<{ id: number; finish: (ready: boolean) => void } | null>(null);
  const 资源库就绪 = useRef(false);
  const 等待资源库 = useRef<Array<() => void>>([]);
  const [启动资料, 设置启动资料] = useState<OmiComicAppData | null>(null);
  const [启动设置就绪, 设置启动设置就绪] = useState(false);
  const [显示主界面, 设置显示主界面] = useState(true);
  const 主界面开关 = useRef(true);
  const 启动资料请求 = useRef<Promise<操作结果<OmiComicAppData>> | null>(null);
  const 初始资源库资料 = useRef<OmiComicAppData>();
  const 启动导航序号 = useRef(0);
  const [初始资源库已就绪, 设置初始资源库已就绪] = useState(false);
  const 启动遮罩已结束 = useRef(false);

  useEffect(() => {
    if (!isAndroid() || 启动遮罩已结束.current || !启动设置就绪 || 手机阅读器准备中
      || (!显示主界面 && !初始资源库已就绪 && 当前页面 !== '阅读器')) return;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
      启动遮罩已结束.current = true;
      void androidCall('finishLaunch', { animated: !matchMedia('(prefers-reduced-motion: reduce)').matches }).catch(() => undefined);
    }); });
    return () => cancelAnimationFrame(frame);
  }, [启动设置就绪, 显示主界面, 初始资源库已就绪, 当前页面, 手机阅读器准备中]);

  useEffect(() => {
    const changed = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail !== false;
      主界面开关.current = enabled; 设置显示主界面(enabled);
      if (!enabled && 当前页面 === '首页') void 直接进入资源库();
    };
    window.addEventListener('omi-home-visibility-changed', changed);
    return () => window.removeEventListener('omi-home-visibility-changed', changed);
  });

  function 取消阅读准备(): void {
    阅读打开请求.current++;
    等待阅读画面.current?.finish(false);
    等待阅读画面.current = null;
    设置手机阅读器准备中(false);
    设置手机阅读转场中(false);
    if (当前页面 !== "阅读器") 设置阅读资源(null);
  }
  useEffect(() => {
    const cancel=()=>{if(等待阅读画面.current)取消阅读准备();};
    window.addEventListener('omi-cancel-reader-prepare',cancel);
    return()=>window.removeEventListener('omi-cancel-reader-prepare',cancel);
  });

  useEffect(() => {
    const root = document.documentElement;
    const hideFocusRing = () => { root.dataset.focusRing = "off"; };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hideFocusRing();
      else if (event.key === "Tab" || event.key.startsWith("Arrow")) root.dataset.focusRing = "on";
    };
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("pointerdown", hideFocusRing, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      document.removeEventListener("pointerdown", hideFocusRing, true);
      delete root.dataset.focusRing;
    };
  }, []);

  useEffect(() => {
    const back = () => {
      if (等待阅读画面.current) { 取消阅读准备(); if (当前页面 === "阅读器") void 切换主界面("资源库"); return; }
      if (document.querySelector('[role="listbox"]')) { window.dispatchEvent(new Event("omi-close-select")); return; }
      if (document.querySelector('.mobile-settings-surface')) { window.dispatchEvent(new Event('omi-library-back', { cancelable: true })); return; }
      if (当前页面 === "阅读器") { window.dispatchEvent(new Event("omi-reader-back")); return; }
      if (当前页面 === "资源库") {
        const event = new Event("omi-library-back", { cancelable: true });
        if (window.dispatchEvent(event)) {
          if (主界面开关.current) void 切换主界面("首页");
          else void window.omicomic.minimizeWindow();
        }
        return;
      }
      window.omicomic.minimizeWindow();
    };
    window.addEventListener("omi-back",back);
    return () => window.removeEventListener("omi-back",back);
  });

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
          启动导航序号.current++; 阅读打开请求.current++;
          设置外部打开错误(null);
          设置进度刷新令牌(值 => 值 + 1);
          await 加载阅读器();
          if (应用已挂载.current) {
            if (mobile) await 打开阅读器页面(结果.data.resource, 结果.data.initialPageIndex);
            else 提交阅读器页面(结果.data.resource, 结果.data.initialPageIndex);
          }
        }
      } catch { if (应用已挂载.current) 设置外部打开错误("接收外部文件失败，请重新打开。"); }
      finally { 外部请求处理中.current = false; }
    };
    const 取消监听 = window.omicomic.onExternalOpen(() => void 接收文件());
    void 接收文件();
    return () => { 应用已挂载.current = false; 等待阅读画面.current?.finish(false); 取消监听(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // StrictMode remounts effects. Both passes share one settings read, and the
    // selected first screen reuses that snapshot instead of asking for it again.
    const request = 启动资料请求.current ??= window.omicomic.getAppData();
    void request.then(async result => {
      if (cancelled) return;
      if (!result.ok) throw new Error(result.error.message);
      应用主题配色(result.data.settings.colorTheme); applyDesktopTypography(result.data.settings);
      setUiLanguage(result.data.settings.language);
      const enabled = result.data.settings.showHomePage !== false;
      主界面开关.current = enabled; 设置显示主界面(enabled);
      设置启动资料(result.data); 设置启动设置就绪(true);
      if (!enabled && 启动导航序号.current === 0) await 直接进入资源库(result.data, 0, () => !cancelled);
    }).catch(error => {
      if (cancelled) return;
      主界面开关.current = true; 设置显示主界面(true); 设置启动设置就绪(true);
      设置外部打开错误(error instanceof Error ? error.message : '设置读取失败，请重试。');
    });
    return () => { cancelled = true; };
  }, []);

  async function 直接进入资源库(initialData?: OmiComicAppData, navigation = 启动导航序号.current, live = () => true): Promise<void> {
    const readerRequest = 阅读打开请求.current;
    try {
      const page = LibraryPage ?? (await import('./pages/LibraryPage')).default;
      if (!应用已挂载.current || !live() || navigation !== 启动导航序号.current || readerRequest !== 阅读打开请求.current) return;
      if (!LibraryPage) 初始资源库资料.current = initialData;
      // The native launch cover waits for the library's existing onReady signal.
      // A skipped home screen needs neither its cover work nor a home transition.
      flushSync(() => { 设置资源库组件(() => page); 设置当前页面('资源库'); });
    } catch {
      if (!应用已挂载.current || !live() || navigation !== 启动导航序号.current) return;
      主界面开关.current = true; 设置显示主界面(true);
      设置外部打开错误('资源库加载失败，请重试。');
    }
  }

  async function 加载阅读器(): Promise<void> {
    const 页面 = await import("./pages/ReaderPage");
    if (应用已挂载.current) flushSync(() => 设置阅读器组件(() => 页面.default));
  }

  async function 切换主界面(目标页面: "首页" | "资源库"): Promise<void> {
    if (目标页面 === '首页' && !主界面开关.current) return;
    if (主界面转场中.current || 当前页面 === 目标页面) return;
    const motion = mobileNavigationEpoch();
    if (mobile) 取消阅读准备();
    const navigationRequest = 阅读打开请求.current;
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
    if (navigationRequest !== 阅读打开请求.current || !应用已挂载.current) return;
    if (mobile) {
      if (目标页面 === "资源库" && !资源库就绪.current) await new Promise<void>(resolve => { 等待资源库.current.push(resolve); });
      if (navigationRequest !== 阅读打开请求.current || !应用已挂载.current) return;
      const request = 阅读打开请求.current;
      await mobileNavigate(() => { if (request === 阅读打开请求.current && 应用已挂载.current) 设置当前页面(目标页面); }, 当前页面 === "阅读器" ? "back" : 目标页面 === "首页" ? "home-collapse" : "home-expand", undefined, undefined, motion);
      if (request === 阅读打开请求.current && !等待阅读画面.current) 设置阅读资源(null);
      return;
    }
    if (isAndroid() || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
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
        if (navigationRequest === 阅读打开请求.current && 应用已挂载.current) flushSync(() => 设置当前页面(目标页面));
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
    motion = mobileNavigationEpoch(),
  ): Promise<void> {
    const request = ++阅读打开请求.current;
    等待阅读画面.current?.finish(false);
    const first=资源.pages[起始页];
    if(hasAndroidRenderer()&&first&&!/\.gif$/i.test(first.name)&&资源.sourceType!=='pdf'&&资源.sourceType!=='epub'){
      // Start native decoding alongside module/settings preparation, not afterwards.
      void androidCall('readerPrepare',{sourcePath:first.sourcePath,archiveInnerPath:first.archiveInnerPath,type:first.type,width:Math.round(innerWidth*devicePixelRatio),height:Math.round(innerHeight*devicePixelRatio)}).catch(()=>undefined);
    }
    await 加载阅读器();
    if (!应用已挂载.current || request !== 阅读打开请求.current) return;
    if (mobile) {
      // Keep the library/home on screen while the actual reader image decodes.
      // The prepared reader keeps the same DOM/image nodes through the reveal.
      const ready = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 20000);
        等待阅读画面.current = { id: request, finish: value => { clearTimeout(timer); resolve(value); } };
        flushSync(() => {
          设置阅读资源(资源); 设置阅读起始页(起始页); 设置阅读上下文(上下文 ?? null);
          设置阅读打开序号(request); 设置手机阅读器准备中(true);
        });
      });
      if (request !== 阅读打开请求.current || !应用已挂载.current) return;
      等待阅读画面.current = null;
      if (!ready) { 设置手机阅读器准备中(false); 设置阅读资源(null); 设置外部打开错误("漫画页面读取超时，请重试。"); return; }
      设置手机阅读转场中(true);
      await mobileNavigate(() => { if (request !== 阅读打开请求.current) return; 设置当前页面("阅读器"); 设置手机阅读器准备中(false); }, 'forward', undefined, undefined, motion);
      if (request === 阅读打开请求.current) 设置手机阅读转场中(false);
      return;
    }
    const 减少动画 = isAndroid() || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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

  async function 切换手机漫画(资源: 阅读资源结果, 起始页: number, 上下文: 阅读打开上下文, motion = mobileNavigationEpoch()): Promise<void> {
    const request=++阅读打开请求.current;
    // Warm the first raster before replacing the current reader. The transition
    // retains its rendered frame until the replacement DOM has also decoded.
    const page=资源.pages[起始页];
    if(page && 资源.sourceType!=='pdf' && 资源.sourceType!=='epub'){
      try{
        const result=await window.omicomic.getPageImage({sourcePath:page.sourcePath,virtualPath:page.virtualPath,archiveInnerPath:page.archiveInnerPath,type:page.type});
        if(result.ok){if(hasAndroidRenderer())await androidCall('readerPrepare',{url:result.data.url});else{const image=new Image();image.src=result.data.url;await image.decode();}}
      }catch{/* The reader presents the normal actionable error. */}
    }
    if(request!==阅读打开请求.current||!应用已挂载.current)return;
    const prepared=new Promise<void>(resolve=>{
      const timer=setTimeout(resolve,2000);
      等待阅读画面.current={id:request,finish:()=>{clearTimeout(timer);resolve();}};
    });
    await mobileNavigate(()=>{
      if(request!==阅读打开请求.current)return;
      设置阅读资源(资源);设置阅读起始页(起始页);设置阅读上下文(上下文);设置阅读打开序号(request);
    },'forward',()=>prepared,undefined,motion);
    if(等待阅读画面.current?.id===request)等待阅读画面.current=null;
  }

  return (
    <div className="app-shell">
      <main className="app-content" aria-busy={!启动设置就绪 || undefined}>
        {启动设置就绪 && 显示主界面 && 当前页面 === "首页" && <HomePage initialData={!LibraryPage && !ReaderPage ? 启动资料 ?? undefined : undefined} refreshToken={进度刷新令牌} onBrowse={() => 切换主界面("资源库")} onSettings={openHomeSettings} onOpenReader={打开阅读器页面} />}

        <div className={`page-panel ${当前页面 === "资源库" ? "is-visible" : "is-hidden"}`}>
          {LibraryPage && <LibraryPage
            initialData={初始资源库资料.current}
            onReady={() => { 资源库就绪.current=true; 设置初始资源库已就绪(true); 等待资源库.current.splice(0).forEach(resolve => resolve()); }}
            onHome={() => 切换主界面("首页")}
            refreshToken={进度刷新令牌}
            isActive={当前页面 === "资源库"}
            backgroundPaused={isAndroid() && 手机阅读器准备中}
            onOpenReader={打开阅读器页面}
          />}
        </div>
        <div className={`page-panel ${当前页面 === "阅读器" ? "is-visible" : "is-hidden"} ${手机阅读器准备中 ? "mobile-reader-preparing" : ""}`} aria-hidden={手机阅读器准备中 || undefined}>
          {(当前页面 === "阅读器" || 手机阅读器准备中) && ReaderPage && <ReaderPage
            key={阅读资源 ? `${阅读打开序号}:${阅读资源.resourceKey}:${阅读资源.sourcePath}:${阅读起始页}:${阅读资源.total}` : "reader-empty"}
            resource={阅读资源}
            initialPageIndex={阅读起始页}
            openContext={阅读上下文}
            isActive={当前页面 === "阅读器" || 手机阅读器准备中}
            interactive={!手机阅读器准备中}
            recordProgress={!mobile || (当前页面 === "阅读器" && !手机阅读器准备中 && !手机阅读转场中)}
            onReady={() => { if (等待阅读画面.current?.id === 阅读打开序号) 等待阅读画面.current.finish(true); }}
            onSwitchResource={(资源, 起始页, 上下文, motion) => {
              if (mobile) {
                if (阅读打开序号 === 阅读打开请求.current) void 切换手机漫画(资源, 起始页, 上下文, motion);
                return;
              }
              设置阅读资源(资源);
              设置阅读起始页(起始页);
              设置阅读上下文(上下文);
              设置阅读打开序号((序号) => 序号 + 1);
            }}
            onBack={() => 手机阅读器准备中 ? 取消阅读准备() : void 切换主界面("资源库")}
            onProgressSaved={(_进度: ReadingProgress) => {
              设置进度刷新令牌((令牌) => 令牌 + 1);
            }}
            onBookmarksChanged={() => {
              设置进度刷新令牌((令牌) => 令牌 + 1);
            }}
          />}
        </div>
      </main>
      {mobile && homeSettings && <MobileSettings settings={homeSettings} displayScope="recent" onSaved={settings => { setHomeSettings(settings); 应用主题配色(settings.colorTheme); }} onClose={() => void mobileNavigate(() => { setHomeSettings(null); 设置进度刷新令牌(value => value + 1); }, 'back')} bookSettings={<BookReaderSettings preferred={null} onSaved={() => 设置进度刷新令牌(value => value + 1)} />} />}
      {!mobile && <GlobalTooltip />}
      {外部打开错误 && <div className="external-open-error" role="alert">{t(外部打开错误 ?? '')}<button aria-label={t("关闭打开提示")} onClick={() => 设置外部打开错误(null)}>×</button></div>}
      <WindowControls />
      <DesktopDirectoryDrop onAdded={() => {
        // A future first library mount must not reuse the pre-import snapshot.
        初始资源库资料.current = undefined;
        设置启动资料(null);
        设置进度刷新令牌(value => value + 1);
      }} />
    </div>
  );
}

export default App;
