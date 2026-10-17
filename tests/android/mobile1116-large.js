const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(25);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Native112',name=window.__omiFixture||'LargeOver1GiB.cbz',path=base+'/'+name;
const listing=await value(api.listDirectory(base)),entry=listing.items.find(e=>e.name===name);assert(entry?.size>1073741824,'Fixture must exceed 1 GiB');
await value(api.updateSettings({mobileReaderPreviews:true,mobilePreviewWidth:88,readerPreloadPages:2,readerImageLoadConcurrency:2,readerMemoryCacheSizeMb:100,androidReaderDiskCacheSizeMb:512,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
const view={fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false};
// No pre-opening getResourcePages or image decode: measure a real card open.
await value(api.saveReadingProgress({resourceKey:'archive:'+path,sourcePath:path,sourceType:'archive',title:name,currentPageIndex:0,totalPages:200,readerViewState:view}));
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing target');e.scrollIntoView({block:'center'});await pause(300);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const body=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
const ready=async()=>{const state=await stats();return state.rasters.some(r=>r.url===body()?.dataset.nativeImage&&r.width===3200&&r.height===4500);};
await tap(button('打开资源库'));const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);await wait(card,'card');
let started;const mark=e=>{if(card()?.contains(e.target))started=performance.now();};document.addEventListener('pointerup',mark,true);await tap(card());await wait(ready,'first full frame');document.removeEventListener('pointerup',mark,true);
const openingMs=Math.round(performance.now()-started),first=await stats();assert(started&&first.visiblePages===1,'Real opening');
await wait(()=>!document.documentElement.dataset.mobileNavigation,'opening transition');await pause(350);
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible'))await tap(document.querySelector('.reader-stage'));
const observations=[];
for(const ratio of [1,.5,0,.95,.05,.85,.15,.75]){
  const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect();
  let target=-1;const landed=e=>{if(e.target.closest?.('.reader-progress-rail')){const box=rail.getBoundingClientRect();target=Math.round(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*199);}};document.addEventListener('pointerup',landed,true);
  window.__omiDrag={from:{x:r.left+Math.max(1,Math.min(r.width-1,r.width*(Number(rail.getAttribute('aria-valuenow'))-1)/199)),y:r.top+r.height/2},to:{x:r.left+Math.max(.1,Math.min(r.width-.1,r.width*ratio)),y:r.top+r.height/2},viewport:innerWidth,holdMs:10,stepMs:6};await wait(()=>!window.__omiDrag,'seek');document.removeEventListener('pointerup',landed,true);
  const end=performance.now();assert(target>=0,'Missing trusted pointer-up');await wait(()=>Number(body()?.closest('[data-reader-page-index]')?.dataset.readerPageIndex)===target&&Number(rail.getAttribute('aria-valuenow'))===target+1,'final target '+target);await wait(ready,'seek pixels');let state;
  await wait(async()=>{state=await stats();const strip=document.querySelector('.mobile-reader-filmstrip'),bounds=strip.getBoundingClientRect();const nodes=[...strip.querySelectorAll('.mobile-filmstrip-page')].filter(n=>{const box=n.getBoundingClientRect();return box.right>bounds.left+10&&box.left<bounds.right-10;});return nodes.length>=2&&nodes.every(n=>{const native=n.querySelector('[data-native-preview]'),img=n.querySelector('img');return native&&state.previewRasterUrls.includes(native.dataset.nativePreview)||img?.complete&&img.naturalWidth>0;});},'seek previews');
  observations.push({page:Number(rail.getAttribute('aria-valuenow')),settledMs:Math.round(performance.now()-end),bitmapBytes:state.bitmapBytes,previewBytes:state.previewBytes,previewRestores:state.previewRestores});
  assert(state.previewBytes<=4*1024*1024&&state.bitmapBytes<=state.budget,'Cache grew beyond budget');
}
assert(observations.some(o=>o.page===200),'Last page was not read: '+JSON.stringify(observations));
const book=await value(api.getResourcePages({path}));assert(book.total===200,'Page count');
await pause(500);const idleStart=await stats();await pause(1500);const idleEnd=await stats();assert(idleStart.bitmapDecodes===idleEnd.bitmapDecodes,'Preview decoder retries while idle');
return {name,bytes:entry.size,pages:book.total,openingMs,first,seeks:observations,cache:await value(api.getAndroidCacheInfo()),idleDecodes:idleEnd.bitmapDecodes-idleStart.bitmapDecodes,native:idleEnd};
