const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(20);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,baseline=window.__omiFixture.endsWith('baseline');
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Missing synthetic fixture grant');
const checks=[],readCalls=[];let openedAt=0;
// Retain the real MessagePort bridge and response handling while observing
// which page requests begin before the first native frame is exposed.
const transport=MessagePort.prototype.postMessage;
MessagePort.prototype.postMessage=function(message,...rest){try{const request=JSON.parse(message);if(request.method==='readerPrepare'&&openedAt)readCalls.push({prefetch:Boolean(request.args?.prefetch),source:request.args?.archiveInnerPath,start:performance.now()-openedAt});}catch{}return transport.call(this,message,...rest);};
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(node=>node.querySelector('strong')?.textContent==='Color.cbz');
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const book=await value(api.getResourcePages({path:root.path+'/Color.cbz',type:'archive'}));
for(const mode of ['single','double','panorama']){
 await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:4,mobileReaderAutoHide:false,mobileReaderPreviews:false,readerPageMode:mode==='double'?'double':'single',doublePageFirstSingle:false,doublePageDirection:'left-to-right'}));
 for(let round=0;round<3;round++){
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'archive',title:'Color.cbz',currentPageIndex:4,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:mode==='double'?'double':'single',pageDirection:'left-to-right',flow:'horizontal',panorama:mode==='panorama',immersive:false,pairingAnchor:4}}));
  await wait(card,'library card');card().scrollIntoView({block:'nearest'});await pause(180);
  window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'begin native frame record');
  readCalls.length=0;openedAt=0;
  const eventStart=()=>{openedAt=performance.now();};document.addEventListener('pointerup',eventStart,{capture:true,once:true});
  const box=card().getBoundingClientRect();window.__omiTap={x:box.x+box.width/2,y:box.y+35,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap comic');
  await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader stage');
  const shownMs=performance.now()-openedAt;
  await wait(async()=>(await stats()).visiblePages>0,'native original pixels');await pause(380);
  window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'end native frame record');
  const frames=window.__omiReaderMotionFrames,trace=window.__omiTapTransportTrace.at(-1),first=frames.find(f=>f.active&&f.pixels&&!f.sceneCovered);
  assert(first,'No committed clear reader frame');
  const blank=frames.filter(f=>f.active&&!f.pixels&&!f.sceneCovered);
  assert(blank.length===0,'Uncovered blank native frame');
  const shown=Number(document.querySelector('[aria-label="阅读进度"]').getAttribute('aria-valuenow'));assert(shown===5,'Saved page changed');
  const check={mode,round,webStageMs:shownMs,fromNativeTapRequestToPixelsMs:first.time-trace.startedUptime,touchTransportMs:trace.elapsed,blankFrames:blank.length,readCalls:[...readCalls],frames};checks.push(check);
  window.__omiKey=4;await wait(()=>!window.__omiKey,'Back');await wait(card,'library returned');await pause(250);
 }
}
MessagePort.prototype.postMessage=transport;
return {baseline,fixture:'Dedicated Android 15 emulator; synthetic Color.cbz; 3 entries per mode; original native pixels; actual touch input; native latency includes shell input transport',checks};
