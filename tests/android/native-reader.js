const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+20000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(50);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root missing');
const base=root.path+'/Native112',book=await value(api.getResourcePages({path:base+'/Pages',type:'folder'}));
await value(api.updateSettings({mobileReaderAutoHide:false,colorTheme:'mist',mobileLibraryLayout:'grid',mobileGridColumns:2,readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerVolumeKeys:true,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',doublePageFirstSingle:false,doublePageDirection:'left-to-right',mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'folder',title:'Pages',currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false,autoRead:{intervalSeconds:3,scrollPixelsPerSecond:80}}}));
for(const name of ['Large','Exif']){const b=await value(api.getResourcePages({path:base+'/'+name}));await value(api.saveReadingProgress({resourceKey:b.resourceKey,sourcePath:b.sourcePath,sourceType:b.sourceType,title:name,currentPageIndex:0,totalPages:b.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));}
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tapAt=async p=>{window.__omiTap={...p,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const tap=async el=>{assert(el,'Missing target');el.scrollIntoView({block:'nearest'});await pause(260);const r=el.getBoundingClientRect();await tapAt({x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2)});};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'key');await pause(150);};
const shot=async name=>{window.__omiShot=name;await wait(()=>!window.__omiShot,'screenshot');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
await tap(button('打开资源库'));await wait(()=>card('Pages'),'library');
const started=performance.now();await tap(card('Pages'));await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'native reader');
await wait(()=>document.documentElement.dataset.nativeReader==='on','transparent UI');await pause(300);
const openMs=Math.round(performance.now()-started),first=await stats();assert(first.active&&first.drawnFrames>0&&first.visiblePages===1,'Native pixels not drawn: '+JSON.stringify(first));
assert(!document.querySelector('.reader-page-spread img'),'WebView still decodes raster pages');await shot('android1112-native-single');
const shown=()=>document.querySelector('.reader-page-frame:not([aria-hidden="true"])');
const turnMs=[];
for(let n=0;n<8;n++){
  const before=shown()?.dataset.readerPageIndex,start=performance.now();await key(n%2?21:22);await wait(()=>shown()?.dataset.readerPageIndex!==before,'page swap');turnMs.push(Math.round(performance.now()-start));
}
const warm=await stats();assert(warm.visiblePages===1&&warm.bitmapHits>=first.bitmapHits,'Native cache not retained');assert(warm.emptyFrames===first.emptyFrames,'Native turn produced an empty frame');
window.__omiPreviewPage=book.pages[0];await wait(()=>!window.__omiPreviewPage,'reader preview bypasses blocked decoder');const preview=window.__omiPreviewResult;assert(preview.bypassedBlockedDecoder&&preview.bitmapReuseHits>0,'Preview reader reuse missing');
const upper=shown().querySelector('[data-native-image]').getBoundingClientRect();window.__omiPixelRegion={left:upper.left+5,top:upper.top+5,width:upper.width-10,height:Math.min(upper.height/2,300),viewport:innerWidth};await wait(()=>!window.__omiPixelRegion,'stable upper image');const pixels=window.__omiPixelResult;assert(pixels.changedSamples===0,'Idle upper image pixels changed: '+JSON.stringify(pixels));
window.__omiNativePendingUrl=(await value(api.getPageImage(book.pages[11]))).url;await wait(()=>window.__omiNativePendingPassed,'pending decode wakes retained frame');
await tap(document.querySelector('.reader-stage'));await tap(button('开始自动阅读'));const autoStart=shown()?.dataset.readerPageIndex;await wait(()=>shown()?.dataset.readerPageIndex!==autoStart,'native automatic page');
assert((await stats()).visiblePages===1,'Automatic page did not draw');await tap(button('暂停自动阅读'));
await tap(button('阅读设置'));await wait(()=>document.querySelector('.mobile-sheet'),'reader settings');
assert(document.querySelector('.mobile-sheet').scrollWidth<=innerWidth,'Settings overflow');
await tap(button('当前单页，点击切换双页'));await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'settings close');await pause(250);
const double=await stats();assert(double.visiblePages===2,'Native double page not drawn: '+JSON.stringify(double));await shot('android1112-native-double');
await tap(button('阅读设置'));await tap(button('当前从左到右阅读，点击切换为从右到左'));await key(4);
const rail=document.querySelector('[aria-label="阅读进度"]').getBoundingClientRect(),currentNumber=document.querySelector('.mobile-reader-current').getBoundingClientRect(),totalNumber=document.querySelector('.mobile-reader-total').getBoundingClientRect();assert(totalNumber.x<rail.x&&currentNumber.x>rail.right,'Native RTL controls reversed');
const pair=[...document.querySelectorAll('.reader-page-frame:not([aria-hidden="true"])')].filter(el=>el.querySelector('[data-native-image]')).map(el=>({index:Number(el.dataset.readerPageIndex),x:el.getBoundingClientRect().x})).sort((a,b)=>a.index-b.index);assert(pair.length===2&&pair[0].x>pair[1].x,'Native double-page RTL order');
await tap(button('阅读设置'));await tap(button('开启全景连环画'));await key(4);await wait(()=>document.querySelector('.reader-stage.is-panorama'),'panorama');await pause(600);
const pano=await stats();assert(pano.visiblePages>=1,'Native panorama empty');await shot('android1112-native-panorama');
await tap(button('开始自动阅读'));const panoFrame=document.querySelector('[data-native-image]'),panoStart=panoFrame.getBoundingClientRect();await pause(800);const panoEnd=panoFrame.getBoundingClientRect();assert(Math.abs(panoStart.x-panoEnd.x)+Math.abs(panoStart.y-panoEnd.y)>20,'Native panorama autoplay did not move');await tap(button('暂停自动阅读'));
await key(25);await pause(250);assert((await stats()).visiblePages>=1,'Volume turn blanked panorama');
await key(4);await wait(()=>card('Pages'),'reader back');assert(!document.documentElement.dataset.nativeReader,'Native layer leaked into library');await shot('android1112-library-return');
for(let i=0;i<3;i++){await tap(card('Pages'));await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'reopen');await key(4);await wait(()=>card('Pages'),'rapid return');}
await tap(card('Large'));await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'large reader');await pause(300);
const large=await stats();assert(large.rasters[0].width===8000&&large.rasters[0].height===10000&&large.rasters[0].sample>=4,'Large page was not sampled');
const stage=document.querySelector('.reader-stage').getBoundingClientRect();window.__omiPinch={x:stage.x+stage.width/2,y:stage.y+stage.height/2,from:30,to:140,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');
await wait(()=>Number(document.querySelector('.reader-page-spread').style.scale)>1,'zoom');
await wait(async()=>{const s=await stats();return s.tileDecodes>large.tileDecodes;},'high resolution tiles');await shot('android1112-native-zoom');const zoom=await stats();
document.querySelector('.reader-stage').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait(()=>Number(document.querySelector('.reader-page-spread').style.scale)===1,'double tap reset');
await key(4);await wait(()=>card('Exif'),'library after zoom');await tap(card('Exif'));await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'exif reader');await pause(300);
const exif=[],colors=[0xe02030,0x20b060,0xe0b020,0x2060d0,0xe02030,0x2060d0,0xe0b020,0x20b060];
for(let i=0;i<8;i++){
  await wait(()=>Number(shown()?.dataset.readerPageIndex)===i,'exif page');await pause(80);const state=await stats(),r=state.rasters[0];assert(r.orientation===i+1,'EXIF orientation lost');
  assert(r.width===(i<4?1200:1800)&&r.height===(i<4?1800:1200),'EXIF dimensions wrong');
  for(const shift of [0,8,16])assert(Math.abs(((r.color>>>shift)&255)-((colors[i]>>>shift)&255))<8,'EXIF quadrant wrong: '+JSON.stringify(r));exif.push({orientation:r.orientation,width:r.width,height:r.height});
  if(i<7)await key(22);
}
await shot('android1112-native-exif');
await tap(document.querySelector('.reader-stage'));await tap(button('阅读设置'));await tap(button('画面调整'));const invert=[...document.querySelectorAll('.reader-tool-switch')].find(e=>e.textContent.trim()==='反色');await tap(invert);
await wait(async()=>{const s=await stats();return s.rasters[0]?.adjustedColor!=null;},'native adjustments');const adjusted=await stats(),r=adjusted.rasters[0];
for(const shift of [0,8,16])assert(Math.abs(((r.adjustedColor>>>shift)&255)-(255-((r.color>>>shift)&255)))<2,'Native inversion differs');await tap(invert);await key(4);
assert(!document.querySelector('.reader-tool-panel')&&document.querySelector('.mobile-sheet'),'Back did not close only adjustments');await key(4);
assert(!document.querySelector('.mobile-sheet')&&document.querySelector('.reader-stage'),'Back did not close only reader settings');await key(4);await wait(()=>card('Pages'),'final back');
return {openMs,turnMs,first,warm,double,panorama:pano,large,zoom,exif,preview,pixels,nativeAdjustments:true,nativeCanvas:true,webRasterDecode:false,layeredBack:true,rapidReopen:true,pendingDecodeWakesFrame:true,automaticPaging:true,panoramaAutoplay:true,rtlDoublePage:true};
