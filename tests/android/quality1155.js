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

const checks=[];
for(const panorama of [false,true]){
  if(panorama){await settings();await tap(button('开启全景连环画'));await key(4);await pause(600);}
  const r=document.querySelector('.reader-stage').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  const pinch=async(from,to)=>{window.__omiPinch={x,y,from,to,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');};
  await pinch(35,80);await pause(1500);
  await begin();await pinch(55,70);await pause(1200);const zoomFrames=await end();checkFrames(zoomFrames,'quality zoom');
  assert(zoomFrames.some(f=>f.qualityLevels?.some(l=>l.mix>0&&l.mix<1)),'Missing gradual quality blend: '+JSON.stringify(zoomFrames));
  assert(zoomFrames.every(f=>f.tileBytes<=24*1024*1024),'Transition exceeded maximum tile budget');
  await begin();await pinch(70,60);await pause(1200);const shrinkFrames=await end();checkFrames(shrinkFrames,'quality shrink');
  await begin();await point(x,y,2);const restoreFrames=await end();checkFrames(restoreFrames,'quality restore');
  assert(document.querySelector('.reader-stage').dataset.readerZoom==='1','Did not restore');
  assert(restoreFrames.some(f=>f.heldQualityPages>0),'Lost previous complete quality during restore');
  assert(restoreFrames.some(f=>f.qualityLevels?.some(l=>l.mix>0&&l.mix<1)),'Missing gradual restore blend');
  await pause(800);const final=await stats();assert(final.tileBytes<=final.tileBudget,'Tile cache exceeded budget');
  checks.push({panorama,zoomFrames,shrinkFrames,restoreFrames,final});
}
return {checks};
