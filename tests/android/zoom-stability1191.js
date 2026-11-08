const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label)=>{const end=performance.now()+30000;while(!await fn()){if(performance.now()>end)throw Error(label);await pause(20);}};
const api=window.omicomic,root=window.__omiTabletRoot,checks=[];
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'probe');return window.__omiNativeStats;};
const settled=()=>wait(async()=>!(await probe()).sceneCovered,'scene');
const tap=async(x,y)=>{window.__omiTap={x,y,repeat:2,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const range=values=>Math.max(...values)-Math.min(...values);
const reversal=(values,increasing)=>Math.max(0,...values.slice(1).map((v,i)=>(values[i]-v)*(increasing?1:-1)));
const baseline=window.__omiFixture.includes('baseline');
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,mobileReaderAutoHide:false,readerDefaultImmersive:false,smartDetectSpreadPage:false,doublePageFirstSingle:false}));
document.querySelector('[aria-label="打开资源库"]')?.click();
for(const rotation of [1,0])for(const mode of ['single','double']){
  window.__omiRotation=rotation;await wait(()=>window.__omiRotation==null,'rotation');await pause(300);
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent==='Panorama.cbz');
  await wait(card,'book');await settled();
  const resource=await value(api.getResourcePages({path:root+'/Panorama.cbz'}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:resource.title,currentPageIndex:20,totalPages:resource.total,readerViewState:{fitMode:'fit-window',pageMode:mode,pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  card().querySelector('strong').click();await wait(()=>active('[data-reader-page-index="20"] .reader-native-image'),'page');await settled();await pause(350);
  const stage=active('.reader-stage'),spread=active('.reader-page-spread'),node=active('[data-reader-page-index="20"] .reader-native-image'),url=node.dataset.nativeImage;
  const original=node.getBoundingClientRect(),index=active('.reader-progress-rail').getAttribute('aria-valuenow');
  for(const target of [2,1,2,1]){
    const rect=stage.getBoundingClientRect(),frames=[];let running=true;
    const sample=()=>{const r=spread.getBoundingClientRect(),s=stage.getBoundingClientRect(),zoom=Number(stage.dataset.readerZoom);frames.push({zoom,x:r.x,y:r.y,w:r.width,h:r.height,baseW:r.width/zoom,baseH:r.height/zoom,viewW:s.width,viewH:s.height});if(running)requestAnimationFrame(sample);};sample();
    window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'start capture');
    await tap(rect.x+rect.width*.6,rect.y+rect.height*.6);await wait(()=>Number(stage.dataset.readerZoom)===target,'zoom target');await pause(400);running=false;
    window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'stop capture');
    const native=window.__omiReaderMotionFrames.filter(f=>f.slots.some(s=>s.url===url)).map(f=>{const r=f.slots.find(s=>s.url===url);return {zoom:f.zoom,y:r.top+f.contentY,h:r.height,contentY:f.contentY,contentHeight:f.contentHeight};});
    const check={rotation,mode,target,domFrames:frames.length,nativeFrames:native.length,viewportWidthChange:range(frames.map(f=>f.viewW)),viewportHeightChange:range(frames.map(f=>f.viewH)),baseWidthChange:range(frames.map(f=>f.baseW)),baseHeightChange:range(frames.map(f=>f.baseH)),nativeOriginChange:range(native.map(f=>f.contentY)),nativeHeightChange:range(native.map(f=>f.contentHeight)),nativeVerticalReversal:reversal(native.map(f=>f.y),target===1)};
    checks.push(check);
    assert(active('.reader-progress-rail').getAttribute('aria-valuenow')===index,'zoom turned page');
    if(!baseline){
      assert(frames.length>5&&native.length>5,'not enough animated frames');
      assert(check.viewportWidthChange<.1&&check.viewportHeightChange<.1&&check.nativeOriginChange===0&&check.nativeHeightChange===0,'viewport changed during zoom '+JSON.stringify(check));
      assert(check.baseWidthChange<.5&&check.baseHeightChange<.5,'fit size changed during zoom '+JSON.stringify(check));
      assert(check.nativeVerticalReversal<2,'native vertical bounce '+JSON.stringify(check));
      if(target===1){const restored=node.getBoundingClientRect();assert(Math.abs(restored.y-original.y)<.5&&Math.abs(restored.height-original.height)<.5,'restore missed original fit');}
    }
  }
  window.dispatchEvent(new Event('omi-reader-back'));await wait(()=>!active('.reader-layout'),'back');await settled();
}
return {checks};
