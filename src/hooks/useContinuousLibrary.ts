import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

// Page numbers are row-aligned landmarks in one continuous, virtualized list.
export function useContinuousLibrary(container: RefObject<HTMLDivElement>, enabled: boolean,
  count: number, columns: number, requestedPageSize: number, resetKey: string) {
  const [view, setView] = useState({ stride: 400, height: 800, row: 0, bottom: false });
  const viewRef = useRef(view);
  const anchor = useRef({ index: 0, fraction: 0 });
  const previous = useRef({ key: resetKey, columns, stride: 400 });
  const lastElement = useRef<HTMLDivElement | null>(null);
  const rows = Math.ceil(count / columns);
  const rowsPerPage = Math.max(1, Math.ceil(requestedPageSize / columns));
  const pageSize = rowsPerPage * columns;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = view.bottom ? pages : Math.min(pages, Math.floor(view.row / rowsPerPage) + 1);
  const windowRows = Math.max(rowsPerPage, Math.ceil(view.height / view.stride) + 6);
  const startRow = Math.max(0, Math.min(view.row - 3, rows - windowRows));
  const endRow = Math.min(rows, startRow + windowRows);
  const height = Math.max(0, rows * view.stride - 14);
  const measureRef = useRef(() => {});

  function sync() {
    const element = container.current;
    if (!enabled || !element) return;
    const stride = previous.current.stride;
    const padding = parseFloat(getComputedStyle(element).paddingTop) || 0;
    const position = Math.max(0, element.scrollTop - padding) / stride;
    // scrollTop may be rounded to a device pixel; tolerate that at row landmarks.
    const row = Math.min(Math.max(0, rows - 1), Math.floor(position + 1 / stride));
    anchor.current = { index: row * columns, fraction: Math.max(0, position - row) };
    const bottom = element.scrollTop > 0 && element.scrollHeight - element.clientHeight - element.scrollTop <= 2;
    const old = viewRef.current;
    if (old.row !== row || old.bottom !== bottom || old.stride !== stride || old.height !== element.clientHeight) {
      viewRef.current = { row, bottom, stride, height: element.clientHeight };
      setView(viewRef.current);
    }
  }

  measureRef.current = () => {
    const element = container.current;
    if (!enabled || !element) return;
    const card = element.querySelector<HTMLElement>('.resource-card');
    const grid = element.querySelector<HTMLElement>('.resource-list');
    if (!card || !grid) return;
    const stride = Math.round((card.getBoundingClientRect().height + (parseFloat(getComputedStyle(grid).rowGap) || 14)) * 64) / 64;
    if (stride <= 14) return;
    const old = previous.current;
    const reset = old.key !== resetKey;
    const changed = old.columns !== columns || Math.abs(old.stride - stride) > .1 || lastElement.current !== element;
    lastElement.current = element;
    previous.current = { key: resetKey, columns, stride };
    // Update the scroll extent before restoring, so the browser cannot clamp the
    // new position against the previous layout's shorter canvas.
    const canvas = element.querySelector<HTMLElement>('.library-virtual-canvas');
    if (canvas) canvas.style.height = `${Math.max(0, rows * stride - 14)}px`;
    if (reset) {
      anchor.current = { index: 0, fraction: 0 };
      element.scrollTop = 0;
    } else if (changed) {
      // Keep the same first visible item when the window or column count changes.
      const row = Math.floor(Math.min(anchor.current.index, Math.max(0, count - 1)) / columns);
      element.scrollTop = row * stride + anchor.current.fraction * stride + (row ? parseFloat(getComputedStyle(element).paddingTop) || 0 : 0);
    }
    sync();
  };
  useLayoutEffect(() => { measureRef.current(); });
  useLayoutEffect(() => {
    const element = container.current;
    if (!enabled || !element) return;
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, resetKey, count, container]);

  function jump(target: number) {
    const element = container.current;
    if (!element) return;
    const safe = Math.max(1, Math.min(pages, target));
    const padding = parseFloat(getComputedStyle(element).paddingTop) || 0;
    element.scrollTo({ top: safe === 1 ? 0 : (safe - 1) * rowsPerPage * previous.current.stride + padding, behavior: 'instant' });
    sync();
  }
  return { start: startRow * columns, end: Math.min(count, endRow * columns), offset: startRow * view.stride,
    height, page, pages, pageSize, sync, jump };
}
