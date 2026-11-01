const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(20);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,baseline=window.__omiFixture.endsWith('baseline');
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Missing synthetic fixture grant');
const checks=[],readCalls=[],sceneCalls=[],gatherCalls=[];let openedAt=0;
const details=window.__omiFixture.includes('details'),animate=Element.prototype.animate;
if(details)Element.prototype.animate=function(frames,options){
 const animation=animate.call(this,frames,options);
 if(this.matches('.reader-page-frame')&&this.closest('[data-panorama-entry-phase]'))gatherCalls.push({index:Number(this.dataset.readerPageIndex),frames,duration:options.duration,start:performance.now()-openedAt});
 return animation;
};
// Retain the real MessagePort bridge and response handling while observing
// which page requests begin before the first native frame is exposed.
const transport=MessagePort.prototype.postMessage;
MessagePort.prototype.postMessage=function(message,...rest){try{
 const request=JSON.parse(message);
 if(request.method==='readerPrepare'&&openedAt)readCalls.push({prefetch:Boolean(request.args?.prefetch),source:request.args?.archiveInnerPath,start:performance.now()-openedAt});
 if(request.method==='commitScene'&&openedAt)sceneCalls.push(request.args);
 if(request.method==='waitScene'&&openedAt){
  const port=this,done=event=>{try{const reply=JSON.parse(event.data);if(reply.id===request.id){sceneCalls.push({method:'waitSceneComplete',at:performance.now()-openedAt});port.removeEventListener('message',done);}}catch{}};
  port.addEventListener('message',done);
 }
}catch{}return transport.call(this,message,...rest);};
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(node=>node.querySelector('strong')?.textContent==='Color.cbz');
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const book=await value(api.getResourcePages({path:root.path+'/Color.cbz',type:'archive'}));
for(const mode of ['single','double','panorama','panorama-double','panorama-vertical']){
 const double=mode.includes('double'),panorama=mode.startsWith('panorama'),flow=mode.endsWith('vertical')?'vertical':'horizontal';
 await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:4,mobileReaderAutoHide:false,mobileReaderPreviews:false,readerPageMode:double?'double':'single',doublePageFirstSingle:false,doublePageDirection:'left-to-right'}));
 for(let round=0;round<3;round++){
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'archive',title:'Color.cbz',currentPageIndex:4,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:double?'double':'single',pageDirection:'left-to-right',flow,panorama,immersive:false,pairingAnchor:4}}));
  await wait(card,'library card');card().scrollIntoView({block:'nearest'});await pause(180);
  window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'begin native frame record');
  readCalls.length=0;sceneCalls.length=0;gatherCalls.length=0;openedAt=0;
  window.__omiMotionReport={mode,round,readCalls,sceneCalls,gatherCalls};
  const eventStart=event=>{openedAt=performance.now();window.__omiMotionReport.pointerUp={at:openedAt,target:event.target?.closest('button')?.textContent};};document.addEventListener('pointerup',eventStart,{capture:true,once:true});
  const box=card().getBoundingClientRect();window.__omiTap={x:box.x+box.width/2,y:box.y+35,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap comic');
  await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader stage');
  const shownMs=performance.now()-openedAt;
  await wait(async()=>(await stats()).visiblePages>0,'native original pixels');await pause(380);
  if(!baseline)await wait(()=>sceneCalls.some(call=>call.method==='waitSceneComplete'),'entry animation completion');
  if(details&&mode==='panorama-vertical'){
   await wait(()=>gatherCalls.length===2,'both initial neighbours gather');
   await wait(()=>!document.querySelector('[data-panorama-entry-phase]'),'entry gather completion');
   assert(gatherCalls.every(call=>call.index!==4&&call.duration===240),'Gather changed the current page or duration');
  }
  window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'end native frame record');
  const frames=window.__omiReaderMotionFrames,trace=window.__omiTapTransportTrace.at(-1),first=frames.find(f=>f.active&&f.pixels&&!f.sceneCovered);
  assert(first,'No committed clear reader frame');
  const blank=frames.filter(f=>f.active&&!f.pixels&&!f.sceneCovered);
  assert(blank.length===0,'Uncovered blank native frame');
  const slideFrames=frames.filter(f=>f.active&&f.pixels&&f.sceneSnapshot&&f.sceneTranslationX>1&&f.sceneTranslationX<f.sceneWidth-1);
  assert(sceneCalls.some(call=>call.direction==='forward'),'Reader entry skipped the original forward animation');
  assert(slideFrames.length>1,'Native forward animation has no intermediate frames');
  const animationEndMs=sceneCalls.find(call=>call.method==='waitSceneComplete')?.at;
  const neighbourReadsBeforeAnimationEnd=animationEndMs===undefined?null:readCalls.filter(call=>call.source!=='005.jpg'&&call.start<animationEndMs).length;
  if(!baseline&&panorama)assert(neighbourReadsBeforeAnimationEnd===0,'Panorama neighbours delayed entry animation');
  const shown=Number(document.querySelector('[aria-label="阅读进度"]').getAttribute('aria-valuenow'));assert(shown===5,'Saved page changed');
  const gatheredNative=details&&mode==='panorama-vertical'?frames.filter(frame=>frame.pixels&&!frame.sceneSnapshot&&frame.slots.length>=3):[];
  if(details&&mode==='panorama-vertical'){
   const neighbour=gatheredNative[0]?.slots.find(slot=>slot.url!==first.slots[0].url)?.url;
   const widths=gatheredNative.flatMap(frame=>frame.slots.filter(slot=>slot.url===neighbour).map(slot=>slot.width));
   assert(widths.length>2&&Math.max(...widths)-Math.min(...widths)>2,'Native pixels did not follow the gather animation');
  }
  const check={mode,round,webStageMs:shownMs,animationStartMs:slideFrames[0].time-trace.startedUptime,animationEndMs,neighbourReadsBeforeAnimationEnd,fromNativeTapRequestToPixelsMs:first.time-trace.startedUptime,touchTransportMs:trace.elapsed,blankFrames:blank.length,slideFrames:slideFrames.length,sceneCalls:[...sceneCalls],readCalls:[...readCalls],gatherCalls:[...gatherCalls],gatherNativeFrames:gatheredNative.length,frames};checks.push(check);
  window.__omiKey=4;await wait(()=>!window.__omiKey,'Back');await wait(card,'library returned');await pause(250);
 }
}
MessagePort.prototype.postMessage=transport;
if(details)Element.prototype.animate=animate;
return {fixture:'Dedicated Android 15 emulator; synthetic Color.cbz; 3 entries per mode; actual touch input; timing is from touch request to the first intermediate native slide frame, distinct from final image readiness',checks};
