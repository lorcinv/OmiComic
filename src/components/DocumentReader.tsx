import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, PDFDataRangeTransport, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./DocumentReader.css";

GlobalWorkerOptions.workerSrc = workerUrl;
interface Props {
  sourcePath: string;
  type: "pdf" | "epub";
  initialPageIndex?: number;
  onPageChange?: (index: number, total: number) => void;
  onClose?: () => void;
}
/** A single visible page/chapter, cancellable PDF rendering, no retained page bitmap cache. */
export default function DocumentReader({ sourcePath, type, initialPageIndex = 0, onPageChange, onClose }: Props) {
  const [index, setIndex] = useState(initialPageIndex);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState<{ id: string; pdf?: PDFDocumentProxy }>();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(900);
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const currentRender = useRef<RenderTask>();
  const renderQueue = useRef(Promise.resolve());
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  useEffect(() => {
    const target = viewport.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width - 32))));
    observer.observe(target); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    const id = crypto.randomUUID();
    let loading: ReturnType<typeof getDocument> | undefined;
    let transport: PDFDataRangeTransport | undefined;
    setReady(undefined); setTotal(0); setError(""); setBusy(true); setHtml("");
    currentRender.current?.cancel();
    void (async () => {
      const opened = await window.omicomic.openDocument({ path: sourcePath, type, id });
      if (!alive) { void window.omicomic.closeDocument(id); return; }
      if (!opened.ok) throw new Error(opened.error.message);
      let pdf: PDFDocumentProxy | undefined;
      let count = opened.data.chapters.length;
      if (type === "pdf") {
        class Ranges extends PDFDataRangeTransport {
          private stopped = false;
          private queue = Promise.resolve();
          requestDataRange(begin: number, end: number) {
            this.queue = this.queue.then(async () => {
              if (this.stopped || !alive) return;
              if (end - begin > 32 * 1024 * 1024) throw new Error("PDF 单次请求超过安全上限，文件可能已损坏。");
              // PDF.js normally requests one 256 KiB block; split larger requests at the IPC limit.
              const blocks: Uint8Array[] = [];
              for (let offset = begin; offset < end; offset += 1024 * 1024) {
                if (this.stopped || !alive) return;
                const result = await window.omicomic.readDocumentRange(id, offset, Math.min(end, offset + 1024 * 1024));
                if (!result.ok) throw new Error(result.error.message);
                blocks.push(new Uint8Array(result.data));
              }
              if (this.stopped || !alive) return;
              const bytes = new Uint8Array(end - begin); let offset = 0;
              for (const block of blocks) { bytes.set(block, offset); offset += block.length; }
              this.onDataRange(begin, bytes);
            }).catch((reason) => { if (alive) { setError(String(reason instanceof Error ? reason.message : reason)); setBusy(false); } void loading?.destroy(); void window.omicomic.closeDocument(id); });
          }
          abort() { this.stopped = true; }
        }
        transport = new Ranges(opened.data.size, new Uint8Array(), true);
        loading = getDocument({ range: transport, cMapUrl: new URL("pdfjs/cmaps/", document.baseURI).href, cMapPacked: true, standardFontDataUrl: new URL("pdfjs/standard_fonts/", document.baseURI).href, wasmUrl: new URL("pdfjs/wasm/", document.baseURI).href, iccUrl: new URL("pdfjs/iccs/", document.baseURI).href, rangeChunkSize: 256 * 1024, disableStream: true, disableAutoFetch: true, useSystemFonts: true, maxImageSize: 16_000_000, stopAtErrors: true });
        pdf = await loading.promise;
        count = pdf.numPages;
      }
      if (!alive) { await loading?.destroy(); return; }
      if (!count) throw new Error("文档没有可阅读内容。");
      setIndex(Math.min(Math.max(0, initialPageIndex), count - 1)); setTotal(count); setReady({ id, pdf });
    })().catch((reason) => { if (alive) { setError(reason instanceof Error ? reason.message : "文档读取失败。"); setBusy(false); } transport?.abort(); void loading?.destroy(); void window.omicomic.closeDocument(id); });
    return () => {
      alive = false; currentRender.current?.cancel(); transport?.abort();
      void loading?.destroy(); void window.omicomic.closeDocument(id);
    };
  }, [sourcePath, type]); // Initial bookmark applies only when a different document is opened.
  useEffect(() => {
    if (ready && total) onPageChangeRef.current?.(index, total);
  }, [ready, index, total]);
  const renderWidth = type === "pdf" ? width : 0;
  useEffect(() => {
    if (!ready || !total) return;
    let alive = true;
    currentRender.current?.cancel();
    setBusy(true); setError(""); setHtml("");
    // Serial queue prevents simultaneous renders into one canvas and bounds chapter decompression.
    renderQueue.current = renderQueue.current.catch(() => undefined).then(async () => {
      if (!alive) return;
      if (ready.pdf) {
        const page = await ready.pdf.getPage(index + 1);
        if (!alive) { page.cleanup(); return; }
        const native = page.getViewport({ scale: 1 });
        const scale = Math.min(renderWidth / native.width * zoom * Math.min(devicePixelRatio || 1, 2), Math.sqrt(16_000_000 / (native.width * native.height)), 4096 / Math.max(native.width, native.height));
        const view = page.getViewport({ scale });
        const element = canvas.current; if (!element) return;
        element.width = Math.ceil(view.width); element.height = Math.ceil(view.height);
        element.style.width = `${view.width / Math.min(devicePixelRatio || 1, 2)}px`;
        element.style.height = `${view.height / Math.min(devicePixelRatio || 1, 2)}px`;
        try {
          const task = page.render({ canvas: element, viewport: view }); currentRender.current = task;
          await task.promise;
        } finally { page.cleanup(); }
      } else {
        const result = await window.omicomic.readDocumentChapter(ready.id, index);
        if (!alive) return;
        if (!result.ok) throw new Error(result.error.message);
        setHtml(result.data);
      }
      if (alive) { setBusy(false); viewport.current?.scrollTo(0, 0); }
    }).catch((reason) => { if (alive && reason?.name !== "RenderingCancelledException") { setError(reason instanceof Error ? reason.message : "页面加载失败。"); setBusy(false); } });
    return () => { alive = false; currentRender.current?.cancel(); };
  }, [ready, index, renderWidth, zoom, total]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches("input,select,textarea,button")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") { event.preventDefault(); setIndex(value => Math.min(total - 1, value + 1)); }
      if (event.key === "ArrowLeft" || event.key === "PageUp") { event.preventDefault(); setIndex(value => Math.max(0, value - 1)); }
      if (event.key === "Escape") onClose?.();
    };
    if (total) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [total, onClose]);
  return <section className="document-reader" aria-label={`${type.toUpperCase()} 阅读器`}>
    <header className="document-reader-toolbar">
      {onClose && <button onClick={onClose}>返回资源库</button>}
      <span className="document-reader-title" title={sourcePath}>{sourcePath.split(/[\\/]/).pop()}</span>
      <button disabled={!total || index === 0} onClick={() => setIndex(value => value - 1)}>上一{type === "pdf" ? "页" : "章"}</button>
      <label><input aria-label={type === "pdf" ? "页码" : "章节"} type="number" min={1} max={total || 1} value={index + 1} disabled={!total} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value)) setIndex(Math.max(0, Math.min(total - 1, value - 1))); }} /> / {total || "…"}</label>
      <button disabled={!total || index >= total - 1} onClick={() => setIndex(value => value + 1)}>下一{type === "pdf" ? "页" : "章"}</button>
      {type === "pdf" && <select aria-label="缩放" value={zoom} onChange={event => setZoom(Number(event.target.value))}><option value={0.75}>75%</option><option value={1}>适应宽度</option><option value={1.5}>150%</option><option value={2}>200%</option></select>}
    </header>
    {error && <p role="alert" className="document-reader-message">{error}</p>}
    {busy && !error && <p role="status" className="document-reader-message">正在加载{type === "pdf" ? "页面" : "章节"}…</p>}
    <div ref={viewport} className="document-reader-viewport" aria-busy={busy}>
      {type === "pdf" ? <canvas ref={canvas} style={{ visibility: busy || !!error ? "hidden" : "visible" }} aria-label={`第 ${index + 1} 页`} /> : html && <iframe key={`${ready?.id}:${index}`} title={`第 ${index + 1} 章`} sandbox="" referrerPolicy="no-referrer" srcDoc={html} />}
    </div>
  </section>;
}
