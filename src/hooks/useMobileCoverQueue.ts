import { useEffect, useRef } from 'react';
import type { 文件条目, 缩略图结果, 操作结果 } from '../types';
import { getResourceThumbnail } from '../reader/thumbnailClient';

/** Keep visible requests alive across row changes; cancel only cards that left
 * the demand window. Results are published independently, as soon as ready. */
export function useCoverQueue(files:文件条目[], enabled:boolean,
  publish:(file:文件条目,result:操作结果<缩略图结果>)=>void, concurrency=2) {
  const state=useRef({wanted:[] as 文件条目[],active:new Map<string,{version:string;controller:AbortController}>(),done:new Map<string,{version:string;expires:number;retry:boolean;result:操作结果<缩略图结果>}>(),enabled:false});
  const retryTimer=useRef<ReturnType<typeof setTimeout>>();
  const callback=useRef(publish);callback.current=publish;
  const pump=useRef(()=>{});
  const version=(file:文件条目)=>`${file.size??''}:${file.modifiedAt??''}`;
  pump.current=()=>{
    clearTimeout(retryTimer.current);const s=state.current;if(!s.enabled)return;
    for(const file of s.wanted){
      if(s.active.size>=concurrency)break;
      const key=version(file),saved=s.done.get(file.path);
      if(s.active.has(file.path)||saved?.version===key&&saved.expires>Date.now())continue;
      const task={version:key,controller:new AbortController()};s.active.set(file.path,task);
      void getResourceThumbnail({path:file.path,type:file.type},task.controller.signal,key).then(result=>{
        if(task.controller.signal.aborted)return;
        const retry=!result.ok||Boolean(result.data.retryable);
        s.done.set(file.path,{version:key,expires:Date.now()+(retry?10_000:300_000),retry,result});
        while(s.done.size>512)s.done.delete(s.done.keys().next().value!);
        callback.current(file,result);
      },()=>{if(!task.controller.signal.aborted){const result:操作结果<缩略图结果>={ok:true,data:{url:null,retryable:true}};s.done.set(file.path,{version:key,expires:Date.now()+10_000,retry:true,result});callback.current(file,result);}}).finally(()=>{
        if(s.active.get(file.path)===task)s.active.delete(file.path);
        pump.current();
      });
    }
    const retries=s.wanted.map(file=>s.done.get(file.path)).filter(entry=>entry?.retry&&entry.expires>Date.now());
    if(retries.length)retryTimer.current=setTimeout(()=>pump.current(),Math.max(50,Math.min(...retries.map(entry=>entry!.expires))-Date.now()+20));
  };
  useEffect(()=>{
    const s=state.current;s.wanted=files;s.enabled=enabled;
    const needed=new Map(files.map(file=>[file.path,version(file)]));
    for(const [path,task] of s.active)if(!enabled||needed.get(path)!==task.version){task.controller.abort();s.active.delete(path);}
    if(enabled)for(const file of files){const saved=s.done.get(file.path);if(saved?.version===version(file)&&saved.expires>Date.now())callback.current(file,saved.result);}
    pump.current();
  },[files,enabled,concurrency]);
  useEffect(()=>()=>{clearTimeout(retryTimer.current);const s=state.current;s.enabled=false;for(const task of s.active.values())task.controller.abort();s.active.clear();},[]);
  useEffect(()=>{
    const reset=(event:Event)=>{
      const path=(event as CustomEvent<string|undefined>).detail,s=state.current;
      for(const key of s.done.keys())if(!path||key===path||key.startsWith(path+'/'))s.done.delete(key);
      for(const [key,task] of s.active)if(!path||key===path||key.startsWith(path+'/')){task.controller.abort();s.active.delete(key);}
      pump.current();
    };
    window.addEventListener('omi-thumbnail-invalidated',reset);return()=>window.removeEventListener('omi-thumbnail-invalidated',reset);
  },[]);
}
export { useCoverQueue as useMobileCoverQueue };
