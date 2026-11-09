import {describe,expect,it,vi} from 'vitest';
import {createAndroidApi} from '../src/android/data';
import type {NativeCall} from '../src/android/bridge';

function store(incoming: Array<string|Error> = []) {
  let saved:any={readingProgress:{'mobi:/local/test/book.mobi':{currentPageIndex:2}}};
  const native=vi.fn(async(method:string,args:any)=>{
    if(method==='loadData')return saved;
    if(method==='saveData'){saved=structuredClone(args.data);return null;}
    if(method==='takeExternalFile'){const next=incoming.shift();if(next instanceof Error)throw next;return next??null;}
    if(method==='chooseFile')return '/local/test/book.mobi';
    if(method==='getResourcePages')return {resourceKey:`${args.type}:${args.path}`,sourcePath:args.path,sourceType:args.type,title:'book',total:4,pages:[]};
    return null;
  });
  return {native:native as NativeCall,calls:native,saved:()=>saved};
}

describe('Android external file handoff',()=>{
  it('drains a cold-start MOBI and restores its progress before recording recent reading',async()=>{
    const backend=store(['/local/test/book.mobi']),api=await createAndroidApi(backend.native);
    const result=await api.takeExternalOpen();
    expect(result).toMatchObject({ok:true,data:{initialPageIndex:2,resource:{sourceType:'mobi',readerInit:{progress:{currentPageIndex:2}}}}});
    expect(backend.saved().recentOpened[0]).toMatchObject({sourceType:'mobi',currentPageIndex:2});
    expect(await api.takeExternalOpen()).toEqual({ok:true,data:null});
  });
  it('notifies mounted consumers on warm opens and removes the listener on unmount',async()=>{
    const api=await createAndroidApi(store().native),listener=vi.fn(),stop=api.onExternalOpen(listener);
    window.dispatchEvent(new Event('omi-external-open'));expect(listener).toHaveBeenCalledTimes(1);
    stop();window.dispatchEvent(new Event('omi-external-open'));expect(listener).toHaveBeenCalledTimes(1);
  });
  it('consumes a rejected file without blocking the next valid file',async()=>{
    const api=await createAndroidApi(store([new Error('不支持此文件格式。'),'/local/test/book.pdf']).native);
    expect(await api.takeExternalOpen()).toMatchObject({ok:false,error:{message:'不支持此文件格式。'}});
    expect(await api.takeExternalOpen()).toMatchObject({ok:true,data:{resource:{sourceType:'pdf'}}});
    expect(await api.takeExternalOpen()).toEqual({ok:true,data:null});
  });
  it('preserves the in-app chooser and identifies MOBI without treating it as an image',async()=>{
    const backend=store(),api=await createAndroidApi(backend.native),listener=vi.fn(),stop=api.onExternalOpen(listener);
    expect(await api.chooseExternalFiles()).toEqual({ok:true,data:null});expect(listener).toHaveBeenCalledTimes(1);
    expect(await api.takeExternalOpen()).toMatchObject({ok:true,data:{resource:{sourceType:'mobi'}}});
    expect(backend.calls.mock.calls.filter(([method])=>method==='takeExternalFile')).toHaveLength(0);stop();
  });
  it('reports storage failure without opening an unrecorded incoming file',async()=>{
    const backend=store(['/local/test/book.epub']);
    const native:NativeCall=async(method,args)=>{if(method==='saveData')throw new Error('storage full');return backend.native(method,args);};
    const api=await createAndroidApi(native);
    expect(await api.takeExternalOpen()).toMatchObject({ok:false,error:{message:'storage full'}});
    expect(await api.takeExternalOpen()).toEqual({ok:true,data:null});
  });
});
