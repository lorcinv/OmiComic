type Source = HTMLImageElement | HTMLCanvasElement;
type Task = { id: number; source: Source; url: string; width: number; height: number; urgent: boolean; cancelled: boolean; finish: (bitmap: ImageBitmap) => void; failed?: () => void };
let worker: Worker | null = null, active: Task | null = null, sequence = 0, timer = 0;
const queue: Task[] = [];

// Decode image URLs in the worker even during long drags. Layout reads, canvas
// snapshots and parent cache accounting still wait for motion to settle.
const REST_MS = 160;
let holds = 0, lastMotion = 0, restTimer = 0;
const resting = new Set<() => void>();
function settle() {
  restTimer = 0;
  const wait = lastMotion + REST_MS - performance.now();
  if (wait > 0) { restTimer = window.setTimeout(settle, wait); return; }
  if (holds) return;
  const runs = [...resting]; resting.clear();
  for (const run of runs) run();
  next();
}
export function displaySamplingMoving() { return holds > 0 || restTimer !== 0; }
export function noteDisplaySamplingMotion() {
  lastMotion = performance.now();
  if (!restTimer) restTimer = window.setTimeout(settle, REST_MS);
}
export function holdDisplaySampling() {
  holds++; noteDisplaySamplingMotion();
  let held = true;
  return () => { if (!held) return; held = false; holds--; noteDisplaySamplingMotion(); };
}
export function afterDisplaySamplingMotion(run: () => void) {
  if (!displaySamplingMoving()) { run(); return () => {}; }
  resting.add(run);
  return () => { resting.delete(run); };
}

export function displaySamplingSize(width: number, height: number, shownWidth: number, shownHeight: number, dpr: number) {
  const targetWidth = Math.max(1, Math.round(shownWidth * dpr)), targetHeight = Math.max(1, Math.round(shownHeight * dpr));
  // Never freeze an enlargement into a low-resolution display copy. Long pages
  // outside this bounded working surface keep the original/tiled renderer.
  if (![width,height,shownWidth,shownHeight,dpr].every(n => Number.isFinite(n) && n > 0)
    || targetWidth * targetHeight > 4_000_000 || targetWidth >= width || targetHeight >= height) return null;
  return { width: targetWidth, height: targetHeight };
}

function next() {
  if (active) return;
  const index = queue.findIndex(task => !displaySamplingMoving() || Boolean(task.url));
  const task = index < 0 ? undefined : queue.splice(index, 1)[0];
  if (!task) {
    if (queue.length) return;
    clearTimeout(timer); timer = window.setTimeout(() => { worker?.terminate(); worker = null; }, 2000); return;
  }
  if (task.cancelled) { next(); return; }
  active = task; clearTimeout(timer);
  const done = () => { if (active !== task) return; clearTimeout(timer); active = null; next(); };
  worker ??= new Worker(new URL('./displaySampling.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<{ id: number; bitmap?: ImageBitmap }>) => {
    const bitmap = event.data.bitmap;
    if (event.data.id !== task.id || active !== task || task.cancelled) { bitmap?.close(); return; }
    if (bitmap) {
      const deliver = () => { if (task.cancelled) bitmap.close(); else task.finish(bitmap); };
      if (task.url) deliver(); else afterDisplaySamplingMotion(deliver);
    } else task.failed?.();
    done();
  };
  worker.onerror = () => { worker?.terminate(); worker = null; task.failed?.(); done(); };
  timer = window.setTimeout(() => { worker?.terminate(); worker = null; task.failed?.(); done(); }, 60000);
  if (task.url && (displaySamplingMoving() || task.source instanceof HTMLImageElement && (!task.source.complete || !task.source.naturalWidth))) { worker.postMessage({ id: task.id, url: task.url, width: task.width, height: task.height }); return; }
  void (async () => {
    if (task.source instanceof HTMLImageElement) await task.source.decode();
    if (task.cancelled || active !== task) return;
    if (task.url && displaySamplingMoving()) { worker!.postMessage({ id: task.id, url: task.url, width: task.width, height: task.height }); return; }
    // ImageBitmap can share the already-decoded source; no full-size Canvas or
    // PNG/data-URL encoding is introduced for large pages.
    const bitmap = await createImageBitmap(task.source,{premultiplyAlpha:'premultiply'});
    if (task.cancelled || active !== task) { bitmap.close(); return; }
    worker!.postMessage({ id: task.id, bitmap, width: task.width, height: task.height }, [bitmap]);
  })().catch(() => { task.failed?.(); done(); });
}

export function queueDisplaySampling(source: Source, width: number, height: number, finish: Task['finish'], urgent = true, failed?: () => void) {
  const url = source instanceof HTMLImageElement ? source.currentSrc || source.src : '';
  const task: Task = { id: ++sequence, source, url: /^(?:omicomic-image:|blob:|data:image\/|https?:)/i.test(url) ? url : '', width, height, urgent, finish, failed, cancelled: false };
  // Pages on screen go ahead of pages prepared just outside it.
  const later = urgent ? queue.findIndex(queued => !queued.urgent) : -1;
  if (later >= 0) queue.splice(later, 0, task); else queue.push(task);
  next();
  const cancel = () => {
    task.cancelled = true;
    const index = queue.indexOf(task); if (index >= 0) queue.splice(index, 1);
    if (active === task) { clearTimeout(timer); worker?.terminate(); worker = null; active = null; next(); }
  };
  return Object.assign(cancel, { prioritize(value: boolean) {
    task.urgent = value;
    const index = queue.indexOf(task);
    if (index < 0) return;
    queue.splice(index, 1);
    const later = value ? queue.findIndex(queued => !queued.urgent) : -1;
    if (later < 0) queue.push(task); else queue.splice(later, 0, task);
  } });
}
