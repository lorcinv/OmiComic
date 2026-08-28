import { contextBridge, ipcRenderer } from "electron";

export interface 应用信息 {
  name: string;
  version: string;
  platform: string;
}

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
  readerPreloadPages: number;
  readerImageLoadConcurrency: number;
  bookSwitchButtonOpacity: 图书切换按钮透明度;
  organizeDrawerOpacity: 整理侧边栏透明度;
  bookshelfNoteHoverDelayMs: 书架备注悬停延迟;
  recentOpenedLimit: 最近打开记录上限;
  tagSearchMode: 标签搜索模式;
  confirmBeforeDeleteTags: boolean;
  confirmBeforeBatchDelete: 批量删除确认设置;
}

export interface ReaderViewState {
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
  sortIndex: number;
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
  version: number;
  library: {
    roots: LibraryRoot[];
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  };
  settings: AppSettings;
  readingProgress: Record<string, ReadingProgress>;
  recentOpened: RecentOpenedItem[];
  removedRecentResourceKeys: string[];
  favorites: FavoriteItem[];
  bookmarks: BookmarkItem[];
  resourceMeta: Record<string, ResourceMetaItem>;
  tagOrder: string[];
  bookshelves: Bookshelf[];
  virtualFolders: VirtualFolder[];
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

export interface 获取页面图片输入 {
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

export type 操作结果<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

contextBridge.exposeInMainWorld("omicomic", {
  getAppInfo: (): Promise<应用信息> => ipcRenderer.invoke("应用:获取信息"),
  getAppData: (): Promise<操作结果<OmiComicAppData>> =>
    ipcRenderer.invoke("数据:获取应用数据"),
  updateSettings: (输入: Partial<AppSettings>): Promise<操作结果<AppSettings>> =>
    ipcRenderer.invoke("数据:更新设置", 输入),
  addLibraryRoot: (输入: { path: string; name: string }): Promise<操作结果<LibraryRoot>> =>
    ipcRenderer.invoke("数据:添加根目录", 输入),
  removeLibraryRoot: (根路径: string): Promise<操作结果<OmiComicAppData>> =>
    ipcRenderer.invoke("数据:移除根目录", 根路径),
  reorderLibraryRoots: (orderedPaths: string[]): Promise<操作结果<LibraryRoot[]>> =>
    ipcRenderer.invoke("数据:重排根目录", orderedPaths),
  updateLibraryState: (输入: {
    lastActiveRootPath?: string;
    lastCurrentPath?: string;
  }): Promise<操作结果<null>> =>
    ipcRenderer.invoke("数据:更新资源库状态", 输入),
  getReadingProgress: (resourceKey: string): Promise<操作结果<ReadingProgress | null>> =>
    ipcRenderer.invoke("数据:获取阅读进度", resourceKey),
  saveReadingProgress: (输入: ReadingProgress): Promise<操作结果<ReadingProgress>> =>
    ipcRenderer.invoke("数据:保存阅读进度", 输入),
  getRecentOpened: (): Promise<操作结果<RecentOpenedItem[]>> =>
    ipcRenderer.invoke("数据:获取最近打开"),
  removeRecentOpened: (resourceKey: string): Promise<操作结果<null>> =>
    ipcRenderer.invoke("数据:移除最近打开", resourceKey),
  getFavorites: (): Promise<操作结果<FavoriteItem[]>> =>
    ipcRenderer.invoke("数据:获取收藏"),
  addFavorite: (
    输入: Omit<FavoriteItem, "addedAt" | "updatedAt" | "sortIndex">,
  ): Promise<操作结果<FavoriteItem>> =>
    ipcRenderer.invoke("数据:添加收藏", 输入),
  updateFavoriteMeta: (resourceKey: string, 输入: 整理信息输入): Promise<操作结果<FavoriteItem>> =>
    ipcRenderer.invoke("数据:更新收藏整理信息", resourceKey, 输入),
  reorderFavorites: (orderedResourceKeys: string[]): Promise<操作结果<FavoriteItem[]>> =>
    ipcRenderer.invoke("数据:重排收藏", orderedResourceKeys),
  removeFavorite: (resourceKey: string): Promise<操作结果<null>> =>
    ipcRenderer.invoke("数据:移除收藏", resourceKey),
  updateResourceMeta: (输入: ResourceMetaInput): Promise<操作结果<ResourceMetaItem>> =>
    ipcRenderer.invoke("数据:更新资源整理信息", 输入),
  updateTagOrder: (tags: string[]): Promise<操作结果<string[]>> =>
    ipcRenderer.invoke("数据:更新标签顺序", tags),
  deleteTags: (tags: string[]): Promise<操作结果<OmiComicAppData>> =>
    ipcRenderer.invoke("数据:删除标签", tags),
  createBookshelf: (输入: { name: string }): Promise<操作结果<Bookshelf>> =>
    ipcRenderer.invoke("数据:创建书架", 输入),
  updateBookshelf: (输入: { id: string; name: string }): Promise<操作结果<Bookshelf>> =>
    ipcRenderer.invoke("数据:更新书架", 输入),
  reorderBookshelves: (orderedIds: string[]): Promise<操作结果<Bookshelf[]>> =>
    ipcRenderer.invoke("数据:重排书架", orderedIds),
  deleteBookshelf: (id: string): Promise<操作结果<OmiComicAppData>> =>
    ipcRenderer.invoke("数据:删除书架", id),
  createVirtualFolder: (输入: { name: string; note?: string; bookshelfId?: string }): Promise<操作结果<VirtualFolder>> =>
    ipcRenderer.invoke("数据:创建虚拟文件夹", 输入),
  updateVirtualFolder: (
    输入: { id: string; name?: string; note?: string; coverResourceKey?: string | null },
  ): Promise<操作结果<VirtualFolder>> =>
    ipcRenderer.invoke("数据:更新虚拟文件夹", 输入),
  reorderVirtualFolders: (orderedIds: string[]): Promise<操作结果<VirtualFolder[]>> =>
    ipcRenderer.invoke("数据:重排虚拟文件夹", orderedIds),
  deleteVirtualFolder: (id: string): Promise<操作结果<VirtualFolder[]>> =>
    ipcRenderer.invoke("数据:删除虚拟文件夹", id),
  addVirtualFolderItems: (输入: {
    folderId: string;
    items: VirtualFolderItemInput[];
  }): Promise<操作结果<{ folder: VirtualFolder; addedCount: number; skippedCount: number }>> =>
    ipcRenderer.invoke("数据:加入虚拟文件夹", 输入),
  removeVirtualFolderItem: (输入: { folderId: string; resourceKey: string }): Promise<操作结果<VirtualFolder>> =>
    ipcRenderer.invoke("数据:移除虚拟文件夹项目", 输入),
  removeVirtualFolderItems: (输入: { folderId: string; resourceKeys: string[] }): Promise<操作结果<VirtualFolder>> =>
    ipcRenderer.invoke("数据:批量移除虚拟文件夹项目", 输入),
  clearVirtualFolderItems: (folderId: string): Promise<操作结果<VirtualFolder>> =>
    ipcRenderer.invoke("数据:清空虚拟文件夹项目", folderId),
  clearInvalidResourceRecords: (输入: { sourcePaths: string[]; resourceKeys: string[] }): Promise<操作结果<OmiComicAppData>> =>
    ipcRenderer.invoke("数据:清理失效资源记录", 输入),
  reorderVirtualFolderItems: (输入: { folderId: string; orderedResourceKeys: string[] }): Promise<操作结果<VirtualFolder>> =>
    ipcRenderer.invoke("数据:重排虚拟文件夹项目", 输入),
  moveVirtualFolderItem: (输入: {
    fromFolderId: string;
    toFolderId: string;
    item: VirtualFolderItemInput;
  }): Promise<操作结果<{ virtualFolders: VirtualFolder[]; targetAlreadyHad: boolean; addedToTarget: boolean }>> =>
    ipcRenderer.invoke("数据:移动虚拟文件夹项目", 输入),
  moveVirtualFolderItems: (输入: {
    fromFolderId: string;
    toFolderId: string;
    items: VirtualFolderItemInput[];
  }): Promise<操作结果<{ virtualFolders: VirtualFolder[]; targetAlreadyHadCount: number; addedCount: number; movedCount: number }>> =>
    ipcRenderer.invoke("数据:批量移动虚拟文件夹项目", 输入),
  getBookmarks: (): Promise<操作结果<BookmarkItem[]>> =>
    ipcRenderer.invoke("数据:获取书签"),
  toggleBookmark: (
    输入: Omit<BookmarkItem, "id" | "createdAt" | "updatedAt" | "sortIndex">,
  ): Promise<操作结果<{ bookmarked: boolean; bookmark?: BookmarkItem }>> =>
    ipcRenderer.invoke("数据:切换书签", 输入),
  updateBookmarkMeta: (id: string, 输入: 整理信息输入): Promise<操作结果<BookmarkItem>> =>
    ipcRenderer.invoke("数据:更新书签整理信息", id, 输入),
  reorderBookmarks: (orderedIds: string[]): Promise<操作结果<BookmarkItem[]>> =>
    ipcRenderer.invoke("数据:重排书签", orderedIds),
  removeBookmark: (id: string): Promise<操作结果<null>> =>
    ipcRenderer.invoke("数据:移除书签", id),
  isPageBookmarked: (resourceKey: string, pageIndex: number): Promise<操作结果<boolean>> =>
    ipcRenderer.invoke("数据:当前页是否书签", resourceKey, pageIndex),
  selectFolder: (): Promise<操作结果<string | null>> =>
    ipcRenderer.invoke("目录:选择根目录"),
  listDirectory: (目标路径: string): Promise<操作结果<目录结果>> =>
    ipcRenderer.invoke("目录:读取", 目标路径),
  getResourcePages: (输入: 打开资源输入): Promise<操作结果<阅读资源结果>> =>
    ipcRenderer.invoke("阅读:获取图片列表", 输入),
  setReaderSession: (id: number): Promise<操作结果<null>> =>
    ipcRenderer.invoke("阅读:设置会话", id),
  getPageImage: (输入: 获取页面图片输入): Promise<操作结果<页面图片结果>> =>
    ipcRenderer.invoke("阅读:获取页面图片", 输入),
  getBookmarkPagePreview: (输入: 书签页预览输入): Promise<操作结果<书签页预览结果>> =>
    ipcRenderer.invoke("书签:获取页面预览", 输入),
  getThumbnail: (输入: 缩略图输入): Promise<操作结果<缩略图结果>> =>
    ipcRenderer.invoke("缩略图:获取", 输入),
  getReadablePageCount: (输入: 可阅读页数输入): Promise<操作结果<number | null>> =>
    ipcRenderer.invoke("资源:获取可阅读页数", 输入),
  checkResourcePath: (输入: { path: string; type: 资源类型 }): Promise<操作结果<资源路径状态>> =>
    ipcRenderer.invoke("资源:检查路径状态", 输入),
  releaseReaderResource: (目标路径: string): Promise<操作结果<null>> =>
    ipcRenderer.invoke("阅读:释放资源", 目标路径),
  minimizeWindow: (): void => ipcRenderer.send("窗口:最小化"),
  toggleMaximizeWindow: (): Promise<操作结果<boolean>> =>
    ipcRenderer.invoke("窗口:切换最大化"),
  isWindowMaximized: (): Promise<操作结果<boolean>> =>
    ipcRenderer.invoke("窗口:是否最大化"),
  closeWindow: (): void => ipcRenderer.send("窗口:关闭"),
  setFullscreen: (enabled: boolean): Promise<操作结果<boolean>> =>
    ipcRenderer.invoke("窗口:设置全屏", enabled),
  isFullscreen: (): Promise<操作结果<boolean>> =>
    ipcRenderer.invoke("窗口:是否全屏"),
});
