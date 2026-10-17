const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(16);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Missing fixture root');
const base=root.path+'/Native112';
await value(api.updateSettings({mobileReaderPreviews:true,mobilePreviewWidth:88,readerPreloadPages:2,readerImageLoadConcurrency:2,readerMemoryCacheSizeMb:100,readerPageMode:'single',readerDefaultPanorama:false}));
for(const [title,totalPages,sourceType] of [['Many.cbz',2500,'archive'],['Large',1,'folder']]){
  const sourcePath=base+'/'+title;
  await value(api.saveReadingProgress({resourceKey:sourceType+':'+sourcePath,sourcePath,sourceType,title,currentPageIndex:0,totalPages,
    readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
}
document.querySelector('.mobile-home-nav button:nth-child(2)').click();
await wait(()=>document.querySelector('.omi-home__book-title')?.textContent==='Large','home refresh');await pause(350);
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing tap');const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'touch');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const shown=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
const opens=[];
for(const title of ['Large','Many.cbz']){
  for(let i=0;i<6&&!document.querySelector('.omi-home');i++){window.__omiKey=4;await wait(()=>!window.__omiKey,'back');await pause(400);}
  await wait(()=>document.querySelector('.omi-home'),'home');await pause(350);
  const card=[...document.querySelectorAll('.omi-home__book')].find(e=>e.querySelector('.omi-home__book-title')?.textContent===title);assert(card,'No home '+title);
  let started=0;const mark=e=>{if(card.contains(e.target))started=performance.now();};document.addEventListener('pointerup',mark,true);
  await tap(card);await wait(shown,'opened '+title);const domMs=Math.round(performance.now()-started);
  let state=await stats();await wait(async()=>{state=await stats();return state.rasters.some(r=>r.url===shown()?.dataset.nativeImage);},'native open');
  const opened={title,inputToDomMs:domMs,inputToNativeObservedMs:Math.round(performance.now()-started),native:state};
  if(title==='Large'){await wait(async()=>{state=await stats();return state.rasters[0]?.sample<=8;},'full large raster');opened.inputToFullObservedMs=Math.round(performance.now()-started);opened.native=state;await pause(1000);}
  opens.push(opened);document.removeEventListener('pointerup',mark,true);await pause(500);
}
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible'))await tap(document.querySelector('.reader-stage'));
const results=[];
for(const ratio of [.23,.81,.45,.92]){
  const rail=document.querySelector('[aria-label="阅读进度"]');assert(visible(rail),'rail');const r=rail.getBoundingClientRect();
  let started=0,target=0,readyIndex=-1,readyAt=0,frame=0,monitor=true;const mark=e=>{if(e.target.closest?.('.reader-progress-rail')){started=performance.now();}};
  const watch=()=>{if(!monitor)return;if(started){const index=Number(rail.getAttribute('aria-valuenow'))-1;if(index!==readyIndex){readyIndex=index;readyAt=0;}const nodes=[-2,-1,1,2].map(delta=>document.querySelector(`.mobile-filmstrip-page [aria-label^="第 ${index+delta+1} 页："]`));if(!readyAt&&nodes.every(node=>{const img=node?.querySelector('img');return node?.querySelector('[data-native-preview]')||img?.complete&&img.naturalWidth>0;}))readyAt=performance.now();}frame=requestAnimationFrame(watch);};watch();
  document.addEventListener('pointerup',mark,true);
  window.__omiDrag={from:{x:r.left+r.width*(Number(rail.getAttribute('aria-valuenow'))-1)/2499,y:r.top+r.height/2},to:{x:r.left+r.width*ratio,y:r.top+r.height/2},viewport:innerWidth,holdMs:40};
  await wait(()=>!window.__omiDrag,'drag');document.removeEventListener('pointerup',mark,true);
  target=Number(rail.getAttribute('aria-valuenow'))-1;
  assert(started>0,'Missing trusted pointer-up');
  const neighbors=()=>[-2,-1,1,2].map(delta=>document.querySelector(`.mobile-filmstrip-page [aria-label^="第 ${target+delta+1} 页："]`));
  let state;await wait(async()=>{
    state=await stats();return neighbors().every(node=>{if(!node)return false;const image=node.querySelector('img'),native=node.querySelector('[data-native-preview]');return image?.complete&&image.naturalWidth>0||native&&state.previewRasterUrls.includes(native.dataset.nativePreview);});
  },'all four neighbours');
  monitor=false;cancelAnimationFrame(frame);assert(readyAt>0&&readyIndex===target,'Missing ready frame');
  results.push({target:target+1,imagesReadyMs:Math.round(readyAt-started),neighborsObservedMs:Math.round(performance.now()-started),nativeNeighborCount:neighbors().filter(node=>node.querySelector('[data-native-preview]')).length,mounted:document.querySelectorAll('.mobile-filmstrip-page').length});
}
const finalNative=await stats(),expectedPreviews=[...finalNative.previewRasterUrls];
const checkEviction=(await api.getAppInfo()).version!=='1.1.14';
if(checkEviction){
  window.__omiEvictNeighborRasters=true;await wait(()=>!window.__omiEvictNeighborRasters,'evict neighbours');
  await wait(async()=>{const state=await stats();return expectedPreviews.every(url=>state.previewRasterUrls.includes(url));},'small preview fallback after full raster eviction');
}
return {opens,seeks:results,native:finalNative,previewSurvivesRasterEviction:checkEviction,note:'Native display is polled at about 100 ms granularity. Opening starts at real pointer-up; seek timing starts at final pointer-up. Same generated 2500-page CBZ and 8000x10000 PNG.'};
