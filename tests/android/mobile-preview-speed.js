const assert=(value,message)=>{if(!value)throw new Error(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(predicate,label,timeout=20000)=>{const deadline=performance.now()+timeout;while(!await predicate()){if(performance.now()>deadline)throw new Error('Timeout: '+label);await pause(16);}};
const api=window.omicomic,value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(item=>item.name==='OmiSmoke');
assert(root,'Native112 fixture root missing');
const base=root.path+'/Native112',book=await value(api.getResourcePages({path:base+'/Many.cbz',type:'archive'}));
assert(book.total===2500,'Many.cbz fixture must contain 2500 pages');
await value(api.updateSettings({
  colorTheme:'mist',mobileLibraryLayout:'grid',mobileGridColumns:2,mobileReaderPreviews:true,mobilePreviewWidth:88,
  readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false,
  doublePageDirection:'left-to-right',doublePageFirstSingle:false,
  mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0},
}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:book.title,currentPageIndex:0,totalPages:book.total,
  readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
const visible=element=>element&&element.getBoundingClientRect().width>0&&getComputedStyle(element).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(element=>visible(element)&&(element.getAttribute('aria-label')===label||element.textContent.trim()===label));
const tap=async element=>{assert(element,'Missing tap target');element.scrollIntoView({block:'center'});await pause(250);const r=element.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'real tap');};
await tap(button('打开资源库'));
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(element=>element.querySelector('strong')?.textContent==='Many.cbz');
await wait(card,'Many.cbz card');await tap(card());
const shown=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"])');
await wait(()=>shown()?.querySelector('[data-native-image]')&&document.documentElement.dataset.nativeReader==='on','native reader');
await pause(350);
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible'))await tap(document.querySelector('.reader-stage'));
await wait(()=>visible(document.querySelector('[aria-label="阅读进度"]')),'visible progress rail');

let trial=null,monitor=true,animation=0,lastNative=null;
const observations=[];
function selectedPreview(){
  if(!trial||trial.target===null)return null;
  const selected=document.querySelector('.mobile-reader-previews .resource-detail-thumbnail.is-selected');
  return selected?.getAttribute('aria-label')?.startsWith(`第 ${trial.target+1} 页：`)?selected.querySelector('[data-native-preview]'):null;
}
function track(event){
  if(!trial||!event.target.closest?.('.reader-progress-rail'))return;
  const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect();
  const target=Math.round(Math.max(0,Math.min(1,(event.clientX-r.left)/r.width))*(book.total-1));
  if(target!==trial.target){
    trial.target=target;trial.targetInputAt=performance.now();trial.previewAt=null;trial.nativeAt=null;trial.domAt=null;trial.url=null;
  }
  trial.trustedEvents+=event.isTrusted?1:0;trial.lastPointerAt=performance.now();
}
for(const type of ['pointerdown','pointermove','pointerup'])document.addEventListener(type,track,true);
function watch(){
  if(!monitor)return;
  if(trial&&trial.target!==null){
    const page=shown(),image=selectedPreview();
    if(Number(page?.dataset.readerPageIndex)===trial.target){
      const native=page.querySelector('[data-native-image]');
      if(native){trial.url=native.dataset.nativeImage;trial.domAt??=performance.now();}
    }
    
  }
  animation=requestAnimationFrame(watch);
}
watch();
const probe=(async()=>{
  while(monitor){
    window.__omiNativeProbe=true;
    await wait(()=>!window.__omiNativeProbe,'native raster observation');
    if(!monitor)break;
    lastNative=window.__omiNativeStats;
    assert(Array.isArray(lastNative?.rasters),'Native probe missing rasters');
    assert(lastNative.rasters.every(raster=>typeof raster.url==='string'),'Native probe must report each raster URL');
    if(trial?.url){if(trial.nativeAt===null&&lastNative.rasters.some(raster=>raster.url===trial.url))trial.nativeAt=performance.now();if(trial.previewAt===null&&lastNative.previewRasterUrls?.includes(trial.url))trial.previewAt=performance.now();}
    await pause(16);
  }
})();
try{
  for(const ratio of [.24,.82,.46,.94,.18,.77]){
    const rail=document.querySelector('[aria-label="阅读进度"]'),rect=rail.getBoundingClientRect();
    const fromIndex=Number(rail.getAttribute('aria-valuenow'))-1;
    trial={requestedRatio:ratio,fromIndex,target:null,targetInputAt:0,lastPointerAt:0,previewAt:null,nativeAt:null,domAt:null,url:null,trustedEvents:0};
    // Real injected Android motion, with intermediate points, deliberately
    // creates superseded requests before landing hundreds of pages away.
    window.__omiDrag={from:{x:rect.left+Math.max(1,Math.min(rect.width-1,rect.width*fromIndex/(book.total-1))),y:rect.top+rect.height/2},
      to:{x:rect.left+rect.width*ratio,y:rect.top+rect.height/2},viewport:innerWidth,holdMs:40};
    await wait(()=>!window.__omiDrag,'real progress drag');
    await wait(()=>trial.nativeAt!==null&&trial.previewAt!==null,'target native page and selected preview',12000);
    assert(trial.trustedEvents>=3,'Preview was not opened with trusted Android pointer input');
    assert(Math.abs(trial.target-fromIndex)>150,'Seek was not a distant page');
    assert(document.querySelector('.mobile-reader-previews'),'Drag preview did not open');
    const image=selectedPreview();assert(image,'Selected preview missing');assert(image.dataset.nativePreview===trial.url,'Selected preview uses a different image');
    const result={fromPage:fromIndex+1,toPage:trial.target+1,
      nativeDomReadyMs:Math.round(trial.domAt-trial.targetInputAt),
      nativeDisplayedObservedMs:Math.round(trial.nativeAt-trial.targetInputAt),
      selectedPreviewDisplayedMs:Math.round(trial.previewAt-trial.targetInputAt),
      previewMinusNativeObservedMs:Math.round(trial.previewAt-trial.nativeAt),
      positivePreviewDelayMs:Math.max(0,Math.round(trial.previewAt-trial.nativeAt)),trustedPointerEvents:trial.trustedEvents,
      mountedPreviews:document.querySelectorAll('.mobile-reader-previews .resource-detail-thumbnail').length};
    observations.push(result);
    assert(result.positivePreviewDelayMs<300,'Selected preview still lags native page by seconds: '+JSON.stringify(result));
    assert(result.mountedPreviews<=9,'Filmstrip mounted excessive work: '+result.mountedPreviews);
    await pause(100);trial=null;
  }
}finally{
  monitor=false;cancelAnimationFrame(animation);window.__omiNativeProbe=false;
  for(const type of ['pointerdown','pointermove','pointerup'])document.removeEventListener(type,track,true);
  await probe;
}
const nativeStats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native overlay probe');return window.__omiNativeStats;};
const back=async()=>{window.__omiKey=4;await wait(()=>!window.__omiKey,'system back');await pause(160);};
const finalPage=shown()?.dataset.readerPageIndex;
// The first outside tap closes only the preview; it must not activate the
// settings button underneath or leave the native thumbnail floating above it.
await tap(button('阅读设置'));
await wait(()=>!document.querySelector('.mobile-reader-previews'),'outside tap dismisses preview');
await wait(async()=>(await nativeStats()).previewSlots===0,'native preview cleared');
assert(!document.querySelector('.mobile-sheet'),'Outside dismissal clicked through to settings');
assert(shown()?.dataset.readerPageIndex===finalPage,'Outside dismissal changed page');
assert(document.querySelector('.reader-layout.is-mobile-chrome-visible'),'Outside dismissal hid reader controls');
await tap(button('阅读设置'));await wait(()=>document.querySelector('.mobile-sheet'),'settings opens on next tap');
assert((await nativeStats()).previewSlots===0,'Native preview overlaps settings');
await back();await wait(()=>!document.querySelector('.mobile-sheet'),'settings closes first');
assert(shown()?.dataset.readerPageIndex===finalPage,'Back from settings left the reader');
await back();await wait(()=>!document.querySelector('.page-panel.is-visible .reader-stage'),'back to library');
assert(!(await nativeStats()).active,'Native reader remained active after leaving');
return {fixture:'Native112/Many.cbz',totalPages:book.total,realAndroidPointerInput:true,
  nativeConfirmation:'Current native Raster URL equals the visible target page URL',
  timingNote:'Times start when the final target is first reached. Native confirmation is polled by instrumentation (roughly 100 ms granularity); negative differences mean preview completed before that confirmation, not a measured negative rendering latency.',
  observations,maxPositivePreviewDelayMs:Math.max(...observations.map(item=>item.positivePreviewDelayMs)),native:lastNative,
  outsideDismissWithoutClickThrough:true,nativePreviewCleared:true,layeredBack:true};
