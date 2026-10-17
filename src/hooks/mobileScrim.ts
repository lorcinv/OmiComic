import { useLayoutEffect, useRef } from 'react';

const layers = new Map<symbol, number>();
let element: HTMLDivElement | null = null;
let animation: Animation | null = null;
let target = 0;
function draw(duration = 0) {
  const next = Math.max(0, ...layers.values());
  if (!element) {
    element = document.createElement('div');
    element.className = 'mobile-screen-dimmer';
    element.setAttribute('aria-hidden', 'true');
    element.style.opacity = '0';
    document.body.append(element);
  }
  if (next === target) return;
  const from = Number(getComputedStyle(element).opacity);
  animation?.cancel(); animation = null; target = next;
  element.style.opacity = String(next);
  if (duration && element.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const current = element.animate([{ opacity: from }, { opacity: next }], { duration, easing: 'linear' });
    animation = current;
    void current.finished.then(() => { if (animation === current) animation = null; }).catch(() => undefined);
  }
}
/** One shade for the whole mobile overlay stack. Replacing a layer in one
 * React commit must not remove and recreate the shade between those layers. */
export function useMobileScrim(enabled = true, initial = 1) {
  const token = useRef(Symbol('mobile-overlay'));
  const openingFloor = useRef(0);
  const inheritedFloor = useRef<number | null>(null);
  const controller = useRef({
    set(value: number, duration = 0) {
      if (!layers.has(token.current)) return;
      if (duration > 0 || value === 1) openingFloor.current = 0;
      layers.set(token.current, Math.max(value, openingFloor.current)); draw(duration);
    },
  });
  useLayoutEffect(() => {
    if (!enabled) return;
    const key = token.current;
    // StrictMode replays this effect for the same layer; its own previous
    // drag progress must not become a minimum opacity when the finger reverses.
    inheritedFloor.current ??= initial === 0 ? target : 0;
    openingFloor.current = inheritedFloor.current;
    layers.set(key, Math.max(initial, openingFloor.current)); draw(initial ? 180 : 0);
    return () => {
      layers.delete(key);
      // New layers register synchronously before this runs, including StrictMode.
      queueMicrotask(() => draw(180));
    };
  }, [enabled]);
  return controller.current;
}
