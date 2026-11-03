const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+30000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-300));await pause(25);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(item=>item.name==='Halftone1149')??data.library.roots[0];
const button=label=>[...document.querySelectorAll('button')].find(el=>el.getBoundingClientRect().width>0&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tap=async el=>{assert(el,'Missing tap target');const label=el.getAttribute('aria-label');let rect;for(let attempt=0;attempt<8;attempt++){if(!el.isConnected&&label)el=[...document.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===label)??el;el.scrollIntoView({block:'center',behavior:'instant'});await pause(180);rect=el.getBoundingClientRect();const x=rect.x+rect.width/2,y=rect.y+Math.min(38,rect.height/2);if(el.isConnected&&rect.width>0&&y>8&&y<innerHeight-8&&el.contains(document.elementFromPoint(x,y)))break;rect=null;}assert(rect,'Unsettled tap '+label);window.__omiTap={x:rect.x+rect.width/2,y:rect.y+Math.min(38,rect.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'real tap');};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const names=['Images','Stored.zip','Deflate.cbz','Lzma.zip','Bzip2.zip','RAR4.rar','RAR5.cbr','Seven.7z','Solid.cb7','Story.epub','Reader1152.mobi'];
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:2,readerPageMode:'single',readerDefaultPanorama:false,mobileReaderAutoHide:false,mobileReaderPreviews:true}));
if(button('打开资源库'))await tap(button('打开资源库'));
if(!card(names[0])){await wait(()=>card('Formats1168'),'format collection');card('Formats1168').click();}await wait(()=>card(names[0]),'format cards');
const checks=[],sessions=new Set(),closed=new Set(),open=api.openDocument,close=api.closeDocument;
api.openDocument=async input=>{sessions.add(input.id);return open(input);};api.closeDocument=async id=>{const result=await close(id);closed.add(id);return result;};
for(const name of names){
  const path=root.path+'/Formats1168/'+name,book=await value(api.getResourcePages({path}));
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:path,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:book.total||2,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  await wait(()=>card(name),'card '+name);const start=performance.now();card(name).click();
  const ready=async()=>{
    const frame=document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"])');
    if(Number(frame?.dataset.readerPageIndex)!==Number(document.querySelector('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))-1)return false;
    const native=frame?.querySelector('[data-native-image]');if(native)return (await stats()).rasters.some(item=>item.url===native.dataset.nativeImage&&item.width>0&&item.height>0);
    const chapter=frame?.querySelector('iframe')?.contentDocument;if(chapter)return chapter.body.textContent.trim()||[...chapter.images].some(image=>image.complete&&image.naturalWidth>0);
    const image=frame?.querySelector('img');return image?.complete&&image.naturalWidth>0;
  };
  await wait(ready,'first pixels '+name);const openMs=performance.now()-start;
  const rail=document.querySelector('[aria-label="阅读进度"]'),before=Number(rail.getAttribute('aria-valuenow'));
  if(name.endsWith('.epub')||name.endsWith('.mobi'))await pause(250);
  const stage=document.querySelector('.page-panel.is-visible .reader-stage'),rect=stage.getBoundingClientRect();
  window.__omiTap={x:rect.x+rect.width*.94,y:rect.y+rect.height*.5,viewport:innerWidth};await wait(()=>!window.__omiTap,'turn '+name);
  await wait(()=>Number(rail.getAttribute('aria-valuenow'))>before,'page changed '+name);await wait(ready,'next pixels '+name);
  const imagePages=name==='Images'?book.pages.slice(0,2).map(page=>page.name):undefined;
  if(imagePages)for(let index=2;index<book.total;index++){
    window.__omiTap={x:rect.x+rect.width*.94,y:rect.y+rect.height*.5,viewport:innerWidth};await wait(()=>!window.__omiTap,'image format turn');
    await wait(()=>Number(rail.getAttribute('aria-valuenow'))===index+1,'image page '+index);await wait(ready,'image pixels '+book.pages[index].name);imagePages.push(book.pages[index].name);
  }
  checks.push({name,type:book.sourceType,openMs,nextPage:Number(rail.getAttribute('aria-valuenow')),imagePages});
  window.dispatchEvent(new Event('omi-back'));await wait(()=>card(name),'return '+name);
}
await wait(()=>[...sessions].every(id=>closed.has(id)),'document sessions closed');
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path}));
return {checks,documentSessions:sessions.size,closedSessions:closed.size};
