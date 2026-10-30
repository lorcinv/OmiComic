import { holdDisplaySampling } from './displaySampling';

// Adapted to Omi's persistent web/native surfaces from EhViewer's SmoothScaler
// and SmoothScroller timing. Copyright 2016 Hippo Seven, Apache-2.0.
// Source and license: licenses/reader-motion-EhViewer-NOTICE.txt.
export function zoomRestoreProgress(progress: number) {
  if (progress <= 0 || progress >= 1) return progress;
  // LinearOutSlowInInterpolator: cubic-bezier(0, 0, .2, 1).
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2;
    if (.6 * t * t + .4 * t * t * t < progress) low = t;
    else high = t;
  }
  const t = (low + high) / 2;
  return t * t * (3 - 2 * t);
}

export const pageSettleProgress = (progress: number) => 1 - (1 - progress) ** 5;

/** Each frame updates real geometry, including Android's separate Canvas.
 * Cancelling leaves the last presented position available to the next gesture. */
export function animateReaderMotion(duration: number, update: (progress: number) => void, complete = () => {}) {
  const release = holdDisplaySampling(), started = performance.now();
  let frame = 0, running = true;
  const cancel = () => {
    if (!running) return;
    running = false; cancelAnimationFrame(frame); release();
  };
  const tick = (now: number) => {
    if (!running) return;
    const progress = Math.min(1, Math.max(0, (now - started) / duration));
    update(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else { cancel(); complete(); }
  };
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    update(1); cancel(); complete();
  } else frame = requestAnimationFrame(tick);
  return cancel;
}
