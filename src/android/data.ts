import type { AppSettings, OmiComicApi, OmiComicAppData, VirtualFolder, VirtualFolderItemInput, 操作结果, 阅读资源结果 } from "../types";
import { updateResourceRecords, withinPath } from "../../electron/services/resourceRecords";
import type { NativeCall } from "./bridge";
import { sanitizeAndroidChapter } from "./epub";
import { version as appVersion } from "../../package.json";

const defaults: AppSettings = {
  colorTheme: "mist", cardSize: "medium", cardScale: 100, detailThumbnailScale: 100,
  pageSize: 60, sortMode: "name-asc", sortDirection: "asc", folderFirst: true,
  hideBookshelfItemsInLibrary: true, showProgressBar: true, showProgressText: true,
  progressTextMode: "page", progressBarThickness: "normal", readerDefaultFitMode: "fit-height",
  readerPageMode: "single", readerDefaultFlow: "horizontal", readerDefaultPanorama: false,
  readerDefaultImmersive: false, doublePageFirstSingle: true, doublePageDirection: "left-to-right",
  smartDetectSpreadPage: true, wheelPageTurn: false, immersiveAutoHide: false, immersiveAutoHideDelay: 3000,
  readerHideFooterControls: false, readerHideImmersiveProgress: false, readerMemoryCacheSizeMb: 100,
  readerPreloadPages: 2, readerImageLoadConcurrency: 2, bookSwitchButtonOpacity: 40,
  organizeDrawerOpacity: 90, bookshelfNoteHoverDelayMs: 1000, recentOpenedLimit: 50,
  tagSearchMode: "fuzzy", confirmBeforeDeleteTags: true,
  confirmBeforeBatchDelete: { favorites: true, bookmarks: true, recent: true },
};
const ok = <T>(data: T): 操作结果<T> => ({ ok: true, data });
const failure = (e: unknown): { ok: false; error: { code: string; message: string } } => {
  const message=e instanceof Error?e.message:"操作失败。";
  const match=/^([A-Z_]+):(.+)$/s.exec(message);
  return {ok:false,error:{code:match?.[1]??"ANDROID_OPERATION_FAILED",message:match?.[2]??message}};
};
const tags = (values?: string[]) => [...new Set((values ?? []).map(s => s.trim()).filter(Boolean))];
const reorder = <T>(list: T[], keys: string[], key: (item: T) => string): T[] => [...list].sort((a,b) => {
  const rank = (v: T) => { const i = keys.indexOf(key(v)); return i < 0 ? keys.length + list.indexOf(v) : i; };
  return rank(a) - rank(b);
}).map((v,i) => ({ ...v, sortIndex: i }));
const parent = (p: string) => p.slice(0, p.lastIndexOf("/"));

