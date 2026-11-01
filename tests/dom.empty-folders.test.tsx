import {act, renderHook} from '@testing-library/react';
import {expect,it} from 'vitest';
import {useEmptyFolders} from '../src/hooks/useEmptyFolders';
import type {文件条目,操作结果,缩略图结果} from '../src/types';

const folder:文件条目={id:'/library/empty',path:'/library/empty',name:'empty',type:'folder',extension:'',size:0,modifiedAt:1};
const result=(data:缩略图结果):操作结果<缩略图结果>=>({ok:true,data});
it('hides only a positively confirmed empty folder on either platform, with a matching source version',()=>{
  const view=renderHook(()=>useEmptyFolders());
  expect(view.result.current.isHidden(folder)).toBe(false);
  act(()=>view.result.current.observe(folder,result({url:null,emptyFolder:true})));
  expect(view.result.current.isHidden(folder)).toBe(true);
  expect(view.result.current.isHidden({...folder,modifiedAt:2})).toBe(false);
  expect(view.result.current.isHidden({...folder,type:'mobi'})).toBe(false);
  view.unmount();
});
it('keeps missing covers, unreadable folders and unfinished discovery visible',()=>{
  const view=renderHook(()=>useEmptyFolders());
  for(const response of [result({url:null}),result({url:null,emptyFolder:true,retryable:true}),result({url:null,emptyFolder:true,pending:true}),result({url:'cover',emptyFolder:true}),{ok:false,error:{code:'FAILED',message:'Unavailable'}} as const]){
    act(()=>view.result.current.observe(folder,result({url:null,emptyFolder:true})));
    act(()=>view.result.current.observe(folder,response));
    expect(view.result.current.isHidden(folder)).toBe(false);
  }
  view.unmount();
});
it('invalidates hidden ancestors as well as descendants so adding files makes folders discoverable again',()=>{
  const view=renderHook(()=>useEmptyFolders()),nested={...folder,path:folder.path+'/nested'};
  act(()=>{view.result.current.observe(folder,result({url:null,emptyFolder:true}));view.result.current.observe(nested,result({url:null,emptyFolder:true}));});
  act(()=>window.dispatchEvent(new CustomEvent('omi-thumbnail-invalidated',{detail:nested.path+'/new.png'})));
  expect(view.result.current.isHidden(folder)).toBe(false);expect(view.result.current.isHidden(nested)).toBe(false);
  act(()=>view.result.current.observe(folder,result({url:null,emptyFolder:true})));
  act(()=>window.dispatchEvent(new CustomEvent('omi-thumbnail-invalidated')));
  expect(view.result.current.isHidden(folder)).toBe(false);
  view.unmount();
});
