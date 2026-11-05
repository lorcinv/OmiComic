const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-240));await pause(15);}};
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const api=window.omicomic,root=window.__omiTabletRoot,checks=[];
const active=s=>document.querySelector('.page-panel.is-visible '+s),index=()=>Number(active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))-1;
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const frames=async action=>{window.__omiFrameMetrics=action;await wait(()=>!window.__omiFrameMetrics,'frame stats');return window.__omiFrameStats;};
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:2,mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:true,mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
const library=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='打开资源库');if(library)library.click();
for(const name of (window.__omiFixture.includes('original')?['Original.pdf']:['Perf.pdf','Document.pdf','Complex.pdf'])){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(()=>card(),'library '+name);
  await wait(async()=>!(await probe()).sceneCovered,'library transition '+name);
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:0,totalPages:resource.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:true}}));
  card().querySelector('strong').click();await wait(()=>active('.reader-native-image')&&document.documentElement.dataset.nativeReader==='on','reader');
  await value(api.setFullscreen(true));await pause(150);
  active('[aria-label="阅读进度"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await wait(()=>index()===0,'first page '+name);await pause(150);
  await wait(async()=>!(await probe()).sceneCovered,'entry transition '+name);
  const before=await probe(),turns=[],total=Number(active('.mobile-reader-total')?.textContent);
  for(let turn=0;turn<Math.min(5,total-1);turn++){
    await frames('start');const old=index(),r=active('.reader-stage').getBoundingClientRect();
    window.__omiDrag={from:{x:r.x+r.width*.78,y:r.y+r.height*.5},to:{x:r.x+r.width*.2,y:r.y+r.height*.5},viewport:innerWidth,stepMs:16,holdMs:10,async:true};
    await wait(()=>!window.__omiDrag,'drag');await wait(()=>index()===old+1&&!active('.reader-stage')?.hasAttribute('data-swipe-phase'),'handoff '+name+' turn '+turn+' from '+old);
    const motion=await frames('stop'),state=await probe();turns.push({page:old+1,motion,tileDecodes:state.tileDecodes-before.tileDecodes,bitmapBytes:state.bitmapBytes,rasters:state.rasters});await pause(120);
  }
  checks.push({name,before,turns});window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'close');await wait(()=>card(),'library return');
}
return {checks,viewport:{width:innerWidth,height:innerHeight}};
