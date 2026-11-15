export type SplitHalf = 'L' | 'R';
export type SplitPart = 0 | 1;
export const SPLIT_WIDE_RATIO = 1.2;
export function splitHalf(part: SplitPart, rtl: boolean): SplitHalf {
  return (part === 0) !== rtl ? 'L' : 'R';
}
export function splitPart(half: SplitHalf | undefined, rtl: boolean): SplitPart {
  return half && half !== splitHalf(0, rtl) ? 1 : 0;
}
export function splitIdentity(identity: string, half?: SplitHalf): string {
  return half ? `omi-split:${half}:${identity}` : identity;
}
export function parseSplitIdentity(identity?: string): { identity?: string; half?: SplitHalf } {
  const match = /^omi-split:([LR]):([\s\S]+)$/.exec(identity ?? '');
  return match ? { identity: match[2], half: match[1] as SplitHalf } : { identity };
}
/** Used by both persistence backends, including normalization after restarting. */
export function sourcePageProgress(index: number, total: number, view?: { splitWidePages?: boolean; splitPageHalf?: SplitHalf; pageMode?: string; pageDirection?: string; panorama?: boolean }) {
  const split = view?.splitWidePages === true && view.pageMode === 'single' && !view.panorama;
  const firstHalf = split && view.splitPageHalf === splitHalf(0, view.pageDirection === 'right-to-left');
  const completed = index >= total - 1 && !firstHalf;
  const percent = Math.round((index + (firstHalf ? .5 : 1)) / Math.max(1, total) * 100);
  return { completed, percent: split && !completed ? Math.min(99, percent) : percent };
}
/** Source indices never change. The part is only a position within a source page. */
export function adjacentSplitPosition(index: number, part: SplitPart, direction: 1 | -1, total: number, wide: boolean): { index: number; part: SplitPart } | null {
  if (wide && (direction > 0 ? part === 0 : part === 1)) return { index, part: direction > 0 ? 1 : 0 };
  const next = index + direction;
  return next < 0 || next >= total ? null : { index: next, part: direction > 0 ? 0 : 1 };
}