export async function createAndroidApi(native: NativeCall): Promise<OmiComicApi> {
  const stored = await native<Partial<OmiComicAppData> | null>("loadData");
  let data: OmiComicAppData = {
    version: 1, library: { roots: [] }, settings: defaults, readingProgress: {}, recentOpened: [],
    temporaryOpened: [], removedRecentResourceKeys: [], favorites: [], bookmarks: [], resourceMeta: {},
    tagOrder: [], bookshelves: [{ id: "bookshelf-default", name: "默认书架", createdAt: Date.now(), updatedAt: Date.now(), sortIndex: 0 }], virtualFolders: [],
    ...stored,
  };
  data.settings = { ...defaults, ...stored?.settings };
  let queue: Promise<unknown> = Promise.resolve();
  const read = async <T>(fn: () => T): Promise<操作结果<T>> => { await queue; return ok(structuredClone(fn())); };
  const write = <T>(fn: (draft: OmiComicAppData) => T | Promise<T>, persist = true): Promise<操作结果<T>> => {
    const work = queue.then(async () => {
      const draft = structuredClone(data);
      try {
        const result = await fn(draft);
        if (persist) await native("saveData", { data: draft });
        data = draft;
        return ok(structuredClone(result));
      } catch (e) { return failure(e); }
    });
    queue = work.then(() => undefined, () => undefined);
    return work;
  };
  const call = async <T>(method: string, args?: unknown): Promise<操作结果<T>> => {
    try { return ok(await native<T>(method, args)); } catch (e) { return failure(e); }
  };
  const folder = (d: OmiComicAppData, id: string) => { const f = d.virtualFolders.find(f => f.id === id); if (!f) throw new Error("书架已不存在。"); return f; };
  const addItems = (f: VirtualFolder, items: VirtualFolderItemInput[]) => {
    let count = 0;
    for (const item of items) if (!f.items.some(i => i.resourceKey === item.resourceKey)) {
      f.items.push({ ...item, id: crypto.randomUUID(), folderId: f.id, addedAt: Date.now(), sortIndex: f.items.length }); count++;
    }
    f.updatedAt = Date.now(); return count;
  };
  const removeItems = (f: VirtualFolder, keys: string[]) => {
    f.items = f.items.filter(i => !keys.includes(i.resourceKey)).map((i,index) => ({...i,sortIndex:index}));
    if (!f.items.some(i => i.resourceKey === f.coverResourceKey)) delete f.coverResourceKey;
    f.updatedAt = Date.now(); return f;
  };
  const external: Array<{ resource: 阅读资源结果; initialPageIndex: number }> = [];
  const listeners = new Set<() => void>();
  const api: OmiComicApi = {
    getAppInfo: async () => ({name:"OmiComic", version:appVersion, platform:"android"}),
    getAppData: () => read(() => data),
    updateSettings: input => write(d => (d.settings = {...d.settings,...input})),
    addLibraryRoot: input => write(d => {
      const root = d.library.roots.find(r => r.path === input.path);
      if (root) return root;
      const item = {...input,addedAt:Date.now(),lastOpenedAt:Date.now()}; d.library.roots.push(item);
      d.temporaryOpened = d.temporaryOpened.filter(i => !withinPath(i.sourcePath,input.path)); return item;
    }),
    removeLibraryRoot: path => write(d => { Object.assign(d,updateResourceRecords(d,path)); return d; }),
    reorderLibraryRoots: keys => write(d => (d.library.roots = reorder(d.library.roots,keys,i => i.path))),
    updateLibraryState: input => write(d => { Object.assign(d.library,input); return null; }),
    getReadingProgress: key => read(() => data.readingProgress[key] ?? null),
    saveReadingProgress: input => write(d => {
      const totalPages = Math.max(1,Math.floor(input.totalPages));
      const currentPageIndex = Math.min(totalPages-1,Math.max(0,Math.floor(input.currentPageIndex)));
      const old = d.readingProgress[input.resourceKey];
      const p = {...input,totalPages,currentPageIndex,percent:Math.round((currentPageIndex+1)/totalPages*100),completed:currentPageIndex===totalPages-1,
        hasStartedReading:!!(old?.hasStartedReading||input.hasStartedReading||currentPageIndex>0||totalPages===1),firstReadAt:old?.firstReadAt??input.firstReadAt??Date.now(),updatedAt:Date.now(), readerViewState:input.readerViewState??old?.readerViewState};
      d.readingProgress[p.resourceKey]=p;
      d.recentOpened=[p,...d.recentOpened.filter(i=>i.resourceKey!==p.resourceKey)].slice(0,d.settings.recentOpenedLimit);
      d.temporaryOpened=d.temporaryOpened.map(i=>i.resourceKey===p.resourceKey?p:i);
      d.removedRecentResourceKeys=d.removedRecentResourceKeys.filter(k=>k!==p.resourceKey); return p;
    }),
    getRecentOpened: () => read(()=>data.recentOpened),
    removeRecentOpened: key => write(d=>{d.recentOpened=d.recentOpened.filter(i=>i.resourceKey!==key); d.removedRecentResourceKeys=tags([...d.removedRecentResourceKeys,key]);return null;}),
    getFavorites: () => read(()=>data.favorites),
    addFavorite: input => write(d=>{const old=d.favorites.find(i=>i.resourceKey===input.resourceKey);if(old)return old;const item={...input,addedAt:Date.now(),updatedAt:Date.now(),sortIndex:d.favorites.length};d.favorites.push(item);return item;}),
    updateFavoriteMeta: (key,input) => write(d=>{const item=d.favorites.find(i=>i.resourceKey===key);if(!item)throw new Error("收藏已不存在。");Object.assign(item,input,{tags:tags(input.tags),updatedAt:Date.now()});return item;}),
    reorderFavorites: keys => write(d=>(d.favorites=reorder(d.favorites,keys,i=>i.resourceKey))),
    removeFavorite: key => write(d=>{d.favorites=d.favorites.filter(i=>i.resourceKey!==key);return null;}),
    updateResourceMeta: input => write(d=>(d.resourceMeta[input.resourceKey]={...input,note:input.note??"",tags:tags(input.tags),updatedAt:Date.now()})),
    updateTagOrder: input => write(d=>(d.tagOrder=tags(input))),
    deleteTags: input => write(d=>{for(const i of [...d.favorites,...d.bookmarks,...Object.values(d.resourceMeta),...d.virtualFolders]) i.tags=(i.tags??[]).filter(t=>!input.includes(t));d.tagOrder=d.tagOrder.filter(t=>!input.includes(t));return d;}),
    createBookshelf: input => write(d=>{const i={...input,id:crypto.randomUUID(),createdAt:Date.now(),updatedAt:Date.now(),sortIndex:d.bookshelves.length};d.bookshelves.push(i);return i;}),
    updateBookshelf: input => write(d=>{const i=d.bookshelves.find(i=>i.id===input.id);if(!i)throw new Error("书架已不存在。");Object.assign(i,input,{updatedAt:Date.now()});return i;}),
    reorderBookshelves: keys=>write(d=>(d.bookshelves=reorder(d.bookshelves,keys,i=>i.id))),
    deleteBookshelf: id=>write(d=>{if(d.bookshelves.length<=1)throw new Error("至少保留一个书架。");d.bookshelves=d.bookshelves.filter(i=>i.id!==id);d.virtualFolders=d.virtualFolders.filter(i=>i.bookshelfId!==id);return d;}),
    createVirtualFolder: input=>write(d=>{const i:VirtualFolder={id:crypto.randomUUID(),bookshelfId:input.bookshelfId??d.bookshelves[0].id,name:input.name,note:input.note??"",tags:[],items:[],createdAt:Date.now(),updatedAt:Date.now(),sortIndex:d.virtualFolders.length};d.virtualFolders.push(i);return i;}),
    updateVirtualFolder: input=>write(d=>{const f=folder(d,input.id);Object.assign(f,input,{coverResourceKey:input.coverResourceKey===null?undefined:input.coverResourceKey??f.coverResourceKey,updatedAt:Date.now()});return f;}),
    reorderVirtualFolders: keys=>write(d=>(d.virtualFolders=reorder(d.virtualFolders,keys,i=>i.id))),
    deleteVirtualFolder: id=>write(d=>(d.virtualFolders=d.virtualFolders.filter(i=>i.id!==id))),
    addVirtualFolderItems: input=>write(d=>{const f=folder(d,input.folderId);const n=addItems(f,input.items);return {folder:f,addedCount:n,skippedCount:input.items.length-n};}),
    removeVirtualFolderItem: input=>write(d=>removeItems(folder(d,input.folderId),[input.resourceKey])),
    removeVirtualFolderItems: input=>write(d=>removeItems(folder(d,input.folderId),input.resourceKeys)),
    clearVirtualFolderItems: id=>write(d=>{const f=folder(d,id);return removeItems(f,f.items.map(i=>i.resourceKey));}),
    clearInvalidResourceRecords: input=>write(d=>{for(const p of input.sourcePaths)Object.assign(d,updateResourceRecords(d,p));return d;}),
    reorderVirtualFolderItems: input=>write(d=>{const f=folder(d,input.folderId);f.items=reorder(f.items,input.orderedResourceKeys,i=>i.resourceKey);return f;}),
    moveVirtualFolderItem: input=>write(d=>{if(input.fromFolderId===input.toFolderId)throw new Error("请选择其他书架。");const count=addItems(folder(d,input.toFolderId),[input.item]);removeItems(folder(d,input.fromFolderId),[input.item.resourceKey]);return {virtualFolders:d.virtualFolders,targetAlreadyHad:!count,addedToTarget:!!count};}),
    moveVirtualFolderItems: input=>write(d=>{if(input.fromFolderId===input.toFolderId)throw new Error("请选择其他书架。");const count=addItems(folder(d,input.toFolderId),input.items);removeItems(folder(d,input.fromFolderId),input.items.map(i=>i.resourceKey));return {virtualFolders:d.virtualFolders,targetAlreadyHadCount:input.items.length-count,addedCount:count,movedCount:input.items.length};}),
    getBookmarks: ()=>read(()=>data.bookmarks),
    toggleBookmark: input=>write(d=>{const old=d.bookmarks.find(i=>i.resourceKey===input.resourceKey&&i.pageIndex===input.pageIndex);if(old){d.bookmarks=d.bookmarks.filter(i=>i!==old);return {bookmarked:false};}const item={...input,id:crypto.randomUUID(),createdAt:Date.now(),updatedAt:Date.now(),sortIndex:d.bookmarks.length};d.bookmarks.push(item);return {bookmarked:true,bookmark:item};}),
    updateBookmarkMeta: (id,input)=>write(d=>{const i=d.bookmarks.find(i=>i.id===id);if(!i)throw new Error("书签已不存在。");Object.assign(i,input,{tags:tags(input.tags),updatedAt:Date.now()});return i;}),
    reorderBookmarks: keys=>write(d=>(d.bookmarks=reorder(d.bookmarks,keys,i=>i.id))),
    removeBookmark: id=>write(d=>{d.bookmarks=d.bookmarks.filter(i=>i.id!==id);return null;}),
    isPageBookmarked: (key,page)=>read(()=>data.bookmarks.some(i=>i.resourceKey===key&&i.pageIndex===page)),
    selectFolder: ()=>call("chooseFolder"),
    listDirectory: async path=>{const result=await call<import("../types").目录结果>("listDirectory",{path});if(result.ok){const hidden=data.excludedResourcePaths??[];result.data.items=result.data.items.filter(i=>!hidden.some(p=>withinPath(i.path,p)));result.data.total=result.data.items.length;}return result;},
    getResourcePages: input=>call("getResourcePages",input),
    getPageImage: input=>call("getPageImage",input),
    getThumbnail: input=>call("getThumbnail",input),
    getReadablePageCount: input=>call("getReadablePageCount",input),
    getBookmarkPagePreview: input=>call("getBookmarkPagePreview",input),
    checkResourcePath: input=>call("checkResourcePath",input),
    releaseReaderResource: path=>call("releaseReaderResource",{path}),
    setReaderSession: async()=>ok(null),
    openDocument: input=>call("openDocument",input),
    readDocumentRange: async(id,begin,end)=>{const result=await call<string>("readDocumentRange",{id,begin,end});return result.ok?ok(Uint8Array.from(atob(result.data),c=>c.charCodeAt(0))):result;},
    readDocumentChapter: async(id,index)=>{try{return ok(await sanitizeAndroidChapter(await native<string>("readDocumentChapter",{id,index}),native));}catch(e){return failure(e);}},
    closeDocument: id=>call("closeDocument",{id}),
    takeExternalOpen: async()=>ok(external.shift()??null),
    onExternalOpen: callback=>{listeners.add(callback);return()=>{listeners.delete(callback);};},
    chooseExternalFiles: async()=>{
      const result=await call<string|null>("chooseFile");if(!result.ok)return result;if(!result.data)return ok(null);
      const opened=await call<阅读资源结果>("getResourcePages",{path:result.data});if(!opened.ok)return opened;
      const resource=opened.data, initialPageIndex=data.readingProgress[resource.resourceKey]?.currentPageIndex??0;
      const saved=await write(d=>{const item={resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:resource.title,currentPageIndex:initialPageIndex,totalPages:resource.total,updatedAt:Date.now()};d.temporaryOpened=[item,...d.temporaryOpened.filter(i=>i.resourceKey!==item.resourceKey)];return null;});
      if(!saved.ok)return saved;external.push({resource,initialPageIndex});listeners.forEach(fn=>fn());return ok(null);
    },
    removeTemporaryOpened:key=>write(d=>{d.temporaryOpened=d.temporaryOpened.filter(i=>i.resourceKey!==key);return null;}),
    promoteTemporaryOpened:async()=>failure(new Error("请点击添加目录，授权文件所在的文件夹。Android 的单文件授权不能访问同目录中的其他文件。")),
    changeLocalResource: input=>write(async d=>{
      await native("backupData",{data:d});
      if(input.action==="index"){Object.assign(d,updateResourceRecords(d,input.path));d.excludedResourcePaths=[...(d.excludedResourcePaths??[]),input.path];await native("saveData",{data:d});return {appData:d,newPath:null};}
      const changed=await native<{newPath:string|null}>("changeLocalResource",input);
      Object.assign(d,updateResourceRecords(d,input.path,changed.newPath??undefined));
      // A native rename is rolled back if the atomic record write fails.
      try{await native("saveData",{data:d});}catch(e){
        if(changed.newPath) {
          try { await native("changeLocalResource",{path:changed.newPath,action:"rename",name:input.path.split("/").pop()}); }
          catch { throw new Error(`文件已重命名为 ${changed.newPath}，记录保存失败，请重新添加目录。`); }
        } else throw new Error("本地文件已删除，但记录保存失败，请刷新后清理失效记录。");
        throw e;
      }
      return {appData:d,newPath:changed.newPath};
    },false),
    restoreResourceIndex:()=>write(d=>{d.excludedResourcePaths=[];return d;}),
    minimizeWindow:()=>{void native("background");}, closeWindow:()=>{void native("close");},
    toggleMaximizeWindow:async()=>ok(false),isWindowMaximized:async()=>ok(false),
    setFullscreen:enabled=>call("setFullscreen",{enabled}),isFullscreen:()=>call("isFullscreen"),
  };
  return api;
}
