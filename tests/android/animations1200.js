const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(40);}};
const value=async promise=>{const r=await promise;if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
const api=window.omicomic,root=window.__omiTabletRoot,results=[];
const active=selector=>document.querySelector('.page-panel.is-visible '+selector);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const settled=()=>wait(async()=>!(await probe()).sceneCovered,'scene settled');
const base={enabled:true,sharpen:40,denoise:40,brightness:125,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false};
await value(api.updateSettings({mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,mobileImageAdjustments:base}));
document.querySelector('[aria-label="打开资源库"]')?.click();
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
await wait(()=>card('Animations1200'),'fixture folder');card('Animations1200').querySelector('strong').click();
const sample=async(label,format,source)=>{
  const image=active('[data-reader-page-index="0"] img.reader-image');assert(image&&image.complete&&image.naturalWidth===96,'Original image missing '+label);
  const effects=image.closest('.reader-effects');assert(effects.dataset.processing==='original','Animation processed '+label);assert(effects.dataset.displaySampling==='original','Animation sampled '+label);
  const r=image.getBoundingClientRect();window.__omiPixels={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiPixels,'frame pixels');
  const colors=window.__omiPixelResult;assert(colors.some(([r,g,b])=>r>b+100)&&colors.some(([r,g,b])=>b>r+100),'Animation paused '+format+'/'+source+'/'+label+' '+JSON.stringify(colors));
  results.push({label,format,source,colors});
};
for(const format of ['gif','webp','png','apng'])for(const source of ['folder','archive']){
  const name='Animated-'+format+(source==='archive'?'.cbz':'');await wait(()=>card(name),'book '+name);await settled();
  const book=await value(api.getResourcePages({path:root+'/Animations1200/'+name}));assert(book.total===2,'Page enumeration '+name);
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:source==='archive',immersive:false}}));
  card(name).querySelector('strong').click();await wait(()=>active('.reader-layout')?.getAttribute('aria-busy')==='false','reader');await settled();await sample('adjusted',format,source);
  // Static WebP retains the native reader, while animated WebP stays live in WebView.
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  await wait(()=>active('[data-reader-page-index="1"] [data-native-image]'),'static WebP native page');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await pause(500);await sample('return-from-static',format,source);
  window.__omiShot='animations1200-'+format+'-'+source;await wait(()=>!window.__omiShot,'screenshot');
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-stage'),'reader closed');await settled();
}
window.dispatchEvent(new Event('omi-open-settings'));
const button=text=>[...document.querySelectorAll('button')].find(e=>e.getBoundingClientRect().width&&e.textContent.trim()===text);
await wait(()=>button('关于 OmiComic'),'about category');button('关于 OmiComic').click();await wait(()=>document.querySelector('.omi-about'),'about');
const actions=[...document.querySelectorAll('.omi-about__action')],cards=actions.map(e=>e.getBoundingClientRect());
const gaps=[cards[1].top-cards[0].bottom,cards[2].top-cards[1].bottom];assert(gaps.every(g=>Math.abs(g-12)<1),'About gaps '+gaps);
for(const action of actions){const a=action.getBoundingClientRect(),icon=action.querySelector('svg').getBoundingClientRect();assert(Math.abs(icon.y+icon.height/2-a.y-a.height/2)<1,'About icon alignment');}
window.__omiShot='animations1200-about';await wait(()=>!window.__omiShot,'about screenshot');
return {version:(await api.getAppInfo()).version,results,staticNative:true,aboutGaps:gaps};
