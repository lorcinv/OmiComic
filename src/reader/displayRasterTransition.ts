import { alignDisplayRaster } from './displayGeometry';

/** Retain the displayed pixels until the complete next quality level is painted.
 * One bounded overlay shares the page's geometry; no image/layout animation. */
export function displayRasterTransition(element: HTMLElement, source: HTMLCanvasElement | HTMLImageElement, onBytes: (bytes: number) => void) {
  if (element.closest('[aria-hidden="true"]') || typeof element.animate !== 'function'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const width = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const height = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  if (!width || !height) return () => {};
  const factor = Math.min(1, Math.sqrt(4_000_000 / (width * height)));
  const overlay = document.createElement('canvas');
  overlay.width = Math.max(1, Math.round(width * factor)); overlay.height = Math.max(1, Math.round(height * factor));
  overlay.className = 'reader-quality-transition'; overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;visibility:visible;z-index:1;';
  try { const context = overlay.getContext('2d'); if (!context) return () => {}; context.drawImage(source, 0, 0, overlay.width, overlay.height); }
  catch { return () => {}; }
  element.appendChild(overlay); alignDisplayRaster(overlay, element);
  onBytes(overlay.width * overlay.height * 4);
  const animation = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in-out', fill: 'forwards' });
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; animation.cancel(); overlay.remove(); overlay.width = overlay.height = 0; onBytes(0); };
  animation.finished.then(dispose, dispose);
  return dispose;
}
