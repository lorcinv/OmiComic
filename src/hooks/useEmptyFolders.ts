import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {文件条目, 操作结果, 缩略图结果} from '../types';

const version=(file:文件条目)=>`${file.size??''}:${file.modifiedAt??''}`;
const normalize=(path:string)=>path.replace(/\\/g,'/').replace(/\/$/,'');

/** Reuse completed cover discovery; never turn a missing cover or failed read
 * into an empty folder, or add foreground traversal to directory navigation. */
export function useEmptyFolders(){
  const known=useRef(new Map<string,string>());
  const [revision,update]=useState(0);
  const observe=useCallback((file:文件条目,result:操作结果<缩略图结果>)=>{
    if(file.type!=='folder')return;
    const key=normalize(file.path),stamp=version(file),previous=known.current.get(key);
    if(result.ok&&result.data.emptyFolder===true&&!result.data.url&&!result.data.pending&&!result.data.retryable){
      if(previous===stamp)return;
      known.current.set(key,stamp);
    }else if(!known.current.delete(key))return;
    update(value=>value+1);
  },[]);
  useEffect(()=>{
    const invalidate=(event:Event)=>{
      const detail=(event as CustomEvent<string|undefined>).detail,path=detail&&normalize(detail);
      let changed=false;
      for(const key of known.current.keys())if(!path||key===path||key.startsWith(path+'/')||path.startsWith(key+'/'))changed=known.current.delete(key)||changed;
      if(changed)update(value=>value+1);
    };
    window.addEventListener('omi-thumbnail-invalidated',invalidate);
    return()=>window.removeEventListener('omi-thumbnail-invalidated',invalidate);
  },[]);
  const isHidden=useMemo(()=>(file:文件条目)=>file.type==='folder'&&known.current.get(normalize(file.path))===version(file),[revision]);
  return {isHidden,observe};
}
