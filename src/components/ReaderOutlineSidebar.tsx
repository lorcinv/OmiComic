import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import MobileSheet, { dismissMobileSheet } from './MobileSheet';
import { consumeDismissGesture } from '../hooks/consumeDismissGesture';
import { t, tr } from '../i18n';
import type { DocumentSource } from '../reader/documentSource';
import { folderFilenameOutline, imageOutline, readerPageCode, type ReaderOutlineEntry } from '../reader/readerOutline';
import type { 阅读资源结果 } from '../types';

interface Props {
  mobile: boolean;
  resource: 阅读资源结果;
  source?: DocumentSource;
  currentPage: number;
  onClose: () => void;
  onJump: (page: number, entry?: ReaderOutlineEntry) => void;
}

export default function ReaderOutlineSidebar({ mobile, resource, source, currentPage, onClose, onJump }: Props) {
  const [documentOutline, setDocumentOutline] = useState<{ source: DocumentSource; entries: ReaderOutlineEntry[] }>();
  const panel = useRef<HTMLElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!source) return;
    let live = true;
    const applyOutline = (entries: ReaderOutlineEntry[]) => {
      if (live) setDocumentOutline({ source, entries });
    };
    void source.readOutline().then(applyOutline, () => applyOutline([]));
    return () => { live = false; };
  }, [source]);

  useEffect(() => {
    if (mobile) return;
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || panel.current?.contains(target) || target.closest('[data-reader-outline]')) return;
      consumeDismissGesture(event, true);
      close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    const back = () => close.current();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('omi-reader-close-panel', back);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('omi-reader-close-panel', back);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mobile]);

  const imageEntries = useMemo(() => {
    if (resource.sourceType === 'archive') return imageOutline(resource.pages);
    if (resource.sourceType === 'folder' || resource.sourceType === 'image') return folderFilenameOutline(resource.pages);
    return [];
  }, [resource.pages, resource.sourceType]);
  const outline = documentOutline?.source === source ? documentOutline?.entries : undefined;
  const loadingOutline = Boolean(source && !outline);
  const entries = outline ?? imageEntries;
  const rows = entries.map(entry => ({ entry, page: source?.outlinePage(entry.target) ?? ('page' in entry.target ? entry.target.page : 0) }));
  let selected = -1;
  rows.forEach(({ page }, index) => {
    if (page <= currentPage && (selected < 0 || page >= rows[selected].page)) selected = index;
  });
  const chapterList = rows.length > 0;
  useLayoutEffect(() => {
    // Move the drawer's own scroller, leaving the reader's image position intact.
    const button = active.current;
    const scroller = button?.closest<HTMLElement>('.reader-sidebar-content, .mobile-sheet-content');
    if (!button || !scroller) return;
    const area = scroller.getBoundingClientRect();
    const row = button.getBoundingClientRect();
    if (row.top < area.top || row.bottom > area.bottom) scroller.scrollTop += row.top - area.top - (area.height - row.height) / 2;
  }, [chapterList, outline, resource.resourceKey]);

  function jump(page: number, entry?: ReaderOutlineEntry) {
    if (mobile) dismissMobileSheet();
    else onClose();
    onJump(page, entry);
  }

  const title = t('章节');
  const list = loadingOutline ? <div className="reader-outline-loading" role="status">{t('正在读取目录')}</div> : <ul className="reader-outline-list">
    {chapterList ? rows.map(({ entry, page }, index) => (
      <li key={index}>
        <button type="button" ref={selected === index ? active : undefined} aria-current={selected === index ? 'true' : undefined}
          style={{ '--chapter-depth': Math.min(entry.depth, 5) } as CSSProperties} onClick={() => jump(page, entry)}>
          <span>{entry.title}</span><span className="reader-outline-page">{tr`第 ${page + 1} 页`}</span>
        </button>
      </li>
    )) : resource.pages.map(page => (
      <li key={page.index}>
        <button type="button" ref={currentPage === page.index ? active : undefined} aria-current={currentPage === page.index ? 'page' : undefined}
          onClick={() => jump(page.index)}>
          <span>{readerPageCode(page.index, resource.total)}</span>
          <span className="reader-outline-page">{page.index + 1}</span>
        </button>
      </li>
    ))}
  </ul>;

  if (mobile) return <MobileSheet title={title} side showHandle={false} overlayClassName="reader-outline-drawer" onClose={onClose}>{list}</MobileSheet>;
  return createPortal(
    <aside ref={panel} className="reader-tool-panel reader-display-sidebar reader-outline-sidebar" tabIndex={-1} role="dialog"
      aria-label={title} onKeyDown={event => event.stopPropagation()}>
      <div className="reader-sidebar-heading"><strong>{title}</strong></div>
      <div className="reader-sidebar-content">{list}</div>
    </aside>, document.body,
  );
}
