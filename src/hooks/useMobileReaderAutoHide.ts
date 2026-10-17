import { useEffect, useRef } from 'react';

/** Hide only idle mobile chrome. Page renders and autoplay must not reset the
 * clock, and a held pointer or an open reader panel must never lose its UI. */
export default function useMobileReaderAutoHide(active: boolean, visible: boolean, enabled: boolean, paused: boolean, onHide: () => void) {
  const hide = useRef(onHide); hide.current = onHide;
  useEffect(() => {
    if (!active || !visible || !enabled || paused) return;
    let timer: number | undefined;
    let disposed = false, suspended = false;
    const pointers = new Set<number>();
    const clear = () => { window.clearTimeout(timer); timer = undefined; };
    const arm = () => {
      clear();
      if (disposed || suspended || document.hidden || pointers.size || document.activeElement?.matches('input,textarea,[contenteditable="true"]')) return;
      timer = window.setTimeout(() => hide.current(), 3000);
    };
    const inside = (event: Event) => event.target instanceof Element && Boolean(event.target.closest('.is-mobile-reader'));
    const down = (event: PointerEvent) => { if (inside(event)) { pointers.add(event.pointerId); clear(); } };
    const up = (event: PointerEvent) => { if (pointers.delete(event.pointerId)) arm(); };
    const activity = (event: Event) => { if (inside(event) || event.type === 'keydown' || event.type.startsWith('omi-volume-')) arm(); };
    const focus = () => queueMicrotask(arm);
    const suspend = () => { suspended = true; pointers.clear(); clear(); };
    const resume = () => { suspended = false; arm(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('wheel', activity, { passive: true, capture: true });
    document.addEventListener('keydown', activity, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', focus);
    document.addEventListener('visibilitychange', arm);
    window.addEventListener('omi-volume-up', activity);
    window.addEventListener('omi-volume-down', activity);
    window.addEventListener('omi-resume', resume);
    window.addEventListener('omi-pause', suspend);
    window.addEventListener('pagehide', suspend);
    window.addEventListener('pageshow', resume);
    arm();
    return () => {
      disposed = true;
      clear();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('wheel', activity, true);
      document.removeEventListener('keydown', activity, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', focus);
      document.removeEventListener('visibilitychange', arm);
      window.removeEventListener('omi-volume-up', activity);
      window.removeEventListener('omi-volume-down', activity);
      window.removeEventListener('omi-resume', resume);
      window.removeEventListener('omi-pause', suspend);
      window.removeEventListener('pagehide', suspend);
      window.removeEventListener('pageshow', resume);
    };
  }, [active, visible, enabled, paused]);
}
