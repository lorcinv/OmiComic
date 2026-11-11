import { useLayoutEffect, useRef, type RefObject } from 'react';
import { readViewMemory, saveViewMemory } from '../library/viewMemory';

type ScrollPosition = { top: number; left: number };

// For ordinary pages and panels. Virtualized library lists retain an item
// anchor in useContinuousLibrary instead, so changing density remains accurate.
export function useRememberedScroll<T extends HTMLElement>(container: RefObject<T>, key: string, enabled = true) {
  const binding = useRef<{ element: T; key: string; restore: () => void; dispose: () => void }>();
  useLayoutEffect(() => {
    const element = container.current;
    if (binding.current && (!enabled || binding.current.element !== element || binding.current.key !== key)) {
      binding.current.dispose(); binding.current = undefined;
    }
    if (!enabled || !element) return;
    if (binding.current) { binding.current.restore(); return; }
    const saved = readViewMemory<ScrollPosition>(`scroll:${key}`);
    let pending: ScrollPosition | undefined = saved && Number.isFinite(saved.top) && Number.isFinite(saved.left)
      ? { top: Math.max(0, saved.top), left: Math.max(0, saved.left) } : { top: 0, left: 0 };
    let frame = 0;
    const restore = () => {
      if (!pending || !element.clientHeight || !element.clientWidth) return;
      // Async content can initially have no scroll range. Keep the saved target
      // until the content is tall enough, instead of replacing it with zero.
      if (element.scrollHeight - element.clientHeight + 1 < pending.top || element.scrollWidth - element.clientWidth + 1 < pending.left) return;
      element.scrollTop = pending.top; element.scrollLeft = pending.left; pending = undefined;
    };
    const save = () => { if (!pending) saveViewMemory(`scroll:${key}`, { top: element.scrollTop, left: element.scrollLeft }); };
    const takeOver = () => { pending = undefined; };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; restore(); }); };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    const mutation = new MutationObserver(schedule);
    mutation.observe(element, { childList: true, subtree: true });
    element.addEventListener('scroll', save, { passive: true });
    element.addEventListener('wheel', takeOver, { passive: true });
    element.addEventListener('touchstart', takeOver, { passive: true });
    element.addEventListener('pointerdown', takeOver, { passive: true });
    element.addEventListener('keydown', takeOver);
    element.addEventListener('load', schedule, true);
    restore(); schedule();
    binding.current = { element, key, restore, dispose: () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect();
      element.removeEventListener('scroll', save); element.removeEventListener('wheel', takeOver);
      element.removeEventListener('touchstart', takeOver); element.removeEventListener('pointerdown', takeOver);
      element.removeEventListener('keydown', takeOver); element.removeEventListener('load', schedule, true);
    } };
  });
  useLayoutEffect(() => () => { binding.current?.dispose(); binding.current = undefined; }, []);
}
