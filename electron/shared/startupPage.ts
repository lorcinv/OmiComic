export const startupPages = [
  { value: 'home', label: '主页' },
  { value: 'directory', label: '资源库' },
  { value: 'bookshelf', label: '书架' },
  { value: 'favorites', label: '收藏' },
  { value: 'bookmarks', label: '书签' },
  { value: 'recent', label: '最近阅读' },
  { value: 'temporary', label: '临时存放' },
] as const;

export type StartupPage = typeof startupPages[number]['value'];
export type LibraryStartupPage = Exclude<StartupPage, 'home'>;

export function normalizeStartupPage(value: unknown): StartupPage | undefined {
  return startupPages.some(page => page.value === value) ? value as StartupPage : undefined;
}

export function effectiveStartupPage(settings: { startupPage?: unknown; showHomePage?: boolean }): StartupPage {
  const page = normalizeStartupPage(settings.startupPage) ?? (settings.showHomePage === false ? 'directory' : 'home');
  return page === 'home' && settings.showHomePage === false ? 'directory' : page;
}
