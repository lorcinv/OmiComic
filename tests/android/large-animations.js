const pause=ms=>new Promise(r=>setTimeout(r,ms)),assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label)=>{const end=Date.now()+45000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-500)+' '+document.querySelector('.page-panel.is-visible .reader-stage')?.outerHTML.slice(-6000));await pause(60);}};
const value=async promise=>{const r=await promise;if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
const api=window.omicomic,root=window.__omiTabletRoot,results=[];
const active=selector=>document.querySelector('.page-panel.is-visible '+selector);
const settled=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'probe');if(window.__omiNativeStats.sceneCovered){await pause(200);return settled();}};
await value(api.updateSettings({mobileReaderAutoHide:false,readerPageMode:'single',readerDefaultPanorama:false,readerPreloadPages:0,mobileImageAdjustments:{enabled:true,sharpen:40,denoise:40,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false}}));
document.querySelector('[aria-label="打开资源库"]')?.click();
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
await wait(()=>card('LargeAnimations'),'fixtures');card('LargeAnimations').querySelector('strong').click();
const cases=['gif','webp','apng'].flatMap(format=>['folder','archive','epub'].map(source=>({format,source})));
cases.push({format:'gif',source:'7z'},{format:'gif',source:'real'});
const selectedPage=async index=>{
  await wait(()=>active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow')===String(index+1),'selected page '+index);
  await wait(async()=>{const page=active('[data-reader-page-index="'+index+'"]');if(!page)return false;const before=page.getBoundingClientRect();await pause(120);const after=page.getBoundingClientRect();return after.width>0&&after.x+after.width/2>0&&after.x+after.width/2<innerWidth&&Math.abs(before.x-after.x)<.5&&Math.abs(before.y-after.y)<.5;},'page movement settled '+index);
};
const sample=async(label,format,source)=>{
  const image=active('[data-reader-page-index="0"] img.reader-image');assert(image&&image.complete&&image.naturalWidth>0,'Image missing '+source+'/'+format+'/'+label);
  const effects=image.closest('.reader-effects');assert(effects.dataset.processing==='original'&&effects.dataset.displaySampling==='original','Animation passed through static processing');
  const rect=image.getBoundingClientRect();window.__omiPixels={x:rect.x+rect.width/2,y:rect.y+rect.height/2,viewport:innerWidth};await wait(()=>!window.__omiPixels,'pixels');
  const colors=window.__omiPixelResult;
  if(source==='real')assert(new Set(colors.map(c=>c.join(','))).size>1,'Real GIF frames did not change');
  else assert(colors.some(([r,g,b])=>r>b+100)&&colors.some(([r,g,b])=>b>r+100),'Animation paused '+source+'/'+format+'/'+label+' '+JSON.stringify(colors));
  results.push({label,format,source,colors,width:image.naturalWidth,height:image.naturalHeight});
};
for(const {format,source} of cases){
  const name=source==='real'?'Lorenzo':'Large-'+format+(source==='archive'?'.cbz':source==='epub'?'.epub':source==='7z'?'.cb7':'');
  await wait(()=>card(name),'book '+name);await settled();
  if(source==='folder'||source==='real')await wait(()=>card(name)?.querySelector('img')?.naturalWidth>0,'large animation cover '+name);
  const book=await value(api.getResourcePages({path:root+'/LargeAnimations/'+name}));if(source!=='epub')assert(book.total===2,'Large image missing from page index '+name+': '+book.total);
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:source==='archive',immersive:false}}));
  card(name).querySelector('strong').click();await wait(()=>active('.reader-layout')?.getAttribute('aria-busy')==='false','reader '+name);await settled();await sample('open',format,source);
  document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await selectedPage(1);await wait(()=>active('[data-reader-page-index="1"] [data-native-image]'),'static native page '+name);
  document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await selectedPage(0);await wait(()=>active('[data-reader-page-index="0"] img.reader-image')?.complete,'return');await sample('return',format,source);
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-stage'),'closed');await settled();
}
return {version:(await api.getAppInfo()).version,results,staticNative:true};
