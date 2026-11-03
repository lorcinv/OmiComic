import type { PDFDocumentLoadingTask, PDFDataRangeTransport, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { 阅读资源结果 } from "../types";
import { isAndroid } from '../platform';
import { displaySamplingMoving } from './displaySampling';

export interface DocumentPage {
  url: string;
  width: number;
  height: number;
  html?: string;
  decodedBytes?: number;
  canvas?: HTMLCanvasElement;
}

/** Supplies pages to the normal reader's foreground queue and bounded cache. */
export class DocumentSource {
  private readonly id = crypto.randomUUID();
  private readonly abortController = new AbortController();
  private loading?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private transport?: PDFDataRangeTransport;
  private renders = new Set<RenderTask>();
  private parsedPages = new Map<number, PDFPageProxy>();
  private pageUsers = new Map<number, number>();
  private previewQueue = Promise.resolve();
  private previewCache = new Map<number, string>();
  private previewListeners = new Map<number, Set<(url: string) => void>>();
  private bodySurfaces = new Map<number, WeakRef<HTMLCanvasElement>>();
  private foregroundRenders = 0;
  private closed = false;
  private failure?: Error;
  private mobi?: import('./mobiClient').MobiClient;

  constructor(private readonly resource: 阅读资源结果, private readonly purpose: "reader" | "thumbnail" = "reader") {}

  private assertOpen() {
    if (this.failure) throw this.failure;
    if (this.closed) throw new Error("文档已关闭。");
  }

  async open(): Promise<阅读资源结果> {
    const type = this.resource.sourceType;
    if (type !== "pdf" && type !== "epub" && type !== 'mobi') throw new Error("文档格式无效。");
    this.assertOpen();
    // EPUB needs only the native chapter service. Load the PDF runtime alongside
    // the native file open, so PDF reads gain no extra serial loading step.
    const [opened, pdfRuntime] = await Promise.all([
      window.omicomic.openDocument({ path: this.resource.sourcePath, type, id: this.id, purpose: this.purpose }).then(async opened => {
        // A slow native open can finish after dispose already sent close. Close
        // again on completion so Android cannot retain that cancelled session.
        if (this.closed) void window.omicomic.closeDocument(this.id).catch(() => undefined);
        this.assertOpen();
        let initialData = new Uint8Array();
        if (type === 'pdf' && opened.ok && opened.data.size > 0) {
          const initial = await window.omicomic.readDocumentRange(this.id, 0, Math.min(opened.data.size, 256 * 1024));
          this.assertOpen();
          if (!initial.ok) throw new Error(initial.error.message);
          initialData = new Uint8Array(initial.data);
        }
        return { result: opened, initialData };
      }),
      type === "pdf" ? import("./pdfRuntime") : undefined,
    ]);
    this.assertOpen();
    if (!opened.result.ok) throw new Error(opened.result.error.message);
    let chapters = opened.result.data.chapters;
    if(type==='mobi'){
      const {MobiClient}=await import('./mobiClient');this.assertOpen();this.mobi=new MobiClient();
      chapters=await this.mobi.open(opened.result.data.size,async(begin,end)=>{const result=await window.omicomic.readDocumentRange(this.id,begin,end);this.assertOpen();if(!result.ok)throw Error(result.error.message);return new Uint8Array(result.data);},this.abortController.signal);
    }
    if (type === "pdf") {
      const { getDocument, PDFDataRangeTransport, getSharedPdfWorker } = pdfRuntime!;
      const source = this;
      class Ranges extends PDFDataRangeTransport {
        private queue = Promise.resolve();
        requestDataRange(begin: number, end: number) {
          this.queue = this.queue.then(async () => {
            source.assertOpen();
            if (end - begin > 32 * 1024 * 1024) throw new Error("PDF 单次请求超过安全上限，文件可能已损坏。");
            const bytes = new Uint8Array(end - begin);
            for (let offset = begin; offset < end; offset += 1024 * 1024) {
              source.assertOpen();
              const result = await window.omicomic.readDocumentRange(source.id, offset, Math.min(end, offset + 1024 * 1024));
              source.assertOpen();
              if (!result.ok) throw new Error(result.error.message);
              bytes.set(new Uint8Array(result.data), offset - begin);
            }
            this.onDataRange(begin, bytes);
          }).catch(reason => {
            if (source.closed) return;
            source.failure = reason instanceof Error ? reason : new Error("PDF 读取失败。");
            source.dispose();
          });
        }
      }
      this.transport = new Ranges(opened.result.data.size, opened.initialData, true);
      this.loading = getDocument({
        worker:getSharedPdfWorker(),
        range: this.transport,
        cMapUrl: new URL("pdfjs/cmaps/", document.baseURI).href, cMapPacked: true,
        standardFontDataUrl: new URL("pdfjs/standard_fonts/", document.baseURI).href,
        wasmUrl: new URL("pdfjs/wasm/", document.baseURI).href,
        iccUrl: new URL("pdfjs/iccs/", document.baseURI).href,
        rangeChunkSize: 256 * 1024, disableStream: true, disableAutoFetch: true,
        useSystemFonts: true, maxImageSize: 16_000_000, stopAtErrors: true,
      });
      this.pdf = await this.loading.promise;
      chapters = Array.from({ length: this.pdf.numPages }, (_, index) => ({ index, name: `第 ${index + 1} 页` }));
    }
    this.assertOpen();
    if (!chapters.length) throw new Error("文档没有可阅读内容。");
    return {
      ...this.resource, total: chapters.length,
      pages: chapters.map(({ name }, index) => ({ index, name, sourcePath: this.resource.sourcePath, type: type === "pdf" ? "pdf-page" : "epub-chapter" })),
    };
  }

  readPage(index: number, requestSignal?: AbortSignal): Promise<DocumentPage> {
    return this.renderPage(index, requestSignal, this.purpose === 'thumbnail');
  }

  private readyPreview(index: number): string | undefined {
    const saved = this.previewCache.get(index);
    if (saved) { this.previewCache.delete(index); this.previewCache.set(index, saved); return saved; }
    const body = this.bodySurfaces.get(index)?.deref();
    if (!body?.width || !body.height) return;
    const canvas = document.createElement('canvas'), scale = Math.min(1, 360 / Math.max(body.width, body.height));
    canvas.width = Math.max(1, Math.round(body.width * scale)); canvas.height = Math.max(1, Math.round(body.height * scale));
    try {
      canvas.getContext('2d')!.drawImage(body, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', .8);
      this.previewCache.set(index, url);
      while (this.previewCache.size > 32) this.previewCache.delete(this.previewCache.keys().next().value!);
      return url;
    } finally { canvas.width = canvas.height = 0; }
  }

  async readPreview(index: number, requestSignal?: AbortSignal): Promise<string> {
    requestSignal?.throwIfAborted();
    this.assertOpen();
    const saved = this.readyPreview(index);
    if (saved) return saved;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, this.abortController.signal, ...(requestSignal ? [requestSignal] : [])]);
    let publish!: (url: string) => void, cancel!: () => void;
    const published = new Promise<string>((resolve, reject) => {
      publish = resolve; cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    });
    const listeners = this.previewListeners.get(index) ?? new Set();
    listeners.add(publish); this.previewListeners.set(index, listeners);
    // Tiny previews share the open PDF and its parsed pages. They never create
    // another document, retain body-size rasters, or fill the foreground queue.
    const result = this.previewQueue.then(async () => {
      const previewDeadline=isAndroid()?performance.now()+48:Infinity;
      while (this.foregroundRenders > 0 && !this.bodySurfaces.get(index)?.deref()?.width) {
        signal.throwIfAborted(); this.assertOpen();
        await new Promise(resolve => setTimeout(resolve, 16));
        if(performance.now()>=previewDeadline)break;
      }
      signal.throwIfAborted(); this.assertOpen();
      const existing = this.readyPreview(index);
      if (existing) return existing;
      const page = await this.renderPage(index, signal, true);
      if (!page.canvas) throw new Error('当前文档不支持页面缩略图。');
      try {
        const url = page.canvas.toDataURL('image/jpeg', .8);
        this.previewCache.set(index, url);
        while (this.previewCache.size > 32) this.previewCache.delete(this.previewCache.keys().next().value!);
        return url;
      } finally { page.canvas.width = page.canvas.height = 0; }
    });
    this.previewQueue = result.then(() => undefined, () => undefined);
    try { return await Promise.race([result, published]); }
    finally {
      listeners.delete(publish); if (!listeners.size) this.previewListeners.delete(index);
      signal.removeEventListener('abort', cancel); controller.abort();
    }
  }

  private async renderPage(index: number, requestSignal: AbortSignal | undefined, thumbnail: boolean): Promise<DocumentPage> {
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.abortController.signal]) : this.abortController.signal;
    signal.throwIfAborted();
    this.assertOpen();
    if (!this.pdf) {
      const result = this.mobi?{ok:true as const,data:await this.mobi.chapter(index)}:await window.omicomic.readDocumentChapter(this.id, index);
      signal.throwIfAborted();
      this.assertOpen();
      if (!result.ok) throw new Error(result.error.message);
      const page = await measureChapter(result.data, signal);
      this.assertOpen();
      return { ...page, url: `epub:${this.id}:${index}` };
    }
    if (!thumbnail) this.foregroundRenders++;
    let page: PDFPageProxy;
    try { page = await this.pdf.getPage(index + 1); }
    catch (error) { if (!thumbnail) this.foregroundRenders--; throw error; }
    this.parsedPages.delete(index); this.parsedPages.set(index, page);
    this.pageUsers.set(index, (this.pageUsers.get(index) ?? 0) + 1);
    const canvas = document.createElement("canvas");
    let task: RenderTask | undefined;
    let continuation = 0;
    let retained = false;
    const cancel = () => task?.cancel();
    try {
      signal.throwIfAborted();
      this.assertOpen();
      const native = page.getViewport({ scale: 1 });
      const scale = thumbnail ? Math.min(1, 360 / Math.max(native.width, native.height)) : Math.min(
        Math.max(1.5, Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) / Math.max(native.width, native.height)),
        Math.sqrt(16_000_000 / (native.width * native.height)), 4096 / Math.max(native.width, native.height),
      );
      const view = page.getViewport({ scale });
      canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      task = page.render({ canvas, viewport: view });
      if (isAndroid() && this.purpose === 'reader') {
        // pdf.js executes drawing on the WebView thread. Leave a frame between
        // drawing slices during a drag/settle, so input and page motion run first.
        // Cold opening keeps the normal, immediate rendering schedule.
        task.onContinue = (resume: () => void) => {
          if (!displaySamplingMoving()) { resume(); return; }
          continuation = window.setTimeout(() => { continuation = 0; if (!signal.aborted && !this.closed) resume(); }, 16);
        };
      }
      this.renders.add(task);
      signal.addEventListener("abort", cancel, { once: true });
      await task.promise;
      signal.throwIfAborted();
      this.assertOpen();
      // Display the rendered surface directly: no synchronous PNG encoding,
      // base64 copy, or second image decode on the scroll thread.
      retained = true;
      if (!thumbnail) {
        this.bodySurfaces.delete(index); this.bodySurfaces.set(index, new WeakRef(canvas));
        while (this.bodySurfaces.size > 32) this.bodySurfaces.delete(this.bodySurfaces.keys().next().value!);
        const listeners = this.previewListeners.get(index);
        if (listeners?.size) {
          const preview = this.readyPreview(index);
          if (preview) for (const publish of listeners) publish(preview);
        }
      }
      return { url: `pdf:${this.id}:${index}`, canvas, width: native.width, height: native.height, decodedBytes: canvas.width * canvas.height * 4 };
    } finally {
      if (continuation) clearTimeout(continuation);
      signal.removeEventListener("abort", cancel);
      if (task) this.renders.delete(task);
      if (!retained) canvas.width = canvas.height = 0;
      if (!thumbnail) this.foregroundRenders--;
      const users = (this.pageUsers.get(index) ?? 1) - 1;
      if (users) this.pageUsers.set(index, users); else this.pageUsers.delete(index);
      // A bounded nearby parse window avoids parsing the same page again for
      // a page turn or preview, without retaining every visited PDF page.
      for (const [key, parsed] of this.parsedPages) {
        if (this.parsedPages.size <= (isAndroid() ? 6 : 4)) break;
        if (this.pageUsers.has(key)) continue;
        parsed.cleanup(); this.parsedPages.delete(key);
      }
    }
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.abortController.abort();
    this.mobi?.close();
    for (const task of this.renders) task.cancel();
    this.renders.clear();
    this.previewCache.clear(); this.previewListeners.clear(); this.parsedPages.clear(); this.bodySurfaces.clear();
    this.transport?.abort();
    void this.loading?.destroy().catch(() => undefined);
    void window.omicomic.closeDocument(this.id).catch(() => undefined);
  }
}

