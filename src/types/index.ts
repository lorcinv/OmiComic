import type { ReaderPreferences, PageSort, ImageAdjustments } from "../../electron/shared/readerPreferences";
export type 页面名称 = "首页" | "资源库" | "阅读器";

export type 资源类型 = "folder" | "image" | "archive" | "pdf" | "epub" | "unknown";
export type 阅读页类型 = "folder-image" | "archive-image" | "pdf-page" | "epub-chapter";
export type 阅读资源类型 = "folder" | "image" | "archive" | "pdf" | "epub";
export type 卡片尺寸 = "small" | "medium" | "large";
export type 主题配色 = "mist" | "nord" | "sand" | "night";
export type 每页数量 = 50 | 100 | 150 | 200 | 500;
export type 排序方式 = "name-asc" | "name-desc" | "time-asc" | "time-desc" | "type";
export type 进度文本模式 = "page" | "percent";
export type 进度条粗细 = "thin" | "normal" | "thick";
export type 阅读器缩放模式 = "fit-window" | "fit-width" | "fit-height" | "original";
export type 阅读器页模式 = "single" | "double";
export type 双页阅读方向 = "left-to-right" | "right-to-left";
export type 阅读流向 = "horizontal" | "vertical";
export type 沉浸自动隐藏延迟 = 500 | 1000 | 1500 | 2000 | 2500 | 3000;
export type 图书切换按钮透明度 = 20 | 30 | 40 | 50 | 60 | 70 | 80;
export type 整理侧边栏透明度 = 70 | 80 | 90 | 100;
export type 书架备注悬停延迟 = 0 | 500 | 1000 | 1500 | 2000;
export type 最近打开记录上限 = 50 | 100 | 150 | 200;
export type 批量删除确认类型 = "favorites" | "bookmarks" | "recent";
export type 标签搜索模式 = "fuzzy" | "exact";

export type 批量删除确认设置 = Record<批量删除确认类型, boolean>;

export interface LibraryRoot {
  path: string;
  name: string;
  addedAt: number;
  lastOpenedAt: number;
}

export type MobileDisplayScope = "directory" | "bookshelf" | "favorites" | "bookmarks" | "recent";
export interface MobileDisplaySettings { layout: "grid" | "list"; columns: number; coverSize: number }

export interface AppSettings {
  showHomePage?: boolean;
  desktopInfoFontSize?: number;
  desktopGlobalFontSize?: number;
  desktopReaderAutoHide?: boolean;
  desktopPerformanceProfile?: 'auto' | 'balanced' | 'high' | 'custom';

  language?: 'zh-CN' | 'en' | 'ja';
  mobileViewDisplays?: Partial<Record<MobileDisplayScope, MobileDisplaySettings>>;
  mobileLibraryLayout?: "grid" | "list";
  mobileGridColumns?: number;
  mobileListCoverSize?: number;
  mobileImageAdjustments?: ImageAdjustments;
  readerVolumeKeys?: boolean;
  readerVolumeKeysReversed?: boolean;
  readerVolumePanoramaPages?: number;
  mobileReaderPreviews?: boolean;
  mobileReaderAutoHide?: boolean;
  mobilePreviewWidth?: number;
  mobilePageSize?: 50 | 100 | 150 | 200 | 500;
  colorTheme: 主题配色;
  cardSize: 卡片尺寸;
  cardScale: number;
  detailThumbnailScale: number;
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
  readerDefaultFlow: 阅读流向;
  readerDefaultPanorama: boolean;
  readerDefaultImmersive: boolean;
  doublePageFirstSingle: boolean;
  doublePageDirection: 双页阅读方向;
  smartDetectSpreadPage: boolean;
  wheelPageTurn: boolean;
  immersiveAutoHide: boolean;
  immersiveAutoHideDelay: 沉浸自动隐藏延迟;
  readerHideFooterControls: boolean;
  readerHideImmersiveProgress: boolean;
  readerMemoryCacheSizeMb: number;
  androidReaderDiskCacheSizeMb?: number;
  androidThumbnailCacheSizeMb?: number;
  readerPreloadPages: number;
  readerImageLoadConcurrency: number;
  bookSwitchButtonOpacity: 图书切换按钮透明度;
  organizeDrawerOpacity: 整理侧边栏透明度;
  bookshelfNoteHoverDelayMs: 书架备注悬停延迟;
  recentOpenedLimit: 最近打开记录上限;
  tagSearchMode: 标签搜索模式;
  searchSplitSpaces?: boolean;
  confirmBeforeDeleteTags: boolean;
  confirmBeforeBatchDelete: 批量删除确认设置;
}

