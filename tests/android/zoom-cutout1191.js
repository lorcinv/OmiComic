const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label,timeout=30000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-300));await pause(20);}};
const api=window.omicomic,root=window.__omiTabletRoot,checks=[];
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'probe');return window.__omiNativeStats;};
const settled=()=>wait(async()=>!(await probe()).sceneCovered,'scene settled');
const tap=async(x,y,repeat=1)=>{window.__omiTap={x,y,repeat,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
const events=[];for(const name of ['pointerdown','pointerup'])document.addEventListener(name,e=>{events.push({name,time:performance.now(),stamp:e.timeStamp,x:e.clientX,y:e.clientY,zoom:active('.reader-stage')?.dataset.readerZoom,index:active('.reader-progress-rail')?.getAttribute('aria-valuenow')});if(events.length>30)events.shift();},true);
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,mobileReaderAutoHide:false,readerDefaultImmersive:false,smartDetectSpreadPage:false,doublePageFirstSingle:false}));
document.querySelector('[aria-label="打开资源库"]')?.click();
for(const rotation of [1,0])for(const mode of ['single','double','horizontal','vertical']){
  window.__omiRotation=rotation;await wait(()=>window.__omiRotation==null,'rotation');await pause(300);
  const panorama=mode==='horizontal'||mode==='vertical',rtl=mode==='horizontal'&&rotation===0;
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent==='Panorama.cbz');
  await wait(card,'book');await settled();
  const resource=await value(api.getResourcePages({path:root+'/Panorama.cbz'}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:resource.title,currentPageIndex:20,totalPages:resource.total,readerViewState:{fitMode:'fit-window',pageMode:mode==='double'?'double':'single',pageDirection:rtl?'right-to-left':'left-to-right',flow:mode==='vertical'?'vertical':'horizontal',panorama,immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('[data-reader-page-index="20"] .reader-native-image'),'native page');await settled();await pause(250);
  const before=await probe();assert((before.cutoutTop||before.cutoutLeft||before.cutoutRight)>0,'test requires an enabled display cutout');
  if(!panorama){
    const style=getComputedStyle(active('.reader-stage')),factor=before.nativeWidth/innerWidth;
    assert(Math.abs(parseFloat(style.paddingTop)*factor-before.cutoutTop)<2&&Math.abs(parseFloat(style.paddingLeft)*factor-before.cutoutLeft)<2,'ordinary fit should retain safe padding');
  }
  const frame=rect(active('.reader-stage')),node=active('[data-reader-page-index="20"] .reader-native-image'),image=rect(node),spreadBefore=rect(active('.reader-page-spread'));
  const x=Math.max(frame.x+20,Math.min(frame.x+frame.width-20,image.x+image.width*.6)),y=Math.max(frame.y+20,Math.min(frame.y+frame.height-20,image.y+image.height*.6));
  const index=active('.reader-progress-rail').getAttribute('aria-valuenow');
  await tap(x,y,2);await wait(()=>Number(active('.reader-stage').dataset.readerZoom)===2,'2x despite inset resize');await pause(300);
  const zoomed=await probe();assert(zoomed.currentZoom===2,'native zoom');
  // Landscape navigation buttons still reserve their own edge; only the
  // cutout edge belongs to the expanded reading canvas.
  const expanded=state=>['Top','Left','Right'].every(side=>state['root'+side+'Padding']===(before['cutout'+side]>0?0:before['root'+side+'Padding']));
  assert(expanded(zoomed),'zoom did not use cutout area '+JSON.stringify({mode,rotation}));
  assert(active('.reader-progress-rail').getAttribute('aria-valuenow')===index,'zoom turned page');
  const stage=rect(active('.reader-stage')),body=rect(node),factor=zoomed.nativeWidth/innerWidth,raster=zoomed.rasters.find(r=>r.url===node.dataset.nativeImage);
  assert(raster&&Math.abs(raster.left-body.x*factor)<4&&Math.abs(raster.top-body.y*factor)<4,'native geometry drift');
  if(!panorama){
    const spread=rect(active('.reader-page-spread'));
    const expected=(origin,viewport,size,point,fraction,fittedCenter)=>Math.max(Math.min(origin+viewport-size,fittedCenter-size/2),Math.min(Math.max(origin,fittedCenter-size/2),point-size*fraction));
    const errorX=Math.abs(spread.x-expected(stage.x,stage.width,spread.width,x,(x-spreadBefore.x)/spreadBefore.width,spreadBefore.x+spreadBefore.width/2));
    const errorY=Math.abs(spread.y-expected(stage.y,stage.height,spread.height,y,(y-spreadBefore.y)/spreadBefore.height,spreadBefore.y+spreadBefore.height/2));
    assert(errorX<2&&errorY<2,'cutout resize lost physical touch anchor '+JSON.stringify({mode,rotation,errorX,errorY}));
  }
  // The controls/time bar may reappear without shrinking the expanded canvas.
  await tap(stage.x+stage.width/2,stage.y+stage.height/2);await wait(()=>active('.is-mobile-chrome-visible'),'toolbar shown');await pause(150);
  const shown=await probe(),button=rect(active('.reader-toolbar button'));
  assert(expanded(shown),'toolbar resized canvas');
  assert(button.y*factor>=Math.max(0,shown.cutoutTop||0)-3,'toolbar overlaps top cutout');
  assert(button.x*factor>=Math.max(0,shown.cutoutLeft||0)-3,'toolbar overlaps side cutout');
  const shownBody=rect(node);
  assert(Object.keys(body).every(key=>Math.abs(shownBody[key]-body[key])<.5),'toolbar moved zoomed page '+JSON.stringify({mode,rotation,before:body,after:shownBody}));
  assert(active('.reader-progress-rail').getAttribute('aria-valuenow')===index,'show toolbar turned page');
  await tap(stage.x+stage.width/2,stage.y+stage.height/2);await wait(()=>!active('.is-mobile-chrome-visible'),'toolbar hidden');
  assert(active('.reader-progress-rail').getAttribute('aria-valuenow')===index,'hide toolbar turned page');
  if(mode==='single'||mode==='double'){window.__omiShot='zoom1191-'+mode+'-'+(rotation?'portrait':'landscape');await wait(()=>!window.__omiShot,'screenshot');}
  // With a portrait single page at 2x, both axes must have useful drag room.
  let pan=null;
  if(rotation===1&&mode==='single'){
    const from=rect(node);window.__omiDrag={from:{x:stage.width/2,y:stage.height/2},to:{x:stage.width/2-24,y:stage.height/2-45},viewport:innerWidth,steps:10,stepMs:16,holdMs:180,async:true};
    await wait(()=>!window.__omiDrag,'two-axis drag');await pause(150);const to=rect(node);pan={x:to.x-from.x,y:to.y-from.y};
    assert(pan.x<-10&&pan.y<-25,'2x page cannot pan on both axes '+JSON.stringify(pan));
  }
  await tap(stage.x+stage.width*.85,stage.y+stage.height*.65,2);await wait(()=>Number(active('.reader-stage').dataset.readerZoom)===1,'restore');
  await wait(async()=>{const s=await probe();return s.rootTopPadding===before.rootTopPadding&&s.rootLeftPadding===before.rootLeftPadding&&s.rootRightPadding===before.rootRightPadding;},'restore original safe area');
  assert(active('.reader-progress-rail').getAttribute('aria-valuenow')===index,'restore turned page '+JSON.stringify({mode,rotation,index,after:active('.reader-progress-rail').getAttribute('aria-valuenow'),pan,events,transport:window.__omiTapTransportTrace?.slice(-5)}));
  checks.push({rotation,mode,pan,beforePadding:[before.rootLeftPadding,before.rootTopPadding,before.rootRightPadding],zoomedPadding:[zoomed.rootLeftPadding,zoomed.rootTopPadding,zoomed.rootRightPadding],nativeZoom:zoomed.currentZoom});
  window.dispatchEvent(new Event('omi-reader-back'));await wait(()=>!active('.reader-layout'),'back');await settled();
}
return {checks};
