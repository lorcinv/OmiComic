import { useEffect, useRef, useState } from "react";
import type { RecentOpenedItem, 阅读资源结果, 阅读打开上下文 } from "../types";
import type { OmiBrandOriginGetter } from "../OmiBrandIcon";
import OmiPageBrand from "../components/OmiPageBrand";
import OmiSignature from "../components/OmiSignature";
import { 应用主题配色 } from "../theme";
import "../styles/home.css";

interface HomePageProps {
  onBrowse: () => void;
  onOpenReader: (resource: 阅读资源结果, initialPageIndex: number, context?: 阅读打开上下文, origin?: OmiBrandOriginGetter) => void;
  refreshToken: number;
}

type RecentBook = RecentOpenedItem & { thumbnail: string | null };

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function HomePage({ onBrowse, onOpenReader, refreshToken }: HomePageProps) {
  const [books, setBooks] = useState<RecentBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const openRequest = useRef(0);
  const openingRef = useRef(false);

  useEffect(() => {
    const current = ++generation.current;
    ++openRequest.current;
    openingRef.current = false;
    setOpening(null);
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const result = await window.omicomic.getAppData();
        if (generation.current !== current) return;
        if (!result.ok) throw new Error(result.error.message);
        应用主题配色(result.data.settings.colorTheme);
        const seen = new Set<string>();
        const recent = [...result.data.recentOpened]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .filter(item => {
            if (seen.has(item.resourceKey)) return false;
            seen.add(item.resourceKey);
            return true;
          }).slice(0, 3);
        setBooks(recent.map(item => ({ ...item, thumbnail: null })));
        setLoading(false);
        await Promise.all(recent.map(async item => {
          try {
            const thumbnail = await window.omicomic.getThumbnail({ path: item.sourcePath, type: item.sourceType });
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
    return () => { ++generation.current; ++openRequest.current; openingRef.current = false; };
  }, [refreshToken, retry]);

  const browse = () => {
    ++openRequest.current;
    openingRef.current = false;
    setOpening(null);
    onBrowse();
  };

  const resume = async (book: RecentBook, origin?: OmiBrandOriginGetter) => {
    if (openingRef.current) return;
    openingRef.current = true;
    const request = ++openRequest.current;
    setOpening(book.resourceKey);
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
      const page = isDocument ? safeSaved : Math.min(safeSaved, resource.data.pages.length - 1);
      if (origin) onOpenReader(resource.data, page, undefined, origin);
      else onOpenReader(resource.data, page);
    } catch (cause) {
      if (request === openRequest.current) setError(cause instanceof Error ? cause.message : "打开失败，请检查文件是否已移动或删除。");
    } finally {
      if (request === openRequest.current) { openingRef.current = false; setOpening(null); }
    }
  };

  return (
    <div className="omi-home">
      <header className="omi-home__header">
        <OmiPageBrand onActivate={browse} onRead={origin => resume(books[0], origin)} readDisabled={loading || books.length === 0 || opening !== null} />
        <button type="button" className="omi-home__library" aria-label="打开资源库" onClick={browse}>我的资源库 <Arrow diagonal /></button>
      </header>
      <div className="omi-home__body">
        <div className="omi-home__reading-column">
        <section className="omi-home__content" aria-label="最近阅读与阅读状态">
          <section className="omi-home__recent" aria-labelledby="omi-home-recent">
            <div className="omi-home__section-label"><h2 id="omi-home-recent">最近阅读</h2><span>CONTINUE READING</span><span className="omi-home__section-line" /></div>
            {loading ? <div className="omi-home__loading" role="status">正在整理你的阅读记录…</div> : books.length > 0 ? (
              <div className="omi-home__books">
                {books.map((book, index) => {
                  const total = Math.max(0, book.totalPages);
                  const unit = book.sourceType === "epub" ? "章" : "页";
                  const page = total ? Math.min(Math.max(1, book.currentPageIndex + 1), total) : 0;
                  const progress = total ? page / total * 100 : 0;
                  const percent = progress > 0 && progress < 1 ? "<1" : Math.round(progress);
                  return <button type="button" key={book.resourceKey} className="omi-home__book" onClick={() => void resume(book)} disabled={opening !== null} aria-label={`继续阅读 ${book.title}${total ? `，第 ${page} ${unit}，共 ${total} ${unit}` : ""}`} aria-busy={opening === book.resourceKey}>
                    <div className={`omi-home__cover omi-home__cover--${index + 1}`}>
                      {book.thumbnail ? <img src={book.thumbnail} alt="" onError={() => setBooks(items => items.map(item => item.resourceKey === book.resourceKey ? { ...item, thumbnail: null } : item))} /> : <div className="omi-home__cover-placeholder" aria-hidden="true"><span>OMI<br />COMIC</span><svg viewBox="0 0 80 80" fill="none"><path d="M15 18c11-3 18-1 25 5 7-6 14-8 25-5v43c-11-3-18-1-25 5-7-6-14-8-25-5V18Zm25 5v43" stroke="currentColor" strokeWidth="1.2" /></svg><small>YOUR NEXT CHAPTER</small></div>}
                      <span className="omi-home__cover-action">{opening === book.resourceKey ? "正在打开…" : "继续阅读"}<Arrow /></span>
                    </div>
                    <span className="omi-home__progress-track" aria-hidden="true"><span style={{ width: `${progress}%`, minWidth: progress > 0 ? 2 : 0 }} /></span>
                    <span className="omi-home__book-title" title={book.title}>{book.title}</span>
                    <span className="omi-home__book-progress">{total ? `${page} / ${total} ${unit}` : "打开阅读"}<span>{total ? `${percent}%` : ""}</span></span>
                  </button>;
                })}
              </div>
            ) : <div className="omi-home__empty"><span className="omi-home__empty-symbol" aria-hidden="true">＋</span><div><h3>{error ? "阅读记录暂未就绪" : "你的故事，即将开始"}</h3><p>{error ? "可以重试，或前往资源库打开漫画。" : "把喜欢的漫画加入资源库，下一次从这里接着看。"}</p><button type="button" onClick={error ? () => setRetry(value => value + 1) : browse}>{error ? "重新加载" : "打开资源库"}<Arrow /></button></div></div>}
          </section>
          {error && <div className="omi-home__error" role="alert">{error}<button type="button" onClick={() => setError(null)} aria-label="关闭错误提示">×</button></div>}
        </section>
        <OmiSignature />
        </div>
        <aside className="omi-home__art" aria-label="灰蓝色漫画少女插画">
          <img src={new URL("../assets/home-scene.webp", import.meta.url).href} alt="镜像后的漫画少女与教室桌面，背景向左渐隐" draggable={false} />
        </aside>
      </div>
      <footer className="omi-home__footer"><span>LOCAL STORIES. LIMITLESS WORLDS.</span><span><i /> 只属于你的阅读时光</span></footer>
    </div>
  );
}