export interface ReaderViewState extends ReaderPreferences {
  pairingAnchor?: number;
  fitMode: 阅读器缩放模式;
  pageMode: 阅读器页模式;
  pageDirection: 双页阅读方向;
  flow: 阅读流向;
  panorama: boolean;
  immersive: boolean;
}

export interface ReadingProgress {
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  currentPageIndex: number;
  totalPages: number;
  currentPageName?: string;
  currentPageId?: string;
  percent: number;
  completed: boolean;
  hasStartedReading: boolean;
  firstReadAt: number;
  updatedAt: number;
  readerViewState?: ReaderViewState;
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
  sortIndex: number;
}

export interface BookmarkItem {
  bookmarkTitle?: string;
  id: string;
  resourceKey: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  title: string;
  pageIndex: number;
  totalPages: number;
  pageName?: string;
  pageId?: string;
  archiveInnerPath?: string;
  thumbnailUrl?: string;
  note?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  sortIndex: number;
}

export interface 整理信息输入 {
  bookmarkTitle?: string;
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
  bookshelfId: string;
  name: string;
  note: string;
  tags: string[];
  coverResourceKey?: string;
  items: VirtualFolderItem[];
  createdAt: number;
  updatedAt: number;
  sortIndex: number;
}

export interface Bookshelf {
  id: string;
  name: string;
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
  excludedResourcePaths?: string[];
  version: number;
  library: {
    roots: LibraryRoot[];
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  };
  settings: AppSettings;
  readingProgress: Record<string, ReadingProgress>;
  recentOpened: RecentOpenedItem[];
  temporaryOpened: RecentOpenedItem[];
  removedRecentResourceKeys: string[];
  favorites: FavoriteItem[];
  bookmarks: BookmarkItem[];
  resourceMeta: Record<string, ResourceMetaItem>;
  tagOrder: string[];
  bookshelves: Bookshelf[];
  virtualFolders: VirtualFolder[];
}

export interface 应用信息 {
  name: string;
  version: string;
  platform: string;
}

export interface LibraryCatalog { items: 文件条目[]; directories: number; skipped: number; scannedAt: number; complete?: boolean; removedPaths?: string[]; yielded?: boolean }
export interface CatalogBatchOptions { incremental?: boolean; restart?: boolean; metadata?: boolean; invalidatePaths?: string[] }

export interface 文件条目 {
  containsImages?: boolean;
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
  pageId?: string;
  modifiedAt?: number;
  index: number;
  name: string;
  sourcePath: string;
  virtualPath?: string;
  archiveInnerPath?: string;
  type: 阅读页类型;
}

export interface 阅读资源结果 {
  requestedPageId?: string;
  key: string;
  resourceKey: string;
  title: string;
  sourcePath: string;
  sourceType: 阅读资源类型;
  pages: 阅读页面项[];
  total: number;
}

export interface 阅读相邻资源项 {
  pageIndex?: number;
  pageId?: string;
  pageName?: string;
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
  prefetch?: boolean;
  preview?: boolean;
  sourcePath: string;
  virtualPath?: string;
  archiveInnerPath?: string;
  readerSessionId?: number;
  type: 阅读页类型;
}

export interface 页面图片结果 {
  url: string;
  width?: number;
  height?: number;
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
  byteSize?: number;
  itemCount?: number;
  childFolderCount?: number;
  folderSummary?: { folders: number; books: number; images: number; unsupported: number };
  pdfPath?: string;
  sourceVersion?: string;
  retryable?: boolean;
  pending?: boolean;
  url: string | null;
}

export interface 可阅读页数输入 {
  path: string;
  type: 资源类型;
}

export interface 资源路径状态 {
  path: string;
  exists: boolean;
  readable: boolean;
  isDirectory?: boolean;
  reason?: string;
}

export interface 操作错误 {
  code: string;
  message: string;
}

export type 操作结果<T> =
  | { ok: true; data: T }
  | { ok: false; error: 操作错误 };

