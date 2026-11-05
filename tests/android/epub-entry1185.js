const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(12);}};
const api=window.omicomic,root=window.__omiTabletRoot,checks=[],calls=[];
const value=async p=>{const result=await p;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
for(const method of ['getResourcePages','openDocument','readDocumentChapter','renderDocumentImage','renderDocumentPage','getPageImage','setReaderChrome']){
  if(!api[method])continue;
  const original=api[method];api[method]=async(...args)=>{
    const call={method,index:method==='readDocumentChapter'?args[1]:undefined,start:performance.now()};calls.push(call);
    try{return await original(...args);}finally{call.end=performance.now();call.ms=call.end-call.start;}
  };
}
const tasks=[];try{new PerformanceObserver(list=>tasks.push(...list.getEntries().map(e=>({start:e.startTime,ms:e.duration})))).observe({entryTypes:['longtask']});}catch{}
await value(api.updateSettings({followSystemTheme:false,colorTheme:'mist',mobileReaderAutoHide:false,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',readerImageLoadConcurrency:2,readerPreloadPages:2}));
document.querySelector('[aria-label="打开资源库"]')?.click();
const extended=window.__omiFixture.includes('all'),bench=extended?[['Eyes.epub',0],['Eyes.epub',60],['Eyes.epub',0],['Text.epub',1],['Long.epub',0],['Square.epub',0],['Document.pdf',0],['Text.mobi',0]]:[['Eyes.epub',0],['Eyes.epub',60],['Eyes.epub',0]];
function pixels(){const page=active('.reader-page-frame:not([aria-hidden="true"])');if(!page)return false;if(page.querySelector('[data-native-image]'))return document.documentElement.dataset.nativeReader==='on';return !!(page.querySelector('img')?.naturalWidth||page.querySelector('canvas')?.width||page.querySelector('iframe')?.contentDocument?.body?.textContent.trim()||page.querySelector('.reader-chapter>div')?.shadowRoot?.querySelector('body')?.textContent.trim());}
for(const [name,index] of bench){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(card,'library '+name);await wait(async()=>!(await probe()).sceneCovered,'settled library');
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:index,currentPageId:resource.sourceType==='epub'?'epub-chapter:'+index:undefined,totalPages:resource.total||200,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'record start');
  const callStart=calls.length,start=performance.now(),gaps=[];let running=true,last=start;
  requestAnimationFrame(function tick(now){if(!running)return;gaps.push(now-last);last=now;requestAnimationFrame(tick);});
  card().querySelector('strong').click();
  await wait(()=>active('.reader-layout')&&pixels(),'first EPUB display '+name);const visibleMs=performance.now()-start;
  await wait(async()=>!(await probe()).sceneCovered,'entry finish');const settledMs=performance.now()-start;
  window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'record stop');running=false;
  const end=performance.now(),frames=window.__omiReaderMotionFrames;
  const row={name,index,visibleMs,settledMs,calls:calls.slice(callStart).map(call=>({...call,start:call.start-start,end:call.end-start})),longTasks:tasks.filter(t=>t.start>=start&&t.start<end).map(t=>({...t,start:t.start-start})),frameGaps:gaps.filter(gap=>gap>50),native:await probe(),frames};
  assert(!active('.reader-page-error'),'reader error '+name);checks.push(row);
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'close reader');await wait(card,'return library');
}
return {checks,viewport:{width:innerWidth,height:innerHeight},webview:navigator.userAgent};
