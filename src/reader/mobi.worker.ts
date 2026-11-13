import '../android/webviewCompat';
import { initMobiFile, initKf8File } from '@lingo-reader/mobi-parser';
import { inspectMobi, MAX_MOBI_BYTES } from './mobiLimits';
import { documentRaster, documentRasterInfo } from './documentRaster';
import { MobiRangeBuffer } from './mobiRangeBuffer';

const owned=new Set<string>(),create=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);owned.add(url);return url;};
let book:Awaited<ReturnType<typeof initMobiFile|typeof initKf8File>>;
let rangeSequence=0;
let ranged:MobiRangeBuffer|undefined;
let comicPages:{id:string;html?:string}[]|undefined;
type RangeParser = {replace:(html:string)=>{html:string};resourceCache:Map<string,string>;chapterCache:Map<number,unknown>};
const ranges=new Map<number,{resolve:(data:Uint8Array)=>void;reject:(error:Error)=>void}>();
function readRange(begin:number,end:number){
  const id=++rangeSequence;
  return new Promise<Uint8Array>((resolve,reject)=>{ranges.set(id,{resolve,reject});self.postMessage({method:'range',id,begin,end});});
}
async function readBook(size:number){
  if(!Number.isSafeInteger(size)||size<78||size>MAX_MOBI_BYTES)throw Error('MOBI 文件为空或超过本版 256 MiB 上限。');
  const bytes=new Uint8Array(size);
  for(let begin=0;begin<size;begin+=1024*1024){
    const end=Math.min(size,begin+1024*1024),id=++rangeSequence;
    const part=await new Promise<Uint8Array>((resolve,reject)=>{ranges.set(id,{resolve,reject});self.postMessage({method:'range',id,begin,end});});
    if(part.length!==end-begin)throw Error('MOBI 文件读取中断。');bytes.set(part,begin);
  }
  return bytes.buffer;
}
async function chapter(index:number){
  if(!Number.isInteger(index))throw Error('MOBI 章节编号无效。');
  const entry=comicPages?.[index]??book.getSpine()[index];if(!entry)throw Error('MOBI 章节不存在。');
  const load=()=>('html' in entry&&entry.html!==undefined)?(book as unknown as RangeParser).replace(entry.html):book.loadChapter(entry.id);
  const content=await (ranged?ranged.retry(load):load());if(!content||content.html.length>4*1024*1024)throw Error('MOBI 章节为空或过大。');
  const replacements=new Map<string,string>(),images:{name:string;type:string;data:ArrayBuffer}[]=[];let total=0;
  for(const match of content.html.matchAll(/\bsrc=["'](blob:[^"']+)["']/gi)){
    const url=match[1];if(replacements.has(url)||!owned.has(url)||images.length>=100)continue;
    const blob=await(await fetch(url)).blob();if(blob.size>8*1024*1024)continue;
    const data=await new Response(blob).arrayBuffer(),type=documentRaster(new Uint8Array(data),content.html.replace(/<[^>]*>/g,'').replace(/&[^;]+;|\s/g,'').length<40?100_000_000:16_000_000);if(!type)continue;
    total+=data.byteLength;if(total>16*1024*1024)throw Error('MOBI 章节图片过大。');
    const name=`mobi-image-${images.length}.raster`;replacements.set(url,name);images.push({name,type,data});
  }
  const html=content.html.replace(/\bsrc=(["'])(blob:[^"']+)\1/gi,(_all,q,url)=>`src=${q}${replacements.get(url)??''}${q}`);
  if(ranged){
    // The receiver owns transferred image bytes. A large book must not retain
    // another whole-book collection of blobs inside the third-party parser.
    for(const url of owned)URL.revokeObjectURL(url);owned.clear();
    const parser=book as unknown as RangeParser;parser.resourceCache.clear();parser.chapterCache.clear();
  }
  return {html,images};
}
const chapterCache=new Map<number,Awaited<ReturnType<typeof chapter>>>();
async function cachedChapter(index:number){
  const saved=chapterCache.get(index);if(saved){chapterCache.delete(index);chapterCache.set(index,saved);return saved;}
  const result=await chapter(index);chapterCache.set(index,result);let bytes=[...chapterCache.values()].reduce((n,v)=>n+v.html.length*2+v.images.reduce((m,i)=>m+i.data.byteLength,0),0);
  for(const [key,value] of chapterCache){if(bytes<=8*1024*1024)break;chapterCache.delete(key);bytes-=value.html.length*2+value.images.reduce((n,i)=>n+i.data.byteLength,0);}return result;
}
async function preview(index:number){
  if(typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined')return null;
  const content=await cachedChapter(index),image=content.images[0];if(!image)return null;const size=documentRasterInfo(new Uint8Array(image.data));if(size.height>size.width*3)return null;
  const bitmap=await createImageBitmap(new Blob([image.data],{type:image.type}),{resizeWidth:360});
  try{const scale=Math.min(1,480/bitmap.height),canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);return new Response(await canvas.convertToBlob({type:'image/jpeg',quality:.8})).arrayBuffer();}finally{bitmap.close();}
}
let queue=Promise.resolve();
self.onmessage=event=>{
  const {id,method,buffer,index,size}=event.data;
  // Range replies must bypass the command queue: its open task awaits them.
  if(method==='range'){
    const range=ranges.get(id);if(!range)return;ranges.delete(id);
    if(event.data.error)range.reject(Error(event.data.error));else range.resolve(new Uint8Array(buffer));return;
  }
  queue=queue.then(async()=>{try{
    if(method==='open'){
      ranged=size>MAX_MOBI_BYTES?await MobiRangeBuffer.open(size,readRange,event.data.signatures?new Uint8Array(event.data.signatures):undefined):undefined;
      const contents=ranged??await readBook(size),format=await (ranged?ranged.retry(()=>inspectMobi(contents)):inspectMobi(contents));
      const file={name:format.kf8?'book.azw3':'book.mobi',arrayBuffer:async()=>contents} as File;
      const init=async():Promise<typeof book>=>format.kf8?initKf8File(file):initMobiFile(file);
      book=await (ranged?ranged.retry(init):init());
      let spine:{id:string}[]=book.getSpine();
      comicPages=undefined;
      if(ranged&&!format.kf8){
        const pages:{id:string;html?:string}[]=[];
        for(const entry of book.getSpine()){
          const html='text' in entry?entry.text:undefined;
          const images=html?[...html.matchAll(/<img\b[^>]*>/gi)]:[];
          const text=html?.replace(/<[^>]*>/g,'').replace(/&[^;]+;|\s/g,'')??'';
          if(html&&images.length>1&&text.length<=images.length*40){
            images.forEach((image,n)=>pages.push({id:entry.id,html:html.slice(n===0?0:image.index,images[n+1]?.index)}));
          }else pages.push({id:entry.id});
        }
        comicPages=pages;spine=pages;
      }
      if(!spine.length||spine.length>5000)throw Error('MOBI 没有可阅读章节或章节过多。');
      self.postMessage({id,data:spine.map((entry,n)=>{const raw=comicPages?.[n]?.html??('text' in entry?String(entry.text):'');const text=raw.replace(/<[^>]*>/g,'').replace(/&[^;]+;|\s/g,'');return{index:n,name:`第 ${n+1} 章`,fixedLayout:!!raw&&/<img\b/i.test(raw)&&(!text||/^(?:第\d+[页頁]|page\d+|\d+)$/i.test(text))};})});
    }else{
      if(!book)throw Error('MOBI 文档已关闭。');if(method==='preview'){const data=await preview(index);self.postMessage({id,data},{transfer:data?[data]:[]});}else{const saved=await cachedChapter(index),data={html:saved.html,images:saved.images.map(image=>({...image,data:image.data.slice(0)}))};self.postMessage({id,data},{transfer:data.images.map(image=>image.data)});}
    }
  }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'MOBI 解析失败。'});}});
};
