import { expect,it } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import type { NativeCall } from '../src/android/bridge';

it('Android saves and reloads exact halves, completion state and two distinct half bookmarks',async()=>{
  let stored:any=null;
  const native:NativeCall=async<T,>(method:string,args:any={})=>{
    if(method==='loadData')return structuredClone(stored) as T;
    if(method==='saveData'){stored=structuredClone(args.data);return null as T;}
    throw Error(method);
  };
  let api=await createAndroidApi(native);
  const ref={resourceKey:'pdf:/spread.pdf',sourcePath:'/spread.pdf',sourceType:'pdf' as const,title:'Spread'};
  const view={fitMode:'fit-window' as const,pageMode:'single' as const,pageDirection:'left-to-right' as const,flow:'horizontal' as const,panorama:false,immersive:false,splitWidePages:true,splitPageHalf:'L' as const};
  const p={...ref,currentPageIndex:2,totalPages:3,readerViewState:view,percent:100,completed:true,firstReadAt:1,updatedAt:1};
  await api.saveReadingProgress(p);
  api=await createAndroidApi(native);
  const data=await api.getAppData();if(!data.ok)throw Error('data');
  expect(data.data.readingProgress[ref.resourceKey]).toMatchObject({currentPageIndex:2,completed:false,percent:83,readerViewState:{splitPageHalf:'L'}});
  for(const half of ['L','R'])await api.toggleBookmark({...ref,pageIndex:2,totalPages:3,pageId:`omi-split:${half}:pdf-page:2`});
  await api.saveReadingProgress({...p,readerViewState:{...view,splitPageHalf:'R'}});
  api=await createAndroidApi(native);
  const result=await api.getReadingProgress(ref.resourceKey);if(!result.ok)throw Error('progress');expect(result.data).toMatchObject({completed:true,percent:100,readerViewState:{splitPageHalf:'R'}});
  const marks=await api.getBookmarks();if(!marks.ok)throw Error('marks');expect(marks.data).toHaveLength(2);
  expect(await api.isPageBookmarked(ref.resourceKey,2,'omi-split:L:pdf-page:2')).toEqual({ok:true,data:true});
});
