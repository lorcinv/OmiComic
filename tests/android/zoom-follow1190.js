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
for(const name of ['Dense.cbz','Dense.pdf'])for(const flow of ['ordinary','vertical','horizontal']){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(card,'book '+name);await wait(async()=>!(await probe()).sceneCovered,'library');
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:20,totalPages:64,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('.reader-native-image'),'native page');await wait(async()=>!(await probe()).sceneCovered,'entry');await pause(200);
  const r=active('.reader-stage').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,axis=flow==='vertical'?'x':'y';
  window.__omiPinch={x,y,from:30,to:90,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch');await wait(()=>Number(active('.reader-stage').dataset.readerZoom)>2.7,'zoomed');await wait(async()=>{const state=await probe();return state.currentZoom>2.7&&!state.waitingDetail&&state.drawSharp;},'native zoom ready');await pause(100);

  const gate=async action=>{if(window.__omiFixture.includes('natural'))return;window.__omiDetailGate=action;await wait(()=>!window.__omiDetailGate,'detail gate');};
  const snapshot=async()=>{
    const state=await probe(),node=[...active('.reader-stage').querySelectorAll('[data-native-image]')].find(n=>state.rasters.some(p=>p.url===n.dataset.nativeImage));assert(node,'visible native node');
    const native=state.rasters.find(p=>p.url===node.dataset.nativeImage);assert(native,'visible native raster');
    const r=node.getBoundingClientRect(),factor=state.nativeWidth/innerWidth;
    const expected={x:Math.round(r.left*factor),y:Math.round(r.top*factor)},actual={x:native.left,y:native.top};
    return {expected,actual,error:Math.max(Math.abs(expected.x-actual.x),Math.abs(expected.y-actual.y)),state};
  };
  await record(true);await gate('hold');const held=[];
  try{
    for(const sign of [-1,1]){
      const dx=flow==='horizontal'?0:Math.min(r.width*.6,260)*sign;
      const dy=flow==='vertical'?0:Math.min(r.height*.55,300)*sign;
      window.__omiDrag={from:{x:x-dx/2,y:y-dy/2},to:{x:x+dx/2,y:y+dy/2},viewport:innerWidth,steps:24,stepMs:16,holdMs:0,async:true};
      await wait(()=>!window.__omiDrag,'pan');await pause(150);
      // Catch inertia and measure a held pose while region decoding is blocked.
      await touch('down',x,y);await pause(100);held.push(await snapshot());await touch('up',x,y);
    }
  }finally{await gate('release');}
  const beforeDetail=held.at(-1);
  await wait(async()=>{const s=await probe();return !s.waitingDetail&&s.drawSharp;},'settled sharp detail',25000);
  await pause(100);const afterDetail=await snapshot(),motion=await record(false);
  const jump=Math.max(Math.abs(beforeDetail.actual.x-afterDetail.actual.x),Math.abs(beforeDetail.actual.y-afterDetail.actual.y));
  const row={name,flow,held,afterDetail,jump,motion};checks.push(row);window.__omiFollowReport=checks;
  assert(motion.filter(f=>f.active&&!f.sceneCovered).every(f=>f.pixels),'lost visible body');
  assert(afterDetail.state.tileBytes<=afterDetail.state.tileBudget,'detail cache exceeded');
  assert(afterDetail.state.bitmapBytes+afterDetail.state.tileBytes<=afterDetail.state.budget,'shared bitmap cache exceeded');
  if(!baseline){
    assert(held.every(p=>p.error<=3),'frozen pose '+JSON.stringify({name,flow,held:held.map(p=>({expected:p.expected,actual:p.actual,error:p.error}))}));
    assert(jump<=3,'late detail moved the image '+JSON.stringify({name,flow,jump}));
    assert(afterDetail.error<=3&&afterDetail.state.drawSharp,'final pose/clarity mismatch');
  }
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'exit');await wait(async()=>!(await probe()).sceneCovered,'exit cover');
}
return{baseline,checks,viewport:{width:innerWidth,height:innerHeight}};
