import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { afterDisplaySamplingMotion, displaySamplingMoving, displaySamplingSize, queueDisplaySampling } from '../reader/displaySampling';
import { alignDisplayRaster } from '../reader/displayGeometry';
import { displayRasterTransition } from '../reader/displayRasterTransition';

// A pinch/Control-wheel zoom changes the spread's scale, not layout. Drag
// frames rewrite the same style attribute every frame, so all pages share one
// observer per spread and only a scale change reaches them.
type ZoomWatch = { scale: string; listeners: Set<() => void>; observer: MutationObserver };
const zoomWatches = new WeakMap<HTMLElement, ZoomWatch>();
function watchZoom(spread: HTMLElement, listener: () => void) {
  let watch = zoomWatches.get(spread);
  if (!watch) {
    const created: ZoomWatch = { scale: spread.style.scale, listeners: new Set(), observer: new MutationObserver(() => {
      if (spread.style.scale === created.scale) return;
      created.scale = spread.style.scale;
      for (const run of [...created.listeners]) run();
    }) };
    created.observer.observe(spread,{ attributes:true,attributeFilter:['style'] });
    zoomWatches.set(spread,watch = created);
  }
  const current = watch;
  current.listeners.add(listener);
  return () => { if (!current.listeners.delete(listener) || current.listeners.size) return; current.observer.disconnect(); zoomWatches.delete(spread); };
}

