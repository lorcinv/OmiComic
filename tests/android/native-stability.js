const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+20000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(40);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
window.__omiAliasProbe=true;await wait(()=>!window.__omiAliasProbe,'antialias reference comparison');
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Native112';
await value(api.updateSettings({mobileLibraryLayout:'grid',mobileGridColumns:2,readerPreloadPages:1,readerMemoryCacheSizeMb:64,readerPageMode:'single',readerDefaultPanorama:false,mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
const book=await value(api.getResourcePages({path:base+'/Large'}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:book.title,currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
document.querySelector('[aria-label="打开资源库"]').click();
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent==='Large');
await wait(card,'large card');card().click();await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'large reader');
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'stats');return window.__omiNativeStats;};
await pause(12000);const start=await stats();await pause(5000);const end=await stats();
window.__omiRasterCacheProbe=true;await wait(()=>!window.__omiRasterCacheProbe,'persistent filtered raster');
assert(window.__omiRasterCacheResult>0,'Filtered raster was not stored: '+JSON.stringify(await value(api.getAndroidCacheInfo())));
const image=document.querySelector('.reader-native-image').getBoundingClientRect();
window.__omiPixelRegion={left:image.left+5,top:image.top+5,width:image.width-10,height:image.height-10,viewport:innerWidth};await wait(()=>!window.__omiPixelRegion,'pixels');
const result={start,end,filteredRasterDiskBytes:window.__omiRasterCacheResult,decodesWhileIdle:end.tileDecodes-start.tileDecodes,drawsWhileIdle:end.drawnFrames-start.drawnFrames,pixels:window.__omiPixelResult,antialias:window.__omiAliasResult};
// Baseline runs record the old loop; the new package must settle at fit size.
if((await api.getAppInfo()).version!=='1.1.13'){
  assert(result.decodesWhileIdle===0,'Visible tiles repeatedly evicted: '+JSON.stringify(result));
  assert(result.pixels.changedSamples===0,'Static page pixels fluctuate: '+JSON.stringify(result));
}
return result;
