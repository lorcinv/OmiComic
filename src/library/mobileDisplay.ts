import type { AppSettings, MobileDisplayScope, MobileDisplaySettings } from '../types';

export const mobileDisplayLabels: Record<MobileDisplayScope, string> = {
  directory: '资源库', bookshelf: '书架', favorites: '收藏', bookmarks: '书签', recent: '最近阅读',
};
export function mobileDisplayScope(view: string): MobileDisplayScope {
  return view === 'virtual-folder' || view === 'bookshelf' ? 'bookshelf'
    : view === 'favorites' || view === 'bookmarks' || view === 'recent' ? view : 'directory';
}
export function getMobileDisplay(settings: Partial<AppSettings>, scope: MobileDisplayScope): MobileDisplaySettings {
  const saved = settings.mobileViewDisplays?.[scope];
  const clamp = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  return {
    layout: (saved?.layout ?? settings.mobileLibraryLayout) === 'list' ? 'list' : 'grid',
    columns: clamp(saved?.columns ?? settings.mobileGridColumns, 2, 2, 6),
    coverSize: clamp(saved?.coverSize ?? settings.mobileListCoverSize, 82, 64, 132),
  };
}
export function patchMobileDisplay(settings: Partial<AppSettings>, scope: MobileDisplayScope, patch: Partial<MobileDisplaySettings>): Partial<AppSettings> {
  // Snapshot legacy global values once so editing one page never changes the
  // fallback of an untouched page, including after an upgrade or restart.
  const displays = Object.fromEntries((Object.keys(mobileDisplayLabels) as MobileDisplayScope[])
    .map(key => [key, getMobileDisplay(settings, key)]));
  return { mobileViewDisplays: { ...displays, [scope]: { ...getMobileDisplay(settings, scope), ...patch } } };
}