export function chapterPresentation(input:string) {
  const document=new DOMParser().parseFromString(input,'text/html');
  const pageLabel=/^(?:第\s*\d+\s*[页頁]|page\s*\d+|\d+)$/i;
  const text=document.body.textContent?.trim()??'';
  const imagePage=document.images.length>0&&(!text||document.images.length===1&&pageLabel.test(text));
  if(imagePage){
    document.body.dataset.omiImagePage='true';
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node:Node|null;while((node=walker.nextNode()))if(pageLabel.test(node.textContent?.trim()??''))node.textContent='';
  }
  const css=imagePage
    ? 'html,body{background:transparent!important;margin:0!important;padding:0!important;min-height:0!important;overflow:hidden}body{box-sizing:border-box;width:900px;max-width:none!important}body :is(div,p,h1,h2,h3,h4){margin:0;padding:0}img{display:block;width:100%;max-width:100%;height:auto;margin:0}'
    : 'html{overflow:hidden}body{box-sizing:border-box;width:900px;max-width:none;margin:0;padding:36px 42px;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;margin:auto}table{table-layout:fixed;width:100%;overflow-wrap:anywhere}';
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  return {imagePage,html:'<!doctype html>'+document.documentElement.outerHTML};
}
/** Measure inert, sanitized EPUB content once, so the shared stage owns all scrolling. */
function measureChapter(input: string, signal: AbortSignal): Promise<Omit<DocumentPage, "url">> {
  const width = 900;
  const {html,imagePage}=chapterPresentation(input);
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    // Scripts remain disabled. Same-origin access is needed only to measure the
    // worker-sanitized document; its restrictive CSP also blocks remote content.
    frame.sandbox.add("allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:1px;visibility:hidden;border:0;pointer-events:none`;
    let finished = false;
    const cleanup = () => { window.clearTimeout(timer); signal.removeEventListener("abort", abort); frame.remove(); };
    const fail = (error: Error) => { if (finished) return; finished = true; cleanup(); reject(error); };
    const abort = () => fail(new Error("文档已关闭。"));
    const timer = window.setTimeout(() => fail(new Error("章节排版超时，请重新打开。")), 15000);
    signal.addEventListener("abort", abort, { once: true });
    frame.onload = () => {
      void (async () => {
        const content = frame.contentDocument;
        if (!content) throw new Error("章节排版失败。");
        await Promise.all(Array.from(content.images, image => image.decode().catch(() => undefined)));
        await content.fonts.ready;
        if (finished) return;
        const height = Math.max(imagePage?1:1200, content.documentElement.scrollHeight, content.body.scrollHeight);
        finished = true; cleanup(); resolve({ html, width, height });
      })().catch(reason => fail(reason instanceof Error ? reason : new Error("章节排版失败。")));
    };
    if (signal.aborted) { abort(); return; }
    frame.srcdoc = html;
    document.body.append(frame);
  });
}
