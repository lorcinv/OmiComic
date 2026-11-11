import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { readViewMemory, saveViewMemory } from '../library/viewMemory';

type ListPosition = { index: number; fraction: number; id?: string };

// Page numbers are row-aligned landmarks in one continuous, virtualized list.
export function useContinuousLibrary(container: RefObject<HTMLDivElement>, enabled: boolean,
  count: number, requestedColumns: number, requestedPageSize: number, resetKey: string, exactPageSize = false, identities?: readonly string[]) {
  // Responsive CSS can override the saved desktop card scale (phones use two columns).
  const [layoutColumns, setLayoutColumns] = useState<number | null>(null);
  const columns = layoutColumns ?? requestedColumns;
  const [view, setView] = useState({ stride: 400, height: 800, row: 0, bottom: false, gap:14, count });
  const viewRef = useRef(view);
  const anchor = useRef<ListPosition>({ index: 0, fraction: 0 });
  const positions = useRef(new Map<string, ListPosition>());
  function positionFor(key: string): ListPosition {
    const cached = positions.current.get(key);
    if (cached) return cached;
    const saved = readViewMemory<ListPosition>(`list:${key}`);
    const position = saved && Number.isFinite(saved.index) && saved.index >= 0 && Number.isFinite(saved.fraction)
      ? { index: Math.floor(saved.index), fraction: Math.max(0, Math.min(1, saved.fraction)), id: saved.id }
      : { index: 0, fraction: 0 };
    positions.current.set(key, position);
    return position;
  }
  const lastIdentities = useRef(identities);
  const previous = useRef({ key: '', columns, stride: 400, gap:14 });
  const lastElement = useRef<HTMLDivElement | null>(null);
  const rows = Math.ceil(count / columns);
  const rowsPerPage = Math.max(1, Math.ceil(requestedPageSize / columns));
  const pageSize = exactPageSize ? requestedPageSize : rowsPerPage * columns;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  // Mount the destination's cards before measuring it. Reusing the outgoing row
  // can leave a short folder empty or briefly show its old scrolled window.
  const resetting = previous.current.key !== resetKey;
  const visibleRow = resetting ? Math.floor(Math.min(positionFor(resetKey).index, Math.max(0, count - 1)) / columns) : view.row;
  const page = !resetting && view.bottom && view.count === count ? pages : Math.min(pages, Math.floor(visibleRow * columns / pageSize) + 1);
  const windowRows = Math.ceil(view.height / view.stride) + (exactPageSize ? 8 : 6);
  const startRow = Math.max(0, Math.min(visibleRow - 3, rows - windowRows));
  const endRow = Math.min(rows, startRow + windowRows);
  const height = Math.max(0, rows * view.stride - view.gap);
  const measureRef = useRef(() => {});

  function contentTop(element: HTMLDivElement) {
    const grid = element.querySelector<HTMLElement>('.resource-list,.bookshelf-folder-grid');
    if (!grid) return parseFloat(getComputedStyle(element).paddingTop) || 0;
    // Account for the bookshelf category rail, without counting virtual padding.
    return grid.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop
      - (grid.parentElement?.classList.contains('library-virtual-canvas') ? parseFloat(grid.style.top) || 0 : 0);
  }
  function sync() {
    const element = container.current;
    if (!enabled || !element || previous.current.key !== resetKey || !count) return;
    const stride = previous.current.stride;
    const padding = contentTop(element);
    const position = Math.max(0, element.scrollTop - padding) / stride;
    // scrollTop may be rounded to a device pixel; tolerate that at row landmarks.
    const row = Math.min(Math.max(0, rows - 1), Math.floor(position + 1 / stride));
    anchor.current = { index: row * columns, fraction: Math.max(0, position - row), id: identities?.[row * columns] };
    positions.current.delete(previous.current.key);
    positions.current.set(previous.current.key, { ...anchor.current });
    saveViewMemory(`list:${previous.current.key}`, { ...anchor.current });
    if (positions.current.size > 160) positions.current.delete(positions.current.keys().next().value!);
    // Fractional rows and browser scroll rounding can leave up to one grid gap
    // after restoring a rotated layout. That empty tail still belongs to the last page.
    const bottom = element.scrollTop > 0 && element.scrollHeight - element.clientHeight - element.scrollTop <= Math.max(2, previous.current.gap);
    const old = viewRef.current;
    if (old.row !== row || old.bottom !== bottom || old.stride !== stride || old.height !== element.clientHeight || old.gap !== previous.current.gap || old.count !== count) {
      viewRef.current = { row, bottom, stride, height: element.clientHeight, gap:previous.current.gap, count };
      setView(viewRef.current);
    }
  }

  measureRef.current = () => {
    const element = container.current;
    if (!enabled || !element) return;
    const card = element.querySelector<HTMLElement>('.resource-card,.mobile-bookshelf-card,.bookshelf-folder-card');
    const grid = element.querySelector<HTMLElement>('.resource-list,.bookshelf-folder-grid');
    if (!card || !grid) return;
    const actualColumns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
    if (actualColumns > 0 && actualColumns !== columns) {
      setLayoutColumns(actualColumns);
      return;
    }
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    // Fractional column widths can make cards in one row slightly different in
    // height. CSS grid uses the tallest card, so the virtual stride must too.
    const firstRow = [...grid.querySelectorAll<HTMLElement>('.resource-card,.mobile-bookshelf-card,.bookshelf-folder-card')].slice(0, columns);
    const stride = Math.round((Math.max(...firstRow.map(item => item.getBoundingClientRect().height)) + gap) * 64) / 64;
    if (stride <= 14) return;
    const old = previous.current;
    const reset = old.key !== resetKey;
    const changed = old.columns !== columns || Math.abs(old.stride - stride) > .1 || lastElement.current !== element;
    // Appending hits does not move the current anchor. Avoid writing scrollTop
    // on every batch: that interrupts touch momentum and wheel scrolling.
    const reordered = lastIdentities.current !== identities && !!anchor.current.id && identities?.[anchor.current.index] !== anchor.current.id;
    lastIdentities.current = identities;
    lastElement.current = element;
    previous.current = { key: resetKey, columns, stride, gap };
    // Update the scroll extent before restoring, so the browser cannot clamp the
    // new position against the previous layout's shorter canvas.
    const canvas = element.querySelector<HTMLElement>('.library-virtual-canvas');
    if (canvas) canvas.style.height = `${Math.max(0, rows * stride - gap)}px`;
    if (reset) {
      anchor.current = { ...positionFor(resetKey) };
      if (anchor.current.id && identities) { const index = identities.indexOf(anchor.current.id); if (index >= 0) anchor.current.index = index; }
      const row = Math.floor(Math.min(anchor.current.index, Math.max(0, count - 1)) / columns);
      element.scrollTop = row * stride + anchor.current.fraction * stride + (row ? contentTop(element) : 0);
    } else if (changed || reordered) {
      // Keep the same first visible item when the window or column count changes.
      if (anchor.current.id && identities) { const index = identities.indexOf(anchor.current.id); if (index >= 0) anchor.current.index = index; }
      const row = Math.floor(Math.min(anchor.current.index, Math.max(0, count - 1)) / columns);
      element.scrollTop = row * stride + anchor.current.fraction * stride + (row ? contentTop(element) : 0);
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
    const padding = contentTop(element);
    element.scrollTo({ top: safe === 1 ? 0 : Math.ceil((safe - 1) * pageSize / columns) * previous.current.stride + padding, behavior: 'instant' });
    sync();
  }
  return { start: startRow * columns, end: Math.min(count, endRow * columns), offset: startRow * view.stride,
    visibleStart:visibleRow*columns, visibleEnd:Math.min(count,(visibleRow+Math.ceil(view.height/view.stride)+1)*columns), columns,
    height, bottom:Math.max(0,(rows-endRow)*view.stride), page, pages, pageSize, sync, jump,
    reset: () => { positions.current.delete(resetKey); jump(1); } };
}
