/** Pure, frame-rate independent reader motion. Velocities are CSS pixels/ms. */
export interface MotionSample { x: number; y: number; time: number }
export const MOTION_SAMPLE_WINDOW_MS = 120;
export const MAX_MOTION_SPEED = 3.2;
export const MIN_MOTION_SPEED = 0.015;
const DECAY_TIME_MS = 240;

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

export function advanceInertia(velocity: number, elapsedMs: number): { distance: number; velocity: number } {
  if (!Number.isFinite(velocity) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return { distance: 0, velocity };
  const decay = Math.exp(-elapsedMs / DECAY_TIME_MS);
  return { distance: velocity * DECAY_TIME_MS * (1 - decay), velocity: velocity * decay };
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
