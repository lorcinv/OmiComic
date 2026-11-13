const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=performance.now()+30000;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-300));await pause(30);}};
const value=async promise=>{const r=await promise;if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
const active=selector=>document.querySelector('.page-panel.is-visible '+selector);
const api=window.omicomic,root=window.__omiTabletRoot,checks=[];
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const settled=()=>wait(async()=>!(await probe()).sceneCovered,'scene ready');
await value(api.updateSettings({mobileReaderAutoHide:false,readerDefaultImmersive:false,smartDetectSpreadPage:false,doublePageFirstSingle:false}));
document.querySelector('[aria-label="打开资源库"]')?.click();
for(const [name,flow] of [['Panorama.cbz','ordinary'],['Panorama.cbz','horizontal'],['Panorama.cbz','vertical'],['Document.pdf','ordinary'],['Story.epub','ordinary']]){
 const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
 await wait(card,'library card '+name);await settled();
 const resource=await value(api.getResourcePages({path:root+'/'+name}));
 await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:0,totalPages:resource.total||2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}}));
 card().querySelector('strong').click();
 await wait(()=>active('.reader-stage'),'reader stage '+name);await wait(()=>active('.reader-layout')?.getAttribute('aria-busy')==='false','reader ready '+name);await settled();
 if(name.endsWith('.epub')){await wait(()=>active('.reader-chapter > div')?.shadowRoot?.querySelector('body')?.textContent.includes('Chapter One'),'EPUB chapter text');if(window.unsafe116)throw Error('EPUB script was not isolated');}
 else await wait(async()=>(await probe()).rasters.length>0,'native pixels '+name);
 let zoom=null;
 if(name==='Panorama.cbz'){
  const stage=active('.reader-stage'),r=stage.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  window.__omiPinch={x,y,from:Math.min(100,r.width*.3),to:10,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch shrink');
  await wait(()=>Number(stage.dataset.readerZoom)===.25,'25% '+flow);await pause(250);
  if(Number(stage.dataset.readerZoom)!==.25)throw Error('Zoom did not persist after release');
  window.__omiShot='delivery1198-'+flow+'-25';await wait(()=>!window.__omiShot,'screenshot');
  window.__omiPinch={x,y,from:20,to:100,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch expand');
  await wait(()=>Number(stage.dataset.readerZoom)>.8,'expanded again');zoom={minimum:.25,expanded:Number(stage.dataset.readerZoom)};
 }
 checks.push({name,flow,zoom,opened:true});
 window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-stage'),'reader closed');await settled();
}
return {version:(await api.getAppInfo()).version,checks,userAgent:navigator.userAgent};
