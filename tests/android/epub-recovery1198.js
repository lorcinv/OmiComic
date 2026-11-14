const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=performance.now()+30000;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-300));await pause(30);}};
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(JSON.stringify(result));return result.data;};
const api=window.omicomic,root=window.__omiTabletRoot,checks=[];
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const settled=()=>wait(async()=>!(await probe()).sceneCovered,'scene settled');
const shot=async name=>{window.__omiShot='epub-recovery1198-'+name.toLowerCase();await wait(()=>!window.__omiShot,'screenshot');};
const tap=async element=>{const r=element.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
await value(api.updateSettings({mobileReaderAutoHide:false,readerDefaultImmersive:false,smartDetectSpreadPage:false,doublePageFirstSingle:false}));
document.querySelector('[aria-label="打开资源库"]')?.click();
async function open(name,flow,index){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent===name);
  await wait(card,'library card '+name);await settled();
  const resource=await value(api.getResourcePages({path:root+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:name,currentPageIndex:index,currentPageId:'epub-chapter:'+index,totalPages:8,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:flow==='rtl'?'right-to-left':'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('.reader-layout')?.getAttribute('aria-busy')==='false','reader ready');await settled();
}
async function close(){window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-stage'),'reader closed');await settled();}
for(const flow of ['ordinary','horizontal','vertical','rtl']){
  await open('Compatibility.epub',flow,flow==='ordinary'?0:3);
  await wait(async()=>(await probe()).rasters.length>0,'native EPUB pixels');
  const stage=active('.reader-stage'),frame=active(flow==='ordinary'?'.reader-page-frame:not([aria-hidden=true])':'.is-current-page'),r=stage.getBoundingClientRect(),image=frame.querySelector('[data-native-image]').getBoundingClientRect();
  assert(image.width>0&&image.height>0&&image.left<r.right&&image.right>r.left&&image.top<r.bottom&&image.bottom>r.top,'visible native EPUB page '+flow);
  const x=r.x+r.width/2,y=r.y+r.height/2;
  window.__omiPinch={x,y,from:Math.min(100,r.width*.3),to:10,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch shrink');
  await wait(()=>Number(stage.dataset.readerZoom)===.25,'25 percent zoom');
  window.__omiPinch={x,y,from:20,to:100,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch enlarge');
  await wait(()=>Number(stage.dataset.readerZoom)>.8,'enlarged EPUB');await shot(flow);
  checks.push({name:'Compatibility.epub',flow,nativePixels:true,minimumZoom:.25,expandedZoom:Number(stage.dataset.readerZoom)});await close();
}
for(const name of ['Missing.epub','Unsupported.epub']){
  await open(name,'ordinary',0);
  const expected=name==='Missing.epub'?'本页图片读取失败，请重试。':'本页使用的 EPUB 图片格式暂不支持。';
  await wait(()=>active('.reader-page-error')?.textContent.includes(expected),'readable error '+name);await shot(name.replace('.epub',''));
  await tap(active('.reader-page-error button'));await wait(()=>active('.reader-page-error')?.textContent.includes(expected),'retry remains available');
  const r=active('.reader-stage').getBoundingClientRect();
  window.__omiTap={x:r.left+r.width*.85,y:r.top+r.height*.5,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap next page');
  await wait(()=>active('.reader-page-frame:not([aria-hidden=true])')?.dataset.readerPageIndex==='1','skip failed page');
  await wait(async()=>(await probe()).rasters.length>0,'next page native pixels');
  checks.push({name,error:expected,retry:true,nextPageReadable:true});await close();
}
return{version:(await api.getAppInfo()).version,checks,userAgent:navigator.userAgent};
