const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-240));await pause(15);}};
const api=window.omicomic,root=window.__omiTabletRoot,baseline=window.__omiFixture.includes('baseline'),checks={entries:[]};
const profile=innerWidth<600?'phone':innerWidth>innerHeight?'landscape':'portrait';
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const tap=async(x,y)=>{window.__omiTap={x,y,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const geometry=()=>{const stage=active('.reader-stage'),page=active('.reader-native-image'),bar=active('.reader-toolbar');const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};return{height:innerHeight,stage:rect(stage),page:rect(page),toolbar:rect(bar)};};
let holdOpening=false,openingHeld=false,releaseOpening;
const calls=[];for(const method of ['getResourcePages','openDocument','renderDocumentPage']){const original=api[method];api[method]=async function(...args){const start=performance.now();try{if(method==='openDocument'&&holdOpening){holdOpening=false;openingHeld=true;await new Promise(resolve=>releaseOpening=resolve);}return await original.apply(this,args);}finally{calls.push({method,ms:performance.now()-start});}};}
const longTasks=[];if(PerformanceObserver.supportedEntryTypes?.includes('longtask'))new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({entryTypes:['longtask']});
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:2,readerImageLoadConcurrency:2,mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false}));
const library=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='打开资源库');if(library)library.click();
for(const name of ['Document.pdf','Perf.pdf','Document.pdf']){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(()=>card(),'card '+name);await wait(async()=>!(await probe()).sceneCovered,'library settled');
  const resource=await value(api.getResourcePages({path:root+'/'+name}));await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:0,totalPages:resource.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'record entry');
  const before=await probe(),start=performance.now(),callStart=calls.length;holdOpening=checks.entries.length===2;card().querySelector('strong').click();
  if(holdOpening||openingHeld){await wait(()=>openingHeld,'held preparation');await pause(200);checks.preparation=await probe();if(!baseline){assert(checks.preparation.rootTopPadding===before.rootTopPadding,'background preparation moved the library');assert(checks.preparation.statusBarVisible===before.statusBarVisible,'background preparation hid the library time bar');}openingHeld=false;releaseOpening();}
  await wait(()=>active('.reader-native-image')&&document.documentElement.dataset.nativeReader==='on','native reader');
  const readyMs=performance.now()-start;await wait(async()=>!(await probe()).sceneCovered,'entry animation');const entryMs=performance.now()-start;
  const hidden=geometry(),hiddenNative=await probe();window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'entry recorded');
  const frames=window.__omiReaderMotionFrames,shots=[];
  if(checks.entries.length===0){window.__omiShot='insets1185-hidden-'+profile;await wait(()=>!window.__omiShot,'hidden screenshot');}
  for(let round=0;round<2;round++){
    let box=active('.reader-stage').getBoundingClientRect();await tap(box.x+box.width/2,box.y+box.height/2);await wait(()=>active('.is-mobile-chrome-visible'),'show toolbar');await pause(350);
    const shown=geometry(),shownNative=await probe();shots.push({shown,shownNative});
    if(!baseline){assert(hidden.height===shown.height,'status bar changed reader viewport height');assert(JSON.stringify(hidden.page)===JSON.stringify(shown.page),'status bar moved/rescaled current page');assert(JSON.stringify(hidden.stage)===JSON.stringify(shown.stage),'status bar moved reader stage');assert(shownNative.rootTopPadding===hiddenNative.rootTopPadding,'status bar changed root padding');}
    const safeTop=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--android-reader-status-inset'))||0,topButton=active('.reader-toolbar button');
    if(!baseline)assert(topButton.getBoundingClientRect().top>=safeTop,'reader toolbar button overlaps the system time bar');
    if(checks.entries.length===0&&round===0){window.__omiShot='insets1185-shown-'+profile;await wait(()=>!window.__omiShot,'shown screenshot');}
    box=active('.reader-stage').getBoundingClientRect();await tap(box.x+box.width/2,box.y+box.height/2);await wait(()=>!active('.is-mobile-chrome-visible'),'hide toolbar');await pause(350);
    if(!baseline)assert(JSON.stringify(hidden.page)===JSON.stringify(geometry().page),'hide toolbar moved current page');
  }
  const oldSnapshots=frames.filter(f=>f.sceneSnapshot&&f.sceneCovered&&f.snapshotLaidOut&&f.snapshotY!==undefined);
  const snapshotDrift=oldSnapshots.length?Math.max(...oldSnapshots.map(f=>f.snapshotY))-Math.min(...oldSnapshots.map(f=>f.snapshotY)):null;
  const snapshotOffset=oldSnapshots.length?Math.max(...oldSnapshots.map(f=>Math.abs(f.snapshotY))):null;
  const barFrames=frames.filter(f=>f.statusBarVisible!==undefined);let hiddenSeen=false,barReappears=0;for(const frame of barFrames){if(!frame.statusBarVisible)hiddenSeen=true;else if(hiddenSeen)barReappears++;}if(!baseline){assert(barReappears===0,'time bar reappeared during entry');assert(oldSnapshots.every(f=>f.snapshotY===0&&f.snapshotHeight>=before.webHeight),'snapshot left the status background exposed');assert(snapshotDrift===0&&snapshotOffset===0,'outgoing library snapshot moved '+JSON.stringify({snapshotDrift,snapshotOffset}));assert(frames.filter(f=>!f.sceneCovered&&f.active).every(f=>f.pixels),'reader revealed without original page');}
  checks.entries.push({name,readyMs,entryMs,before,hidden,hiddenNative,shots,calls:calls.slice(callStart),snapshotDrift,snapshotOffset,barReappears,frames});
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'exit');await wait(()=>card(),'library return');await wait(async()=>!(await probe()).sceneCovered,'back transition');await pause(120);
  const back=await probe();if(!baseline)assert(back.rootTopPadding===before.rootTopPadding,'exit did not restore library insets');
}
const pdfLoads=performance.getEntriesByType('resource').filter(e=>/pdfRuntime-|pdfCompatRuntime-|pdf[.-].*worker|pdfjs/i.test(e.name)).map(e=>({name:e.name.split('/').pop(),ms:e.duration,bytes:e.transferSize}));
if(!baseline)assert(!pdfLoads.length,'native PDF still starts unused webpage PDF runtime '+JSON.stringify(pdfLoads));
checks.pdfLoads=pdfLoads;checks.longTasks=longTasks;
return {checks,viewport:{width:innerWidth,height:innerHeight},baseline};
