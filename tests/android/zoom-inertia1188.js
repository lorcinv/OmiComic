const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label,timeout=30000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-250));await pause(15);}};
const api=window.omicomic,root=window.__omiTabletRoot,baseline=window.__omiFixture.includes('baseline'),checks=[];
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const pose=()=>{const p=active('.reader-page-spread').style.translate.split(' ').map(parseFloat);return{x:p[0]||0,y:p[1]||0};};
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'probe');return window.__omiNativeStats;};
const record=async(start)=>{window[start?'__omiReaderMotionStart':'__omiReaderMotionStop']=true;await wait(()=>!window[start?'__omiReaderMotionStart':'__omiReaderMotionStop'],'native frames');return window.__omiReaderMotionFrames;};
const touch=async(action,x,y)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'touch '+action);await pause(40);};
window.__omiRotation=window.__omiFixture.includes('landscape')?0:1;await wait(()=>window.__omiRotation==null,'orientation');
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:2,mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false}));
document.querySelector('[aria-label="打开资源库"]')?.click();
for(const name of ['Panorama.cbz','Panorama.pdf'])for(const flow of ['ordinary','horizontal','vertical']){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(card,'book '+name);await wait(async()=>!(await probe()).sceneCovered,'library');
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:20,totalPages:64,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('.reader-native-image'),'native page');await wait(async()=>!(await probe()).sceneCovered,'entry');await pause(200);
  const r=active('.reader-stage').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,axis=flow==='vertical'?'x':'y';
  window.__omiPinch={x,y,from:30,to:90,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');await wait(()=>Number(active('.reader-stage').dataset.readerZoom)>2.7,'zoomed');await pause(200);
  const beforeIndex=active('[aria-label="阅读进度"]').getAttribute('aria-valuenow'),start=pose(),events=[],dom=[];
  let up=null,running=true;const capture=()=>{if(!running)return;dom.push({time:performance.now(),...pose()});requestAnimationFrame(capture);};capture();
  const observe=e=>{events.push({type:e.type,time:performance.now(),x:e.clientX,y:e.clientY,stamp:e.timeStamp});if(e.type==='pointerup')up={time:performance.now(),...pose()};};
  for(const type of ['pointerdown','pointermove','pointerup'])document.addEventListener(type,observe,true);
  await record(true);
  window.__omiDrag={from:{x,y},to:{x:x-(axis==='x'?90:0),y:y-(axis==='y'?90:0)},viewport:innerWidth,stepMs:9,holdMs:0,async:true,releaseCorrectionX:axis==='x'?35:0,releaseCorrectionY:axis==='y'?35:0};
  await wait(()=>!window.__omiDrag,'fling');await wait(()=>up,'release');await pause(180);
  const after=pose(),released=up,afterRelease=dom.filter(f=>f.time>up.time+25);
  if(!baseline){assert(after[axis]<up[axis]-15,'no zoom inertia '+JSON.stringify({name,flow,up,after,events}));assert(afterRelease.every((p,i)=>!i||p[axis]<=afterRelease[i-1][axis]+1),'zoom fling reversed');}
  // Catch with native DOWN and hold: no residual motion or click paging.
  await touch('down',x,y);const caught=pose();await pause(150);assert(Math.abs(pose()[axis]-caught[axis])<.5,'catch kept moving');await touch('up',x,y);await pause(160);assert(Math.abs(pose()[axis]-caught[axis])<.5,'catch release restarted fling');
  assert(active('[aria-label="阅读进度"]').getAttribute('aria-valuenow')===beforeIndex,'zoom fling turned a page');
  const motion=await record(false);running=false;for(const type of ['pointerdown','pointermove','pointerup'])document.removeEventListener(type,observe,true);
  assert(motion.filter(f=>f.active&&!f.sceneCovered).every(f=>f.pixels),'native zoom frame lost pixels');
  // A deliberate pause before lifting must remain precise.
  await touch('down',x,y);await touch('move',x+(axis==='x'?35:0),y+(axis==='y'?35:0));await pause(180);const held=pose();await touch('up',x+(axis==='x'?35:0),y+(axis==='y'?35:0));await pause(150);assert(Math.abs(pose()[axis]-held[axis])<.5,'paused release coasted');
  window.__omiShot='zoom1188-'+name.split('.')[1]+'-'+flow;await wait(()=>!window.__omiShot,'screenshot');
  checks.push({name,flow,start,released,after,caught,held,events,dom,motion,stats:await probe()});
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'exit');await wait(async()=>!(await probe()).sceneCovered,'exit cover');
}
return{baseline,checks,viewport:{width:innerWidth,height:innerHeight}};
