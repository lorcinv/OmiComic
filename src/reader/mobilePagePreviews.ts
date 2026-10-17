import type { 阅读页面项 } from '../types';

type DecodedPreview = { url: string; image: HTMLImageElement };
type Task = {
  key: string; page: 阅读页面项; order: number; users: Map<symbol, number>;
  promise: Promise<string>; resolve: (url: string) => void; reject: (error: unknown) => void;
  controller?: AbortController;
};
type CachedPreview = DecodedPreview & { sourcePath: string; expires: number; bytes: number };

const tasks = new Map<string, Task>();
const running = new Set<Task>();
const cache = new Map<string, CachedPreview>();
const maxConcurrent = 2, maxCacheBytes = 8 * 1024 * 1024, cacheLifetime = 60_000;
let order = 0, cacheBytes = 0, scheduled = false;
const cancelled = () => new DOMException('Preview cancelled', 'AbortError');
const keyFor = (page: 阅读页面项) => JSON.stringify([page.sourcePath, page.archiveInnerPath, page.virtualPath, page.type, page.modifiedAt, page.pageId]);
const priorityOf = (task: Task) => Math.min(...task.users.values());

function discard(key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cache.delete(key); cacheBytes -= entry.bytes;
  // The mounted preview has its own img. Release only our bounded decode pin.
  entry.image.removeAttribute('src');
}

function remember(task: Task, preview: DecodedPreview): void {
  discard(task.key);
  const bytes = preview.image.naturalWidth * preview.image.naturalHeight * 4;
  if (bytes > maxCacheBytes) return;
  cache.set(task.key, { ...preview, bytes, sourcePath: task.page.sourcePath, expires: Date.now() + cacheLifetime });
  cacheBytes += bytes;
  while (cache.size > 64 || cacheBytes > maxCacheBytes) discard(cache.keys().next().value!);
}

async function load(task: Task, signal: AbortSignal): Promise<DecodedPreview> {
  signal.throwIfAborted();
  const page = task.page;
  const result = await window.omicomic.getPageImage({ sourcePath: page.sourcePath, virtualPath: page.virtualPath,
    archiveInnerPath: page.archiveInnerPath, type: page.type, preview: true });
  signal.throwIfAborted();
  if (!result.ok || !result.data.url) throw new Error('Preview unavailable');
  const url = result.data.url;
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = priorityOf(task) === 0 ? 'high' : 'low';
  // A URL registration is cheap; the actual native read/decode happens when the
  // image is fetched. Keep the slot until that work and WebView decode finish.
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => finish(new Error('Preview timed out')), 8000);
    const finish = (error?: unknown) => {
      if (done) return; done = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      signal.removeEventListener('abort', abort);
      if (error) { image.removeAttribute('src'); reject(error); } else resolve();
    };
    const abort = () => finish(cancelled());
    image.onload = () => {
      if (typeof image.decode !== 'function') { finish(); return; }
      void image.decode().then(() => finish(), error => finish(error));
    };
    image.onerror = () => finish(new Error('Preview decode failed'));
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  return { url, image };
}

function start(task: Task): void {
  const controller = new AbortController(); task.controller = controller; running.add(task);
  void load(task, controller.signal).then(preview => {
    if (task.controller !== controller || tasks.get(task.key) !== task) return;
    remember(task, preview); tasks.delete(task.key); task.resolve(preview.url);
  }, error => {
    if (task.controller !== controller || tasks.get(task.key) !== task) return;
    tasks.delete(task.key); task.reject(error);
  }).finally(() => {
    if (task.controller !== controller) return;
    task.controller = undefined; running.delete(task); schedule();
  });
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // Batch sibling effects so the selected page starts before its DOM neighbours.
  queueMicrotask(() => {
    scheduled = false;
    for (;;) {
      const next = [...tasks.values()].filter(task => !task.controller && task.users.size)
        .sort((a, b) => priorityOf(a) - priorityOf(b) || a.order - b.order)[0];
      if (!next) return;
      if (running.size >= maxConcurrent) {
        const obsolete = [...running].sort((a, b) => priorityOf(b) - priorityOf(a))[0];
        // A newly selected page must not wait behind two old/off-centre reads.
        // Subscribers are retained: the displaced neighbour can resume later.
        if (priorityOf(next) > 2 || !obsolete || priorityOf(obsolete) <= priorityOf(next)) return;
        const controller = obsolete.controller!;
        obsolete.controller = undefined; running.delete(obsolete); controller.abort();
      }
      start(next);
    }
  });
}

export interface MobilePagePreviewRequest {
  promise: Promise<string>;
  setPriority: (priority: number) => void;
  cancel: () => void;
}

export function requestMobilePagePreview(page: 阅读页面项, priority = 16): MobilePagePreviewRequest {
  const key = keyFor(page), saved = cache.get(key);
  if (saved && saved.expires > Date.now()) {
    cache.delete(key); cache.set(key, saved);
    return { promise: Promise.resolve(saved.url), setPriority() {}, cancel() {} };
  }
  if (saved) discard(key);
  let task = tasks.get(key);
  if (!task) {
    let resolve!: Task['resolve'], reject!: Task['reject'];
    const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    // A cancelled view may unmount before React attaches its state handler.
    void promise.catch(() => undefined);
    task = { key, page, order: order++, users: new Map(), promise, resolve, reject };
    tasks.set(key, task);
  }
  const subscription = Symbol(); task.users.set(subscription, priority); schedule();
  const subscribed = task;
  return {
    promise: task.promise,
    setPriority(value) {
      if (!subscribed.users.has(subscription)) return;
      subscribed.users.set(subscription, value); schedule();
    },
    cancel() {
      subscribed.users.delete(subscription);
      if (subscribed.users.size || tasks.get(key) !== subscribed) return;
      tasks.delete(key); running.delete(subscribed);
      const controller = subscribed.controller; subscribed.controller = undefined;
      controller?.abort(); subscribed.reject(cancelled()); schedule();
    },
  };
}

export function clearMobilePagePreviews(path?: string): void {
  const matches = (candidate: string) => !path || candidate === path || candidate.startsWith(path + '/') || candidate.startsWith(path + '\\');
  for (const [key, entry] of cache) if (matches(entry.sourcePath)) discard(key);
  for (const [key, task] of tasks) if (matches(task.page.sourcePath)) {
    tasks.delete(key); running.delete(task);
    const controller = task.controller; task.controller = undefined;
    controller?.abort(); task.reject(cancelled());
  }
  schedule();
}
