interface Work { id: number; cancelled: boolean; prepare: () => Promise<ImageBitmap>; denoise: number; sharpen: number; finish: (result: { blob?: Blob; error?: string }) => void }
let worker: Worker | null = null, active: Work | null = null, sequence = 0, timer = 0;
const waiting: Work[] = [];
function next() {
  if (active) return;
  const task = waiting.shift();
  if (!task) { window.clearTimeout(timer); timer = window.setTimeout(() => { worker?.terminate(); worker = null; }, 2000); return; }
  if (task.cancelled) { next(); return; }
  active = task; window.clearTimeout(timer);
  const finish = (result: { blob?: Blob; error?: string }) => {
    if (active !== task) return;
    window.clearTimeout(timer); active = null;
    if (!task.cancelled) task.finish(result);
    next();
  };
  if (!worker) worker = new Worker(new URL('./imageProcessing.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = event => { if (event.data.id === task.id) finish(event.data.error ? { error: '图像处理失败，已显示原图。' } : event.data); };
  worker.onerror = () => { worker?.terminate(); worker = null; finish({ error: '图像处理失败，已显示原图。' }); };
  timer = window.setTimeout(() => { worker?.terminate(); worker = null; finish({ error: '图像处理超时，已显示原图。' }); }, 30000);
  void task.prepare().then(bitmap => {
    if (active !== task || task.cancelled) { bitmap.close(); finish({}); return; }
    worker!.postMessage({ id: task.id, bitmap, denoise: task.denoise, sharpen: task.sharpen }, [bitmap]);
  }).catch(() => finish({ error: '无法处理此页，已显示原图。' }));
}
export function queueImageProcessing(prepare: Work['prepare'], denoise: number, sharpen: number, finish: Work['finish']): () => void {
  const task: Work = { id: ++sequence, prepare, denoise, sharpen, finish, cancelled: false };
  waiting.push(task); next();
  return () => { task.cancelled = true; const index = waiting.indexOf(task); if (index >= 0) waiting.splice(index, 1); };
}
export function processingPreviewSize(width: number, height: number, shownWidth: number, shownHeight: number, dpr: number) {
  const scale = Math.min(1, Math.max(shownWidth * dpr / width, shownHeight * dpr / height), Math.sqrt(4_000_000 / (width * height)), 8192 / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
