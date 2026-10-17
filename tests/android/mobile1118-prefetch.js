const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(25);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Png117',name='LargePng110.cbz',path=base+'/'+name;
const version=(await api.getAppInfo()).version,updated=version!=='1.1.17';
const entry=(await value(api.listDirectory(base))).items.find(e=>e.name===name);assert(entry?.size>1800000000,'Large PNG fixture missing');
const concurrency=window.__omiFixture==='single-worker'?1:2;
await value(api.updateSettings({mobileReaderPreviews:true,readerPreloadPages:2,readerImageLoadConcurrency:concurrency,readerMemoryCacheSizeMb:100,androidReaderDiskCacheSizeMb:512,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false,mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:'archive:'+path,sourcePath:path,sourceType:'archive',title:name,currentPageIndex:0,totalPages:110,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing target');const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'key');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const body=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
const page=()=>Number(body()?.closest('[data-reader-page-index]')?.dataset.readerPageIndex);
const ready=async()=>{const s=await stats();return s.rasters.some(r=>r.url===body()?.dataset.nativeImage&&!r.preview&&r.bitmapWidth>=800);};
await tap(button('打开资源库'));const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);await wait(card,'card');
const book=await value(api.getResourcePages({path})),urls=[];
for(const p of book.pages.slice(0,35))urls.push((await value(api.getPageImage({sourcePath:p.sourcePath,archiveInnerPath:p.archiveInnerPath,type:p.type}))).url);
let opened;const mark=e=>{if(card()?.contains(e.target))opened=performance.now();};document.addEventListener('pointerup',mark,true);await tap(card());await wait(ready,'first clear');document.removeEventListener('pointerup',mark,true);
const openingMs=Math.round(performance.now()-opened);await wait(()=>!document.documentElement.dataset.mobileNavigation,'transition');
const paced=[],reverse=[],burst=[];let peakBytes=0;
const turn=async(target,code,rows)=>{
  const before=await stats(),warm=before.clearCachedUrls.includes(urls[target]);const start=performance.now();
  await key(code);await wait(()=>page()===target,'page '+target);await wait(ready,'clear '+target);const s=await stats();peakBytes=Math.max(peakBytes,s.bitmapBytes);
  rows.push({page:target+1,clearMs:Math.round(performance.now()-start),alreadyClear:warm,cancellations:s.cancelledLoads});
};
for(let target=1;target<=10;target++){await pause(600);await turn(target,22,paced);}
// Turn while adjacent decoding is in flight. The last requested page must win.
for(let group=0;group<3;group++){
  const start=performance.now();for(let step=0;step<4;step++){await key(22);await pause(60);}
  const target=14+group*4;await wait(()=>page()===target,'burst landing '+target);await wait(ready,'burst clear');
  burst.push({page:target+1,ms:Math.round(performance.now()-start)});
}
for(let target=21;target>=17;target--){await pause(400);await turn(target,21,reverse);}
await pause(3000);const settled=await stats(),usage=await value(api.getAndroidCacheInfo());
assert(usage.readerBytes<=usage.readerLimit&&usage.readerRasterBytes<=usage.readerRasterLimit,'Disk budget');
assert(peakBytes<=settled.budget+16000000,'Unbounded decoded page cache');
if(updated){assert(settled.retainedLoads>0,'Useful in-flight work was never reused');assert(settled.clearPrefetches>0,'Clear neighbours not prepared');assert(settled.deferredRasterWrites>0,'Foreground never deferred raster encoding');}
await pause(1500);const idle=await stats();assert(idle.bitmapDecodes===settled.bitmapDecodes,'Idle decode loop');
if(updated){for(let i=0;i<4;i++)await key(22);}
if(document.querySelector('.reader-layout.is-mobile-chrome-visible'))await key(4);await key(4);await wait(()=>!body(),'exit');
let afterExit;await wait(async()=>{afterExit=await value(api.getAndroidCacheInfo());return afterExit.readerTemporaryBytes===0;},'cleanup');const exited=await stats();
assert(exited.bitmapBytes===0&&exited.previewBytes===0&&exited.tileBytes===0,'Exit retained native pixels');
await pause(800);const afterCleanup=await stats();assert(afterCleanup.bitmapBytes===0&&afterCleanup.previewBytes===0&&afterCleanup.tileBytes===0,'Cancelled work repopulated pixels after exit');
return {version,concurrency,bytes:entry.size,openingMs,paced,burst,reverse,peakBytes,settled,usage,afterExit,exited,afterCleanup};
