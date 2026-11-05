import {documentRasterInfo} from './documentRaster';
import { MAX_MOBI_BYTES } from './mobiLimits';
import { sanitizeAndroidChapter } from '../android/epub';
import type { NativeCall } from '../android/bridge';
import { MAX_MOBI_FILE_BYTES } from './mobiRangeBuffer';

/** Loaded only for MOBI, with one disposable worker and the existing range API. */
export class MobiClient {
  private worker=new Worker(new URL('./mobi.worker.ts',import.meta.url),{type:'module'});
  private sequence=0;private closed=false;
  private source?:{size:number;read:(begin:number,end:number)=>Promise<Uint8Array>;signal:AbortSignal};
  private pending=new Map<number,{resolve:(data:any)=>void;reject:(error:Error)=>void;timer:number}>();
  private queued:{id:number;method:string;args:Record<string,unknown>;transfer:Transferable[];resolve:(data:any)=>void;reject:(error:Error)=>void}[]=[];
  private focusedChapter=-1;
  private releaseSource?:()=>void;
  constructor(private registerImage?: (data:string)=>Promise<{url:string;preview:string;width:number;height:number}>){
    this.worker.onmessage=({data})=>{
      if(data.method==='range'){void this.readRange(data.id,data.begin,data.end);return;}
      const task=this.pending.get(data.id);if(!task)return;clearTimeout(task.timer);this.pending.delete(data.id);if(data.error)task.reject(Error(data.error));else task.resolve(data.data);this.dispatch();
    };
    this.worker.onerror=()=>this.close('MOBI 解析任务失败。');
  }
  private request<T>(method:string,args:Record<string,unknown>,transfer:Transferable[]=[]):Promise<T>{
    if(this.closed)return Promise.reject(Error('MOBI 文档已关闭。'));
    return new Promise((resolve,reject)=>{this.queued.push({id:++this.sequence,method,args,transfer,resolve,reject});this.dispatch();});
  }
  focus(index:number){this.focusedChapter=index;}
  private dispatch(){
    if(this.closed||this.pending.size||!this.queued.length)return;
    // Range replies bypass this queue. Only one parser operation owns the
    // worker, and a new destination goes ahead of speculative work.
    const priority=(task:typeof this.queued[number])=>task.method==='open'?-1:task.method==='chapter'?(task.args.index===this.focusedChapter?0:1):2;
    this.queued.sort((a,b)=>priority(a)-priority(b)||a.id-b.id);
    const task=this.queued.shift()!,timer=window.setTimeout(()=>this.close('MOBI 解析超时，请尝试转换为 EPUB。'),task.method==='open'?120000:30000);
    this.pending.set(task.id,{resolve:task.resolve,reject:task.reject,timer});
    try{this.worker.postMessage({id:task.id,method:task.method,...task.args},task.transfer);}
    catch{this.close('MOBI 解析任务失败。');}
  }
  private async readRange(id:number,begin:number,end:number){
    try{
      const source=this.source;
      if(!source||!Number.isInteger(begin)||!Number.isInteger(end)||begin<0||end<=begin||end>source.size||end-begin>1024*1024)throw Error('MOBI 读取范围无效。');
      source.signal.throwIfAborted();const part=await source.read(begin,end);source.signal.throwIfAborted();
      if(this.closed)return;if(part.length!==end-begin)throw Error('MOBI 文件读取中断。');
      // Own just this chunk before transferring; never detach the source API's
      // borrowed backing store or allocate the whole book in the UI process.
      const buffer=Uint8Array.from(part).buffer;
      this.worker.postMessage({method:'range',id,buffer},[buffer]);
    }catch(error){if(!this.closed)this.worker.postMessage({method:'range',id,error:error instanceof Error?error.message:'MOBI 文件读取中断。'});}
  }
  async open(size:number,read:(begin:number,end:number)=>Promise<Uint8Array>,signal:AbortSignal,recordSignatures?:string){
    if(!Number.isSafeInteger(size)||size<78||size>MAX_MOBI_FILE_BYTES)throw Error('MOBI 文件大小无效或超过 2 GiB。');
    signal.throwIfAborted();this.source={size,read,signal};
    const abort=()=>this.close('MOBI 文件读取已取消。');signal.addEventListener('abort',abort,{once:true});
    this.releaseSource=()=>{signal.removeEventListener('abort',abort);this.source=undefined;};
    try{const signatures=recordSignatures?Uint8Array.from(atob(recordSignatures),c=>c.charCodeAt(0)):undefined;return await this.request<{name:string;index:number;fixedLayout?:boolean}[]>('open',{size,signatures:signatures?.buffer},signatures?[signatures.buffer]:[]);}
    catch(error){this.close();throw error;}
    finally{if(size<=MAX_MOBI_BYTES){this.releaseSource?.();this.releaseSource=undefined;}}
  }
  async preview(index:number){
    const data=await this.request<ArrayBuffer|null>('preview',{index});if(!data)return null;
    const bytes=new Uint8Array(data);let binary='';for(let n=0;n<bytes.length;n+=16384)binary+=String.fromCharCode(...bytes.subarray(n,n+16384));return `data:image/jpeg;base64,${btoa(binary)}`;
  }
  async chapter(index:number){
    const result=await this.request<{html:string;images:{name:string;type:string;data:ArrayBuffer}[]}>('chapter',{index});
    const images=new Map<string,string|{url:string;preview?:string;width:number;height:number}>();let total=0;
    for(const image of result.images){const bytes=new Uint8Array(image.data);total+=bytes.length;if(total>16*1024*1024)throw Error('MOBI 章节图片过大。');let binary='';for(let n=0;n<bytes.length;n+=16384)binary+=String.fromCharCode(...bytes.subarray(n,n+16384));const base64=btoa(binary);images.set(image.name,this.registerImage?await this.registerImage(base64):{url:`data:${image.type};base64,${base64}`,...documentRasterInfo(bytes)});}
    const native:NativeCall=async<T>(_method:string,args:unknown)=>images.get((args as {href:string}).href) as T;
    return sanitizeAndroidChapter(JSON.stringify({html:result.html,path:'',entry:''}),native,this.registerImage?'https://omi.local':'data:');
  }
  close(message='MOBI 文档已关闭。'){
    if(this.closed)return;this.closed=true;this.releaseSource?.();this.releaseSource=undefined;this.source=undefined;this.worker.terminate();for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(Error(message));}this.pending.clear();for(const task of this.queued)task.reject(Error(message));this.queued=[];
  }
}
