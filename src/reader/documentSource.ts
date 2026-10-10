import { getDocument, GlobalWorkerOptions, PDFDataRangeTransport, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { 阅读资源结果 } from "../types";

GlobalWorkerOptions.workerSrc = workerUrl;

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
  private loading?: ReturnType<typeof getDocument>;
  private pdf?: PDFDocumentProxy;
  private transport?: PDFDataRangeTransport;
  private renders = new Set<RenderTask>();
  private closed = false;
  private failure?: Error;

  constructor(private readonly resource: 阅读资源结果) {}

  private assertOpen() {
    if (this.failure) throw this.failure;
    if (this.closed) throw new Error("文档已关闭。");
  }

  async open(): Promise<阅读资源结果> {
    const type = this.resource.sourceType;
    if (type !== "pdf" && type !== "epub") throw new Error("文档格式无效。");
    const opened = await window.omicomic.openDocument({ path: this.resource.sourcePath, type, id: this.id });
    this.assertOpen();
    if (!opened.ok) throw new Error(opened.error.message);
    let chapters = opened.data.chapters;
    if (type === "pdf") {
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
      this.transport = new Ranges(opened.data.size, new Uint8Array(), true);
      this.loading = getDocument({
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

  async readPage(index: number, requestSignal?: AbortSignal): Promise<DocumentPage> {
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.abortController.signal]) : this.abortController.signal;
    signal.throwIfAborted();
    this.assertOpen();
    if (!this.pdf) {
      const result = await window.omicomic.readDocumentChapter(this.id, index);
      signal.throwIfAborted();
      this.assertOpen();
      if (!result.ok) throw new Error(result.error.message);
      const page = await measureChapter(result.data, signal);
      this.assertOpen();
      return { ...page, url: `epub:${this.id}:${index}` };
    }
    const page = await this.pdf.getPage(index + 1);
    const canvas = document.createElement("canvas");
    let task: RenderTask | undefined;
    let retained = false;
    const cancel = () => task?.cancel();
    try {
      signal.throwIfAborted();
      this.assertOpen();
      const native = page.getViewport({ scale: 1 });
      const scale = Math.min(
        Math.max(1.5, Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) / Math.max(native.width, native.height)),
        Math.sqrt(16_000_000 / (native.width * native.height)), 4096 / Math.max(native.width, native.height),
      );
      const view = page.getViewport({ scale });
      canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      task = page.render({ canvas, viewport: view });
      this.renders.add(task);
      signal.addEventListener("abort", cancel, { once: true });
      await task.promise;
      signal.throwIfAborted();
      this.assertOpen();
      // Display the rendered surface directly: no synchronous PNG encoding,
      // base64 copy, or second image decode on the scroll thread.
      retained = true;
      return { url: `pdf:${this.id}:${index}`, canvas, width: native.width, height: native.height, decodedBytes: canvas.width * canvas.height * 4 };
    } finally {
      signal.removeEventListener("abort", cancel);
      if (task) this.renders.delete(task);
      if (!retained) canvas.width = canvas.height = 0;
      page.cleanup();
    }
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.abortController.abort();
    for (const task of this.renders) task.cancel();
    this.renders.clear();
    this.transport?.abort();
    void this.loading?.destroy().catch(() => undefined);
    void window.omicomic.closeDocument(this.id).catch(() => undefined);
  }
}

/** Measure inert, sanitized EPUB content once, so the shared stage owns all scrolling. */
function measureChapter(input: string, signal: AbortSignal): Promise<Omit<DocumentPage, "url">> {
  const width = 900;
  const css = "html{overflow:hidden}body{box-sizing:border-box;width:900px;max-width:none;margin:0;padding:36px 42px;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;margin:auto}table{table-layout:fixed;width:100%;overflow-wrap:anywhere}";
  const html = input.replace("</head>", `<style>${css}</style></head>`);
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
        const height = Math.max(1200, content.documentElement.scrollHeight, content.body.scrollHeight);
        finished = true; cleanup(); resolve({ html, width, height });
      })().catch(reason => fail(reason instanceof Error ? reason : new Error("章节排版失败。")));
    };
    if (signal.aborted) { abort(); return; }
    frame.srcdoc = html;
    document.body.append(frame);
  });
}
