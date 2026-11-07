const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const wait=async(fn,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(12);}};
const api=window.omicomic,root=window.__omiTabletRoot,checks=[];
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=selector=>document.querySelector('.page-panel.is-visible '+selector);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(element=>element.querySelector('strong')?.textContent===name);
function pixels(){const frame=active('.reader-page-frame:not([aria-hidden="true"])');if(!frame)return false;if(frame.querySelector('[data-native-image]'))return document.documentElement.dataset.nativeReader==='on';return !!(frame.querySelector('img')?.naturalWidth||frame.querySelector('canvas')?.width||frame.querySelector('iframe')?.contentDocument?.body?.textContent.trim()||frame.querySelector('.reader-chapter>div')?.shadowRoot?.querySelector('body')?.textContent.trim());}
await value(api.updateSettings({followSystemTheme:false,colorTheme:'mist',mobileReaderAutoHide:false,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',readerImageLoadConcurrency:2,readerPreloadPages:2}));
document.querySelector('[aria-label="打开资源库"]')?.click();
for(const name of ['Startup.cbz','Startup.zip','Startup.cbr','Startup.cb7','Startup.png','Startup.pdf','StartupText.epub','StartupPictures.epub','StartupText.mobi','StartupPictures.mobi']){
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  const runs=[];
  for(let run=0;run<3;run++){
    await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:0,currentPageId:resource.sourceType==='epub'||resource.sourceType==='mobi'?'epub-chapter:0':undefined,totalPages:resource.total||2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
    await wait(()=>card(name),'library '+name);card(name).scrollIntoView({block:'center'});await wait(async()=>!(await probe()).sceneCovered,'settled library');
    const before=await probe(),start=performance.now();card(name).querySelector('strong').click();
    await wait(()=>active('.reader-layout')&&pixels(),'prepared pixels '+name);const preparedMs=performance.now()-start;
    const usesNative=!!active('.reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
    let stats;await wait(async()=>{stats=await probe();return !stats.sceneCovered&&(!usesNative||stats.visiblePages>0&&stats.drawnFrames>before.drawnFrames);},'visible first frame '+name);
    const visibleMs=performance.now()-start;
    assert(!active('.reader-page-error'),'reader error '+name);
    const stage=active('.reader-stage').getBoundingClientRect(),index=()=>Number(active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))-1,total=Number(active('.mobile-reader-total')?.textContent);
    assert(stage.width>0&&stage.height>0,'empty reader bounds '+name);
    if(total>1){document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));await wait(()=>index()>=1&&pixels(),'next page '+name);assert(!active('.reader-page-error'),'next-page error '+name);}
    runs.push({run,preparedMs,visibleMs,native:usesNative,total,stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height},firstFrame:{visiblePages:stats.visiblePages,drawnFrames:stats.drawnFrames}});
    window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'close reader');await wait(()=>card(name),'return library');
  }
  checks.push({name,format:resource.sourceType,runs,medianVisibleMs:runs.map(run=>run.visibleMs).sort((a,b)=>a-b)[1]});
}
return{checks,measurement:'library click to prepared page and uncovered visible first frame; three repeated opens, no cold-cache claim',viewport:{width:innerWidth,height:innerHeight},webview:navigator.userAgent};
