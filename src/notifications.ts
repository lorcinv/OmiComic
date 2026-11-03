import {useCallback,useEffect,useId,useRef,useState,useSyncExternalStore,type SetStateAction} from 'react';

export interface AppNotice {id:number;owner:string;text:string;kind:'info'|'success'|'error';duration:number;closeLabel:string;className?:string;onDismiss?:()=>void;}
let sequence=0;
let queue:AppNotice[]=[],snapshot:AppNotice[]=[];
const active=new Map<string,boolean>(),listeners=new Set<()=>void>();
const publish=()=>{snapshot=queue.filter(item=>active.get(item.owner)!==false);for(const listener of listeners)listener();};
export function showNotice(input:Omit<AppNotice,'id'>):number{
  const existing=queue.find(item=>item.owner===input.owner&&item.text===input.text);
  if(existing)return existing.id;
  const item={...input,id:++sequence};queue=[...queue,item];publish();return item.id;
}
export function dismissNotice(id:number):void{const item=queue.find(item=>item.id===id);queue=queue.filter(item=>item.id!==id);publish();item?.onDismiss?.();}
function clearOwner(owner:string){queue=queue.filter(item=>item.owner!==owner);publish();}
export const getNoticeSnapshot=()=>snapshot;
export const useNotices=()=>useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener);},getNoticeSnapshot,getNoticeSnapshot);

/** Keep existing page setters while every notification shares one ordered clock. */
export function useNoticeState(kind:AppNotice['kind'],duration:number,closeLabel:string,enabled=true){
  const owner=useId(),valueRef=useRef<string|null>(null),[value,setValue]=useState<string|null>(null);
  useEffect(()=>()=>{active.delete(owner);clearOwner(owner);},[owner]);
  useEffect(()=>{active.set(owner,enabled);publish();},[owner,enabled]);
  const set=useCallback((input:SetStateAction<string|null>)=>{
    const next=typeof input==='function'?input(valueRef.current):input;valueRef.current=next;setValue(next);
    if(next===null){clearOwner(owner);return;}
    showNotice({owner,text:next,kind,duration,closeLabel,onDismiss:()=>{if(valueRef.current===next){valueRef.current=null;setValue(null);}}});
  },[owner,kind,duration,closeLabel]);
  return [value,set] as const;
}
