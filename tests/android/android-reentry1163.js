const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const deadline=Date.now()+25000;while(!await fn()){if(Date.now()>deadline)throw Error(label+' '+document.body.innerText.slice(-700));await pause(30);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,baseline=window.__omiFixture.endsWith('baseline'),name=window.__omiFixture.includes('color')?'Color.cbz':'Many.cbz';
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Missing fixture root');
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:4,mobileReaderAutoHide:false,mobileReaderPreviews:false,readerPageMode:'single',doublePageFirstSingle:false,doublePageDirection:'left-to-right'}));
const book=await value(api.getResourcePages({path:root.path+'/'+name,type:'archive'}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'archive',title:name,currentPageIndex:4,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:true,immersive:false}}));
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(node=>node.querySelector('strong')?.textContent===name);
const checks=[];window.__omiReentryChecks=checks;
for(let pass=0;pass<3;pass++){
  await wait(card,'library card');card().scrollIntoView({block:'nearest'});await pause(350);
  window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'start frame probe');
  const bounds=card().getBoundingClientRect(),start=performance.now();window.__omiTap={x:bounds.x+bounds.width/2,y:bounds.y+35,viewport:innerWidth};await wait(()=>!window.__omiTap,'open touch');
  await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage.is-panorama'),'panorama visible');
  await wait(async()=>(await stats()).visiblePages>0,'source pixels');await pause(750);
  window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'stop frame probe');
  const frames=window.__omiReaderMotionFrames,exposedEmpty=frames.filter(frame=>frame.active&&!frame.pixels&&!frame.sceneCovered);
  const check={pass,elapsedMs:performance.now()-start,exposedEmptyFrames:exposedEmpty.length,coveredPendingFrames:frames.filter(frame=>frame.active&&!frame.pixels&&frame.sceneCovered).length,frames};checks.push(check);
  assert(frames.some(frame=>frame.active&&frame.pixels&&!frame.sceneCovered),'Reader never revealed its source pixels');
  if(!baseline)assert(exposedEmpty.length===0,'Reader reveal exposed an empty native frame: '+JSON.stringify(exposedEmpty));
  if(pass<2){window.__omiKey=4;await wait(()=>!window.__omiKey,'return to library');await wait(card,'library after back');await pause(450);}
}
let revealGate;
if(!baseline){window.__omiReaderRevealCheck=true;await wait(()=>!window.__omiReaderRevealCheck,'native reveal gate');revealGate=window.__omiReaderRevealResult;}
return {baseline,book:name,checks,revealGate};