export interface AndroidCacheInfo { readerBytes: number; readerLimit: number; thumbnailBytes: number; thumbnailLimit: number; }
export type { HomeArtwork } from '../../electron/shared/homeArtwork';
import type { HomeArtwork, SaveHomeArtwork } from '../../electron/shared/homeArtwork';
export interface OmiComicApi {
  getHomeArtwork?(): Promise<操作结果<HomeArtwork | null>>;
  selectHomeArtwork?(): Promise<操作结果<HomeArtwork | null>>;
  saveHomeArtwork?(input: SaveHomeArtwork): Promise<操作结果<HomeArtwork>>;
  resetHomeArtwork?(): Promise<操作结果<null>>;
  getAndroidCacheInfo?(): Promise<操作结果<AndroidCacheInfo>>;
  clearAndroidReadCache?(): Promise<操作结果<AndroidCacheInfo>>;
  setReaderPageSort(input: { path: string; type: 阅读资源类型; mode: PageSort; currentPageId: string }): Promise<操作结果<{ resource: 阅读资源结果; progress: ReadingProgress }>>;
  changeLocalResource(input: { path: string; action: "rename" | "trash" | "index"; name?: string }): Promise<操作结果<{ appData: OmiComicAppData; newPath: string | null }>>;
  restoreResourceIndex(): Promise<操作结果<OmiComicAppData>>;
  takeExternalOpen(): Promise<操作结果<{ resource: 阅读资源结果; initialPageIndex: number } | null>>;
  onExternalOpen(callback: () => void): () => void;
  chooseExternalFiles(): Promise<操作结果<null>>;
  removeTemporaryOpened(resourceKey: string): Promise<操作结果<null>>;
  promoteTemporaryOpened(resourceKey: string): Promise<操作结果<OmiComicAppData>>;
  openDocument(input: { path: string; type: "pdf" | "epub"; id: string; purpose?: "reader" | "thumbnail" }): Promise<操作结果<{ size: number; chapters: { name: string; index: number }[] }>>;
  readDocumentRange(id: string, begin: number, end: number): Promise<操作结果<Uint8Array>>;
  readDocumentChapter(id: string, index: number): Promise<操作结果<string>>;
  closeDocument(id: string): Promise<操作结果<null>>;
  getAppInfo(): Promise<应用信息>;
  getAppData(): Promise<操作结果<OmiComicAppData>>;
  updateSettings(input: Partial<AppSettings>): Promise<操作结果<AppSettings>>;
  addLibraryRoot(input: { path: string; name: string }): Promise<操作结果<LibraryRoot>>;
  importDroppedDirectory?(file: File): Promise<操作结果<{ root: LibraryRoot; alreadyAdded: boolean }>>;
  removeLibraryRoot(path: string): Promise<操作结果<OmiComicAppData>>;
  reorderLibraryRoots(orderedPaths: string[]): Promise<操作结果<LibraryRoot[]>>;
  updateLibraryState(input: {
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  }): Promise<操作结果<null>>;
  getReadingProgress(resourceKey: string): Promise<操作结果<ReadingProgress | null>>;
  saveReadingProgress(input: ReadingProgress): Promise<操作结果<ReadingProgress>>;
  getRecentOpened(): Promise<操作结果<RecentOpenedItem[]>>;
  removeRecentOpened(resourceKey: string): Promise<操作结果<null>>;
  getFavorites(): Promise<操作结果<FavoriteItem[]>>;
  addFavorite(input: Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex">): Promise<操作结果<FavoriteItem>>;
  updateFavoriteMeta(resourceKey: string, input: 整理信息输入): Promise<操作结果<FavoriteItem>>;
  reorderFavorites(orderedResourceKeys: string[]): Promise<操作结果<FavoriteItem[]>>;
  removeFavorite(resourceKey: string): Promise<操作结果<null>>;
  updateResourceMeta(input: ResourceMetaInput): Promise<操作结果<ResourceMetaItem>>;
  updateTagOrder(tags: string[]): Promise<操作结果<string[]>>;
  deleteTags(tags: string[]): Promise<操作结果<OmiComicAppData>>;
  createBookshelf(input: { name: string }): Promise<操作结果<Bookshelf>>;
  updateBookshelf(input: { id: string; name: string }): Promise<操作结果<Bookshelf>>;
  reorderBookshelves(orderedIds: string[]): Promise<操作结果<Bookshelf[]>>;
  deleteBookshelf(id: string): Promise<操作结果<OmiComicAppData>>;
  createVirtualFolder(input: { name: string; note?: string; bookshelfId?: string }): Promise<操作结果<VirtualFolder>>;
  updateVirtualFolder(input: { id: string; name?: string; note?: string; coverResourceKey?: string | null }): Promise<操作结果<VirtualFolder>>;
  reorderVirtualFolders(orderedIds: string[]): Promise<操作结果<VirtualFolder[]>>;
  deleteVirtualFolder(id: string): Promise<操作结果<VirtualFolder[]>>;
  addVirtualFolderItems(input: {
    folderId: string;
    items: VirtualFolderItemInput[];
  }): Promise<操作结果<{ folder: VirtualFolder; addedCount: number; skippedCount: number }>>;
  removeVirtualFolderItem(input: { folderId: string; resourceKey: string }): Promise<操作结果<VirtualFolder>>;
  removeVirtualFolderItems(input: { folderId: string; resourceKeys: string[] }): Promise<操作结果<VirtualFolder>>;
  clearVirtualFolderItems(folderId: string): Promise<操作结果<VirtualFolder>>;
  clearInvalidResourceRecords(input: { sourcePaths: string[]; resourceKeys: string[] }): Promise<操作结果<OmiComicAppData>>;
  reorderVirtualFolderItems(input: { folderId: string; orderedResourceKeys: string[] }): Promise<操作结果<VirtualFolder>>;
  moveVirtualFolderItem(input: {
    fromFolderId: string;
    toFolderId: string;
    item: VirtualFolderItemInput;
  }): Promise<操作结果<{ virtualFolders: VirtualFolder[]; targetAlreadyHad: boolean; addedToTarget: boolean }>>;
  moveVirtualFolderItems(input: {
    fromFolderId: string;
    toFolderId: string;
    items: VirtualFolderItemInput[];
  }): Promise<操作结果<{ virtualFolders: VirtualFolder[]; targetAlreadyHadCount: number; addedCount: number; movedCount: number }>>;
  getBookmarks(): Promise<操作结果<BookmarkItem[]>>;
  toggleBookmark(
    input: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt" | "sortIndex">,
  ): Promise<操作结果<{ bookmarked: boolean; bookmark?: BookmarkItem }>>;
  updateBookmarkMeta(id: string, input: 整理信息输入): Promise<操作结果<BookmarkItem>>;
  reorderBookmarks(orderedIds: string[]): Promise<操作结果<BookmarkItem[]>>;
  removeBookmark(id: string): Promise<操作结果<null>>;
  isPageBookmarked(resourceKey: string, pageIndex: number, pageId?: string): Promise<操作结果<boolean>>;
  selectFolder(): Promise<操作结果<string | null>>;
  listDirectory(path: string, options?: { background?: boolean }): Promise<操作结果<目录结果>>;
  scanLibrary(path: string, refresh?: boolean, booksOnly?: boolean, options?: CatalogBatchOptions): Promise<操作结果<LibraryCatalog>>;
  cancelLibraryScan?(): void;
  getResourcePages(input: 打开资源输入): Promise<操作结果<阅读资源结果>>;
  setReaderSession(id: number): Promise<操作结果<null>>;
  getPageImage(input: 获取页面图片输入): Promise<操作结果<页面图片结果>>;
  getBookmarkPagePreview(input: 书签页预览输入): Promise<操作结果<书签页预览结果>>;
  getThumbnail(input: 缩略图输入): Promise<操作结果<缩略图结果>>;
  refreshThumbnails?(): Promise<操作结果<null>>;
  getReadablePageCount(input: 可阅读页数输入): Promise<操作结果<number | null>>;
  checkResourcePath(input: { path: string; type: 资源类型 }): Promise<操作结果<资源路径状态>>;
  releaseReaderResource(path: string): Promise<操作结果<null>>;
  minimizeWindow(): void;
  toggleMaximizeWindow(): Promise<操作结果<boolean>>;
  isWindowMaximized(): Promise<操作结果<boolean>>;
  closeWindow(): void;
  setFullscreen(enabled: boolean): Promise<操作结果<boolean>>;
  setReaderVolumeKeys?(enabled: boolean): Promise<操作结果<boolean>>;
  isFullscreen(): Promise<操作结果<boolean>>;
}
