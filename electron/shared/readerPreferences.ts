export type PageSort = "name-asc" | "name-desc" | "time-asc" | "time-desc";
export interface ImageAdjustments {
  enabled: boolean; brightness: number; contrast: number; gamma: number;
  warmth: number; grayscale: boolean; invert: boolean; sharpen: number; denoise: number;
}
export interface AutoReadOptions { intervalSeconds: number; scrollPixelsPerSecond: number }
export interface ReaderPreferences {
  pageSort?: PageSort;
  adjustments?: ImageAdjustments;
  autoRead?: AutoReadOptions;
  pairingAnchorId?: string;
}
export const DEFAULT_ADJUSTMENTS: ImageAdjustments = { enabled: false, brightness: 100, contrast: 100, gamma: 1, warmth: 0, grayscale: false, invert: false, sharpen: 0, denoise: 0 };
export const DEFAULT_AUTO_READ: AutoReadOptions = { intervalSeconds: 5, scrollPixelsPerSecond: 80 };
export const PAGE_SORT_OPTIONS = [
  { value: "name-asc" as const, label: "文件名自然升序" },
  { value: "name-desc" as const, label: "文件名自然降序" },
  { value: "time-asc" as const, label: "修改时间升序" },
  { value: "time-desc" as const, label: "修改时间降序" },
];
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
export function normalizePageSort(value: unknown): PageSort { return PAGE_SORT_OPTIONS.some(o => o.value === value) ? value as PageSort : "name-asc"; }
export function normalizeAdjustments(value: unknown): ImageAdjustments {
  const v = (value && typeof value === "object" ? value : {}) as Partial<ImageAdjustments>;
  return { enabled: v.enabled === true, brightness: number(v.brightness, 100, 50, 150), contrast: number(v.contrast, 100, 50, 150), gamma: number(v.gamma, 1, .5, 2), warmth: number(v.warmth, 0, 0, 100), grayscale: v.grayscale === true, invert: v.invert === true, sharpen: number(v.sharpen, 0, 0, 100), denoise: number(v.denoise, 0, 0, 100) };
}
export function normalizeAutoRead(value: unknown): AutoReadOptions {
  const v = (value && typeof value === "object" ? value : {}) as Partial<AutoReadOptions>;
  return { intervalSeconds: number(v.intervalSeconds, 5, 1, 60), scrollPixelsPerSecond: number(v.scrollPixelsPerSecond, 80, 10, 400) };
}
export function normalizeReaderPreferences(value: ReaderPreferences): ReaderPreferences {
  return { pageSort: normalizePageSort(value.pageSort), adjustments: normalizeAdjustments(value.adjustments), autoRead: normalizeAutoRead(value.autoRead), pairingAnchorId: typeof value.pairingAnchorId === "string" ? value.pairingAnchorId : undefined };
}
export interface IdentifiedPage { index: number; name: string; type: string; sourcePath: string; virtualPath?: string; archiveInnerPath?: string; pageId?: string; modifiedAt?: number }
export function pageIdentity(page: IdentifiedPage): string {
  if (page.type === 'pdf-page' || page.type === 'epub-chapter') return page.pageId ?? `${page.type}:${page.index}`;
  return page.pageId ?? `${page.type}:${(page.archiveInnerPath ?? page.virtualPath ?? page.name).replace(/\\/g, "/")}`;
}
const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function sortReaderPages<T extends IdentifiedPage>(pages: T[], mode: PageSort): T[] {
  const named = (a: T, b: T) => collator.compare(a.name, b.name) || ordinal(a.name, b.name) || ordinal(pageIdentity(a), pageIdentity(b));
  return [...pages].sort((a, b) => {
    if (mode.startsWith("time")) {
      const ta = typeof a.modifiedAt === "number" && Number.isFinite(a.modifiedAt) ? a.modifiedAt : null;
      const tb = typeof b.modifiedAt === "number" && Number.isFinite(b.modifiedAt) ? b.modifiedAt : null;
      if (ta === null || tb === null) return ta === tb ? named(a, b) : ta === null ? 1 : -1;
      return (ta - tb) * (mode === "time-desc" ? -1 : 1) || named(a, b);
    }
    return named(a, b) * (mode === "name-desc" ? -1 : 1);
  }).map((page, index) => ({ ...page, index, pageId: pageIdentity(page) }));
}
export function resolvePageIndex(pages: IdentifiedPage[], identity: string | undefined, name: string | undefined, fallback: number): number {
  const found = identity ? pages.findIndex(page => pageIdentity(page) === identity) : name ? pages.findIndex(page => page.name === name || page.archiveInnerPath === name) : -1;
  return found >= 0 ? found : Math.max(0, Math.min(pages.length - 1, fallback));
}
export function bookmarkMatches(bookmark: { pageId?: string; pageName?: string; archiveInnerPath?: string; sourceType: string; pageIndex: number }, index: number, identity?: string): boolean {
  if (!identity) return bookmark.pageIndex === index;
  if (!bookmark.pageId && (bookmark.sourceType === 'pdf' || bookmark.sourceType === 'epub')) return bookmark.pageIndex === index;
  const legacyName = bookmark.archiveInnerPath ?? bookmark.pageName;
  const legacyId = legacyName ? `${bookmark.sourceType === "archive" ? "archive-image" : bookmark.sourceType === "pdf" ? "pdf-page" : bookmark.sourceType === "epub" ? "epub-chapter" : "folder-image"}:${legacyName.replace(/\\/g, "/")}` : undefined;
  return bookmark.pageId || legacyId ? (bookmark.pageId ?? legacyId) === identity : bookmark.pageIndex === index;
}
