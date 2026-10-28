import { describe, it, expect } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import { sanitizeAndroidChapter } from '../src/android/epub';
import type { NativeCall } from '../src/android/bridge';
import type { OmiComicAppData } from '../src/types';

function nativeStore() {
  let saved: OmiComicAppData | null = null;
  const calls: {method:string;args:any}[] = [];
  let failWrite = false;
  const native: NativeCall = async(method,args:any) => {
    calls.push({method,args});
    if(method==='loadData')return structuredClone(saved) as any;
    if(method==='saveData'){if(failWrite)throw new Error('storage full');saved=structuredClone(args.data);}
    if(method==='changeLocalResource')return {newPath:args.action==='rename'?args.path.slice(0,args.path.lastIndexOf('/')+1)+args.name:null} as any;
    if(method==='epubImage')return 'https://omi.local/media/approved' as any;
    return null as any;
  };
  return {native,calls,fail:()=>{failWrite=true;}};
}

describe('Android durable library adapter',()=>{
  it('defaults the home screen on for old data and persists an explicit opt-out', async () => {
    const store = nativeStore(), api = await createAndroidApi(store.native);
    const initial = await api.getAppData(); expect(initial.ok && initial.data.settings.showHomePage).toBe(true);
    await api.updateSettings({showHomePage:false});
    const restored = await (await createAndroidApi(store.native)).getAppData();
    expect(restored.ok && restored.data.settings.showHomePage).toBe(false);
  });
  it('keeps space splitting disabled by default and persists numeric page sizes', async () => {
    const store = nativeStore();
    const api = await createAndroidApi(store.native);
    const initial = await api.getAppData();
    expect(initial.ok && initial.data.settings.searchSplitSpaces).toBe(false);
    await api.updateSettings({ mobilePageSize: 500, searchSplitSpaces: true });
    const restored = await (await createAndroidApi(store.native)).getAppData();
    expect(restored.ok && restored.data.settings).toMatchObject({ mobilePageSize: 500, searchSplitSpaces: true });
  });
  it('opens pages and reads the committed snapshot while a save is held, then commits in order',async()=>{
    const store=nativeStore();let release!:()=>void;let saving=false;
    const native:NativeCall=async(method,args)=>{
      if(method==='saveData'&&saving)await new Promise<void>(resolve=>{release=resolve;});
      if(method==='getResourcePages')return {resourceKey:'folder:/local/a',sourcePath:'/local/a',sourceType:'folder',pages:[],total:0} as any;
      return store.native(method,args);
    };
    const api=await createAndroidApi(native);await api.updateSettings({colorTheme:'mist'});saving=true;
    const write=api.updateSettings({colorTheme:'night'});await new Promise(resolve=>setTimeout(resolve,0));
    const timeout=new Promise<'blocked'>(resolve=>setTimeout(()=>resolve('blocked'),100));
    const read=await Promise.race([Promise.all([api.getAppData(),api.getResourcePages({path:'/local/a',type:'folder'})]),timeout]);
    expect(read).not.toBe('blocked');if(read==='blocked')throw new Error('Reads waited for disk');
    expect(read[0].ok&&read[0].data.settings.colorTheme).toBe('mist');expect(read[1].ok).toBe(true);
    saving=false;release();expect((await write).ok).toBe(true);
    const committed=await api.getAppData();expect(committed.ok&&committed.data.settings.colorTheme).toBe('night');
  });
  it('persists independent reading and cover disk budgets and exposes cache management',async()=>{
    const n=nativeStore(),api=await createAndroidApi(n.native);const first=await api.getAppData();if(!first.ok)throw new Error();
    expect(first.data.settings).toMatchObject({androidReaderDiskCacheSizeMb:512,androidThumbnailCacheSizeMb:128,readerMemoryCacheSizeMb:100});
    await api.updateSettings({androidReaderDiskCacheSizeMb:768,androidThumbnailCacheSizeMb:192});
    const restored=await (await createAndroidApi(n.native)).getAppData();if(!restored.ok)throw new Error();
    expect(restored.data.settings).toMatchObject({androidReaderDiskCacheSizeMb:768,androidThumbnailCacheSizeMb:192,readerMemoryCacheSizeMb:100});
    await api.getAndroidCacheInfo!();await api.clearAndroidReadCache!();expect(n.calls.slice(-2).map(c=>c.method)).toEqual(['getAndroidCacheInfo','clearAndroidReadCache']);
  });
  it('tag-only and note-only edits preserve the other field and survive restart',async()=>{
    const n=nativeStore(),api=await createAndroidApi(n.native),item={resourceKey:'archive:/local/a.cbz',sourcePath:'/local/a.cbz',sourceType:'archive' as const,title:'a.cbz'};
    await api.addFavorite(item);await api.updateResourceMeta({...item,note:'原简介',tags:['原标签']});
    await api.updateResourceMeta({...item,tags:['新标签']});await api.updateResourceMeta({...item,note:'新简介'});
    const reopened=await createAndroidApi(n.native),data=await reopened.getAppData();if(!data.ok)throw new Error();
    expect(data.data.resourceMeta[item.resourceKey]).toMatchObject({note:'新简介',tags:['新标签']});expect(data.data.favorites[0]).toMatchObject({note:'新简介',tags:['新标签']});
  });
  it('bookmark rename preserves its physical page, metadata, order and source file across restart',async()=>{
    const n=nativeStore(),api=await createAndroidApi(n.native);
    const item={resourceKey:'archive:/local/books/a.cbz',sourcePath:'/local/books/a.cbz',sourceType:'archive' as const,title:'a.cbz'};
    const added=await api.toggleBookmark({...item,pageIndex:5,totalPages:12,pageName:'000006.png',tags:['科幻'],note:'夜空'});if(!added.ok || !added.data.bookmark)throw new Error();
    const id=added.data.bookmark.id;
    await api.updateBookmarkMeta(id,{bookmarkTitle:'月光书签'});
    const reopened=await createAndroidApi(n.native),marks=await reopened.getBookmarks();if(!marks.ok)throw new Error();
    expect(marks.data[0]).toMatchObject({id,bookmarkTitle:'月光书签',title:'a.cbz',sourcePath:item.sourcePath,pageIndex:5,pageName:'000006.png',tags:['科幻'],note:'夜空',sortIndex:0});
    expect(n.calls.filter(call=>call.method==='changeLocalResource')).toHaveLength(0);
  });
  it('serializes concurrent updates and restores complete progress after restart',async()=>{
    const n=nativeStore();const api=await createAndroidApi(n.native);
    await Promise.all([api.updateSettings({colorTheme:'night'}),api.addLibraryRoot({path:'/local/books',name:'漫画'}),api.saveReadingProgress({resourceKey:'archive:/local/books/a.cbz',sourcePath:'/local/books/a.cbz',sourceType:'archive',title:'a.cbz',currentPageIndex:3,totalPages:10,percent:40,completed:false,hasStartedReading:true,firstReadAt:10,updatedAt:20})]);
    const restored=await createAndroidApi(n.native);const result=await restored.getAppData();
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.data.settings.colorTheme).toBe('night');expect(result.data.library.roots).toHaveLength(1);
    expect(result.data.readingProgress['archive:/local/books/a.cbz'].currentPageIndex).toBe(3);
    expect(result.data.recentOpened).toHaveLength(1);
  });
  it('renames references without losing tags or shelf membership, then removes only index',async()=>{
    const n=nativeStore();const api=await createAndroidApi(n.native);
    const item={resourceKey:'archive:/local/books/a.cbz',sourcePath:'/local/books/a.cbz',sourceType:'archive' as const,title:'a.cbz'};
    await api.addFavorite(item);await api.updateResourceMeta({...item,tags:['中文标签'],note:'简介'});
    const shelf=await api.createVirtualFolder({name:'想看'});if(!shelf.ok)throw new Error();
    await api.addVirtualFolderItems({folderId:shelf.data.id,items:[item]});
    const result=await api.changeLocalResource({path:item.sourcePath,action:'rename',name:'b.cbz'});expect(result.ok).toBe(true);if(!result.ok)return;
    expect(result.data.appData.favorites[0].sourcePath).toBe('/local/books/b.cbz');
    expect(result.data.appData.resourceMeta['archive:/local/books/b.cbz'].tags).toEqual(['中文标签']);
    expect(result.data.appData.virtualFolders[0].items[0].resourceKey).toBe('archive:/local/books/b.cbz');
    const nativeChanges=n.calls.filter(c=>c.method==='changeLocalResource').length;
    await api.changeLocalResource({path:'/local/books/b.cbz',action:'index'});
    expect(n.calls.filter(c=>c.method==='changeLocalResource')).toHaveLength(nativeChanges);
    const data=await api.getAppData();if(!data.ok)throw new Error();expect(data.data.excludedResourcePaths).toEqual(['/local/books/b.cbz']);
    await api.restoreResourceIndex();expect((await api.getFavorites())).toEqual({ok:true,data:[]});
  });
  it('failed storage rolls a rename back and never commits half-updated application state',async()=>{
    const n=nativeStore();const api=await createAndroidApi(n.native);
    await api.addFavorite({resourceKey:'archive:/local/a.cbz',sourcePath:'/local/a.cbz',sourceType:'archive',title:'a.cbz'});
    n.fail();const changed=await api.changeLocalResource({path:'/local/a.cbz',action:'rename',name:'b.cbz'});
    expect(changed.ok).toBe(false);
    expect(n.calls.filter(c=>c.method==='changeLocalResource').map(c=>c.args.name)).toEqual(['b.cbz','a.cbz']);
    const saved=await api.getFavorites();if(!saved.ok)throw new Error();expect(saved.data[0].sourcePath).toBe('/local/a.cbz');
  });
  it('sanitizes EPUB scripts, forms, active links and remote images before display',async()=>{
    const n=nativeStore();
    const result=await sanitizeAndroidChapter(JSON.stringify({path:'/local/book.epub',entry:'OPS/chapter.xhtml',html:'<script>alert(1)</script><p onclick="evil()">中文正文 <a href="javascript:evil()">链接</a></p><iframe src="https://remote/"></iframe><img src="https://remote/x.png"><img src="images/one.png" onerror="evil()"><form>input</form>'}),n.native);
    expect(result).toContain('中文正文');expect(result).toContain('https://omi.local/media/approved');
    expect(result).not.toMatch(/<script|onclick=|onerror=|<iframe|javascript:|https:\/\/remote|<form/);
    expect(n.calls.filter(c=>c.method==='epubImage')).toHaveLength(1);
  });
});
