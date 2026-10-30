import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { animateReaderMotion, pageSettleProgress } from '../reader/transitionAnimation';
import { estimateReleaseVelocity, MOTION_SAMPLE_WINDOW_MS, type MotionSample } from '../reader/motion';

type Target = { index: number; key: string };
const resting = { offset: 0, direction: 0 as -1 | 0 | 1, target: null as Target | null, settling: false };
const resistance = (distance: number, extent: number) => distance * .35 / (1 + Math.abs(distance) / (extent * .45));
const unresist = (offset: number, extent: number) => offset / Math.max(.01, .35 - Math.abs(offset) / (extent * .45));

/** A bounded two-group transition. The incoming group stays until the actual
 * reader confirms that its decoded replacement is visible. */
export default function useMobilePageSwipe(stage: RefObject<HTMLDivElement>, enabled: boolean, rtl: boolean, shownKey: string, getTarget: (direction: 1 | -1) => Target | null, prepare: (index: number) => void, navigate: (index: number) => void) {
  const [view, setView] = useState(resting), current = useRef(resting), ready = useRef(''), pending = useRef('');
  const animation = useRef(() => {});
  const waiting = useRef<{ key: string; run: () => void; timer: number } | null>(null);
  const point = useRef<{ id: number; x: number; y: number; origin: number; slop: number; dragging: boolean; samples: MotionSample[] } | null>(null);
  const config = useRef({ enabled, rtl, getTarget, prepare, navigate }); config.current = { enabled, rtl, getTarget, prepare, navigate };
  const extent = () => Math.max(1, stage.current?.clientWidth ?? 1);
  const update = (next: typeof resting) => { current.current = next; setView(next); };
  const stopWaiting = () => { if (waiting.current) clearTimeout(waiting.current.timer); waiting.current = null; };
  const clear = () => { stopWaiting(); animation.current(); point.current = null; ready.current = ''; pending.current = ''; update(resting); };
  useLayoutEffect(clear, [shownKey, rtl]);
  useEffect(() => { if (!enabled) clear(); return () => { stopWaiting(); animation.current(); }; }, [enabled]);

  const sample = (event: PointerEvent<HTMLDivElement>) => {
    const samples = point.current!.samples;
    samples.push({ x: event.clientX, y: event.clientY, time: event.timeStamp });
    while (samples.length > 1 && samples[0].time < event.timeStamp - MOTION_SAMPLE_WINDOW_MS) samples.shift();
  };
  const settle = (destination: number, velocity: number, complete: () => void) => {
    animation.current();
    const snapshot = current.current, distance = Math.abs(destination - snapshot.offset), width = extent();
    // As in a native pager, remaining distance and release velocity determine
    // duration. Both surfaces receive the same quintic deceleration each frame.
    const influence = width / 2 * (1 + Math.sin((Math.min(1, distance / width) - .5) * .47123894));
    const followsVelocity = (destination - snapshot.offset) * velocity > 0 && Math.abs(velocity) > .4;
    const duration = Math.max(120, Math.min(360, followsVelocity ? 4 * influence / Math.abs(velocity) : (distance / width + 1) * 160));
    if (distance < .5) { update({ ...snapshot, offset: destination, settling: true }); complete(); return; }
    update({ ...snapshot, settling: true });
    animation.current = animateReaderMotion(duration, progress => {
      update({ ...snapshot, offset: snapshot.offset + (destination - snapshot.offset) * pageSettleProgress(progress), settling: true });
    }, complete);
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!config.current.enabled || event.pointerType !== 'touch' || !event.isPrimary || (event.target as Element).closest('button,input,a,select,textarea')) return false;
    if (pending.current) { event.preventDefault(); return true; }
    stopWaiting();
    const snapshot = current.current, resuming = snapshot.settling && Math.abs(snapshot.offset) > .5;
    animation.current();
    point.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: snapshot.target ? snapshot.offset : unresist(snapshot.offset, extent()), slop: 0, dragging: resuming, samples: [{ x: event.clientX, y: event.clientY, time: event.timeStamp }] };
    if (resuming) { update({ ...snapshot, settling: false }); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }
    return resuming;
  };
  const move = (event: PointerEvent<HTMLDivElement>, overflow?: number) => {
    const start = point.current; if (!start || event.pointerId !== start.id) return false;
    const dx = overflow ?? event.clientX - start.x, dy = event.clientY - start.y;
    sample(event);
    if (!start.dragging) {
      if (Math.abs(dx) < 8) return false;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { point.current = null; return false; }
      start.slop = Math.sign(dx) * 8;
      start.dragging = true; event.currentTarget.setPointerCapture(event.pointerId);
    }
    const raw = start.origin + dx - start.slop;
    const direction = (raw < 0 ? 1 : -1) * (config.current.rtl ? -1 : 1) as 1 | -1;
    const target = config.current.getTarget(direction);
    if (target?.key !== current.current.target?.key) {
      ready.current = ''; if (target) config.current.prepare(target.index);
    }
    // The current group tracks the finger even while the neighbour decodes.
    // Readiness controls the final handoff, never the drag distance.
    update({ offset: target ? Math.max(-extent(), Math.min(extent(), raw)) : resistance(raw, extent()), direction, target, settling: false });
    event.preventDefault(); return true;
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const start = point.current; if (!start || event.pointerId !== start.id) return false;
    sample(event); point.current = null; if (!start.dragging) return false;
    const snapshot = current.current, velocity = estimateReleaseVelocity(start.samples, false).x;
    const fling = Math.abs(velocity) > .4 && Math.abs(snapshot.offset) > 25;
    const commit = snapshot.target && (fling ? velocity * snapshot.offset > 0 : Math.abs(snapshot.offset) > extent() * .28);
    const target = snapshot.target;
    if (commit && target) {
      const finish = () => settle(snapshot.direction * (config.current.rtl ? 1 : -1) * extent(), velocity, () => {
        pending.current = target.key; config.current.navigate(target.index);
      });
      if (ready.current === target.key) finish();
      else {
        // A fast release can precede the second page's decode. Keep the finger's
        // final pose until the complete neighbour is ready, then finish once.
        // A new gesture cancels this wait and immediately resumes tracking.
        waiting.current = { key: target.key, run: finish, timer: window.setTimeout(() => { waiting.current = null; settle(0, 0, clear); }, 1500) };
      }
    } else settle(0, velocity, clear);
    event.preventDefault(); return true;
  };
  const cancel = (event?: PointerEvent<HTMLDivElement>) => {
    if (event && point.current?.id !== event.pointerId) return;
    const dragging = point.current?.dragging; point.current = null;
    if (event && dragging) settle(0, 0, clear);
    else clear();
  };
  return { ...view, down, move, up, cancel, onPrepared: (key: string) => { if (key !== current.current.target?.key) return; ready.current = key; const queued = waiting.current; if (queued?.key === key) { stopWaiting(); queued.run(); } }, screenDirection: view.direction * (rtl ? -1 : 1) };
}
