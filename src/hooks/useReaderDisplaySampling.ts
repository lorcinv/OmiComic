import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { afterDisplaySamplingMotion, displaySamplingMoving, displaySamplingSize, queueDisplaySampling } from '../reader/displaySampling';

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

export default function useReaderDisplaySampling(host: RefObject<HTMLDivElement>, sourceKey: string, enabled: boolean, processed: boolean, onBytes?: (bytes: number) => void, originalSize?: { width?: number; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null), notify = useRef(onBytes);
  notify.current = onBytes;
  const [ready, setReady] = useState('');
  const originalWidth = originalSize?.width || 0, originalHeight = originalSize?.height || 0;
  useLayoutEffect(() => {
    const element = host.current, surface = canvas.current;
    if (!enabled || !element || !surface || typeof createImageBitmap !== 'function' || typeof Worker === 'undefined') return;
    const reportBytes = notify.current, root = element.closest<HTMLElement>('.reader-stage');
    let visible = false, urgent = true, disposed = false, timer = 0, stop: (() => void) & { prioritize?: (value: boolean) => void } = () => {}, wait = () => {}, bytesWait = () => {}, key = '', sourceUrl = '', sourceElement: HTMLImageElement | HTMLCanvasElement | null = null;
    let box: { width: number; height: number } | null = null;
    const spread = element.closest<HTMLElement>('.reader-page-spread');
    const report = (bytes: number) => { bytesWait(); bytesWait = afterDisplaySamplingMotion(() => { if (!disposed) reportBytes?.(bytes); }); };
    const clear = () => { clearTimeout(timer); stop(); key = ''; if (surface.width || surface.height) surface.width = surface.height = 0; report(0); setReady(''); };
    const sample = () => {
      wait();
      if (disposed) return;
      if (!visible) {
        if (displaySamplingMoving()) { clearTimeout(timer); stop(); key = ''; wait = afterDisplaySamplingMotion(sample); return; }
        clear(); return;
      }
      const source = element.querySelector<HTMLImageElement | HTMLCanvasElement>(processed ? '.reader-processed-image' : '.reader-effects-original img,.reader-effects-original canvas');
      if (!source) return;
      const url = source instanceof HTMLImageElement ? source.currentSrc || source.src : sourceKey;
      if (source !== sourceElement || url !== sourceUrl) { clear(); sourceElement = source; sourceUrl = url; }
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
      if (!target) { clear(); return; }
      const nextKey = `${sourceKey}:${target.width}:${target.height}`;
      if (key === nextKey) return;
      clearTimeout(timer); stop(); key = nextKey;
      // Coalesce window/zoom changes. Drag translations never enter this path.
      timer = window.setTimeout(() => {
        stop = queueDisplaySampling(source,target.width,target.height,bitmap => {
          if (disposed || !visible || key !== nextKey) { bitmap.close(); return; }
          surface.width = target.width; surface.height = target.height;
          // Own a copy: a transferred WebGL image can disappear when its worker
          // exits, despite bitmaprenderer and the DOM still reporting ready.
          const context = surface.getContext('2d');
          try { if (!context) { key = ''; return; } context.drawImage(bitmap,0,0); }
          finally { bitmap.close(); }
          report(target.width*target.height*4); setReady(sourceKey);
        },urgent,() => { if (key === nextKey) key = ''; });
      }, 40);
    };
    const resize = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) box = { width: rect.width, height: rect.height }; sample(); });
    const sourceChanges = new MutationObserver(records => { if (records.some(record => record.target !== surface)) sample(); });
    sourceChanges.observe(element,{ childList:true,subtree:true,attributes:true,attributeFilter:['src','width','height'] });
    let unwatchZoom = () => {};
    // Prepare several viewports ahead and let URL jobs continue off-thread as
    // new pages approach during a long drag. Screen pages retain priority.
    const intersection = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      const rect = entries[0]?.boundingClientRect;
      if (!box && rect?.width && rect.height) { const scale = Number(spread?.style.scale) || 1; box = { width: rect.width / scale, height: rect.height / scale }; }
      unwatchZoom(); unwatchZoom = visible && spread ? watchZoom(spread,sample) : () => {};
      sample();
    }, { root, rootMargin: '400%', threshold: 0 });
    const onScreen = new IntersectionObserver(entries => { urgent = entries[0]?.isIntersecting ?? false; stop.prioritize?.(urgent); }, { root, threshold: 0 });
    intersection.observe(element); onScreen.observe(element); resize.observe(element); element.addEventListener('load',sample,true); window.addEventListener('resize',sample);
    return () => { disposed=true;clearTimeout(timer);wait();bytesWait();stop();intersection.disconnect();onScreen.disconnect();resize.disconnect();sourceChanges.disconnect();unwatchZoom();element.removeEventListener('load',sample,true);window.removeEventListener('resize',sample);surface.width=surface.height=0;reportBytes?.(0); };
  },[sourceKey,enabled,processed,host,originalWidth,originalHeight]);
  return { canvas, ready: enabled && ready === sourceKey };
}
