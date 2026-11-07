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
for(const name of ['Panorama.cbz','Dense.cbz','Dense.pdf'])for(const flow of ['ordinary','vertical']){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(card,'book '+name);await wait(async()=>!(await probe()).sceneCovered,'library');
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:20,totalPages:64,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('.reader-native-image'),'native page');await wait(async()=>!(await probe()).sceneCovered,'entry');await pause(200);
  const r=active('.reader-stage').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,axis=flow==='vertical'?'x':'y';
  window.__omiPinch={x,y,from:30,to:90,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');await wait(()=>Number(active('.reader-stage').dataset.readerZoom)>2.7,'zoomed');await wait(async()=>{const state=await probe();return state.currentZoom>2.7&&!state.waitingDetail;},'native zoom ready');await pause(100);
  const before=await probe(),motions=[],events=[];
  if(!baseline){window.__omiTilePolicyCheck=true;await wait(()=>!window.__omiTilePolicyCheck,'native detail policy');}
  const observe=e=>events.push({type:e.type,time:performance.now(),x:e.clientX,y:e.clientY});
  for(const type of ['pointerdown','pointermove','pointerup'])document.addEventListener(type,observe,true);
  for(const direction of [-1,1,-1,1]){
    await record(true);
    const distance=Math.min(axis==='x'?r.width*.65:r.height*.55,300);
    const from={x:x-(axis==='x'?direction*distance/2:0),y:y-(axis==='y'?direction*distance/2:0)};
    const to={x:x+(axis==='x'?direction*distance/2:0),y:y+(axis==='y'?direction*distance/2:0)};
    window.__omiDrag={from,to,viewport:innerWidth,steps:30,stepMs:16,holdMs:0,async:true};
    await wait(()=>!window.__omiDrag,'long drag');await pause(450);
    motions.push(await record(false));
    await pause(100);
  }
  for(const type of ['pointerdown','pointermove','pointerup'])document.removeEventListener(type,observe,true);
  const motion=motions.flat();
  assert(motion.filter(f=>f.active&&!f.sceneCovered).every(f=>f.pixels),'native zoom frame lost pixels');
  const stats=await probe();assert(stats.tileBytes<=stats.tileBudget,'tile budget exceeded');
  assert(stats.bitmapBytes+stats.tileBytes<=stats.budget,'shared bitmap budget exceeded');
  assert(motion.every(f=>f.tileBytes<=f.tileBudget),'in-motion tile budget exceeded');
  if(!baseline)assert(motion.every(f=>f.drawSharp!==false),'drawn frame lost sharp coverage '+JSON.stringify({name,flow,bad:motion.filter(f=>f.drawSharp===false).slice(0,3)}));
  await pause(1300);const idle=await probe();assert(idle.openPdfDetails===0,'PDF detail page retained after idle');
  checks.push({name,flow,motions,events,before,stats,idle});
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'exit');await wait(async()=>!(await probe()).sceneCovered,'exit cover');
}
return{baseline,checks,viewport:{width:innerWidth,height:innerHeight}};
