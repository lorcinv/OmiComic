import { t, tr } from '../i18n';
import MobileIcon from "../components/MobileIcon";
import { pageIdentity, resolvePageIndex } from '../../electron/shared/readerPreferences';
import { getResourceThumbnail } from "../reader/thumbnailClient";
import ResourcePlaceholder from "../components/ResourcePlaceholder";
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { RecentOpenedItem, 阅读资源结果, 阅读打开上下文 } from "../types";
import type { OmiBrandOriginGetter } from "../OmiBrandIcon";
import OmiPageBrand from "../components/OmiPageBrand";
import OmiSignature from "../components/OmiSignature";
import { HomeArtworkPalette, HomeMascot } from '../components/HomeArtworkDecor';
import useMobileLayout from "../hooks/useMobileLayout";
import { defaultHomeArtwork, useHomeArtwork } from '../hooks/useHomeArtwork';
import { mobileNavigationEpoch } from '../hooks/mobileNavigation';
import { 应用主题配色, applyDesktopTypography } from "../theme";
import "../styles/home.css";
import "../styles/mobileInteractionRefinements.css";

interface HomePageProps {
  onBrowse: () => void;
  onSettings: () => void;
  onOpenReader: (resource: 阅读资源结果, initialPageIndex: number, context?: 阅读打开上下文, origin?: OmiBrandOriginGetter, motionEpoch?: number) => void | Promise<void>;
  refreshToken: number;
}

