/** Pure, frame-rate independent reader motion. Velocities are CSS pixels/ms. */
export interface MotionSample { x: number; y: number; time: number }
export const MOTION_SAMPLE_WINDOW_MS = 120;
export const MAX_MOTION_SPEED = 12;
export const MIN_MOTION_SPEED = 0.015;
const DECAY_TIME_MS = 240;

/** CSS pointer coordinates already include the OS mouse curve. Keep slow drags
 * precise and add a continuous gain for deliberate fast mouse sweeps. */
export function mouseDragGain(speed: number): number {
  const progress = Math.max(0, Math.min(1, (Math.abs(speed) - 0.45) / 3.55));
  return 1 + 1.6 * progress * progress * (3 - 2 * progress);
}

export function acceleratedMouseVelocity(speed: number): number {
  return Math.max(-MAX_MOTION_SPEED, Math.min(MAX_MOTION_SPEED, speed * mouseDragGain(speed)));
}

/** Preserve precise finger placement; a deliberate sweep gains distance smoothly.
 * CSS pixels keep the same response on phones and tablets at different densities. */
export function touchDragGain(speed: number): number {
  const progress = Math.max(0, Math.min(1, (Math.abs(speed) - 0.45) / 2.55));
  return 1 + 0.65 * progress * progress * (3 - 2 * progress);
}

export function acceleratedTouchVelocity(speed: number): number {
  return Math.max(-MAX_MOTION_SPEED, Math.min(MAX_MOTION_SPEED, speed * touchDragGain(speed)));
}

/** UP may correct an extrapolated MOVE by tens of pixels. Only movement while
 * held can establish a reversal; lifting must not pull the strip backwards. */
export function touchReleaseSample(samples: readonly MotionSample[], release: MotionSample, vertical: boolean): MotionSample {
  const last = samples[samples.length - 1];
  if (!last) return release;
  const velocity = estimateTouchVelocity(samples, vertical);
  const speed = vertical ? velocity.y : velocity.x;
  const delta = vertical ? release.y - last.y : release.x - last.x;
  if (delta * speed < 0) return vertical ? { ...release, y: last.y } : { ...release, x: last.x };
  return release;
}

/** A finger reversal must replace, rather than average with, the previous sweep. */
export function estimateTouchVelocity(samples: readonly MotionSample[], vertical: boolean): { x: number; y: number } {
  if (samples.length < 2) return { x: 0, y: 0 };
  const end = samples[samples.length - 1];
  let first = samples.findIndex(sample => sample.time >= end.time - 80);
  let direction = 0, runDistance = 0;
  for (let i = samples.length - 1; i > first; i--) {
    const delta = vertical ? samples[i].y - samples[i - 1].y : samples[i].x - samples[i - 1].x;
    if (Math.abs(delta) < 0.5) continue;
    if (direction && Math.sign(delta) !== direction) {
      // WebView can extrapolate the last MOVE beyond the physical UP position.
      // A small correction is not a deliberate reversal of the whole fling.
      if (runDistance >= 12) { first = i; break; }
      runDistance = 0;
    }
    direction = Math.sign(delta);runDistance += Math.abs(delta);
  }
  return estimateReleaseVelocity(samples.slice(first), vertical);
}

/** Fast touch flings travel farther without changing speed at finger release. */
export function touchInertiaTime(speed: number): number {
  return DECAY_TIME_MS + 160 * Math.min(1, Math.abs(speed) / 4);
}

export function estimateReleaseVelocity(samples: readonly MotionSample[], vertical: boolean): { x: number; y: number } {
  if (samples.length < 2) return { x: 0, y: 0 };
  const end = samples[samples.length - 1];
  const first = samples.findIndex(sample => sample.time >= end.time - MOTION_SAMPLE_WINDOW_MS);
  let lastMovement = first;
  for (let i = first + 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (Math.abs(vertical ? current.y - previous.y : current.x - previous.x) > 0.1) lastMovement = i;
  }
  if (lastMovement <= first) return { x: 0, y: 0 };
  // Ignore the stationary release event in the regression, then attenuate a pause
  // continuously. A tiny delay at pointer-up must not abruptly erase momentum.
  const movingEnd = samples[lastMovement];
  const pause = Math.max(0, end.time - movingEnd.time);
  const attenuation = Math.max(0, 1 - pause / MOTION_SAMPLE_WINDOW_MS) ** 2;
  let weight = 0, timeSum = 0, positionSum = 0;
  for (let i = first; i <= lastMovement; i++) {
    const sample = samples[i];
    const w = 0.35 + 0.65 * (sample.time - samples[first].time) / Math.max(1, movingEnd.time - samples[first].time);
    weight += w;
    timeSum += (sample.time - samples[first].time) * w;
    positionSum += (vertical ? sample.y : sample.x) * w;
  }
  const meanTime = timeSum / weight, meanPosition = positionSum / weight;
  let variance = 0, covariance = 0;
  for (let i = first; i <= lastMovement; i++) {
    const sample = samples[i];
    const w = 0.35 + 0.65 * (sample.time - samples[first].time) / Math.max(1, movingEnd.time - samples[first].time);
    const delta = sample.time - samples[first].time - meanTime;
    variance += w * delta * delta;
    covariance += w * delta * ((vertical ? sample.y : sample.x) - meanPosition);
  }
  const speed = variance < 0.01 ? 0 : Math.max(-MAX_MOTION_SPEED, Math.min(MAX_MOTION_SPEED, covariance / variance)) * attenuation;
  return vertical ? { x: 0, y: speed } : { x: speed, y: 0 };
}

export function advanceInertia(velocity: number, elapsedMs: number, decayTimeMs = DECAY_TIME_MS): { distance: number; velocity: number } {
  if (!Number.isFinite(velocity) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return { distance: 0, velocity };
  const decay = Math.exp(-elapsedMs / decayTimeMs);
  return { distance: velocity * decayTimeMs * (1 - decay), velocity: velocity * decay };
}

/** Keep speculation bounded separately from the indispensable visible working set. */
export function trimPrefetchBuffer<T>(buffer: Map<number, T>, center: number, maxBytes: number, sizeOf: (entry: T) => number, radius = 40): void {
  let bytes = 0;
  for (const [index, value] of buffer) {
    if (Math.abs(index - center) > radius) buffer.delete(index);
    else bytes += sizeOf(value);
  }
  if (bytes <= maxBytes) return;
  const farthestFirst = [...buffer.keys()].sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
  for (const index of farthestFirst) {
    if (bytes <= maxBytes) break;
    // Nearby pages may exceed the budget individually; retain only a tiny
    // working set so they can be committed and displayed rather than reloaded.
    if (Math.abs(index - center) <= 2) continue;
    bytes -= sizeOf(buffer.get(index)!);
    buffer.delete(index);
  }
}
