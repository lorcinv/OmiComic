export interface PageGroupSettings {
  readerPageMode: "single" | "double";
  smartDetectSpreadPage: boolean;
  pairingAnchor?: number;
}

export function clampPage(index: number, total: number): number {
  return Math.max(0, Math.min(Math.floor(index), Math.max(0, total - 1)));
}

function groupLength(start: number, total: number, settings: PageGroupSettings, spread: (index: number) => boolean): number {
  if (settings.readerPageMode === "single" || start + 1 >= total) return 1;
  return settings.smartDetectSpreadPage && (spread(start) || spread(start + 1)) ? 1 : 2;
}

// Pair outward from the page where double-page reading began. A spread always
// stands alone; discovering an earlier page's dimensions never shifts this anchor.
export function normalizeGroup(index: number, total: number, settings: PageGroupSettings, spread: (index: number) => boolean = () => false): number {
  const target = clampPage(index, total);
  if (settings.readerPageMode === "single" || total <= 0) return target;
  const anchor = clampPage(settings.pairingAnchor ?? 0, total);
  if (target >= anchor) {
    let start = anchor;
    while (start < total) {
      const length = groupLength(start, total, settings, spread);
      if (target < start + length) return start;
      start += length;
    }
  } else {
    let end = anchor;
    while (end > 0) {
      const last = end - 1;
      const start = last > 0 && (!settings.smartDetectSpreadPage || (!spread(last) && !spread(last - 1))) ? last - 1 : last;
      if (target >= start) return start;
      end = start;
    }
  }
  return target;
}

export function groupIndices(index: number, total: number, settings: PageGroupSettings, spread: (index: number) => boolean = () => false): number[] {
  if (total <= 0) return [];
  const start = normalizeGroup(index, total, settings, spread);
  return start + 1 < total && normalizeGroup(start + 1, total, settings, spread) === start
    ? [start, start + 1] : [start];
}

export function nextGroup(index: number, total: number, settings: PageGroupSettings, spread: (index: number) => boolean): number {
  const group = groupIndices(index, total, settings, spread);
  return normalizeGroup((group.at(-1) ?? index) + 1, total, settings, spread);
}

export function previousGroup(index: number, total: number, settings: PageGroupSettings, spread: (index: number) => boolean): number {
  return normalizeGroup(normalizeGroup(index, total, settings, spread) - 1, total, settings, spread);
}
