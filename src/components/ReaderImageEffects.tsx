import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ImageAdjustments } from '../../electron/shared/readerPreferences';
import { queueImageProcessing, processingPreviewSize } from '../reader/processingClient';
import useReaderDisplaySampling from '../hooks/useReaderDisplaySampling';
import { alignDisplayRaster } from '../reader/displayGeometry';
import useReaderViewportRaster from '../hooks/useReaderViewportRaster';
import { preferDesktopViewportDisplay } from '../reader/desktopDisplayPolicy';
import { isAndroid } from '../platform';

export function imageFilter(settings: ImageAdjustments, gammaId: string): string {
  if (!settings.enabled || settings.gamma === 1 && settings.brightness === 100 && settings.contrast === 100 && settings.warmth === 0 && !settings.grayscale && !settings.invert) return 'none';
  return `${settings.gamma !== 1 ? `url("#${gammaId}") ` : ''}brightness(${settings.brightness / 100}) contrast(${settings.contrast / 100}) sepia(${settings.warmth * .0035}) grayscale(${settings.grayscale ? 1 : 0}) invert(${settings.invert ? 1 : 0})`;
}
export function GammaFilter({ id, gamma }: { id: string; gamma: number }) {
  return <svg width="0" height="0" aria-hidden="true" className="reader-filter-definitions"><defs><filter id={id} colorInterpolationFilters="sRGB"><feComponentTransfer>
    <feFuncR type="gamma" amplitude="1" exponent={1 / gamma} offset="0" />
    <feFuncG type="gamma" amplitude="1" exponent={1 / gamma} offset="0" />
    <feFuncB type="gamma" amplitude="1" exponent={1 / gamma} offset="0" />
  </feComponentTransfer></filter></defs></svg>;
}
export default function ReaderImageEffects({ children, settings, gammaId, sourceKey, alignmentKey = '', layoutKey = '', processable = true, sampleable = true, onRasterBytes, onPrepared, onReadinessChange, sourceWidth, sourceHeight, sourceBytes, nativeZoom = false, samplingPriority }: { children: ReactNode; settings: ImageAdjustments; gammaId: string; sourceKey: string; alignmentKey?: string; layoutKey?: string; processable?: boolean; sampleable?: boolean; onRasterBytes?: (bytes: number) => void; onPrepared?: () => void; onReadinessChange?: (ready:boolean) => void; sourceWidth?: number; sourceHeight?: number; sourceBytes?: number; nativeZoom?: boolean; samplingPriority?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false), [sizeKey, setSizeKey] = useState('');
  const [processed, setProcessed] = useState<{ url: string; key: string } | null>(null), [status, setStatus] = useState('');
  const [decodedProcessed, setDecodedProcessed] = useState<string | null>(null);
  // A fit-size effect preview cannot supply source pixels at native zoom.
  const processing = settings.enabled && processable && (settings.denoise > 0 || settings.sharpen > 0);
  const processingKey = JSON.stringify([sourceKey, layoutKey, sizeKey, settings.denoise, settings.sharpen]);
  const processedUrl = processed?.key === processingKey ? processed.url : null;
  useEffect(() => {
    const element = host.current;
    if (!element || !processing) return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false), { root: element.closest('.reader-stage'), threshold: 0 });
    const resize = new ResizeObserver(() => { const box = element.getBoundingClientRect(); setSizeKey(`${Math.round(box.width)}:${Math.round(box.height)}`); });
    observer.observe(element); resize.observe(element);
    return () => { observer.disconnect(); resize.disconnect(); setVisible(false); };
  }, [processing]);
  useEffect(() => {
    setProcessed(null); setStatus('');
    if (!processing || !visible) return;
    let cancelled = false, dispose = () => {}, url: string | null = null;
    const delay = window.setTimeout(() => {
      setStatus('正在处理画面…');
      dispose = queueImageProcessing(async () => {
        const image = host.current?.querySelector('.reader-effects-original img,.reader-effects-original canvas') as HTMLImageElement | HTMLCanvasElement | null;
        if (!image) throw new Error('No raster source');
        if (image instanceof HTMLImageElement) await image.decode();
        if (cancelled) throw new Error('Cancelled');
        const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
        const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
        const box = image.getBoundingClientRect();
        const target = processingPreviewSize(width, height, box.width, box.height, window.devicePixelRatio || 1);
        return createImageBitmap(image, { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' });
      }, settings.denoise, settings.sharpen, result => {
        if (cancelled) return;
        if (result.blob) { url = URL.createObjectURL(result.blob); setProcessed({ url, key: processingKey }); setStatus(''); }
        else setStatus(result.error ?? '');
      });
    }, 100);
    return () => { cancelled = true; clearTimeout(delay); dispose(); if (url) URL.revokeObjectURL(url); };
  }, [processingKey, processing, visible]);
  const displayProcessed = !nativeZoom && processing && processedUrl && processedUrl === decodedProcessed;
  // Both surfaces can coexist during zoom. Keep accounting with the source
  // owner, including its final release when another book reuses this element.
  const allocations=useMemo(()=>{let sampled=0,viewport=0;const owner=onRasterBytes;return {
    sampled:(bytes:number)=>{sampled=bytes;owner?.(sampled+viewport);},
    viewport:(bytes:number)=>{viewport=bytes;owner?.(sampled+viewport);},
  };},[sourceKey]);
  const viewportEnabled=!isAndroid()&&sampleable&&processable&&!displayProcessed&&(nativeZoom||preferDesktopViewportDisplay(sourceWidth,sourceHeight));
  // The effect worker already prepares a display-sized image, as in 1.1.38.
  // Resampling it again costs a second job and softens the same pixels twice.
  // Fit-size antialiasing stays off-thread and never gates navigation. Every
  // enlargement uses the source viewport immediately, including modest zooms.
  const sampled = useReaderDisplaySampling(host, sourceKey, sampleable && processable && !processing, false, allocations.sampled, { width: sourceWidth, height: sourceHeight, encodedBytes: sourceBytes }, layoutKey, samplingPriority,!isAndroid(),nativeZoom);
  const viewport=useReaderViewportRaster(host,sourceKey,viewportEnabled,allocations.viewport,nativeZoom&&settings.enabled?settings.denoise:0,nativeZoom&&settings.enabled?settings.sharpen:0,alignmentKey);
  const prepared = useRef(onPrepared); prepared.current = onPrepared;
  const readiness = useRef(onReadinessChange); readiness.current = onReadinessChange;
  useLayoutEffect(() => {
    const canvas = sampled.canvas.current, element = host.current;
    if (!sampled.ready || !canvas || !element) return;
    const align = () => {
      alignDisplayRaster(canvas, element);
      element.querySelectorAll<HTMLCanvasElement>('.reader-quality-transition').forEach(overlay => alignDisplayRaster(overlay, element));
    };
    const spread = element.closest('.reader-page-spread');
    spread?.addEventListener('omi-reader-aligned', align); align();
    return () => spread?.removeEventListener('omi-reader-aligned', align);
  }, [sampled.ready, sampled.revision, sourceKey, alignmentKey]);
  useLayoutEffect(() => { readiness.current?.(sampled.prepared); if (sampled.prepared) prepared.current?.(); return () => readiness.current?.(false); }, [sourceKey, sampled.prepared]);
  return <div ref={host} className={`reader-effects ${displayProcessed ? 'has-processed-image' : ''} ${sampled.ready ? 'has-display-raster' : ''} ${sampled.pending ? 'is-display-pending' : ''}`} style={{ filter: imageFilter(settings, gammaId) }} data-display-sampling={sampled.pending ? 'pending' : sampled.ready ? 'ready' : 'original'} data-processing={status === '正在处理画面…' ? 'pending' : status ? 'error' : displayProcessed ? 'ready' : 'original'}>
    <div className="reader-effects-original">{children}</div>
    {processing && processedUrl && <img className="reader-processed-image" src={processedUrl} style={displayProcessed ? undefined : {visibility:'hidden'}} alt="" aria-hidden="true" draggable={false} onLoad={async event => { const img=event.currentTarget,url=processedUrl;try{await img.decode();}catch{return;}if(img.isConnected)setDecodedProcessed(url); }} />}
    {sampleable && processable && <canvas ref={sampled.canvas} width={0} height={0} className="reader-display-raster" aria-hidden="true" />}
    {viewportEnabled && <canvas ref={viewport} width={0} height={0} className="reader-viewport-raster" aria-hidden="true" />}
    {status && <span className="reader-processing-status" role={status.includes('失败') || status.includes('无法') || status.includes('超时') ? 'alert' : 'status'}>{status}</span>}
  </div>;
}
