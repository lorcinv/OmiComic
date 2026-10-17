const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(30);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Png117',name='LargePng110.cbz',path=base+'/'+name;
const version=(await api.getAppInfo()).version,baseline=version==='1.1.16';
const listing=await value(api.listDirectory(base)),entry=listing.items.find(e=>e.name===name);assert(entry?.size>1800000000,'Real PNG archive must exceed 1.8 GB');
await value(api.updateSettings({mobileReaderPreviews:true,mobilePreviewWidth:88,readerPreloadPages:window.__omiFixture==='no-preload'?0:2,readerImageLoadConcurrency:2,readerMemoryCacheSizeMb:100,androidReaderDiskCacheSizeMb:512,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false,mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:'archive:'+path,sourcePath:path,sourceType:'archive',title:name,currentPageIndex:0,totalPages:110,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing target');e.scrollIntoView({block:'center'});await pause(250);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'key');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const body=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
const ready=async()=>{const state=await stats();return state.rasters.some(r=>r.url===body()?.dataset.nativeImage&&r.width===3444&&r.height===5120&&!r.preview&&r.bitmapWidth>=800);};
await tap(button('打开资源库'));const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);await wait(card,'card');
let started;const mark=e=>{if(card()?.contains(e.target))started=performance.now();};document.addEventListener('pointerup',mark,true);await tap(card());
await wait(body,'first preview');const previewMs=Math.round(performance.now()-started);await wait(ready,'first clear frame');document.removeEventListener('pointerup',mark,true);
const openingMs=Math.round(performance.now()-started),first=await stats();assert(started,'Real opening');
if(window.__omiFixture==='restore')assert(first.rasterSourceSkips>0,'Restart did not reuse the persisted clear raster');
const savedVisible=async()=>{const state=await stats();return state.persistedVisibleUrls?.includes(body()?.dataset.nativeImage);};
// Encoding is intentionally deferred during fast reading. Confirm idle
// persistence explicitly instead of assuming every passing page was written.
if(typeof first.rasterWriteCount==='number')await wait(savedVisible,'first clear raster persisted while idle',15000);
await wait(()=>!document.documentElement.dataset.mobileNavigation,'opening transition');await pause(400);
const turns=[],budgetSamples=[];
for(let n=1;n<=(window.__omiFixture==='cache-stress'?70:8);n++){
  const t=performance.now();await key(22);await wait(()=>Number(body()?.closest('[data-reader-page-index]')?.dataset.readerPageIndex)===n,'turn '+n);await wait(ready,'clear page '+n);
  turns.push({page:n+1,clearMs:Math.round(performance.now()-t)});
  if(!baseline&&n%7===0){const usage=await value(api.getAndroidCacheInfo());assert(usage.readerBytes<=usage.readerLimit&&usage.readerRasterBytes<=usage.readerRasterLimit,'Disk cache exceeded its budget');budgetSamples.push(usage);}
}
// Reachable state: a cached preview survived cancellation; geometry revisits it
// without another prepare call. Verify native pixels, not a ready URL.
window.__omiStalePreview=true;await wait(()=>!window.__omiStalePreview,'cancelled-preview injection');
const recoveryStart=performance.now();let recovered=false;
try{await wait(ready,'stale preview recovery',5000);recovered=true;}catch(error){if(!baseline)throw error;}
const recovery={recovered,ms:Math.round(performance.now()-recoveryStart),native:await stats()};
let transientRecovery=null;
if(!baseline){const before=await stats();window.__omiTransientRefinement=true;await wait(()=>!window.__omiTransientRefinement,'transient I/O failure');await wait(ready,'automatic clear retry');const after=await stats();assert(after.refinementFailures>before.refinementFailures,'Transient failure was not exercised');transientRecovery={failures:after.refinementFailures-before.refinementFailures,refinements:after.refinements-before.refinements};}
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible'))await tap(document.querySelector('.reader-stage'));
await wait(()=>document.querySelector('.reader-layout.is-mobile-chrome-visible'),'reader controls');await pause(450);
const seeks=[];
for(const ratio of baseline?[]:[.95,.05,.9,.1,1,0]){
  const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect();let target=-1;
  const landed=e=>{if(e.target.closest?.('.reader-progress-rail')){const box=rail.getBoundingClientRect();target=Math.round(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*109);}};document.addEventListener('pointerup',landed,true);
  window.__omiDrag={from:{x:r.left+Math.max(1,Math.min(r.width-1,r.width*(Number(rail.getAttribute('aria-valuenow'))-1)/109)),y:r.top+r.height/2},to:{x:r.left+Math.max(.1,Math.min(r.width-.1,r.width*ratio)),y:r.top+r.height/2},viewport:innerWidth,holdMs:10,stepMs:6};
  await wait(()=>!window.__omiDrag,'seek');document.removeEventListener('pointerup',landed,true);const t=performance.now();assert(target>=0,'Progress drag missed');
  await wait(()=>Number(body()?.closest('[data-reader-page-index]')?.dataset.readerPageIndex)===target,'seek target '+target+' from '+rail.getAttribute('aria-valuenow'));await wait(ready,'seek clear');const clearMs=Math.round(performance.now()-t);
  await wait(async()=>{const state=await stats(),strip=document.querySelector('.mobile-reader-filmstrip'),bounds=strip.getBoundingClientRect();return [...strip.querySelectorAll('.mobile-filmstrip-page')].filter(n=>{const b=n.getBoundingClientRect();return b.right>bounds.left+10&&b.left<bounds.right-10;}).every(n=>{const native=n.querySelector('[data-native-preview]'),img=n.querySelector('img');return native&&state.previewRasterUrls.includes(native.dataset.nativePreview)||img?.complete&&img.naturalWidth>0;});},'visible previews');
  seeks.push({page:target+1,clearMs,previewsMs:Math.round(performance.now()-t)});
}
await pause(2000);const settled=await stats();await pause(2000);const idle=await stats();assert(idle.bitmapDecodes===settled.bitmapDecodes,'Decode loop while idle');
if(typeof first.rasterWriteCount==='number')await wait(savedVisible,'current cached page persisted while idle',15000);
const beforeExit=await value(api.getAndroidCacheInfo());if(document.querySelector('.mobile-reader-filmstrip'))await key(4);await key(4);await wait(()=>!body(),'exit');
let afterExit;await wait(async()=>{afterExit=await value(api.getAndroidCacheInfo());return baseline||afterExit.readerTemporaryBytes===0;},'temporary cache cleanup');
const exited=await stats();if(!baseline){assert(exited.bitmapBytes===0&&exited.previewBytes===0&&exited.tileBytes===0,'Decoded pages retained after exit');assert(afterExit.readerRasterBytes>0&&afterExit.readerRasterBytes<=afterExit.readerRasterLimit,'Clear rasters missing or over budget');assert(afterExit.thumbnailBytes>=beforeExit.thumbnailBytes,'Exit deleted cover cache');}
await wait(card,'return card');let warmStart;const warmMark=e=>{if(card()?.contains(e.target))warmStart=performance.now();};document.addEventListener('pointerup',warmMark,true);await tap(card());await wait(ready,'warm clear');document.removeEventListener('pointerup',warmMark,true);
const reopenMs=Math.round(performance.now()-warmStart),warm=await stats();
if(!baseline)assert(warm.rasterSourceSkips>idle.rasterSourceSkips,'Reopen decoded original PNG instead of clear raster '+JSON.stringify({first:first.rasters,idle:{rasters:idle.rasters,writes:idle.rasterWriteCount,skips:idle.rasterSourceSkips,pending:idle.pendingRasterWrites},warm:{rasters:warm.rasters,writes:warm.rasterWriteCount,skips:warm.rasterSourceSkips},beforeExit,afterExit}));
return {version,bytes:entry.size,pages:110,dimensions:[3444,5120],previewMs,openingMs,turns,budgetSamples,recovery,transientRecovery,seeks,idleDecodes:idle.bitmapDecodes-settled.bitmapDecodes,beforeExit,afterExit,exited,reopenMs,warm,first};
