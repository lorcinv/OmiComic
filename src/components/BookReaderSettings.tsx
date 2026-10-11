import { useEffect, useRef, useState } from 'react';
import GlassSelect from '../GlassSelect';
import type { ReadingProgress, 阅读资源结果 } from '../types';
import { DEFAULT_AUTO_READ, normalizeAutoRead, normalizePageSort, pageIdentity, resolvePageIndex, PAGE_SORT_OPTIONS, type AutoReadOptions, type PageSort } from '../../electron/shared/readerPreferences';

type Book = Pick<阅读资源结果, 'resourceKey' | 'sourcePath' | 'sourceType' | 'title'>;
export default function BookReaderSettings({ preferred, onSaved }: {
  preferred: Book | null;
  onSaved: (progress: ReadingProgress, resource?: 阅读资源结果) => void;
}) {
  const [books, setBooks] = useState<Book[]>([]), [key, setKey] = useState('');
  const [resource, setResource] = useState<阅读资源结果 | null>(null);
  const [sort, setSort] = useState<PageSort>('name-asc'), [auto, setAuto] = useState({ ...DEFAULT_AUTO_READ });
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(0), [error, setError] = useState('');
  const queue = useRef(Promise.resolve()), alive = useRef(true), notify = useRef(onSaved);
  notify.current = onSaved;
  useEffect(() => {
    alive.current = true;
    void window.omicomic.getAppData().then(result => {
      if (!alive.current) return;
      if (!result.ok) { setError(result.error.message); setLoading(false); return; }
      const recent = Object.values(result.data.readingProgress).sort((a,b) => b.updatedAt - a.updatedAt);
      const list = [...new Map([...(preferred ? [preferred] : []), ...recent].map(book => [book.resourceKey, book])).values()];
      setBooks(list); setKey(preferred?.resourceKey ?? list[0]?.resourceKey ?? '');
      if (!list.length) setLoading(false);
    }).catch(() => { if (alive.current) { setError('阅读设置读取失败，请重新打开设置。'); setLoading(false); } });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const book = books.find(book => book.resourceKey === key);
    if (!book) return;
    let cancelled = false;
    setLoading(true); setResource(null); setError('');
    void Promise.all([window.omicomic.getResourcePages({ path: book.sourcePath, type: book.sourceType }), window.omicomic.getReadingProgress(key)]).then(([pages, progress]) => {
      if (cancelled) return;
      if (!pages.ok || !progress.ok) { setError(!pages.ok ? pages.error.message : !progress.ok ? progress.error.message : '读取失败'); return; }
      setResource(pages.data); setSort(normalizePageSort(progress.data?.readerViewState?.pageSort)); setAuto(normalizeAutoRead(progress.data?.readerViewState?.autoRead));
    }).catch(() => { if (!cancelled) setError('此漫画读取失败，请确认文件仍然存在。'); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key, books]);

  function save(mode?: PageSort, options?: AutoReadOptions) {
    if (!resource) return;
    const book = resource;
    setPending(count => count + 1); setError('');
    queue.current = queue.current.then(async () => {
      const result = await window.omicomic.getReadingProgress(book.resourceKey);
      if (!result.ok) throw new Error(result.error.message);
      const old = result.data;
      if (mode) {
        const index = resolvePageIndex(book.pages, old?.currentPageId, old?.currentPageName, old?.currentPageIndex ?? 0);
        const current = book.pages[index];
        if (!current) throw new Error('当前漫画没有可排序的图片。');
        const sorted = await window.omicomic.setReaderPageSort({ path: book.sourcePath, type: book.sourceType, mode, currentPageId: pageIdentity(current) });
        if (!sorted.ok) throw new Error(sorted.error.message);
        if (alive.current) { setResource(sorted.data.resource); setSort(mode); }
        notify.current(sorted.data.progress, sorted.data.resource);
      } else if (options) {
        const data = await window.omicomic.getAppData();
        if (!data.ok) throw new Error(data.error.message);
        const settings = data.data.settings;
        const view = old?.readerViewState ?? { fitMode: settings.readerDefaultFitMode, pageMode: settings.readerPageMode, pageDirection: settings.doublePageDirection, flow: settings.readerDefaultFlow, panorama: false, immersive: false };
        const index = old?.currentPageIndex ?? 0;
        const saved = await window.omicomic.saveReadingProgress({ ...old, resourceKey: book.resourceKey, sourcePath: book.sourcePath, sourceType: book.sourceType, title: book.title,
          currentPageIndex: index, currentPageId: old?.currentPageId ?? (book.pages[index] ? pageIdentity(book.pages[index]) : undefined), currentPageName: old?.currentPageName ?? book.pages[index]?.name,
          totalPages: old?.totalPages || book.total || 1, percent: old?.percent ?? 0, completed: old?.completed ?? false, hasStartedReading: old?.hasStartedReading ?? false, firstReadAt: old?.firstReadAt ?? Date.now(), updatedAt: Date.now(),
          readerViewState: { ...view, autoRead: options },
        });
        if (!saved.ok) throw new Error(saved.error.message);
        notify.current(saved.data);
      }
    }).catch(reason => { if (alive.current) setError(reason instanceof Error ? reason.message : '保存失败，请重试。'); }).finally(() => { if (alive.current) setPending(count => count - 1); });
  }
  const document = resource?.sourceType === 'pdf' || resource?.sourceType === 'epub';
  const noTimes = window.document.documentElement.dataset.platform === 'android' && !resource?.pages.some(page => page.modifiedAt);
  return <div className="book-reader-settings" aria-busy={loading || pending > 0}>
    <h4>每本漫画的阅读设置</h4>
    {books.length > 0 && <div className="settings-row"><span>当前漫画</span><GlassSelect ariaLabel="当前漫画" value={key} options={books.map(book => ({ value: book.resourceKey, label: book.title }))} disabled={pending > 0} onChange={setKey} className="settings-glass-select" /></div>}
    <p className="settings-help">仅影响所选漫画的页面和自动阅读，不改变资源库排序。</p>
    {loading ? <p role="status">正在读取阅读设置…</p> : !books.length ? <p>打开漫画后，可在这里选择并设置。</p> : resource && <>
      {document ? <p className="settings-help">PDF / EPUB 保持文档原有顺序。</p> : <div className="settings-row"><span>页面排序</span><GlassSelect ariaLabel="页面排序" value={sort} options={PAGE_SORT_OPTIONS.map(option => ({ ...option, disabled: noTimes && option.value.startsWith('time') }))} disabled={pending > 0 || !resource.pages.length} onChange={mode => save(mode)} className="settings-glass-select" /></div>}
      {!document && <p className="settings-help">{noTimes ? '当前 Android 文件接口未提供页面修改时间，仅支持文件名排序。' : '时间缺失排在最后；时间相同按文件名自然升序。重排保留当前图片与书签。'}</p>}
      {(['intervalSeconds', 'scrollPixelsPerSecond'] as const).map(field => <label className="settings-row book-reader-slider" key={field}>
        <span>{field === 'intervalSeconds' ? '翻页间隔' : '滚动速度'}</span><span><input type="range" aria-label={field === 'intervalSeconds' ? '翻页间隔' : '滚动速度'} min={field === 'intervalSeconds' ? 1 : 10} max={field === 'intervalSeconds' ? 60 : 400} step={field === 'intervalSeconds' ? 1 : 10} value={auto[field]} onChange={event => { const value = { ...auto, [field]: Number(event.target.value) }; setAuto(value); save(undefined, value); }} /><output>{auto[field]} {field === 'intervalSeconds' ? '秒' : '像素/秒'}</output></span>
      </label>)}
      <p className="settings-help">顶部播放按钮启动 / 暂停。普通阅读按间隔翻页，全景连续阅读平滑滚动。</p>
    </>}
    {pending > 0 && <p role="status">正在保存…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
