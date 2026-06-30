export type 页面名称 = "资源库" | "阅读器";

export type 资源类型 = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";
export type 阅读页类型 = "folder-image" | "archive-image";
export type 阅读资源类型 = "folder" | "image" | "archive";
export type 卡片尺寸 = "small" | "medium" | "large";
export type 每页数量 = 60 | 100 | 150 | 200;
export type 排序方式 = "name-asc" | "name-desc" | "time-asc" | "time-desc" | "type";
export type 进度文本模式 = "page" | "percent";
export type 进度条粗细 = "thin" | "normal" | "thick";
export type 阅读器缩放模式 = "fit-width" | "fit-height" | "original";
export type 阅读器页模式 = "single" | "double";
export type 双页阅读方向 = "left-to-right" | "right-to-left";
export type 沉浸自动隐藏延迟 = 500 | 1000 | 1500 | 2000 | 2500 | 3000;
export type 图书切换按钮透明度 = 20 | 30 | 40 | 50 | 60 | 70 | 80;
export type 整理侧边栏透明度 = 70 | 80 | 90 | 100;
export type 书架备注悬停延迟 = 0 | 500 | 1000 | 1500 | 2000;
export type 批量删除确认类型 = "favorites" | "bookmarks" | "recent";
export type 标签搜索模式 = "fuzzy" | "exact";

export type 批量删除确认设置 = Record<批量删除确认类型, boolean>;

export interface LibraryRoot {
  path: string;
  name: string;
  addedAt: number;
  lastOpenedAt: number;
}

export interface AppSettings {
  cardSize: 卡片尺寸;
  pageSize: 每页数量;
  sortMode: 排序方式;
  sortDirection: "asc" | "desc";
  folderFirst: boolean;
  hideBookshelfItemsInLibrary: boolean;
  showProgressBar: boolean;
  showProgressText: boolean;
  progressTextMode: 进度文本模式;
  progressBarThickness: 进度条粗细;
  readerDefaultFitMode: 阅读器缩放模式;
  readerPageMode: 阅读器页模式;
  doublePageFirstSingle: boolean;
  doublePageDirection: 双页阅读方向;
  smartDetectSpreadPage: boolean;
  wheelPageTurn: boolean;
  immersiveAutoHide: boolean;
  immersiveAutoHideDelay: 沉浸自动隐藏延迟;
  bookSwitchButtonOpacity: 图书切换按钮透明度;
  organizeDrawerOpacity: 整理侧边栏透明度;
  bookshelfNoteHoverDelayMs: 书架备注悬停延迟;
  tagSearchMode: 标签搜索模式;
  confirmBeforeDeleteTags: boolean;
  confirmBeforeBatchDelete: 批量删除确认设置;
}

export interface ReadingProgress {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  currentPageIndex: number;
  totalPages: number;
  currentPageName?: string;
  percent: number;
  completed: boolean;
  hasStartedReading: boolean;
  firstReadAt: number;
  updatedAt: number;
}

export interface RecentOpenedItem {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  currentPageIndex: number;
  totalPages: number;
  updatedAt: number;
}

export interface FavoriteItem {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  note?: string;
  tags?: string[];
  addedAt: number;
  updatedAt: number;
}

