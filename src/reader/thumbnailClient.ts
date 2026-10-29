import type { 缩略图输入, 缩略图结果, 操作结果 } from "../types";
import { isAndroid } from "../platform";
import { clearMobilePagePreviews } from "./mobilePagePreviews";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const waiting: Array<() => void> = [];
let active = 0;
const archivePending = new Map<string, Promise<操作结果<缩略图结果>>>();
let desktopGeneration = 0;
const androidChunks = new Map<string, Promise<操作结果<缩略图结果>>>();
const androidCache = new Map<string, { result: 操作结果<缩略图结果>; version?: string; expires: number }>();
const androidTasks = new Map<string, { promise: Promise<操作结果<缩略图结果>>; controller: AbortController; users: number; version?: string }>();
let androidActive = 0;
const androidWaiting: Array<() => void> = [];

export function clearResourceThumbnailCache(path?: string): void {
  desktopGeneration++;
  if (isAndroid()) clearMobilePagePreviews(path);
  if (!path) { androidCache.clear(); cache.clear(); }
  else for (const key of androidCache.keys()) if (key === path || key.startsWith(path + '/')) androidCache.delete(key);
  for (const [key, task] of androidTasks) if (!path || key === path || key.startsWith(path + '/')) { task.controller.abort(); androidTasks.delete(key); }
  for (const key of androidChunks.keys()) if (!path || key === path || key.startsWith(path + '/')) androidChunks.delete(key);
  window.dispatchEvent(new CustomEvent('omi-thumbnail-invalidated',{detail:path}));
}

async function androidSlot(signal: AbortSignal): Promise<() => void> {
  signal.throwIfAborted();
  if (androidActive < 2) androidActive++;
  else await new Promise<void>((resolve, reject) => {
    const ready = () => { signal.removeEventListener('abort', abort); resolve(); };
    const abort = () => { const index = androidWaiting.indexOf(ready); if (index >= 0) androidWaiting.splice(index,1); reject(new DOMException('Cancelled','AbortError')); };
    androidWaiting.push(ready); signal.addEventListener('abort', abort, {once:true});
  });
  return () => { const next = androidWaiting.shift(); if (next) next(); else androidActive--; };
}

async function sharedAndroidCover(input: 缩略图输入, signal?: AbortSignal, version?: string): Promise<操作结果<缩略图结果>> {
  signal?.throwIfAborted();
  const key = input.path, saved = androidCache.get(key);
  if (saved && saved.expires > Date.now() && (version === undefined || version === saved.version)) {
    androidCache.delete(key); androidCache.set(key,saved); return saved.result;
  }
  let task = androidTasks.get(key);
  if (task && version !== undefined && version !== task.version) {
    task.controller.abort(); androidChunks.delete(key); task = undefined;
  }
  if (task?.controller.signal.aborted) task = undefined;
  if (!task) {
    const controller = new AbortController();
    const created = { controller, users: 0, version, promise: Promise.resolve(null as unknown as 操作结果<缩略图结果>) };
    created.promise = (async () => {
      const release = await androidSlot(controller.signal);
      try {
        controller.signal.throwIfAborted();
        const result = await readAndroidCover(input,controller.signal);
        if (result.ok && !result.data.pending) {
          androidCache.set(key,{result,version,expires:Date.now() + (result.data.url || result.data.pdfPath ? 300000 : 10000)});
          while (androidCache.size > 512) androidCache.delete(androidCache.keys().next().value!);
        }
        return result;
      } finally { release(); if (androidTasks.get(key) === created) androidTasks.delete(key); }
    })();
    // A view may leave before the native slice completes; its rejection is handled
    // here as well as by the active subscriber, without orphaned promises.
    void created.promise.catch(() => { if (androidTasks.get(key) === created) androidTasks.delete(key); });
    androidTasks.set(key, created); task = created;
  }
  task.users++;
  let released = false;
  const release = () => { if (released) return; released = true; if (--task!.users === 0) task!.controller.abort(); };
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([task.promise, new Promise<never>((_,reject) => {
      abort = () => { release(); reject(new DOMException('Cancelled','AbortError')); };
      signal?.addEventListener('abort',abort,{once:true});
    })]);
  } finally { if (abort) signal?.removeEventListener('abort',abort); release(); }
}

