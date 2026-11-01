type Task = { run: () => Promise<void>; bytes: number; background: () => boolean; signal?: AbortSignal; started: boolean; resolve: () => void; reject: (error: unknown) => void; abort: () => void };
const waiting: Task[] = [];
let active = 0, activeBytes = 0;
const running = new Set<Task>();
const heavy = (task:Task) => task.bytes > 32*1024*1024;
const BYTE_LIMIT = 192 * 1024 * 1024;
function advance() {
  waiting.sort((a,b) => Number(a.background())-Number(b.background()));
  for (;;) {
    const index = waiting.findIndex(task => active < (heavy(task) ? 2 : 4) && (!task.background() || [...running].filter(t=>t.background()).length < (heavy(task) ? 1 : 3)) && (active === 0 || activeBytes + task.bytes <= BYTE_LIMIT));
    if (index < 0) return;
    const task = waiting.splice(index,1)[0];
    if (task.signal?.aborted) { task.abort(); continue; }
    task.started = true; active++; activeBytes += task.bytes; running.add(task);
    void Promise.resolve().then(task.run).then(task.resolve,task.reject).finally(() => {
      task.signal?.removeEventListener('abort',task.abort);
      active--; activeBytes -= task.bytes; running.delete(task); advance();
    });
  }
}
/** Reserve decode memory before assigning an image URL. Speculation cannot
 * occupy every lane while a visible page waits. */
export function queueDesktopDecode(run: () => Promise<void>, bytes: number, prefetch: boolean | (() => boolean), signal?: AbortSignal): Promise<void> {
  return new Promise((resolve,reject) => {
    const task: Task = { run, bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 32*1024*1024,
      background: typeof prefetch === 'function' ? prefetch : () => prefetch, signal, started: false, resolve, reject, abort() {
        if (task.started) return; // The caller aborts the image; retain its reservation until it settles.
        const index = waiting.indexOf(task); if (index >= 0) waiting.splice(index,1);
        signal?.removeEventListener('abort',task.abort); reject(new DOMException('Image read cancelled','AbortError')); advance();
      } };
    if (signal?.aborted) { task.abort(); return; }
    signal?.addEventListener('abort',task.abort,{once:true}); waiting.push(task); advance();
  });
}

/** Promote a page already queued by read-ahead without restarting its decode. */
export function prioritizeDesktopDecodes(){advance();}
