const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(value,label)=>{if(!value)throw Error(label);};
const wait=async(fn,label)=>{const until=Date.now()+60000;while(!await fn()){if(Date.now()>until)throw Error(label+' '+JSON.stringify(window.__omiPreviewDiagnostics)+' '+JSON.stringify(window.__omiOpenErrors)+' '+document.body.innerText.slice(-200));await pause(40);}};
const api=window.omicomic,value=async promise=>{const r=await promise;if(!r.ok)throw Error(r.error.message);return r.data;};
const active=selector=>document.querySelector('.page-panel.is-visible '+selector);
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
const button=name=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&(el.getAttribute('aria-label')===name||el.textContent.trim()===name));
const root=window.__omiTabletRoot,checks=[];
const documentModule=await import(new URL(window.__omiDocumentModule,'https://omi.local').href),DocumentClass=Object.values(documentModule).find(value=>typeof value==='function'&&value.prototype?.readPreview);
const originalAcquire=DocumentClass.acquirePrepared;DocumentClass.acquirePrepared=async function(...args){const prepared=await originalAcquire.apply(this,args);if(prepared)window.__currentDocument=prepared.source;return prepared;};
const originalOpen=DocumentClass.prototype.open;DocumentClass.prototype.open=async function(...args){try{const resource=await originalOpen.apply(this,args);if(this.purpose==='reader')window.__currentDocument=this;return resource;}catch(error){(window.__omiOpenErrors??=[]).push(String(error));throw error;}};
const originalPreview=DocumentClass.prototype.readPreview,diagnostics=window.__omiPreviewDiagnostics={started:0,finished:0,errors:[]};
const nativeProbe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native render stats');return window.__omiNativeStats;};
const experience=window.__omiFixture.includes('experience');
const tap=async element=>{const r=element.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
DocumentClass.prototype.readPreview=async function(...args){diagnostics.started++;try{const url=await originalPreview.apply(this,args);diagnostics.finished++;return url;}catch(error){diagnostics.errors.push(String(error));throw error;}};
assert(root,'Test grant missing');
if(button('打开资源库'))button('打开资源库').click();
await wait(()=>card('Document.pdf'),'tablet library');
let offlineRootIsolated=false;
if(/118[0123]/.test(window.__omiFixture)){
  button('资源库目录').click();await wait(()=>document.querySelector('.mobile-tree-error'),'offline root warning');
  assert([...document.querySelectorAll('.mobile-tree-row')].some(el=>el.textContent.includes('Tablet1179')),'Readable root missing from drawer');
  offlineRootIsolated=true;window.dispatchEvent(new Event('omi-library-back',{cancelable:true}));await wait(()=>!document.querySelector('.is-side-drawer'),'drawer closed');
}
assert(getComputedStyle(document.querySelector('.sidebar-item.is-active')).boxShadow==='none','Active navigation still has a shadow');
for(const name of (window.__omiFixture.includes('pdf-experience')?['Document.pdf']:window.__omiFixture.endsWith('square')?['Square.epub']:/118[123]/.test(window.__omiFixture)?['Document.pdf','Text.mobi',...(experience?['Text.epub']:[]),'Eyes.epub','Large.mobi','Long.epub','Square.epub']:/118[01]/.test(window.__omiFixture)?['Document.pdf','Text.mobi','Eyes.epub','Large.mobi']:['Document.pdf','Story.epub','Large.mobi'])){
  const path=root+'/'+name,resource=await value(api.getResourcePages({path}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:path,sourceType:resource.sourceType,title:name,currentPageIndex:0,totalPages:resource.total||2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  const cover=await value(api.getThumbnail({path,type:resource.sourceType}));
  assert(cover.url,'Native cover missing for '+name);
  await wait(()=>card(name),'resource '+name);
  card(name).querySelector('[aria-label="打开资源信息"]').click();
  await wait(()=>active('.resource-detail-page'),'details '+name);
  active('.resource-detail-thumbnail-grid').scrollIntoView({block:'start'});
  await wait(()=>[...document.querySelectorAll('.page-panel.is-visible .resource-detail-thumbnail img')].some(img=>img.complete&&img.naturalWidth>0),'detail preview '+name);
  const coverShadow=getComputedStyle(active('.resource-detail-cover')).boxShadow;
  assert(coverShadow.includes('0.14'),'Deep detail cover shadow '+coverShadow);
  const openStart=performance.now();
  active('.resource-detail-read-button').click();
  await wait(()=>active('.reader-layout'),'reader '+name);
  await wait(()=>{
    const frame=active('.reader-page-frame:not([aria-hidden="true"])');if(!frame)return false;
    if(frame.querySelector('[data-native-image]')&&document.documentElement.dataset.nativeReader==='on')return true;
    const raster=frame.querySelector('img.reader-image');if(raster?.complete&&raster.naturalWidth>1)return true;
    const shadow=frame.querySelector('.reader-chapter > div')?.shadowRoot;if(shadow?.querySelector('body')?.textContent.trim())return true;
    const chapter=frame.querySelector('iframe')?.contentDocument;
    if(chapter)return chapter.body.textContent.trim()||[...chapter.images].some(img=>img.complete&&img.naturalWidth>0);
    const canvas=frame.querySelector('canvas');if(canvas?.width>0){const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=0;i<data.length;i+=4)if(data[i]<240||data[i+1]<240||data[i+2]<240)return true;}
    return false;
  },'visible document pixels '+name);
  const openedMs=performance.now()-openStart;
  const total=active('.mobile-reader-total')?.textContent;
  if(name==='Text.mobi')assert(Number(total)>10,'Text MOBI was not paginated: '+total);
  if(name==='Eyes.epub'){const page=await window.__currentDocument.readPage(0);assert(page.width>1000&&(page.native||page.decodedImage),'Original EPUB image resolution lost');}
  if(name==='Document.pdf'&&/118[123]/.test(window.__omiFixture))assert(window.__currentDocument.nativePdf,'Native PDF renderer was not used');
  if(name==='Long.epub'){
    assert(Number(total)===5,'Long image was not split into 5 pages');
    if(/118[23]/.test(window.__omiFixture)){
      const rail=active('[aria-label="阅读进度"]');rail.dispatchEvent(new KeyboardEvent('keydown',{key:'End',code:'End',bubbles:true}));await wait(()=>rail.getAttribute('aria-valuenow')==='5','last long-image region');
      const target=()=>active('.reader-page-frame[data-reader-page-index="4"] [data-native-image]')?.dataset.nativeImage;
      let stats;await wait(async()=>{stats=await nativeProbe();return target()&&stats.rasters?.some(r=>r.url===target());},'last region painted');
      const raster=stats.rasters.find(r=>r.url===target()),color=raster.color;assert(Math.abs((color>>>16&255)-155)<8&&Math.abs((color&255)-179)<8,'Last native region color is incorrect');assert(raster.bitmapHeight<=2400,'Long image was fully decoded');
    }else{const tail=await window.__currentDocument.readPage(4),img=tail.decodedImage;assert(img&&img.naturalHeight<=2400,'Long image was fully decoded');const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(img,0,0,1,1);const color=[...canvas.getContext('2d').getImageData(0,0,1,1).data];assert(Math.abs(color[0]-155)<8&&Math.abs(color[2]-179)<8,'Last image region is incorrect: '+color);}
  }
  if(name==='Square.epub'){const page=await window.__currentDocument.readPage(0);assert(page.native&&page.width===6000&&page.height===6000,'Large scan did not use the bounded native decoder');assert(page.decodedBytes<=48*1024*1024,'Large scan exceeded the bounded decode budget');await pause(150);window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native drawing probe');assert(window.__omiNativeStats.active&&window.__omiNativeStats.visiblePages===1&&window.__omiNativeStats.drawnFrames>0,'Prepared large scan was not drawn');window.__omiShot='perf1181-square-'+innerWidth;await wait(()=>!window.__omiShot,'native scan screenshot');}
  const before=active('.reader-page-frame:not([aria-hidden="true"])')?.getBoundingClientRect();
  if(experience&&['Document.pdf','Text.mobi','Eyes.epub'].includes(name)){await pause(700);window.__omiShot='experience1182-'+name.split('.')[0].toLowerCase();await wait(()=>!window.__omiShot,'reader screenshot '+name);}
  if(Number(total)>1&&name!=='Document.pdf'&&name!=='Long.epub'){await pause(600);document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true}));await wait(()=>Number(active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))>=2,'turn page '+name);await pause(350);assert(!active('.reader-page-error'),'Page turn error '+name);}

  if(name==='Large.mobi')assert(Number(total)>=500,'Image book did not split into bounded pages: '+total);
  if(!button('阅读设置'))active('.reader-stage').click();await wait(()=>button('阅读设置'),'reader settings button');button('阅读设置').click();
  await wait(()=>document.querySelector('[role="dialog"][aria-label="阅读设置"]'),'settings');
  const dialog=document.querySelector('[role="dialog"][aria-label="阅读设置"]');
  assert(!dialog.querySelector('.mobile-sheet-heading,.mobile-reader-help'),'Extra settings header remains');
  const handle=dialog.querySelector('.mobile-sheet-handle')?.getBoundingClientRect(),action=dialog.querySelector('.reader-reading-actions button')?.getBoundingClientRect();assert(handle&&action&&action.top-handle.bottom>=16,'Grab handle too close to reader icons');
  assert(getComputedStyle(dialog,'::-webkit-scrollbar').display==='none','Dialog scrollbar remains');
  assert(getComputedStyle(active('.reader-progress-thumb')).boxShadow.includes('0.08'),'Progress glow lost');
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!document.querySelector('[role="dialog"][aria-label="阅读设置"]'),'settings closed');
  let previewRail=false,zoomed=false,resumed=false,modes=false,pdfZoomTiles;
  if(experience&&name!=='Square.epub'){
    button('阅读设置').click();await wait(()=>document.querySelector('[role="dialog"][aria-label="阅读设置"]'),'mode settings');
    const controls=document.querySelector('[role="dialog"][aria-label="阅读设置"]');
    controls.querySelector('.reader-page-count-toggle').click();await wait(()=>controls.querySelector('.reader-page-count-toggle').textContent.includes('双页'),'double-page mode');
    controls.querySelector('.reader-direction-toggle').click();await pause(100);controls.querySelector('.reader-direction-toggle').click();
    await pause(150);controls.querySelector('.reader-page-count-toggle').click();
    const continuous=controls.querySelector('[aria-label="开启全景连环画"]');continuous.click();await wait(()=>active('.reader-stage.is-panorama'),'panorama mode');
    await pause(250);assert(!active('.reader-page-error'),'Panorama document error '+name);controls.querySelector('[aria-label="关闭全景连环画"]').click();await wait(()=>!active('.reader-stage.is-panorama'),'ordinary mode restored');modes=true;
    window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!document.querySelector('[role="dialog"][aria-label="阅读设置"]'),'mode settings closed');
    const stage=active('.reader-stage'),rect=stage.getBoundingClientRect();
    const oldStats=stage.querySelector('[data-native-image]')?await nativeProbe():null;
    window.__omiPinch={x:rect.x+rect.width/2,y:rect.y+rect.height/2,from:35,to:100,viewport:innerWidth};await wait(()=>!window.__omiPinch,'pinch '+name);await wait(()=>Number(stage.dataset.readerZoom)>1.4,'zoomed '+name);zoomed=true;
    if(name==='Document.pdf'){
      let stats;await wait(async()=>{stats=await nativeProbe();return stats.tileDecodes>(oldStats?.tileDecodes??0);},'sharp PDF zoom tiles');pdfZoomTiles=stats.tileDecodes-(oldStats?.tileDecodes??0);
    }
    stage.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2}));await wait(()=>Math.abs(Number(stage.dataset.readerZoom)-1)<.01,'zoom reset '+name);
    if(!active('.mobile-reader-tools')?.getClientRects().length)await tap(stage);
    const rail=active('[aria-label="阅读进度"]'),bar=rail.getBoundingClientRect();
    window.__omiDrag={from:{x:bar.x+bar.width*.25,y:bar.y+bar.height/2},to:{x:bar.x+bar.width*.4,y:bar.y+bar.height/2},viewport:innerWidth,holdMs:20,stepMs:16,async:true};await wait(()=>!window.__omiDrag,'progress drag');
    await wait(()=>active('.mobile-reader-filmstrip'),'preview rail '+name);
    await wait(()=>[...document.querySelectorAll('.mobile-reader-filmstrip img')].some(image=>image.complete&&image.naturalWidth>0)||!!active('.mobile-reader-filmstrip [data-native-preview]'),'preview pixels '+name);previewRail=true;
    await pause(250);
  }
  if(active('.mobile-reader-filmstrip')){window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.mobile-reader-filmstrip'),'preview rail closed');}
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'reader closed');
  if(active('.resource-detail-page')){window.dispatchEvent(new Event('omi-library-back',{cancelable:true}));await wait(()=>!active('.resource-detail-page'),'details closed');}
  await wait(()=>card(name),'library restored');
  if(experience&&name!=='Square.epub'){
    const saved=await value(api.getReadingProgress(resource.resourceKey));assert(saved?.currentPageId||resource.sourceType==='pdf','Missing stable reading position '+name);
    card(name).querySelector('strong').click();await wait(()=>active('.reader-layout'),'reopen '+name);
    await wait(()=>{const index=Number(active('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))-1,page=window.__currentDocument.openedResource?.pages[index];return resource.sourceType==='pdf'?index===saved.currentPageIndex:page?.pageId===saved.currentPageId;},'saved page restored '+name);resumed=true;
    window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'reopened reader closed');await wait(()=>card(name),'library restored again');
  }
  checks.push({name,format:resource.sourceType,nativeCover:true,detailPreview:true,readerPixels:true,total:Number(total),nativePdf:name==='Document.pdf'&&!!window.__currentDocument.nativePdf,nativeLargeImage:name==='Square.epub',nativeStats:name==='Square.epub'?window.__omiNativeStats:undefined,longImageTiles:name==='Long.epub'?5:undefined,previewRail,zoomed,resumed,modes,pdfZoomTiles,openedMs,bodyHeight:before?.height,softEffects:true,noScrollbars:true,settingsClean:true});
}
return{checks,offlineRootIsolated,viewport:{width:innerWidth,height:innerHeight},webview:navigator.userAgent,physicalDevice:false};
