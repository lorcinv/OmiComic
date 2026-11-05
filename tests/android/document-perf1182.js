const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const wait=async(fn,label,timeout=45000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-200));await pause(15);}};
const api=window.omicomic,value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const root=window.__omiTabletRoot,checks=[];
const active=selector=>document.querySelector('.page-panel.is-visible '+selector);
const button=label=>[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(b.getAttribute('aria-label')===label||b.textContent.trim()===label));
const pageIndex=()=>Number(active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))-1;
function pixels(frame){if(!frame)return false;if(frame.querySelector('[data-native-image]'))return document.documentElement.dataset.nativeReader==='on';const image=frame.querySelector('img.reader-image');if(image?.complete&&image.naturalWidth>0)return true;const canvas=frame.querySelector('canvas');if(canvas?.width>0)return true;return !!(frame.querySelector('iframe')?.contentDocument?.body?.textContent.trim()||frame.querySelector('.reader-chapter > div')?.shadowRoot?.querySelector('body')?.textContent.trim());}
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:2,mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false,mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
if(button('打开资源库'))button('打开资源库').click();
const names=window.__omiFixture.includes('all')?['Perf.pdf','Text.mobi','Eyes.epub','Large.mobi','Long.epub']:['Perf.pdf','Perf.pdf','Perf.pdf'];
for(const name of names){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(()=>card(),'library '+name);
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:0,totalPages:resource.total||2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  window.__perfGaps=[];window.__perfRunning=true;let last=performance.now();
  const tick=now=>{if(!window.__perfRunning)return;window.__perfGaps.push(now-last);last=now;requestAnimationFrame(tick);};requestAnimationFrame(tick);
  const start=performance.now();card().querySelector('strong').click();
  await wait(()=>pixels(active('.reader-page-frame:not([aria-hidden="true"])')),'reader pixels '+name);const firstPixelMs=performance.now()-start;
  await pause(500);window.__perfGaps=[];last=performance.now();const turnTimes=[],warmBefore=[],blankFrames=[];
  for(let turn=0;turn<4;turn++){
    const index=pageIndex();if(index>=Number(active('.mobile-reader-total')?.textContent)-1)break;
    const warm=!!active(`.reader-swipe-preview[data-swipe-group$=":${index+1}"] .reader-image,.reader-swipe-preview[data-swipe-group$=":${index+1}"] .reader-chapter`);warmBefore.push(warm);
    let blanks=0,observe=true;const probe=()=>{if(!observe)return;const frames=[...document.querySelectorAll('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]),.page-panel.is-visible .reader-swipe-preview[data-swipe-active="true"]')];if(!frames.some(pixels))blanks++;requestAnimationFrame(probe);};requestAnimationFrame(probe);
    const r=active('.reader-stage').getBoundingClientRect(),begin=performance.now();
    window.__omiDrag={from:{x:r.x+r.width*.78,y:r.y+r.height*.5},to:{x:r.x+r.width*.2,y:r.y+r.height*.5},viewport:innerWidth,stepMs:12,holdMs:10,async:true};
    await wait(()=>!window.__omiDrag,'swipe input');await wait(()=>pageIndex()===index+1&&pixels(active('.reader-page-frame:not([aria-hidden="true"])')),'swipe handoff '+name);turnTimes.push(performance.now()-begin);observe=false;blankFrames.push(blanks);await pause(200);
  }
  // Reverse turns must reuse the completed surface too.
  const reverseFrom=pageIndex(),reverseStart=performance.now();
  document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',code:'ArrowLeft',bubbles:true}));
  await wait(()=>pageIndex()===Math.max(0,reverseFrom-1)&&pixels(active('.reader-page-frame:not([aria-hidden="true"])')),'reverse page');const reverseMs=performance.now()-reverseStart;
  window.__perfRunning=false;const gaps=window.__perfGaps.filter(n=>n>0).sort((a,b)=>a-b),row={name,firstPixelMs,turnTimes,reverseMs,warmBefore,blankFrames,raf:{count:gaps.length,p95:gaps[Math.floor(gaps.length*.95)],worst:gaps.at(-1),over50:gaps.filter(n=>n>50).length}};
  assert(!active('.reader-page-error'),'reader error '+name);checks.push(row);
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'close reader');
  await wait(()=>card(),'return library');await pause(100);
}
return{checks,viewport:{width:innerWidth,height:innerHeight},webview:navigator.userAgent};
