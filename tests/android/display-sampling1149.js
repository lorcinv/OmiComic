const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
window.__omiDisplaySamplingCheck=true;
for(let n=0;n<600 && window.__omiDisplaySamplingCheck;n++)await pause(50);
assert(!window.__omiDisplaySamplingCheck,'Native display sampling probe timed out');
assert(window.__omiDisplaySamplingResult,'Native display sampling results missing');
const pixelChecks=window.__omiDisplaySamplingResult;
const wait=async(fn,label)=>{const until=Date.now()+30000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(60);}};
const api=window.omicomic,value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Halftone test root missing');
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);
const tap=async e=>{assert(e,'Missing native tap target');e.scrollIntoView({block:'nearest'});await pause(200);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+(e.classList.contains('reader-stage')?r.height/2:Math.min(40,r.height/2)),viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'native key');};
const settings=async()=>{if(!button('阅读设置'))await tap(document.querySelector('.reader-stage'));await wait(()=>button('阅读设置'),'reader toolbar');await tap(button('阅读设置'));};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const touch=async(action,x,y)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'native touch '+action);};
const tone=async()=>{const r=document.querySelector('.is-current-page [data-native-image],.reader-page-frame:not([aria-hidden="true"]) [data-native-image]').getBoundingClientRect();window.__omiToneRegion={left:r.left+r.width*.15,top:r.top+r.height*.1,width:r.width*.3,height:r.height*.2,viewport:innerWidth};await wait(()=>!window.__omiToneRegion,'screen tone pixels');assert(window.__omiTonePixels.deviation<6,'Visible tone still aliases: '+JSON.stringify(window.__omiTonePixels));return window.__omiTonePixels;};
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:2,readerImageLoadConcurrency:2,mobileReaderAutoHide:false,mobileReaderPreviews:false,readerPageMode:'single',doublePageFirstSingle:false,mobileImageAdjustments:{enabled:false,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
for(const name of ['Tone','Large']){
  const book=await value(api.getResourcePages({path:root.path+'/'+name,type:'folder'}));
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:name,currentPageIndex:name==='Tone'?1:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
}
await wait(()=>card('Tone'),'fixture cards');await tap(card('Tone'));
await wait(()=>document.documentElement.dataset.nativeReader==='on','native layer');
await wait(async()=>{const s=await stats();return s.visiblePages>0;},'decoded native pixels');
const initialNative=await stats();assert(initialNative.rasters.every(r=>!r.preview),'Reader revealed a provisional preview before clear pixels');
await pause(400);const ordinaryPixels=await tone();
await settings();await tap(button('开启全景连环画'));await key(4);
await wait(()=>document.querySelector('.reader-stage.is-panorama'),'panorama');await pause(900);
window.__omiNativeMovingPendingCheck=true;await wait(()=>!window.__omiNativeMovingPendingCheck,'moving pose while a neighbour waits');
const movingPending=window.__omiNativeMovingPendingResult;assert(movingPending?.followsFinger&&movingPending.retainsPixels,'Pending neighbour caused drag resistance');
const horizontalPixels=await tone(),movement=[];
for(const flow of ['horizontal','vertical']){
  if(flow==='vertical'){await settings();await tap(button('当前横向阅读，点击切换纵向阅读'));await key(4);await pause(900);}
  const before=await stats(),r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width*.5,y=r.y+r.height*.5;
  // An edge sliver of the preceding page may legitimately leave the viewport.
  // Track the largest visible page, which this short drag keeps on screen.
  const known=[...document.querySelectorAll('.reader-stage [data-native-image]')].map(node=>{const b=node.getBoundingClientRect();return {url:node.dataset.nativeImage,area:Math.max(0,Math.min(b.right,r.right)-Math.max(b.left,r.left))*Math.max(0,Math.min(b.bottom,r.bottom)-Math.max(b.top,r.top))};}).sort((a,b)=>b.area-a.area)[0]?.url,positions=[];
  assert(known&&before.rasters.some(slot=>slot.url===known),'Visible native drag target missing');
  await touch('down',x,y);
  for(let n=0;n<24;n++){
    await touch('move',x-(flow==='horizontal'?n*2.5:0),y-(flow==='vertical'?n*2.5:0));
    if(n%3===0){const s=await stats(),slot=s.rasters.find(r=>r.url===known);assert(slot,'Moving native page disappeared');positions.push(flow==='horizontal'?slot.left:slot.top);}
  }
  await touch('up',x-(flow==='horizontal'?23*2.5:0),y-(flow==='vertical'?23*2.5:0));await pause(300);const after=await stats();
  assert(positions.every((value,index)=>index===0||value<=positions[index-1]+.5),'Native pixels reversed during the real touch drag: '+JSON.stringify({flow,positions}));
  assert(positions.at(-1)<positions[0]-40,'Native pixels did not follow the finger');
  assert(after.emptyFrames===before.emptyFrames,'Movement produced blank native frames');
  assert(after.displayRasterBuilds===before.displayRasterBuilds&&after.tileFilterBuilds===before.tileFilterBuilds,'The same moving image was refiltered every frame');
  movement.push({flow,drawnFrames:after.drawnFrames-before.drawnFrames,newFilters:after.displayRasterBuilds-before.displayRasterBuilds,newTileFilters:after.tileFilterBuilds-before.tileFilterBuilds,displayBytes:after.displayRasterBytes,positions,monotonic:true});
}
// Explicit magnification still owns high resolution tiles; ordinary fit-size
// scrolling must not accidentally enter this refinement path.
const beforeZoom=await stats(),zoomStage=document.querySelector('.reader-stage'),zoomRect=zoomStage.getBoundingClientRect();
zoomStage.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-400,clientX:zoomRect.x+zoomRect.width/2,clientY:zoomRect.y+zoomRect.height/2}));
await wait(async()=>{const s=await stats();return s.tileDecodes>beforeZoom.tileDecodes;},'magnified high resolution tiles');
const zoomTiles=(await stats()).tileDecodes-beforeZoom.tileDecodes;
await key(4);await wait(()=>card('Large'),'return to fixture library');await tap(card('Large'));
await wait(()=>document.documentElement.dataset.nativeReader==='on','large native image');await pause(500);
const large=await stats();assert(large.rasters.some(r=>r.width===8000&&r.height===10000&&r.sample>=4),'80 MP source lost bounded decoding');
await settings();await tap(button('开启全景连环画'));await key(4);await pause(600);
const largePanorama=await stats();assert(largePanorama.visiblePages>0&&largePanorama.emptyFrames===large.emptyFrames,'80 MP panorama became blank');
await key(4);
window.__omiCatalogProviderTest=true;await wait(()=>!window.__omiCatalogProviderTest,'supported-only native directory and catalog');
const fileFiltering=window.__omiCatalogProviderResult;assert(fileFiltering?.unsupportedFilesHidden,'Unsupported files entered native library');
return {pixelChecks,ordinaryClearOnReveal:true,ordinaryPixels,horizontalPixels,movingPending,movement,zoomTiles,fileFiltering,large:{width:8000,height:10000,sample:large.rasters[0].sample,ordinaryVisible:large.visiblePages,panoramaVisible:largePanorama.visiblePages}};