type RecentBook = RecentOpenedItem & { thumbnail: string | null };

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function HomePage({ onBrowse, onSettings, onOpenReader, refreshToken }: HomePageProps) {
  const mobile = useMobileLayout();
  const artwork = useHomeArtwork(!mobile);
  const [artworkFailed, setArtworkFailed] = useState(false);
  useEffect(() => setArtworkFailed(false), [artwork?.url]);
  const customArtwork = artwork && !artworkFailed;
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = stage.current;
    if (mobile || !element) return;
    // Fit the entire desktop composition, including the signature and mascots, as one unit.
    const fit = () => element.style.setProperty('--omi-home-scale', String(Math.min(element.clientWidth / 1440, element.clientHeight / (1653 / 2480 * 1440))));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mobile]);
  const [books, setBooks] = useState<RecentBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const openRequest = useRef(0);
  const openingRef = useRef(false);
  const [heldBook, setHeldBook] = useState<string | null>(null);
  const hold = useRef<{ x: number; y: number; timer: number } | null>(null);
  const suppressHoldClick = useRef(false);
  const cancelHold = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => cancelHold, []);
  useEffect(() => {
    if (!heldBook) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.omi-home__book.is-held')) setHeldBook(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [heldBook]);
  const startHold = (event: PointerEvent<HTMLButtonElement>, book: RecentBook) => {
    if (!mobile || event.button !== 0) return;
    cancelHold(); suppressHoldClick.current = false;
    hold.current = { x: event.clientX, y: event.clientY, timer: window.setTimeout(() => {
      suppressHoldClick.current = true; setHeldBook(book.resourceKey);
    }, 450) };
  };

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    ++openRequest.current;
    openingRef.current = false;
    setOpening(null);
    setHeldBook(null); cancelHold();
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const result = await window.omicomic.getAppData();
        if (generation.current !== current) return;
        if (!result.ok) throw new Error(result.error.message);
        应用主题配色(result.data.settings.colorTheme);
        applyDesktopTypography(result.data.settings);
        const seen = new Set<string>();
        const recent = [...result.data.recentOpened]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .filter(item => {
            if (seen.has(item.resourceKey)) return false;
            seen.add(item.resourceKey);
            return true;
          }).slice(0, mobile ? 4 : 3);
        setBooks(recent.map(item => ({ ...item, thumbnail: null })));
        setLoading(false);
        await Promise.all(recent.map(async item => {
          try {
            const thumbnail = await getResourceThumbnail({ path: item.sourcePath, type: item.sourceType }, controller.signal);
            if (generation.current !== current || !thumbnail.ok) return;
            setBooks(items => items.map(book => book.resourceKey === item.resourceKey ? { ...book, thumbnail: thumbnail.data.url } : book));
          } catch { /* A missing cover never prevents opening a book. */ }
        }));
      } catch (cause) {
        if (generation.current !== current) return;
        setBooks([]);
        setLoading(false);
        setError(cause instanceof Error ? cause.message : "暂时无法读取最近阅读记录。");
      }
    };
    void load();
    return () => { controller.abort(); ++generation.current; ++openRequest.current; openingRef.current = false; };
  }, [refreshToken, retry, mobile]);

  const browse = () => {
    ++openRequest.current;
    openingRef.current = false;
    setOpening(null);
    onBrowse();
  };

  const resume = async (book: RecentBook, origin?: OmiBrandOriginGetter) => {
    if (openingRef.current) return;
    const motion = mobileNavigationEpoch();
    openingRef.current = true;
    const request = ++openRequest.current;
    setOpening(book.resourceKey);
    setHeldBook(null); cancelHold();
    setError(null);
    try {
      const [resource, progress] = await Promise.all([
        window.omicomic.getResourcePages({ path: book.sourcePath, type: book.sourceType }),
        window.omicomic.getReadingProgress(book.resourceKey),
      ]);
      if (request !== openRequest.current) return;
      if (!resource.ok) throw new Error(resource.error.message);
      const isDocument = resource.data.sourceType === "pdf" || resource.data.sourceType === "epub";
      if (!isDocument && !resource.data.pages.length) throw new Error("这本漫画中没有可阅读的图片，请在资源库中检查文件。");
      if (!progress.ok) throw new Error(progress.error.message);
      const saved = progress.data?.currentPageIndex ?? book.currentPageIndex;
      const safeSaved = Math.max(0, Number.isFinite(saved) ? Math.floor(saved) : 0);
      const page = isDocument ? safeSaved : resolvePageIndex(resource.data.pages, progress.data?.currentPageId, progress.data?.currentPageName, safeSaved);
      if (!isDocument) resource.data.requestedPageId = pageIdentity(resource.data.pages[page]);
      if (mobile) await onOpenReader(resource.data, page, undefined, origin, motion);
      else if (origin) await onOpenReader(resource.data, page, undefined, origin);
      else await onOpenReader(resource.data, page);
    } catch (cause) {
      if (request === openRequest.current) setError(cause instanceof Error ? cause.message : "打开失败，请检查文件是否已移动或删除。");
    } finally {
      if (request === openRequest.current) { openingRef.current = false; setOpening(null); }
    }
  };

  return (
    <div className={`omi-home${mobile ? ' is-mobile-home' : ''}`}>
      {!mobile && <HomeArtworkPalette id="omi-home-palette" />}
      <header className="omi-home__header">
        <OmiPageBrand onActivate={browse} onRead={origin => resume(books[0], origin)} readDisabled={loading || books.length === 0 || opening !== null} />
        {!mobile && <button type="button" className="omi-home__library" aria-label={t("打开资源库")} onClick={browse}>{t("我的资源库 ")}<Arrow diagonal /></button>}
      </header>
      <div className="omi-home__stage" ref={stage}>
      <div className="omi-home__body">
        <div className="omi-home__reading-column">
        <div className="omi-home__recent-shell">
        <section className="omi-home__content" aria-label={t("最近阅读与阅读状态")}>
          <section className="omi-home__recent" aria-labelledby="omi-home-recent">
            <div className="omi-home__section-label"><h2 id="omi-home-recent">{t("最近阅读")}</h2><span>CONTINUE READING</span><span className="omi-home__section-line" />
              {!mobile && !customArtwork && <HomeMascot name="peek" />}
            </div>
            {loading && (!mobile || !books.length) ? (mobile ? null : <div className="omi-home__loading" role="status">{t("正在整理你的阅读记录…")}</div>) : books.length > 0 ? (
              <div className="omi-home__books">
                {books.map((book, index) => {
                  const total = Math.max(0, book.totalPages);
                  const unit = book.sourceType === "epub" ? "章" : "页";
                  const page = total ? Math.min(Math.max(1, book.currentPageIndex + 1), total) : 0;
                  const progress = total ? page / total * 100 : 0;
                  const percent = progress > 0 && progress < 1 ? "<1" : Math.round(progress);
                  return <button type="button" key={book.resourceKey} className={`omi-home__book${heldBook === book.resourceKey ? ' is-held' : ''}`}
                    onPointerDown={event => startHold(event, book)} onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 9) cancelHold(); }}
                    onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold}
                    onContextMenu={event => { if (mobile) event.preventDefault(); }}
                    onClick={event => {
                      if (mobile && suppressHoldClick.current) { suppressHoldClick.current = false; return; }
                      if (mobile || event.detail === 0 || (event.target as Element).closest('.omi-home__cover-action')) void resume(book);
                    }}
                    onDoubleClick={() => { if (!mobile) void resume(book); }} disabled={opening !== null} aria-label={tr`继续阅读 ${book.title}${total ? tr`，第 ${page} ${t(unit)}，共 ${total} ${t(unit)}` : ""}`} aria-busy={opening === book.resourceKey}>
                    <div className={`omi-home__cover omi-home__cover--${index + 1}`}>
                      {book.thumbnail ? <img src={book.thumbnail} alt="" onError={() => setBooks(items => items.map(item => item.resourceKey === book.resourceKey ? { ...item, thumbnail: null } : item))} /> : <div className="omi-home__cover-placeholder" aria-hidden="true"><ResourcePlaceholder type={book.sourceType} /></div>}
                      {(!mobile || heldBook === book.resourceKey) && <span className="omi-home__cover-action">{!mobile && opening === book.resourceKey ? t("正在打开…") : t("继续阅读")}<Arrow /></span>}
                    </div>
                    <span className="omi-home__progress-track" aria-hidden="true"><span style={{ width: `${progress}%`, minWidth: progress > 0 ? 'max(2px, calc(2.05px / var(--omi-home-scale, 1)))' : 0 }} /></span>
                    <span className="omi-home__book-title" title={mobile ? undefined : book.title}>{book.title}</span>
                    <span className="omi-home__book-progress">{total ? `${page} / ${total}${unit === '页' ? '' : ` ${t(unit)}`}` : t("打开阅读")}<span>{total ? `${percent}%` : ""}</span></span>
                  </button>;
                })}
              </div>
            ) : <div className="omi-home__empty"><span className="omi-home__empty-symbol" aria-hidden="true">＋</span><div><h3>{error ? t("阅读记录暂未就绪") : t("你的故事，即将开始")}</h3><p>{error ? t("可以重试，或前往资源库打开漫画。") : t("把喜欢的漫画加入资源库，下一次从这里接着看。")}</p><button type="button" onClick={error ? () => setRetry(value => value + 1) : browse}>{error ? t("重新加载") : t("打开资源库")}<Arrow /></button></div></div>}
          </section>
          {error && <div className="omi-home__error" role="alert">{t(error ?? '')}<button type="button" onClick={() => setError(null)} aria-label={t("关闭错误提示")}>×</button></div>}
        </section>
        {!mobile && !customArtwork && <HomeMascot name="side" />}
        </div>
        {!mobile && <OmiSignature showMascot={!customArtwork} />}
        </div>
        {!mobile && <aside className={`omi-home__art${customArtwork ? ' is-custom' : ''}`} aria-label={t('主页看板娘')}>
          <img src={customArtwork ? artwork.url : defaultHomeArtwork} alt={customArtwork ? artwork.name : t('Omi 抱着小 Omi 坐在漫画书上')} draggable={false} onError={() => setArtworkFailed(true)} />
        </aside>}
      </div>
      </div>
      {mobile ? <nav className="mobile-home-nav" aria-label={t("首页导航")}><button aria-label={t("打开资源库")} onClick={browse}><MobileIcon name="library"/>{t("进入资源库")}</button><button onClick={() => setRetry(value => value + 1)} disabled={loading}><MobileIcon name="refresh"/>{t("刷新")}</button><button onClick={onSettings}><MobileIcon name="settings"/>{t("设置")}</button></nav> : null}
    </div>
  );
}
