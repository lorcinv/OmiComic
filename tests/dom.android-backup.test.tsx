import { describe, expect, it } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import type { NativeCall } from '../src/android/bridge';

describe('Android backup and temporary directory bridge',()=>{
  it('roundtrips a real serialized backup through the native bridge, restores the previous state and keeps root authorization separate',async()=>{
    let stored:any=null,before:any=null,document='',exportName='';
    const native:NativeCall=async<T,>(method:string,args:any={})=>{
      const result=await(async()=>{switch(method){
        case'loadData':return stored;
        case'saveData':stored=structuredClone(args.data);return null;
        case'exportBackupFile':document=args.text;exportName=args.filename;return'content://backup/export.json';
        case'readBackupFile':return document;
        case'hasDataImportBackup':return!!before;
        case'importDataBackup':before=structuredClone(args.before);stored=structuredClone(args.data);return null;
        case'restoreDataBackup':stored=before;before=null;return stored;
        case'checkResourcePath':return{readable:false,isDirectory:false};
        case'chooseFolder':return'/local/selected/漫画';
        default:throw Error(method);
      }})();return result as T;
    };
    const api=await createAndroidApi(native),ref={resourceKey:'archive:/local/book/第一卷.cbz',sourcePath:'/local/book/第一卷.cbz',sourceType:'archive' as const,title:'第一卷.cbz'};
    await api.updateResourceMeta({...ref,tags:['原标签'],note:'原备注'});
    expect((await api.exportDataBackup!()).ok).toBe(true);expect(exportName).toMatch(/^OmiComic-Data-android-\d{8}-\d{6}\.json$/);
    await api.updateResourceMeta({...ref,tags:['修改后']});
    const preview=await api.readDataBackup!();if(!preview.ok||!preview.data)throw Error('preview');
    expect((await api.applyDataBackup!('wrong',{mappings:[],mode:'replace',prefer:'imported',includeSettings:false})).ok).toBe(false);
    expect((await api.applyDataBackup!(preview.data.token,{mappings:[],mode:'replace',prefer:'imported',includeSettings:false})).ok).toBe(true);
    let data=await api.getAppData();if(!data.ok)throw Error();expect(data.data.resourceMeta[ref.resourceKey].tags).toEqual(['原标签']);
    const reload=await createAndroidApi(native);data=await reload.getAppData();if(!data.ok)throw Error();expect(data.data.resourceMeta[ref.resourceKey].note).toBe('原备注');
    expect((await api.restoreDataBackup!()).ok).toBe(true);data=await api.getAppData();if(!data.ok)throw Error();expect(data.data.resourceMeta[ref.resourceKey].tags).toEqual(['修改后']);
    const directory=await api.openResourceDirectory!(ref);expect(directory).toEqual({ok:true,data:{path:'/local/selected/漫画',rootPath:'/local/selected/漫画'}});
    data=await api.getAppData();if(!data.ok)throw Error();expect(data.data.library.roots).toEqual([]);
  });
  it('cancelling a missing parent-directory authorization leaves records and saved roots unchanged',async()=>{
    const native:NativeCall=async<T,>(method:string)=>({loadData:null,checkResourcePath:{readable:false,isDirectory:false},chooseFolder:null}[method] as T);
    const api=await createAndroidApi(native),before=await api.getAppData();
    expect(await api.openResourceDirectory!({sourcePath:'/local/single/book.cbz',sourceType:'archive'})).toEqual({ok:true,data:null});
    expect(await api.getAppData()).toEqual(before);
  });
});

it('persists mobile text sizes on Android without changing desktop preferences',async()=>{
  let stored:any=null;
  const native:NativeCall=async<T,>(method:string,args:any={})=>{
    if(method==='loadData')return structuredClone(stored) as T;
    if(method==='saveData'){stored=structuredClone(args.data);return null as T;}
    throw Error(method);
  };
  const api=await createAndroidApi(native);
  await api.updateSettings({mobileGlobalFontSize:16,mobileInfoFontSize:13,desktopGlobalFontSize:18,desktopInfoFontSize:11});
  let result=await (await createAndroidApi(native)).getAppData();if(!result.ok)throw Error();
  expect(result.data.settings).toMatchObject({mobileGlobalFontSize:16,mobileInfoFontSize:13,desktopGlobalFontSize:18,desktopInfoFontSize:11});
  await api.updateSettings({mobileGlobalFontSize:100,mobileInfoFontSize:-1});
  result=await api.getAppData();if(!result.ok)throw Error();expect(result.data.settings).toMatchObject({mobileGlobalFontSize:24,mobileInfoFontSize:10});
});
