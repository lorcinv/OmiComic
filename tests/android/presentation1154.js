const assert=(condition,message)=>{if(!condition)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const inputTrace=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,event=>{inputTrace.push({event:name,time:event.timeStamp,id:event.pointerId,x:event.clientX,y:event.clientY,primary:event.isPrimary,target:event.target.className});if(inputTrace.length>24)inputTrace.shift();},true);
const wait=async(fn,label)=>{const deadline=Date.now()+25000;while(!await fn()){if(Date.now()>deadline)throw Error('Timeout: '+label+' '+JSON.stringify({trace:inputTrace,zoom:document.querySelector('.reader-stage')?.dataset.readerZoom,classes:document.querySelector('.reader-layout')?.className,offset:document.querySelector('.reader-page-spread')?.style.translate,resetReports:window.__omiMotionReport?.resets.map(({panorama,from,webIntermediate,nativeIntermediate})=>({panorama,from,webIntermediate,nativeIntermediate}))}));await pause(60);}};
const api=window.omicomic,value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const button=label=>[...document.querySelectorAll('button')].find(e=>e.getBoundingClientRect().width&&getComputedStyle(e).visibility!=='hidden'&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);
const point=async(x,y,repeat=1)=>{window.__omiTap={x,y,repeat,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const tap=async element=>{assert(element,'Missing tap target');element.scrollIntoView({block:'nearest'});await pause(350);const r=element.getBoundingClientRect();await point(r.x+r.width/2,r.y+(element.classList.contains('reader-stage')?r.height/2:Math.min(40,r.height/2)));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'back');await wait(()=>!document.querySelector('.mobile-sheet-overlay'),'settings closed');await pause(300);};
const touch=async(action,x,y)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'touch '+action);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};
const settings=async()=>{if(!button('阅读设置'))await tap(document.querySelector('.reader-stage'));await wait(()=>button('阅读设置'),'toolbar');await tap(button('阅读设置'));await wait(()=>document.querySelector('.mobile-sheet-overlay'),'settings open');await pause(450);};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const progress=()=>document.querySelector('[aria-label="阅读进度"]').getAttribute('aria-valuenow');
const offset=()=>parseFloat(document.querySelector('.reader-page-spread').style.translate)||0;
const begin=async()=>{window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'begin native frame record');};
const end=async()=>{await pause(650);window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'end native frame record');window.__omiZoomRecording=false;return window.__omiReaderMotionFrames;};
const checkFrames=(frames,label)=>{assert(frames.length>=6,label+' missing native frames');assert(frames.every(frame=>frame.pixels),label+' lost native pixels: '+JSON.stringify(frames));assert(frames[frames.length-1].emptyFrames===frames[0].emptyFrames,label+' drew an empty frame');};
const recordZoom=async()=>{const frames=[];window.__omiZoomFrames=frames;window.__omiZoomRecording=true;const started=performance.now();const frame=()=>{if(!window.__omiZoomRecording)return;frames.push({time:performance.now()-started,zoom:Number(document.querySelector('.reader-stage').dataset.readerZoom)});requestAnimationFrame(frame);};requestAnimationFrame(frame);};

