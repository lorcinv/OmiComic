import { useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react';

export const READER_DOUBLE_TAP_MS = 200;
export const READER_DOUBLE_TAP_MIN_MS = 180;
const TAP_DISTANCE = 30, DRAG_DISTANCE = 8;
type Tap = { x: number; y: number; time: number; deadline: number; consumed: boolean };

/** Android touch taps share one decision: either one confirmed tap or a zoom. */
export default function useReaderDoubleTap(stage: RefObject<HTMLDivElement>, enabled: boolean, resetKey: string,
  onSingle: (x: number, y: number) => void, onDouble: (x: number, y: number) => void) {
  const config = useRef({ enabled, onSingle, onDouble });
  config.current = { enabled, onSingle, onDouble };
  const pending = useRef<Tap | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const pointer = useRef<{ id: number; x: number; y: number; time: number; second: boolean } | null>(null);
  const clearTimer = () => { clearTimeout(timer.current); timer.current = undefined; };
  const cancel = () => { clearTimer(); pending.current = null; pointer.current = null; };
  const confirm = () => {
    const tap = pending.current; clearTimer(); pending.current = null;
    if (tap && !tap.consumed && config.current.enabled) config.current.onSingle(tap.x, tap.y);
  };
  useLayoutEffect(() => { cancel(); return cancel; }, [enabled, resetKey]);
  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => { if (!stage.current?.contains(event.target as Node)) cancel(); };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    window.addEventListener('omi-pause', cancel);
    document.addEventListener('visibilitychange', cancel);
    return () => {
      cancel(); window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel);
      window.removeEventListener('omi-pause', cancel); document.removeEventListener('visibilitychange', cancel);
    };
  }, [stage]);
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!config.current.enabled) return;
    if (event.pointerType !== 'touch' || !event.isPrimary || event.button !== 0
      || (event.target as Element).closest('button,input,a,select,textarea,[contenteditable=true]')) { cancel(); return; }
    const tap = pending.current;
    const second = Boolean(tap && event.timeStamp >= tap.time && event.timeStamp <= tap.deadline
      && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < TAP_DISTANCE);
    // Reserve the second tap before its UP so the first tap cannot turn a page
    // while the finger is still held or starts dragging.
    if (second) clearTimer(); else confirm();
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, second };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= DRAG_DISTANCE) cancel();
  };
  const tap = (event: PointerEvent<HTMLDivElement>, consumed = false) => {
    if (!config.current.enabled || event.pointerType !== 'touch') return false;
    const start = pointer.current; pointer.current = null;
    if (!start || start.id !== event.pointerId) { cancel(); return true; }
    if (start.second && pending.current) {
      cancel(); config.current.onDouble(event.clientX, event.clientY);
    } else {
      // A tap that stops inertia can still start a double tap, but must never
      // turn a page by itself when the double-tap window expires.
      // Credit the first press, retaining at least 180 ms after release for a
      // second tap. Very short taps never wait longer than the old 200 ms.
      const held=Math.max(0,event.timeStamp-start.time);
      const delay=Math.max(READER_DOUBLE_TAP_MIN_MS,READER_DOUBLE_TAP_MS-held);
      pending.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, deadline: event.timeStamp+delay, consumed };
      timer.current = setTimeout(confirm, delay);
    }
    return true;
  };
  const lostCapture = (event: PointerEvent<HTMLDivElement>) => { if (pointer.current?.id === event.pointerId) cancel(); };
  return { down, move, tap, cancel, lostCapture };
}
