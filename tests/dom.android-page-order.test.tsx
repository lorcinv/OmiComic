import { it, expect } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import type { NativeCall } from '../src/android/bridge';
import names from './helpers/mixedImageNames.cjs';

it.each(['folder','archive'] as const)('keeps mixed GIF/JPG pages in numeric order through the Android %s adapter',async type=>{
  const sourcePath=type==='folder'?'/local/Mixed':'/local/Mixed.cbz';
  const rows=[...names].reverse().map((name,index)=>({name,index,type:type==='folder'?'folder-image':'archive-image',sourcePath,archiveInnerPath:type==='archive'?name:undefined}));
  const native:NativeCall=async(method)=>{
    if(method==='loadData')return null as any;
    if(method==='getResourcePages')return {resourceKey:`${type}:${sourcePath}`,sourcePath,sourceType:type,pages:structuredClone(rows),total:rows.length} as any;
    return null as any;
  };
  const api=await createAndroidApi(native);
  const result=await api.getResourcePages({path:sourcePath,type});
  expect(result.ok).toBe(true);
  if(!result.ok)throw Error(result.error.message);
  expect(result.data.pages.map(page=>page.name)).toEqual(names);
  expect(result.data.pages[3]).toMatchObject({name:'00016-GIF.gif',index:3,pageId:`${type==='folder'?'folder':'archive'}-image:00016-GIF.gif`});
  expect(rows[0].name).toBe('00026.jpg');
});
