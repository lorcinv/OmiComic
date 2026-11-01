import { decodeThumbnail } from './thumbnailDecoder';

// Share a bounded native decode lane between library covers and page previews.
let tail: Promise<unknown> = Promise.resolve();
const pending = new Map<string, Promise<{url:string;width:number;height:number}>>();
const cache = new Map<string, {url:string;width:number;height:number}>();

/** Full-size pixels stay in the decoder process; the queue retains small URLs. */
export function nativePageThumbnail(sourcePath:string, load?:()=>Promise<Buffer>) {
  const task=tail.catch(()=>{}).then(()=>decodeThumbnail(sourcePath,load));
  tail=task;
  return task;
}

export function pagePreview(key:string, sourcePath:string, dimensions:(bytes:Buffer)=>{width:number;height:number}|null, load?:()=>Promise<Buffer>) {
  const saved=cache.get(key);
  if(saved){cache.delete(key);cache.set(key,saved);return Promise.resolve(saved);}
  const running=pending.get(key);if(running)return running;
  const task=nativePageThumbnail(sourcePath,load?async()=>{
    const data=await load(),size=dimensions(data);
    if(data.length>256*1024*1024||!size||size.width*size.height>100_000_000)throw Error('PREVIEW_TOO_LARGE');
    return data;
  }:undefined).then(result=>{
    cache.set(key,result);while(cache.size>160)cache.delete(cache.keys().next().value!);
    return result;
  });
  pending.set(key,task);
  void task.finally(()=>{if(pending.get(key)===task)pending.delete(key);}).catch(()=>{});
  return task;
}
