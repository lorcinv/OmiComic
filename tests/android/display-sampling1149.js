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
const tap=async e=>{assert(e,'Missing native tap target');e.scrollIntoView({block:'nearest'});await pause(200);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
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
await wait(async()=>{const s=await stats();return s.displayRasterBuilds+(s.tileFilterBuilds||0)>0;},'display-size filtered raster');
await pause(400);const ordinaryPixels=await tone();
await settings();await tap(button('开启全景连环画'));await key(4);
await wait(()=>document.querySelector('.reader-stage.is-panorama'),'panorama');await pause(900);
const horizontalPixels=await tone(),movement=[];
for(const flow of ['horizontal','vertical']){
  if(flow==='vertical'){await settings();await tap(button('当前横向阅读，点击切换纵向阅读'));await key(4);await pause(900);}
  const before=await stats(),r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width*.5,y=r.y+r.height*.5;
  await touch('down',x,y);
  for(let n=0;n<24;n++)await touch('move',x-(flow==='horizontal'?Math.sin(n/4)*6:0),y-(flow==='vertical'?Math.sin(n/4)*6:0));
  await touch('up',x,y);await pause(300);const after=await stats();
  assert(after.emptyFrames===before.emptyFrames,'Movement produced blank native frames');
  assert(after.displayRasterBuilds===before.displayRasterBuilds&&after.tileFilterBuilds===before.tileFilterBuilds,'The same moving image was refiltered every frame');
  movement.push({flow,drawnFrames:after.drawnFrames-before.drawnFrames,newFilters:after.displayRasterBuilds-before.displayRasterBuilds,displayBytes:after.displayRasterBytes});
}
await key(4);await wait(()=>card('Large'),'return to fixture library');await tap(card('Large'));
await wait(()=>document.documentElement.dataset.nativeReader==='on','large native image');await pause(500);
const large=await stats();assert(large.rasters.some(r=>r.width===8000&&r.height===10000&&r.sample>=4),'80 MP source lost bounded decoding');
await settings();await tap(button('开启全景连环画'));await key(4);await pause(600);
const largePanorama=await stats();assert(largePanorama.visiblePages>0&&largePanorama.emptyFrames===large.emptyFrames,'80 MP panorama became blank');
await key(4);
window.__omiCatalogProviderTest=true;await wait(()=>!window.__omiCatalogProviderTest,'supported-only native directory and catalog');
const fileFiltering=window.__omiCatalogProviderResult;assert(fileFiltering?.unsupportedFilesHidden,'Unsupported files entered native library');
return {pixelChecks,ordinaryPixels,horizontalPixels,movement,fileFiltering,large:{width:8000,height:10000,sample:large.rasters[0].sample,ordinaryVisible:large.visiblePages,panoramaVisible:largePanorama.visiblePages}};
