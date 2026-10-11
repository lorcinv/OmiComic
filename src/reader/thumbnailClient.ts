import type { 缩略图输入, 缩略图结果, 操作结果 } from "../types";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const waiting: Array<() => void> = [];
let active = 0;

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

export async function getResourceThumbnail(input: 缩略图输入): Promise<操作结果<缩略图结果>> {
  const result = await window.omicomic.getThumbnail(input);
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
