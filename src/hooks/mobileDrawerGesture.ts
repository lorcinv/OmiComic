import { flushSync } from 'react-dom';
import { useEffect, useRef, type RefObject } from 'react';

export type DrawerSide = 'left' | 'right';
export type DrawerGesture = { side: DrawerSide; x: number; y: number; currentX: number; time: number };
let opening: DrawerGesture | null = null;
export function takeDrawerGesture(side: DrawerSide): DrawerGesture | null {
  if (opening?.side !== side) return null;
  const gesture = opening; opening = null; return gesture;
}

/** Claim horizontal movement before lifting the finger, then hand the ongoing
 * touch to the mounted drawer. Vertical scrolling remains native. */
export function useMobileDrawerGesture(ref: RefObject<HTMLElement>, enabled: boolean, open: (side: DrawerSide) => boolean): void {
  const callback = useRef(open); callback.current = open;
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    let start: { x: number; y: number; time: number } | null = null;
    const down = (event: TouchEvent) => {
      const target = event.target as Element;
      const touch = event.touches[0];
      start = touch && event.touches.length === 1 && !document.querySelector('.mobile-sheet-overlay,.root-delete-overlay,.settings-window-overlay')
        && !target.closest('input,textarea,[role="slider"],[draggable="true"]')
        ? { x: touch.clientX, y: touch.clientY, time: performance.now() } : null;
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!start || !touch) return;
      const dx = touch.clientX - start.x, dy = touch.clientY - start.y;
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      const side = dx > 0 ? 'left' : 'right';
      opening = { ...start, currentX: touch.clientX, side };
      let accepted = false;
      flushSync(() => { accepted = callback.current(side); });
      opening = null; start = null;
      if (accepted) { event.preventDefault(); event.stopPropagation(); }
    };
    const end = () => { start = null; };
    element.addEventListener('touchstart', down, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', end);
    return () => {
      element.removeEventListener('touchstart', down); element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end); element.removeEventListener('touchcancel', end);
    };
  }, [ref, enabled]);
}
