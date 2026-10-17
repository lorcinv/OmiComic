import type { 阅读器缩放模式 } from "../types";

export interface PageSize { width: number; height: number }

// Pair only when the chosen scale fits both pages in the usable viewport.
export function canPairPages(first: PageSize | undefined, second: PageSize | undefined, viewport: PageSize, mode: 阅读器缩放模式): boolean {
  if (mode === "fit-window") return true;
  if (!first || !second || viewport.width <= 0 || viewport.height <= 0) return true;
  if (mode === "original") return first.width + second.width <= viewport.width && Math.max(first.height, second.height) <= viewport.height;
  if (mode === "fit-width") return viewport.width / (first.width / first.height + second.width / second.height) <= viewport.height + 0.5;
  return (first.width / first.height + second.width / second.height) * viewport.height <= viewport.width + 0.5;
}

export function fitPage(size: PageSize, viewport: PageSize, mode: 阅读器缩放模式): PageSize {
  if (mode === "original" || viewport.width <= 0 || viewport.height <= 0) return size;
  const scale = mode === "fit-width"
    ? viewport.width / size.width
    : mode === "fit-height"
      ? viewport.height / size.height
      : Math.min(viewport.width / size.width, viewport.height / size.height);
  return { width: size.width * scale, height: size.height * scale };
}

export function fitSpread(pages: PageSize[], viewport: PageSize, mode: 阅读器缩放模式): PageSize[] {
  if (pages.length < 2 || mode === "original") return pages.map(size => fitPage(size, viewport, mode));
  const widthFitHeight = viewport.width / pages.reduce((sum, size) => sum + size.width / size.height, 0);
  const height = mode === "fit-width" ? widthFitHeight : mode === "fit-height" ? viewport.height : Math.min(viewport.height, widthFitHeight);
  return pages.map(size => ({ width: height * size.width / size.height, height }));
}

// Panorama fits only the cross axis. Its long axis stays continuous and can
// be dragged, independently of the ordinary reader's saved zoom selection.
export function fitPanorama(size: PageSize, viewport: PageSize, vertical: boolean): PageSize {
  const scale = vertical ? viewport.width / size.width : viewport.height / size.height;
  return { width: size.width * scale, height: size.height * scale };
}

export function panoramaScrollBounds(firstCenter: number, lastCenter: number, firstLength: number, lastLength: number, viewportLength: number, anchor: number): { min: number; max: number } {
  return {
    min: anchor - lastCenter - Math.max(0, (lastLength - viewportLength) / 2),
    max: anchor - firstCenter + Math.max(0, (firstLength - viewportLength) / 2),
  };
}
