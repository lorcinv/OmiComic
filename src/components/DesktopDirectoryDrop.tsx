import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { t } from '../i18n';
import { isAndroid } from '../platform';
import '../styles/directoryDrop.css';

export default function DesktopDirectoryDrop({ onAdded }: { onAdded: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState('');
  const [pane, setPane] = useState({ x: innerWidth / 2, y: innerHeight / 2, width: innerWidth });
  const added = useRef(onAdded);
  added.current = onAdded;

  useLayoutEffect(() => {
    if (!dragging && !message) return;
    const target = document.querySelector<HTMLElement>('.page-panel.is-visible .library-main, .page-panel.is-visible .reader-layout')
      ?? document.querySelector<HTMLElement>('.omi-home, .app-content');
    const measure = () => {
      const rect = target?.getBoundingClientRect();
      const next = rect?.width && rect.height
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width }
        : { x: innerWidth / 2, y: innerHeight / 2, width: innerWidth };
      setPane(old => old.x === next.x && old.y === next.y && old.width === next.width ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  });
  const paneStyle = { '--drop-center-x': `${pane.x}px`, '--drop-center-y': `${pane.y}px`, '--drop-pane-width': `${pane.width}px` } as CSSProperties;

  useEffect(() => {
    const importDirectory = window.omicomic.importDroppedDirectory;
    if (isAndroid() || !importDirectory) return;
    let live = true, busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const notify = (text: string) => {
      if (!live) return;
      setMessage(text);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(''), 6000);
    };
    const reset = () => { if (live) setDragging(false); };
    const isFileDrop = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const over = (event: DragEvent) => {
      if (!isFileDrop(event)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    };
    const leave = (event: DragEvent) => {
      if (event.currentTarget !== document) return;
      if (!event.relatedTarget && (event.target === document.documentElement
        || (event.target instanceof Element && event.target.classList.contains('directory-drop-overlay'))
        || event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight)) reset();
    };
    const drop = (event: DragEvent) => {
      if (!isFileDrop(event)) return;
      event.preventDefault(); event.stopPropagation(); reset();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length !== 1) { notify('请每次拖入一个文件夹。'); return; }
      if (busy) { notify('目录正在添加，请稍候。'); return; }
      busy = true;
      void importDirectory(files[0]).then(result => {
        if (!live) return;
        if (!result.ok) { notify(result.error.message); return; }
        if (!result.data.alreadyAdded) added.current();
        notify(result.data.alreadyAdded ? '该目录已在资源库中。' : '目录已加入资源库。');
      }).catch(() => notify('目录添加失败，请检查文件夹是否存在并且可以访问。')).finally(() => { busy = false; });
    };
    const listen = (target: Document) => {
      target.addEventListener('dragenter', over, true);
      target.addEventListener('dragover', over, true);
      target.addEventListener('dragleave', leave, true);
      target.addEventListener('drop', drop, true);
      target.addEventListener('dragend', reset, true);
      return () => {
        target.removeEventListener('dragenter', over, true);
        target.removeEventListener('dragover', over, true);
        target.removeEventListener('dragleave', leave, true);
        target.removeEventListener('drop', drop, true);
        target.removeEventListener('dragend', reset, true);
      };
    };
    const unlisten = listen(document);
    // EPUB chapters are same-origin sandboxed frames. Their DOM events do not
    // bubble to the app document, so register the same drop handling there.
    const frames = new Map<HTMLIFrameElement, () => void>();
    const scanFrames = () => {
      for (const [frame, dispose] of frames) if (!frame.isConnected) { dispose(); frames.delete(frame); }
      for (const frame of document.querySelectorAll('iframe')) {
        if (frames.has(frame)) continue;
        let disposeDocument: (() => void) | undefined;
        const loaded = () => {
          disposeDocument?.(); disposeDocument = undefined;
          try { if (frame.contentDocument) disposeDocument = listen(frame.contentDocument); } catch { /* A foreign frame cannot access local files. */ }
        };
        frame.addEventListener('load', loaded); loaded();
        frames.set(frame, () => { frame.removeEventListener('load', loaded); disposeDocument?.(); });
      }
    };
    scanFrames();
    const observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.tagName === 'IFRAME' || node.querySelector('iframe'))))) scanFrames();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('blur', reset);
    return () => {
      live = false; clearTimeout(timer); unlisten(); observer.disconnect();
      for (const dispose of frames.values()) dispose();
      window.removeEventListener('blur', reset);
    };
  }, []);

  return <>
    {dragging && <div className="directory-drop-overlay" style={paneStyle} aria-hidden="true">
      <div className="directory-drop-card">
        <svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 9V6h9l3 3h12v17H4V9Z"/><path d="M16 13v9m-4-4 4 4 4-4"/></svg>
        <strong>{t('松开添加到资源库')}</strong>
        <span>{t('每次拖入一个文件夹')}</span>
      </div>
    </div>}
    {message && <div className="directory-drop-notice" style={paneStyle} role="status"><span>{t(message).replace(/[。．.]+$/u, '')}</span><button type="button" aria-label={t('关闭')} onClick={() => setMessage('')}>×</button></div>}
  </>;
}
