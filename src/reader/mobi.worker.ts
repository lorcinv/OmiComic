import { initMobiFile } from '@lingo-reader/mobi-parser';
import { inspectMobi } from './mobiLimits';
import { documentRaster } from './documentRaster';

const owned=new Set<string>(),create=URL.createObjectURL.bind(URL);
URL.createObjectURL=blob=>{const url=create(blob);owned.add(url);return url;};
let book:Awaited<ReturnType<typeof initMobiFile>>;
async function chapter(index:number){
  if(!Number.isInteger(index))throw Error('MOBI 章节编号无效。');
  const entry=book.getSpine()[index];if(!entry)throw Error('MOBI 章节不存在。');
  const content=book.loadChapter(entry.id);if(!content||content.html.length>4*1024*1024)throw Error('MOBI 章节为空或过大。');
  const replacements=new Map<string,string>(),images:{name:string;type:string;data:ArrayBuffer}[]=[];let total=0;
  for(const match of content.html.matchAll(/\bsrc=["'](blob:[^"']+)["']/gi)){
    const url=match[1];if(replacements.has(url)||!owned.has(url)||images.length>=100)continue;
    const blob=await(await fetch(url)).blob();if(blob.size>8*1024*1024)continue;
    const data=await blob.arrayBuffer(),type=documentRaster(new Uint8Array(data));if(!type)continue;
    total+=data.byteLength;if(total>16*1024*1024)throw Error('MOBI 章节图片过大。');
    const name=`mobi-image-${images.length}.raster`;replacements.set(url,name);images.push({name,type,data});
  }
  return {html:content.html.replace(/\bsrc=(["'])(blob:[^"']+)\1/gi,(_all,q,url)=>`src=${q}${replacements.get(url)??''}${q}`),images};
}
let queue=Promise.resolve();
self.onmessage=event=>{
  const {id,method,buffer,index}=event.data;
  queue=queue.then(async()=>{try{
    if(method==='open'){
      inspectMobi(buffer);
      const file={name:'book.mobi',arrayBuffer:async()=>buffer} as File;
      book=await initMobiFile(file);
      const spine=book.getSpine();if(!spine.length||spine.length>5000)throw Error('MOBI 没有可阅读章节或章节过多。');
      self.postMessage({id,data:spine.map((_entry,n)=>({index:n,name:`第 ${n+1} 章`}))});
    }else{
      if(!book)throw Error('MOBI 文档已关闭。');const data=await chapter(index);self.postMessage({id,data},{transfer:data.images.map(image=>image.data)});
    }
  }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'MOBI 解析失败。'});}});
};
