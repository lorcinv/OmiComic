const assert=(v,m)=>{if(!v)throw new Error(m);}, pause=ms=>new Promise(r=>setTimeout(r,ms));
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Test library missing');
if(api.getAndroidCacheInfo)await value(api.updateSettings({androidReaderDiskCacheSizeMb:512,androidThumbnailCacheSizeMb:128}));
const listing=await value(api.listDirectory(root.path+'/Performance'));
await pause(1500);
const formats=[];let probe=Date.now();
const decode=async page=>{const start=performance.now(),{url}=await value(api.getPageImage(page));const response=await fetch(url+(url.includes('?')?'&':'?')+'probe='+(probe++),{cache:'no-store'});assert(response.ok,'Image response');const blob=await response.blob(),src=URL.createObjectURL(blob),image=new Image();try{image.src=src;await image.decode();assert(image.naturalWidth===512&&image.naturalHeight===768,'Page dimensions');}finally{URL.revokeObjectURL(src);}return Math.round(performance.now()-start);};
for(const name of ['Book01.cbz','Solid.cbr','Solid.cb7']){
 if(!listing.items.some(f=>f.name===name))continue;
 let start=performance.now();const book=await value(api.getResourcePages({path:root.path+'/Performance/'+name}));assert(book.total===64,'Book page count');const indexMs=Math.round(performance.now()-start);
 const order=[0,31,32,0,63,31],cold=[];for(const i of order)cold.push(await decode(book.pages[i]));
 await value(api.releaseReaderResource(book.sourcePath));
 start=performance.now();await value(api.getResourcePages({path:book.sourcePath}));const reopenMs=Math.round(performance.now()-start);
 const warm=[];for(const i of order)warm.push(await decode(book.pages[i]));
 formats.push({name,indexMs,firstPageMs:cold[0],reopenMs,coldPagesMs:cold,reopenedPagesMs:warm});
 window.__omiPage=book.pages[0];
 const cover=await value(api.getThumbnail({path:book.sourcePath,type:'archive'}));const image=new Image();image.src=cover.url;await image.decode();window.__omiWarmPreviewKey=new URL(cover.url).pathname.split('/').pop();
}
let cache=null;
if(api.getAndroidCacheInfo){cache=await value(api.getAndroidCacheInfo());assert(cache.readerBytes>0&&cache.readerLimit===512*1048576,'Read cache has no persisted pages');assert(cache.thumbnailLimit===128*1048576,'Cover budget differs from setting');await value(api.updateSettings({androidReaderDiskCacheSizeMb:768,androidThumbnailCacheSizeMb:192}));const changed=await value(api.getAndroidCacheInfo());assert(changed.readerLimit===768*1048576&&changed.thumbnailLimit===192*1048576,'Cache settings not applied live');}
return {version:(await api.getAppInfo()).version,formats,cache};