async function readAndroidCover(input: 缩略图输入, signal?: AbortSignal): Promise<操作结果<缩略图结果>> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    signal?.throwIfAborted();
    let chunk = androidChunks.get(input.path);
    if (!chunk) { chunk = window.omicomic.getThumbnail(input); androidChunks.set(input.path, chunk); }
    let result: 操作结果<缩略图结果>;
    try { result = await chunk; }
    finally { if (androidChunks.get(input.path) === chunk) androidChunks.delete(input.path); }
    signal?.throwIfAborted();
    if (!result.ok || !result.data.pending) return result;
    if (Date.now() >= deadline) return { ok: true, data: { ...result.data, pending: false, retryable: true } };
    // Yield between native slices so other visible cards and reader actions run.
    await new Promise(resolve => setTimeout(resolve, 16));
  }
}

async function readArchiveCover(input: 缩略图输入): Promise<操作结果<缩略图结果>> {
  let result = await window.omicomic.getThumbnail(input);
  if (result.ok && result.data.retryable) {
    await new Promise(resolve => setTimeout(resolve, 750));
    result = await window.omicomic.getThumbnail(input);
  }
  return result;
}

async function renderPdf(path: string): Promise<string | null> {
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve)); else active++;
  let dispose: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { DocumentSource } = await import("./documentSource");
    const key = `pdf:${path}`;
    const source = new DocumentSource({ key, resourceKey: key, sourcePath: path, sourceType: "pdf", title: "", pages: [], total: 0 }, "thumbnail");
    dispose = () => source.dispose();
    return await Promise.race([
      (async () => {
        await source.open();
        const page = await source.readPage(0);
        if (!page.canvas) return null;
        const url = page.canvas.toDataURL("image/jpeg", .82);
        page.canvas.width = page.canvas.height = 0;
        return url;
      })(),
      new Promise<null>(resolve => { timer = setTimeout(() => { source.dispose(); resolve(null); }, 15000); }),
    ]);
  } catch { return null; }
  finally {
    clearTimeout(timer); dispose?.();
    const next = waiting.shift(); if (next) next(); else active--;
  }
}

export async function getResourceThumbnail(input: 缩略图输入, signal?: AbortSignal, version?: string): Promise<操作结果<缩略图结果>> {
  // Scrolling can replace a card's effect while its archive is still being read.
  // Share that work across the old/new view instead of filling the decoder queue.
  if (!isAndroid()) {
    signal?.throwIfAborted();
    const key = JSON.stringify([desktopGeneration,input.type,input.path,version]);
    let task = archivePending.get(key);
    if (!task) {
      task = (input.type === 'archive' ? readArchiveCover(input) : window.omicomic.getThumbnail(input)).then(completeCover);
      archivePending.set(key, task);
      const finished = () => { if (archivePending.get(key) === task) archivePending.delete(key); };
      void task.then(finished, finished);
    }
    return task;
  }
  return completeCover(await sharedAndroidCover(input, signal, version));
}
async function completeCover(result: 操作结果<缩略图结果>): Promise<操作结果<缩略图结果>> {
  if (!result.ok || result.data.url || !result.data.pdfPath) return result;
  const key = `${result.data.pdfPath}:${result.data.sourceVersion ?? ""}`;
  let url = cache.get(key) ?? null;
  if (!url) {
    let task = pending.get(key);
    if (!task) { task = renderPdf(result.data.pdfPath); pending.set(key, task); }
    try { url = await task; } finally { if (pending.get(key) === task) pending.delete(key); }
    if (url) {
      cache.set(key, url);
      while (cache.size > 96) cache.delete(cache.keys().next().value!);
    }
  }
  return { ok: true, data: { ...result.data, url } };
}
