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
const loadingOnly=window.__omiFixture.startsWith('loading'),panoramaOnly=window.__omiFixture.startsWith('panorama'),bookName=(loadingOnly||panoramaOnly)&&window.__omiFixture.includes('color')?'Color.cbz':panoramaOnly||loadingOnly?'Many.cbz':window.__omiFixture==='large'?'Large':'Tone';
const book=await value(api.getResourcePages({path:root.path+'/'+bookName,type:panoramaOnly||loadingOnly?'archive':'folder'}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:bookName,currentPageIndex:panoramaOnly?8:loadingOnly?4:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:panoramaOnly,immersive:false}}));
await wait(()=>card(bookName),bookName+' card');await tap(card(bookName));await wait(()=>document.documentElement.dataset.nativeReader==='on','native reader');
await wait(async()=>(await stats()).visiblePages>0,'decoded native pixels');await pause(350);
if(loadingOnly){
  const baseline=window.__omiFixture.endsWith('baseline');
  if(!baseline){window.__omiNativeQueueCheck=true;await wait(()=>!window.__omiNativeQueueCheck,'native asynchronous queue policy');}
  const ready=async(index)=>{
    const body=document.querySelector('.reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
    if(Number(body?.closest('[data-reader-page-index]')?.dataset.readerPageIndex)!==index)return false;
    const state=await stats();return state.rasters.some(r=>r.url===body.dataset.nativeImage&&!r.preview);
  };
  const checks=[];
  for(let phase=0;phase<2;phase++){
    window.__omiEvictNeighborRasters=true;await wait(()=>!window.__omiEvictNeighborRasters,'cold neighbor');
    const from=Number(progress())-1,target=from+8;await begin();
    window.__omiKeyBurst={code:22,count:8,stepMs:25};await wait(()=>!window.__omiKeyBurst,'rapid native keys');
    await wait(()=>ready(target),'latest source pixels');const frames=await end(),body=document.querySelector('.reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
    const finalFrame=frames.find(f=>f.slots.some(s=>s.url===body.dataset.nativeImage));
    assert(finalFrame,'Missing target native paint');const latency=Math.max(0,finalFrame.time-window.__omiKeyBurstResult.lastKeyUptime),blankFrames=frames.filter(f=>!f.pixels).length;
    checks.push({from:from+1,to:target+1,lastKeyToPixelsMs:latency,blankFrames,frames});
    if(!baseline){assert(blankFrames===0,'Fast page burst cleared the native frame');assert(latency<1500,'Latest page waited behind stale work: '+latency);}
  }
  const jumps=[];
  for(const ratio of [.12,.88,.25]){
    if(!document.querySelector('.reader-layout.is-mobile-chrome-visible'))await tap(document.querySelector('.reader-stage'));
    await pause(450);
    const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect(),from=Number(progress())-1;
    let target=-1;const landed=e=>{if(e.target.closest?.('.reader-progress-rail')){const box=rail.getBoundingClientRect();target=Math.round(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*(book.total-1));}};
    document.addEventListener('pointerup',landed,true);await begin();
    window.__omiDrag={from:{x:r.left+r.width*from/(book.total-1),y:r.top+r.height/2},to:{x:r.left+r.width*ratio,y:r.top+r.height/2},viewport:innerWidth,holdMs:8,stepMs:8,async:true};
    await wait(()=>!window.__omiDrag,'native progress jump');await wait(()=>target>=0,'progress pointerup delivered');document.removeEventListener('pointerup',landed,true);
    await wait(()=>ready(target),'jump source pixels');
    const frames=await end(),body=document.querySelector('.reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
    const finalFrame=frames.find(f=>f.slots.some(s=>s.url===body.dataset.nativeImage));
    assert(finalFrame,'Missing jump target native paint');const latency=Math.max(0,finalFrame.time-window.__omiDragResult.lastUpUptime),blankFrames=frames.filter(f=>!f.pixels).length;
    jumps.push({from:from+1,to:target+1,lastUpToPixelsMs:latency,blankFrames,frames});
    if(!baseline){assert(blankFrames===0,'Progress jump cleared the native frame');assert(latency<1500,'Progress jump waited behind stale work: '+latency);}
  }
  const final=await stats();if(!baseline)assert(final.bitmapBytes+final.tileBytes<=final.budget,'Reader exceeded shared bitmap budget');
  return {bookName,loadingOnly:true,baseline,checks,jumps,queuePolicy:window.__omiNativeQueueResult,final};
}
if(panoramaOnly){
  assert(book.total>=24,'Panorama fixture too short');await wait(()=>document.querySelector('.reader-stage.is-panorama'),'panorama');await pause(1000);
  const r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width*.85,y=r.y+r.height/2;
  const from=Number(progress());await begin();
  for(let swipe=0;swipe<6;swipe++){
    await touch('down',x,y);
    for(let step=1;step<=8;step++)await touch('move',x-r.width*.75*step/8,y);
    await pause(150);await touch('up',x-r.width*.75,y);
  }
  const frames=await end();checkFrames(frames,'panorama throughput');
  const gaps=[];
  for(const frame of frames){
    const clip=frame.clip,slots=frame.slots.filter(s=>s.left+s.width>clip[0]+2&&s.left<clip[2]-2).sort((a,b)=>a.left-b.left);
    let edge=clip[0];for(const slot of slots){if(slot.left>edge+2)gaps.push({time:frame.time,from:edge,to:slot.left});edge=Math.max(edge,slot.left+slot.width);}
    if(edge<clip[2]-2)gaps.push({time:frame.time,from:edge,to:clip[2]});
  }
  window.__omiMotionReport={frames,gaps,final:await stats()};
  assert(gaps.length===0,'Native panorama exposed an unloaded edge: '+JSON.stringify(gaps.slice(0,8)));
  assert(frames.every(f=>f.slots.every(s=>s.visibleSample===1||s.pixelDensity<=1.01)),'Panorama enlarged an undersized body instead of using source detail');
  assert(window.__omiMotionReport.final.bitmapBytes+window.__omiMotionReport.final.tileBytes<=window.__omiMotionReport.final.budget,'Panorama exceeded the shared reader budget');
  assert(Number(progress())>=from+3,'Panorama did not advance through enough pages');
  return {bookName,from,to:Number(progress()),frames,gaps,final:await stats()};
}
window.__omiTilePolicyCheck=true;await wait(()=>!window.__omiTilePolicyCheck,'native detail policy');

const checks=[];
for(const panorama of [false,true]){
  if(panorama){await settings();await tap(button('开启全景连环画'));await key(4);await pause(600);}
  const r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  const pinch=async(from,to)=>{window.__omiPinch={x,y,from,to,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');};
  await pinch(35,80);await pause(1500);
  const prepared=await stats();
  if(bookName==='Large')assert(prepared.rasters.some(r=>r.sample>1),'Large fixture did not exercise region decoding');
  await begin();await pinch(55,70);await pause(1200);const zoomFrames=await end();checkFrames(zoomFrames,'quality zoom');
  assert(zoomFrames.every(f=>f.qualityLevels?.every(l=>l.mix===1)),'Unexpected blurry quality blend');
  assert(zoomFrames.every(f=>f.slots.every(s=>s.visibleSample===1||s.pixelDensity<=1.01)),'Zoom displayed an enlarged low-resolution source');
  assert(zoomFrames.every(f=>f.tileBudget>0&&f.tileBytes<=f.tileBudget),'Transition exceeded actual tile budget');
  await begin();await pinch(70,60);await pause(1200);const shrinkFrames=await end();checkFrames(shrinkFrames,'quality shrink');
  await begin();await point(x,y,2);const restoreFrames=await end();checkFrames(restoreFrames,'quality restore');
  assert(document.querySelector('.reader-stage').dataset.readerZoom==='1','Did not restore');
  assert(restoreFrames.every(f=>f.slots.every(s=>s.visibleSample===1||s.pixelDensity<=1.01)),'Restore displayed an enlarged low-resolution source');
  assert(restoreFrames.every(f=>f.qualityLevels?.every(l=>l.mix===1)),'Unexpected restore quality blend');
  await pause(800);const final=await stats();assert(final.tileBytes<=final.tileBudget,'Tile cache exceeded budget');
  const coveredZoomDecodes=zoomFrames.at(-1).tileDecodes-prepared.tileDecodes;
  if(bookName==='Large'){
    // A gesture may cross one source-resolution level. It must not decode a
    // fresh region on every geometry frame at that level.
    assert(coveredZoomDecodes<=1,'Pinch repeatedly decoded source regions: '+coveredZoomDecodes);
    assert(final.detailPlanReuses>prepared.detailPlanReuses,'Pinch did not reuse prepared coverage');
    assert(final.bitmapBytes+final.tileBytes<=final.budget,'Detail exceeded the shared reader budget');
  }
  checks.push({panorama,coveredZoomDecodes,zoomFrames,shrinkFrames,restoreFrames,final});
}
return {bookName,checks,tilePolicy:window.__omiTilePolicyResult,taps:window.__omiTapTransportTrace,inputTrace};
