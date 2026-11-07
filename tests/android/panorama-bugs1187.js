const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-250));await pause(15);}};
const api=window.omicomic,root=window.__omiTabletRoot,baseline=window.__omiFixture.includes('baseline'),checks=[];
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'probe');return window.__omiNativeStats;};
const record=async(start)=>{window[start?'__omiReaderMotionStart':'__omiReaderMotionStop']=true;await wait(()=>!window[start?'__omiReaderMotionStart':'__omiReaderMotionStop'],'native motion');return window.__omiReaderMotionFrames;};
window.__omiRotation=window.__omiFixture.includes('landscape')?0:1;await wait(()=>window.__omiRotation==null,'orientation');await pause(300);
const readIndex=()=>Number(active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))-1;
const tap=async()=>{const r=active('.reader-stage').getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const panoramaControl=()=>document.querySelector('.mobile-sheet .reader-panorama-toggle');
function visiblePoses(frames){
  const first=frames.find(f=>f.slots.length),clip=first.clip;
  const page=first.slots.reduce((a,b)=>{
    const distance=s=>Math.abs(s.left+s.width/2-(clip[0]+clip[2])/2)+Math.abs(s.top+s.height/2-(clip[1]+clip[3])/2);
    return distance(a)<distance(b)?a:b;
  });
  const poses=[];
  for(const f of frames){
    if(f.sceneCovered)continue;
    const s=f.slots.find(s=>s.url===page.url);if(!s)continue;
    const pose=[s.left+f.sceneTranslationX,s.top+f.contentY,s.width,s.height].map(v=>Math.round(v));
    if(!poses.length||pose.some((v,i)=>Math.abs(v-poses.at(-1)[i])>1))poses.push(pose);
  }
  return poses;
}
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:2,mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false}));
document.querySelector('[aria-label="打开资源库"]')?.click();
for(const name of ['Panorama.cbz','Panorama.pdf'])for(const flow of ['horizontal','vertical','rtl']){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(card,'card '+name);await wait(async()=>!(await probe()).sceneCovered,'library');
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:20,totalPages:64,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:flow==='rtl'?'right-to-left':'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:false,immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('.reader-native-image'),'native page');await wait(async()=>!(await probe()).sceneCovered,'entry');await pause(150);
  // Exercise the actual settings toggle, including the cutout resize it causes.
  await tap();await wait(()=>active('.is-mobile-chrome-visible'),'controls');await pause(250);active('[aria-label="阅读设置"]').click();await wait(()=>document.querySelector('.mobile-sheet'),'settings');
  const control=panoramaControl();
  assert(control,'panorama toggle missing '+document.querySelector('.mobile-sheet').innerText);
  await record(true);control.click();window.dispatchEvent(new Event('omi-back',{cancelable:true}));
  await wait(()=>active('.reader-stage.is-panorama'),'panorama');await wait(async()=>!(await probe()).sceneCovered,'switch settled');await pause(350);const switching=await record(false),switchPoses=visiblePoses(switching);
  if(!baseline){
    assert(switchPoses.length<=2,'mode switch exposed intermediate layouts '+JSON.stringify(switchPoses));
    assert(switching.some(f=>f.sceneCovered),'missing mode switch cover');
    const snapshots=switching.filter(f=>f.sceneCovered&&f.snapshotLaidOut);
    assert(snapshots.length&&snapshots.every(f=>f.snapshotY===snapshots[0].snapshotY&&f.snapshotHeight===snapshots[0].snapshotHeight),'mode switch cover moved');
  }
  if(active('.is-mobile-chrome-visible'))await tap();await pause(100);
  const before=await probe(),vertical=flow==='vertical',sign=flow==='rtl'?-1:1,events=[],dom=[];
  const observe=e=>events.push({type:e.type,stamp:e.timeStamp,x:e.clientX,y:e.clientY,time:performance.now()});
  for(const type of ['pointerdown','pointermove','pointerup'])document.addEventListener(type,observe,true);
  let sampling=true;const capture=()=>{if(!sampling)return;const nodes=[...active('.reader-stage').querySelectorAll('[data-reader-page-index]')].map(n=>{const r=n.getBoundingClientRect();return{index:Number(n.dataset.readerPageIndex),x:r.x,y:r.y,w:r.width,h:r.height};});dom.push({time:performance.now(),index:readIndex(),nodes});requestAnimationFrame(capture);};capture();
  await record(true);window.__omiFrameMetrics='start';await wait(()=>!window.__omiFrameMetrics,'frame metrics');
  for(let n=0;n<7;n++){
    const r=active('.reader-stage').getBoundingClientRect(),axis=vertical?r.height:r.width,distance=Math.min(axis*.64,420);
    const from={x:r.x+r.width*(sign<0?.2:.8),y:r.y+r.height*.78},to={x:from.x-(vertical?0:distance*sign),y:from.y-(vertical?distance:0)};
    // Also reproduce a device's extrapolated MOVE followed by a corrected UP.
    const correction=window.__omiFixture.includes('correction')&&n===6?40:0;
    window.__omiDrag={from,to,viewport:innerWidth,stepMs:5,holdMs:0,async:true,releaseCorrectionX:vertical?0:correction*sign,releaseCorrectionY:vertical?correction:0};await wait(()=>!window.__omiDrag,'fast drag');await pause(n<6?70:2200);
  }
  window.__omiFrameMetrics='stop';await wait(()=>!window.__omiFrameMetrics,'frame metrics');const motion=await record(false);sampling=false;
  for(const type of ['pointerdown','pointermove','pointerup'])document.removeEventListener(type,observe,true);
  const after=await probe(),reversals=[];let travel=0;
  for(let i=1;i<motion.length;i++){
    const a=motion[i-1],b=motion[i],pairs=b.slots.map(s=>[a.slots.find(p=>p.url===s.url),s]).filter(([p])=>p);
    if(!pairs.length)continue;
    const distances=pairs.map(([p,s])=>(vertical?p.top-s.top:(p.left-s.left)*sign));
    const delta=distances.sort((a,b)=>a-b)[Math.floor(distances.length/2)];travel+=delta;
    if(delta < -2)reversals.push({time:b.time,delta,before:a.slots,after:b.slots});
  }
  assert(motion.filter(f=>f.active&&!f.sceneCovered).every(f=>f.pixels),'blank native frame '+name+' '+flow);
  const finalIndex=readIndex();let exiting=[],cancelledExit=false;
  if(!baseline){
    if(!active('.is-mobile-chrome-visible'))await tap();await pause(250);
    active('[aria-label="阅读设置"]').click();await wait(()=>document.querySelector('.mobile-sheet'),'exit settings');
    const off=panoramaControl();
    assert(off,'exit panorama switch');await record(true);off.click();off.click();window.dispatchEvent(new Event('omi-back',{cancelable:true}));
    await wait(()=>!active('.reader-stage.is-panorama'),'ordinary mode');
    await wait(async()=>!(await probe()).sceneCovered,'ordinary settled');await pause(250);exiting=await record(false);
    assert(visiblePoses(exiting).length<=2,'exit switch exposed intermediate layouts');
    assert(active('.reader-native-image'),'ordinary page lost pixels');
    if(name==='Panorama.pdf'&&flow==='horizontal'){
      if(!active('.is-mobile-chrome-visible'))await tap();await pause(250);
      active('[aria-label="阅读设置"]').click();await wait(()=>document.querySelector('.mobile-sheet'),'cancel settings');
      panoramaControl().click();
      // Leave while the layout snapshot is still being captured.
      window.dispatchEvent(new Event('omi-back',{cancelable:true}));await wait(()=>!document.querySelector('.mobile-sheet'),'close cancel settings');
      window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));
      cancelledExit=true;
    }
  }
  checks.push({name,flow,switching,switchPoses,exiting,before,after,events,dom,motion,frameStats:window.__omiFrameStats,reversals,travel,finalIndex});
  if(!cancelledExit)window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'exit');
  await wait(async()=>!(await probe()).sceneCovered,'exit cover cleared');
}
if(!baseline)assert(checks.every(c=>c.reversals.length===0),'panorama rolled backwards '+JSON.stringify(checks.map(c=>({name:c.name,flow:c.flow,reversals:c.reversals.map(r=>r.delta)}))));
return{baseline,checks,viewport:{width:innerWidth,height:innerHeight}};