export interface BookmarkItem {
  id: string;
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  pageIndex: number;
  totalPages: number;
  pageName?: string;
  archiveInnerPath?: string;
  thumbnailUrl?: string;
  note?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface 整理信息输入 {
  note?: string;
  tags?: string[];
}

export interface ResourceMetaItem {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
  note: string;
  tags: string[];
  updatedAt: number;
}

export interface ResourceMetaInput extends 整理信息输入 {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
}

export interface VirtualFolderItem {
  id: string;
  folderId: string;
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
  addedAt: number;
  sortIndex: number;
}

export interface VirtualFolder {
  id: string;
  name: string;
  note: string;
  tags: string[];
  items: VirtualFolderItem[];
  createdAt: number;
  updatedAt: number;
  sortIndex: number;
}

export interface VirtualFolderItemInput {
  resourceKey: string;
  sourcePath: string;
  sourceType: 资源类型;
  title: string;
}

export interface OmiComicAppData {
  version: number;
  library: {
    roots: LibraryRoot[];
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  };
  settings: AppSettings;
  readingProgress: Record<string, ReadingProgress>;
  recentOpened: RecentOpenedItem[];
  favorites: FavoriteItem[];
  bookmarks: BookmarkItem[];
  resourceMeta: Record<string, ResourceMetaItem>;
  tagOrder: string[];
  virtualFolders: VirtualFolder[];
}

export interface 应用信息 {
  name: string;
  version: string;
  platform: string;
}

export interface 文件条目 {
  id: string;
  name: string;
  path: string;
  type: 资源类型;
  extension: string;
  size?: number;
  modifiedAt?: number;
  hasError?: boolean;
  errorMessage?: string;
}

export interface 目录结果 {
  path: string;
  parentPath: string | null;
  items: 文件条目[];
  total: number;
}

export interface 打开资源输入 {
  path: string;
  type: 阅读资源类型;
}

export interface 阅读页面项 {
  index: number;
  name: string;
  sourcePath: string;
  virtualPath?: string;
  archiveInnerPath?: string;
  type: 阅读页类型;
}

export interface 阅读资源结果 {
  key: string;
  resourceKey: string;
  title: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  pages: 阅读页面项[];
  total: number;
}

export interface 阅读相邻资源项 {
  key: string;
  path: string;
  type: 阅读资源类型;
  title: string;
}

export interface 阅读打开上下文 {
  source: "directory" | "recent" | "favorites" | "bookmarks" | "virtual-folder";
  currentKey: string;
  items: 阅读相邻资源项[];
}

export interface 获取页面图片输入 {
  sourcePath: string;
  virtualPath?: string;
  archiveInnerPath?: string;
  readerSessionId?: number;
  type: 阅读页类型;
}

export interface 页面图片结果 {
  url: string;
}

export interface 书签页预览输入 {
  sourcePath: string;
  sourceType: 阅读资源类型;
  pageIndex: number;
  pageName?: string;
  archiveInnerPath?: string;
}

export interface 书签页预览结果 {
  dataUrl: string;
}

export interface 缩略图输入 {
  path: string;
  type: 资源类型;
}

export interface 缩略图结果 {
  url: string | null;
}

export interface 可阅读页数输入 {
  path: string;
  type: 资源类型;
}

export interface 操作错误 {
  code: string;
  message: string;
}

export type 操作结果<T> =
  | { ok: true; data: T }
  | { ok: false; error: 操作错误 };

export interface OmiComicApi {
  getAppInfo(): Promise<应用信息>;
  getAppData(): Promise<操作结果<OmiComicAppData>>;
  updateSettings(input: Partial<AppSettings>): Promise<操作结果<AppSettings>>;
  addLibraryRoot(input: { path: string; name: string }): Promise<操作结果<LibraryRoot>>;
  removeLibraryRoot(path: string): Promise<操作结果<LibraryRoot[]>>;
  updateLibraryState(input: {
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  }): Promise<操作结果<null>>;
  getReadingProgress(resourceKey: string): Promise<操作结果<ReadingProgress | null>>;
  saveReadingProgress(input: ReadingProgress): Promise<操作结果<ReadingProgress>>;
  getRecentOpened(): Promise<操作结果<RecentOpenedItem[]>>;
  removeRecentOpened(resourceKey: string): Promise<操作结果<null>>;
  getFavorites(): Promise<操作结果<FavoriteItem[]>>;
  addFavorite(input: Omit<FavoriteItem, "addedAt" | "updatedAt">): Promise<操作结果<FavoriteItem>>;
  updateFavoriteMeta(resourceKey: string, input: 整理信息输入): Promise<操作结果<FavoriteItem>>;
  removeFavorite(resourceKey: string): Promise<操作结果<null>>;
  updateResourceMeta(input: ResourceMetaInput): Promise<操作结果<ResourceMetaItem>>;
  updateTagOrder(tags: string[]): Promise<操作结果<string[]>>;
  deleteTags(tags: string[]): Promise<操作结果<OmiComicAppData>>;
  createVirtualFolder(input: { name: string; note?: string }): Promise<操作结果<VirtualFolder>>;
  updateVirtualFolder(input: { id: string; name?: string; note?: string }): Promise<操作结果<VirtualFolder>>;
  deleteVirtualFolder(id: string): Promise<操作结果<VirtualFolder[]>>;
  addVirtualFolderItems(input: {
    folderId: string;
    items: VirtualFolderItemInput[];
  }): Promise<操作结果<{ folder: VirtualFolder; addedCount: number; skippedCount: number }>>;
  removeVirtualFolderItem(input: { folderId: string; resourceKey: string }): Promise<操作结果<VirtualFolder>>;
  getBookmarks(): Promise<操作结果<BookmarkItem[]>>;
  toggleBookmark(
    input: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt">,
  ): Promise<操作结果<{ bookmarked: boolean; bookmark?: BookmarkItem }>>;
  updateBookmarkMeta(id: string, input: 整理信息输入): Promise<操作结果<BookmarkItem>>;
  removeBookmark(id: string): Promise<操作结果<null>>;
  isPageBookmarked(resourceKey: string, pageIndex: number): Promise<操作结果<boolean>>;
  selectFolder(): Promise<操作结果<string | null>>;
  listDirectory(path: string): Promise<操作结果<目录结果>>;
  getResourcePages(input: 打开资源输入): Promise<操作结果<阅读资源结果>>;
  setReaderSession(id: number): Promise<操作结果<null>>;
  getPageImage(input: 获取页面图片输入): Promise<操作结果<页面图片结果>>;
  getBookmarkPagePreview(input: 书签页预览输入): Promise<操作结果<书签页预览结果>>;
  getThumbnail(input: 缩略图输入): Promise<操作结果<缩略图结果>>;
  getReadablePageCount(input: 可阅读页数输入): Promise<操作结果<number | null>>;
  releaseReaderResource(path: string): Promise<操作结果<null>>;
  setFullscreen(enabled: boolean): Promise<操作结果<boolean>>;
  isFullscreen(): Promise<操作结果<boolean>>;
}
