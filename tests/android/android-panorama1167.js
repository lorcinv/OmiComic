const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-500));await pause(25);}};
const value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const api=window.omicomic,baseline=window.__omiFixture.endsWith('baseline');
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Missing synthetic grant');
const book=await value(api.getResourcePages({path:root.path+'/Color.cbz',type:'archive'})),checks=[];
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(node=>node.querySelector('strong')?.textContent==='Color.cbz');
const touch=async(action,x,y)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'touch '+action);};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'stats');return window.__omiNativeStats;};
for(const flow of ['horizontal','vertical','rtl']){
  await value(api.updateSettings({mobileReaderAutoHide:false,mobileReaderPreviews:true,readerPreloadPages:3,readerMemoryCacheSizeMb:100,readerPageMode:'single'}));
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'archive',title:'Color.cbz',currentPageIndex:4,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:flow==='rtl'?'right-to-left':'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:true,immersive:false}}));
  await wait(card,'card');card().scrollIntoView({block:'nearest'});await pause(100);
  window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'start frames');
  const box=card().getBoundingClientRect();window.__omiTap={x:box.x+box.width/2,y:box.y+35,viewport:innerWidth};await wait(()=>!window.__omiTap,'open');
  await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage.is-panorama'),'stage');await pause(400);
  if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){const s=document.querySelector('.reader-stage').getBoundingClientRect();window.__omiTap={x:s.x+s.width/2,y:s.y+s.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'show toolbar');}
  const rail=document.querySelector('[aria-label="阅读进度"]');assert(rail,'rail');const r=rail.getBoundingClientRect(),y=r.y+r.height/2,x=ratio=>r.x+r.width*(flow==='rtl'?1-ratio:ratio);
  const steps=[];await touch('down',x(.15),y);
  for(const ratio of [.35,.75,.45]){
    await touch('move',x(ratio),y);const started=performance.now();let step;
    do{
      await pause(50);
      const native=await stats(),stage=document.querySelector('.reader-stage'),clip=stage.getBoundingClientRect(),vertical=flow==='vertical',center=vertical?clip.y+clip.height/2:clip.x+clip.width/2;
      const node=[...stage.querySelectorAll('[data-reader-page-index]')].find(node=>{const b=node.getBoundingClientRect();return vertical?b.top<=center&&b.bottom>=center:b.left<=center&&b.right>=center;});
      const url=node?.querySelector('[data-native-image]')?.dataset.nativeImage;
      step={ratio,expectedIndex:Math.round(ratio*(book.total-1)),domIndex:Number(node?.dataset.readerPageIndex),nativeMatches:Boolean(url&&native.rasters.some(r=>r.url===url)),url,nativeUrls:native.rasters.map(r=>r.url),dragging:rail.classList.contains('is-dragging'),whileHeldMs:performance.now()-started};
    }while(!step.nativeMatches&&performance.now()-started<2500);
    steps.push(step);window.__omiMotionReport={baseline,flow,checks,steps};
    if(!baseline){assert(step.dragging,'Touch capture lost during progress scrub');assert(step.domIndex===step.expectedIndex,'DOM did not follow thumb');assert(step.nativeMatches,'Native pixels stayed at old progress: '+JSON.stringify(step));}
  }
  await touch('up',x(.45),y);await pause(300);
  window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'stop frames');
  checks.push({flow,steps,frames:window.__omiReaderMotionFrames});window.__omiMotionReport={baseline,checks};
  for(let back=0;back<3&&!card();back++){window.__omiKey=4;await wait(()=>!window.__omiKey,'back');await pause(350);}
  await wait(card,'library');
}
return {baseline,fixture:'Synthetic Color.cbz; held native touch at three progress positions in horizontal, vertical and RTL panorama',checks};