const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Halftone root missing');
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:4,mobileReaderAutoHide:false,mobileReaderPreviews:false,mobilePanoramaTapPaging:false,readerPageMode:'single',doublePageFirstSingle:false,doublePageDirection:'left-to-right'}));
const book=await value(api.getResourcePages({path:root.path+'/Tone',type:'folder'}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:'Tone',currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
await wait(()=>card('Tone'),'Tone card');await tap(card('Tone'));await wait(()=>document.documentElement.dataset.nativeReader==='on','native reader');
await wait(async()=>(await stats()).visiblePages>0,'decoded native pixels');await pause(350);
const resets=[],swipes=[],zoomedSwipes=[];
window.__omiMotionReport={resets,swipes,zoomedSwipes};
const reset=async(panorama,from,to)=>{
  const r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  window.__omiPinch={x,y,from,to,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');await pause(600);
  const initial=Number(document.querySelector('.reader-stage').dataset.readerZoom),page=progress();assert(Math.abs(initial-1)>.2,'Pinch scale did not change');
  await begin();await recordZoom();await point(x,y,2);const frames=await end(),zooms=window.__omiZoomFrames;
  checkFrames(frames,'restore');assert(zooms.filter(frame=>Math.abs(frame.zoom-1)>.001&&Math.abs(frame.zoom-initial)>.001).length>=3,'Restore skipped intermediate web zooms: '+JSON.stringify({initial,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,zooms,native:frames.map(frame=>({zoom:frame.zoom,time:frame.time,drawn:frame.drawnFrames}))}));
  assert(new Set(frames.filter(frame=>Math.abs(frame.zoom-1)>.001&&Math.abs(frame.zoom-initial)>.001).map(frame=>frame.zoom)).size>=3,'Native layer skipped intermediate restore positions: '+JSON.stringify({initial,web:zooms.map(frame=>[Math.round(frame.time),frame.zoom]),native:frames.map(frame=>({time:frame.time,zoom:frame.zoom,drawn:frame.drawnFrames,width:frame.slots[0]?.width}))}));
  await wait(()=>document.querySelector('.reader-stage').dataset.readerZoom==='1','restore complete');assert(progress()===page,'Restore turned page');
  if(frames[0].tileQualityPages>0){assert(frames.some(frame=>frame.restoring&&frame.heldQualityPages>0),'Restore dropped its complete quality level');assert(frames.at(-1).restoreFadeFrames>frames[0].restoreFadeFrames,'Restore did not fade its retained level');}
  resets.push({panorama,from:initial,webIntermediate:zooms.filter(frame=>Math.abs(frame.zoom-1)>.001&&Math.abs(frame.zoom-initial)>.001).length,nativeIntermediate:frames.filter(frame=>Math.abs(frame.zoom-1)>.001&&Math.abs(frame.zoom-initial)>.001).length,frames});
};
await reset(false,35,80);await reset(false,80,25);

for(const mode of ['single','double','double-rtl']){
  if(mode!=='single'){
    await settings();
    await tap(button(mode==='double'?'当前单页，点击切换双页':'当前从左到右阅读，点击切换为从右到左'));
    await key(4);await pause(350);
  }
  const r=document.querySelector('.reader-stage').getBoundingClientRect(),sign=mode==='double-rtl'?1:-1,x=r.x+r.width*(sign>0?.2:.8),y=r.y+r.height/2,page=progress();
  await touch('down',x,y);await touch('move',x+sign*25,y);await wait(()=>document.querySelector('.reader-swipe-preview'),'incoming group');await pause(300);
  await touch('move',x+sign*65,y);const a=offset();await touch('move',x+sign*130,y);const b=offset();assert(Math.abs((b-a)*sign-65)<2,'Drag did not follow the finger: '+JSON.stringify({mode,a,b,zoom:document.querySelector('.reader-stage').dataset.readerZoom,trace:inputTrace}));
  const during=await stats();assert(during.visiblePages>=(mode==='single'?2:3),'Native incoming group missing');assert(progress()===page,'Drag committed early');
  await begin();await touch('up',x+sign*130,y);const frames=await end();checkFrames(frames,mode+' settle');
  await wait(()=>progress()!==page&&!document.querySelector('.reader-swipe-preview'),'single group handoff');
  const incoming=frames.flatMap(frame=>frame.slots),changes=new Set(incoming.map(slot=>Math.round(slot.left*10))).size;
  assert(changes>=5,'Native settle only sent endpoints');
  swipes.push({mode,from:page,to:progress(),fingerDelta:b-a,visibleDuring:during.visiblePages,nativePositions:changes,frames});
  // Return to the first spread before the next mode, so every mode has a neighbour.
  const opposite=-sign;
  await touch('down',r.x+r.width*(opposite>0?.2:.8),y);await touch('move',r.x+r.width*(opposite>0?.2:.8)+opposite*25,y);await pause(300);await touch('move',r.x+r.width*(opposite>0?.2:.8)+opposite*140,y);await touch('up',r.x+r.width*(opposite>0?.2:.8)+opposite*140,y);await wait(()=>progress()===page&&!document.querySelector('.reader-swipe-preview'),'return one spread');
  window.__omiPinch={x:r.x+r.width/2,y,from:35,to:90,viewport:innerWidth};await wait(()=>!window.__omiPinch,'enlarge pager');await pause(350);
  const zoom=Number(document.querySelector('.reader-stage').dataset.readerZoom);assert(zoom>2,'Pager did not enlarge');
  await begin();let attempts=0;
  while(progress()===page&&attempts++<4){await touch('down',x,y);for(let n=1;n<=9;n++)await touch('move',x+sign*n*r.width*.065,y);await touch('up',x+sign*9*r.width*.065,y);await pause(650);}
  await wait(()=>progress()!==page&&!document.querySelector('.reader-swipe-preview'),'enlarged '+mode+' handoff');
  const enlargedFrames=await end();checkFrames(enlargedFrames,'enlarged '+mode);assert(Math.abs(Number(document.querySelector('.reader-stage').dataset.readerZoom)-zoom)<.001,'Paging reset the enlarged scale');
  zoomedSwipes.push({mode,from:page,to:progress(),zoom,attempts,frames:enlargedFrames});
  await point(r.x+r.width/2,y,2);await wait(()=>document.querySelector('.reader-stage').dataset.readerZoom==='1','pager restore');await pause(250);
  await touch('down',r.x+r.width*(opposite>0?.2:.8),y);await touch('move',r.x+r.width*(opposite>0?.2:.8)+opposite*25,y);await pause(300);await touch('move',r.x+r.width*(opposite>0?.2:.8)+opposite*140,y);await touch('up',r.x+r.width*(opposite>0?.2:.8)+opposite*140,y);await wait(()=>progress()===page&&!document.querySelector('.reader-swipe-preview'),'return enlarged spread');
}

await settings();await tap(button('当前双页，点击切换单页'));await tap(button('当前从右到左阅读，点击切换为从左到右'));await key(4);await pause(350);
const r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width*.2,y=r.y+r.height/2,page=progress();
await touch('down',x,y);await touch('move',x+80,y);const a=offset();await touch('move',x+180,y);const b=offset();assert(a>0&&b>a&&b-a<30,'First-page resistance is not bounded: '+JSON.stringify({a,b,page,trace:inputTrace}));
await begin();await touch('up',x+180,y);const edgeFrames=await end();checkFrames(edgeFrames,'edge return');assert(offset()===0&&progress()===page,'Edge drag turned page');

const left=r.x+r.width*.8;
await touch('down',left,y);await touch('move',left-25,y);await pause(300);await touch('move',left-70,y);await pause(180);
await begin();await touch('up',left-70,y);const cancelFrames=await end();checkFrames(cancelFrames,'short drag return');assert(progress()===page&&offset()===0,'Short drag unexpectedly committed');

await settings();await tap(button('开启全景连环画'));await key(4);await pause(500);
await reset(true,35,80);await reset(true,80,25);
const before=await stats();await touch('down',r.x+r.width*.5,y);for(let n=1;n<=8;n++)await touch('move',r.x+r.width*.5-n*5,y);await touch('up',r.x+r.width*.5-40,y);await pause(600);const after=await stats();assert(after.emptyFrames===before.emptyFrames&&after.drawnFrames>before.drawnFrames,'Panorama drag regressed after reset');
await begin();await touch('down',r.x+r.width*.7,y);for(let n=1;n<=25;n++)await touch('move',r.x+r.width*.7-n*3,y);const smoothFrames=await end();await touch('up',r.x+r.width*.7-75,y);checkFrames(smoothFrames,'panorama slow drag');
const url=smoothFrames[0].slots[0].url,poses=smoothFrames.flatMap(frame=>frame.slots.filter(slot=>slot.url===url));
assert(new Set(poses.map(slot=>slot.top+':'+slot.width+':'+slot.height)).size===1,'Panorama cross axis or page size wobbled');
assert(smoothFrames.some(frame=>frame.workingPages>0),'Panorama did not rank native neighbouring pages');
const final=await stats();assert(final.bitmapBytes+final.tileBytes<=final.budget,'Reader exceeded its raster budget');
return {resets,swipes,zoomedSwipes,edge:{a,b,frames:edgeFrames},shortReturn:{frames:cancelFrames},panoramaAfterReset:true,panorama:{frames:smoothFrames,final}};
