import { MAX_MOBI_BYTES } from './mobiLimits';
import { sanitizeAndroidChapter } from '../android/epub';
import type { NativeCall } from '../android/bridge';

/** Loaded only for MOBI, with one disposable worker and the existing range API. */
export class MobiClient {
  private worker=new Worker(new URL('./mobi.worker.ts',import.meta.url),{type:'module'});
  private sequence=0;private closed=false;
  private pending=new Map<number,{resolve:(data:any)=>void;reject:(error:Error)=>void;timer:number}>();
  constructor(){
    this.worker.onmessage=({data})=>{const task=this.pending.get(data.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(data.id);if(data.error)task.reject(Error(data.error));else task.resolve(data.data);};
    this.worker.onerror=()=>this.close('MOBI 解析任务失败。');
  }
  private request<T>(method:string,args:Record<string,unknown>,transfer:Transferable[]=[]):Promise<T>{
    if(this.closed)return Promise.reject(Error('MOBI 文档已关闭。'));
    if(this.pending.size>=2)return Promise.reject(Error('请等待当前 MOBI 章节完成。'));
    return new Promise((resolve,reject)=>{const id=++this.sequence,timer=window.setTimeout(()=>this.close('MOBI 解析超时，请尝试转换为 EPUB。'),30000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,method,...args},transfer);});
  }
  async open(size:number,read:(begin:number,end:number)=>Promise<Uint8Array>,signal:AbortSignal){
    if(!Number.isSafeInteger(size)||size<78||size>MAX_MOBI_BYTES)throw Error('MOBI 文件为空或超过本版 64 MB 上限。');
    const data=new Uint8Array(size);
    for(let offset=0;offset<size;offset+=1024*1024){signal.throwIfAborted();const end=Math.min(size,offset+1024*1024),part=await read(offset,end);if(part.length!==end-offset)throw Error('MOBI 文件读取中断。');data.set(part,offset);}
    signal.throwIfAborted();return this.request<{name:string;index:number}[]>('open',{buffer:data.buffer},[data.buffer]);
  }
  async chapter(index:number){
    const result=await this.request<{html:string;images:{name:string;type:string;data:ArrayBuffer}[]}>('chapter',{index});
    const images=new Map<string,string>();let total=0;
    for(const image of result.images){const bytes=new Uint8Array(image.data);total+=bytes.length;if(total>16*1024*1024)throw Error('MOBI 章节图片过大。');let binary='';for(let n=0;n<bytes.length;n+=16384)binary+=String.fromCharCode(...bytes.subarray(n,n+16384));images.set(image.name,`data:${image.type};base64,${btoa(binary)}`);}
    const native:NativeCall=async<T>(_method:string,args:unknown)=>images.get((args as {href:string}).href) as T;
    return sanitizeAndroidChapter(JSON.stringify({html:result.html,path:'',entry:''}),native,'data:');
  }
  close(message='MOBI 文档已关闭。'){
    if(this.closed)return;this.closed=true;this.worker.terminate();for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(Error(message));}this.pending.clear();
  }
}