export default function useReaderDisplaySampling(host: RefObject<HTMLDivElement>, sourceKey: string, enabled: boolean, processed: boolean, onBytes?: (bytes: number) => void, originalSize?: { width?: number; height?: number }, layoutKey = '', priority?: boolean) {
  const canvas = useRef<HTMLCanvasElement>(null), notify = useRef(onBytes);
  const layoutChanged = useRef(() => {});
  const priorityChanged = useRef(() => {}), requestedPriority = useRef(priority); requestedPriority.current = priority;
  notify.current = onBytes;
  const [presentation, setPresentation] = useState({ source: '', status: 'pending', rendered: '' });
  const originalWidth = originalSize?.width || 0, originalHeight = originalSize?.height || 0;
  useLayoutEffect(() => {
    const element = host.current, surface = canvas.current;
    if (!enabled || !element || !surface || typeof createImageBitmap !== 'function' || typeof Worker === 'undefined') return;
    const reportBytes = notify.current, root = element.closest<HTMLElement>('.reader-stage');
    let visible = false, observed = false, urgent = true, disposed = false, preserve = false, presented = false, timer = 0, stop: (() => void) & { prioritize?: (value: boolean) => void } = () => {}, wait = () => {}, bytesWait = () => {}, key = '', renderedKey = '', failedKey = '', sourceUrl = '', sourceElement: HTMLImageElement | HTMLCanvasElement | null = null;
    let box: { width: number; height: number } | null = null;
    const spread = element.closest<HTMLElement>('.reader-page-spread');
    let rasterBytes = 0, transitionBytes = 0, endTransition = () => {};
    const report = (bytes: number) => { rasterBytes = bytes; bytesWait(); bytesWait = afterDisplaySamplingMotion(() => { if (!disposed) reportBytes?.(rasterBytes + transitionBytes); }); };
    const transition = () => {
      endTransition();
      if (!presented) return;
      const previous = renderedKey && surface.width ? surface : sourceElement;
      if (previous) endTransition = displayRasterTransition(element, previous, bytes => { transitionBytes = bytes; report(rasterBytes); });
    };
    const present = (status: string) => { presented = status === 'ready' || status === 'original'; const rendered = status === 'ready' ? key : ''; setPresentation(old => old.source === sourceKey && old.status === status && old.rendered === rendered ? old : { source: sourceKey, status, rendered }); };
    // Hide a retired surface in the React commit before releasing its pixels.
    // Clearing it here can expose a blank canvas while its ready class is live.
    const clear = (status = 'pending') => { clearTimeout(timer); stop(); key = ''; renderedKey = ''; report(0); present(status); };
    const sample = () => {
      wait();
      if (disposed) return;
      if (!visible) {
        if (!observed) return;
        if (displaySamplingMoving()) { clearTimeout(timer); stop(); key = ''; wait = afterDisplaySamplingMotion(sample); return; }
        clear(); return;
      }
      const source = element.querySelector<HTMLImageElement | HTMLCanvasElement>(processed ? '.reader-processed-image' : '.reader-effects-original img,.reader-effects-original canvas');
      if (!source) return;
      const url = source instanceof HTMLImageElement ? source.currentSrc || source.src : sourceKey;
      if (source !== sourceElement || url !== sourceUrl) { clear(); sourceElement = source; sourceUrl = url; }
      // Keep the current pixels throughout zoom restore/settle, including when
      // crossing the original-size cutoff. Prepare one final sample at rest.
      // New incoming pages still prepare normally while a swipe is in progress.
      if (presented && displaySamplingMoving()) {
        clearTimeout(timer); stop(); key = ''; wait = afterDisplaySamplingMotion(sample); return;
      }
      // Lazy images can stay undecoded until they enter the viewport. Use the
      // already-authorized header dimensions to prepare them in the worker.
      const width = source instanceof HTMLImageElement ? source.naturalWidth || (!processed ? originalWidth : 0) : source.width;
      const height = source instanceof HTMLImageElement ? source.naturalHeight || (!processed ? originalHeight : 0) : source.height;
      // ResizeObserver supplies layout dimensions without a forced layout in
      // the pointer loop. Zoom is a separate transform on the spread.
      if (!box) {
        if (displaySamplingMoving()) { wait = afterDisplaySamplingMotion(sample); return; }
        const rect = element.getBoundingClientRect();
        const scale = Number(spread?.style.scale) || 1;
        box = { width: rect.width / scale, height: rect.height / scale };
      }
      const scale = Number(spread?.style.scale) || 1;
      const target = displaySamplingSize(width,height,box.width * scale,box.height * scale,window.devicePixelRatio || 1);
      if (!width || !height) return;
      if (!target) { if (renderedKey) transition(); clear('original'); return; }
      const nextKey = `${sourceKey}:${target.width}:${target.height}`;
      if (failedKey === nextKey) return;
      if (key === nextKey) return;
      if (renderedKey === nextKey && surface.width === target.width && surface.height === target.height) { key = nextKey; alignDisplayRaster(surface,element); present('ready'); return; }
      clearTimeout(timer); stop(); key = nextKey; if (!preserve && !presented && (!surface.width || !surface.height)) present('pending');
      // Coalesce window/zoom changes. Drag translations never enter this path.
      timer = window.setTimeout(() => {
        stop = queueDisplaySampling(source,target.width,target.height,bitmap => {
          if (disposed || !visible || key !== nextKey) { bitmap.close(); return; }
          if (presented && displaySamplingMoving()) { bitmap.close(); key = ''; wait = afterDisplaySamplingMotion(sample); return; }
          transition(); surface.width = target.width; surface.height = target.height;
          // Own a copy: a transferred WebGL image can disappear when its worker
          // exits, despite bitmaprenderer and the DOM still reporting ready.
          const context = surface.getContext('2d');
          try { if (!context) throw Error('Display surface unavailable'); context.drawImage(bitmap,0,0); }
          catch { failedKey = nextKey; clear('original'); return; }
          finally { bitmap.close(); }
          // Size, pixel copy and the physical-pixel mapping change together;
          // there must be no frame using a new bitmap with the old mapping.
          renderedKey = nextKey; alignDisplayRaster(surface,element);
          report(target.width*target.height*4); present('ready');
        },urgent,() => { if (key === nextKey) { failedKey = nextKey; clear('original'); } });
      }, presented ? 40 : 0);
    };
    const resize = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) box = { width: rect.width, height: rect.height }; sample(); });
    layoutChanged.current = () => {
      const rect = element.getBoundingClientRect(), scale = Number(spread?.style.scale) || 1;
      box = { width: rect.width / scale, height: rect.height / scale }; sample();
    };
    const sourceChanges = new MutationObserver(records => { if (records.some(record => record.target !== surface && !(record.target instanceof Element && record.target.closest('.reader-quality-transition')))) sample(); });
    sourceChanges.observe(element,{ childList:true,subtree:true,attributes:true,attributeFilter:['src','width','height'] });
    let unwatchZoom = () => {};
    // Prepare several viewports ahead and let URL jobs continue off-thread as
    // new pages approach during a long drag. Screen pages retain priority.
    const intersection = new IntersectionObserver(entries => {
      observed = true;
      visible = entries[0]?.isIntersecting ?? false;
      const rect = entries[0]?.boundingClientRect;
      if (!box && rect?.width && rect.height) { const scale = Number(spread?.style.scale) || 1; box = { width: rect.width / scale, height: rect.height / scale }; }
      unwatchZoom(); unwatchZoom = visible && spread ? watchZoom(spread,() => { preserve = true; try { sample(); } finally { preserve = false; } }) : () => {};
      sample();
    }, { root, rootMargin: '400%', threshold: 0 });
    let onScreenVisible = true;
    priorityChanged.current = () => { urgent = requestedPriority.current ?? onScreenVisible; stop.prioritize?.(urgent); };
    priorityChanged.current();
    const onScreen = new IntersectionObserver(entries => { onScreenVisible = entries[0]?.isIntersecting ?? false; priorityChanged.current(); }, { root, threshold: 0 });
    intersection.observe(element); onScreen.observe(element); resize.observe(element); element.addEventListener('load',sample,true); window.addEventListener('resize',sample);
    return () => { disposed=true;endTransition();priorityChanged.current=()=>{};layoutChanged.current=()=>{};clearTimeout(timer);wait();bytesWait();stop();intersection.disconnect();onScreen.disconnect();resize.disconnect();sourceChanges.disconnect();unwatchZoom();element.removeEventListener('load',sample,true);window.removeEventListener('resize',sample);surface.width=surface.height=0;reportBytes?.(0); };
  },[sourceKey,enabled,processed,host,originalWidth,originalHeight]);
  useLayoutEffect(() => {
    if (presentation.source === sourceKey && presentation.status !== 'ready') {
      const surface = canvas.current;
      if (surface && (surface.width || surface.height)) surface.width = surface.height = 0;
    }
  }, [presentation,sourceKey]);
  useLayoutEffect(() => { if (layoutKey) layoutChanged.current(); }, [layoutKey]);
  useLayoutEffect(() => priorityChanged.current(), [priority]);
  const supported = typeof createImageBitmap === 'function' && typeof Worker !== 'undefined';
  return { canvas, revision: presentation.rendered, ready: enabled && presentation.source === sourceKey && presentation.status === 'ready', pending: enabled && supported && (presentation.source !== sourceKey || presentation.status === 'pending') };
}
