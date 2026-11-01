// PC fit rendering is bounded by decoded pixels, not the compression ratio.
// A noisy/color PNG can exceed 5 MiB while needing less RAM than a small gray PNG.
// The Android decoder and its native budget do not use these thresholds.
export function preferDesktopViewportDisplay(width=0,height=0): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width>0 && height>0
    && (width*height>32_000_000 || Math.max(width,height)>32768);
}
