/** Map a prepared bitmap to the layout box. A jump animation can temporarily
 * scale an ancestor; that presentation scale must never become its resting size. */
export function alignDisplayRaster(canvas: HTMLCanvasElement, element: HTMLElement) {
  if (!canvas.width || !canvas.height) return;
  const dpr = window.devicePixelRatio || 1;
  const zoom = Number(element.closest<HTMLElement>('.reader-page-spread')?.style.scale) || 1;
  const rect = element.getBoundingClientRect(), layout = getComputedStyle(element);
  const width = Number.parseFloat(layout.width) || rect.width / zoom;
  const height = Number.parseFloat(layout.height) || rect.height / zoom;
  canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
  canvas.style.transformOrigin = '0 0';
  canvas.style.transform = `translate(${(Math.round(rect.left * dpr) / dpr - rect.left) / zoom}px,${(Math.round(rect.top * dpr) / dpr - rect.top) / zoom}px) scale(${Math.round(width * zoom * dpr) / (dpr * zoom * canvas.width)},${Math.round(height * zoom * dpr) / (dpr * zoom * canvas.height)})`;
}
