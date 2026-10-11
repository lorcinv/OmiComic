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
