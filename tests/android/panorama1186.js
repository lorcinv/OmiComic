const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const wait=async(fn,label,timeout=30000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-220));await pause(15);}};
const api=window.omicomic,root=window.__omiTabletRoot,baseline=window.__omiFixture.includes('baseline');
const landscape=window.__omiFixture.includes('landscape');
window.__omiRotation=landscape?0:1;
await wait(()=>window.__omiRotation==null&&(landscape?innerWidth>innerHeight:innerWidth<innerHeight),'requested screen orientation');
await pause(350);
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const touch=async(action,x,y)=>{
  const type={down:'pointerdown',move:'pointermove',up:'pointerup',cancel:'pointercancel'}[action];let received=false;
  const seen=e=>{if(e.pointerType==='touch'){received=true;document.removeEventListener(type,seen,true);}};
  document.addEventListener(type,seen,true);
  window.__omiTouch={action,x,y,viewport:innerWidth};
  try{await wait(()=>!window.__omiTouch&&received,'delivered touch '+action,5000);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}
  finally{document.removeEventListener(type,seen,true);}
};
const tap=async(x,y)=>{window.__omiTap={x,y,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const checks=[];
const profile=window.__omiFixture.includes('phone-landscape')?'phone-landscape':innerWidth<600?'phone':innerWidth>innerHeight?'tablet-landscape':'tablet-portrait';
await value(api.updateSettings({mobileReaderAutoHide:false,readerPreloadPages:4,readerMemoryCacheSizeMb:100,readerImageLoadConcurrency:2,readerPageMode:'single',readerDefaultImmersive:false}));
const library=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='打开资源库');if(library)library.click();
const resource=await value(api.getResourcePages({path:root+'/Panorama.cbz',type:'archive'}));
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent==='Panorama.cbz');
for(const flow of ['horizontal','vertical','rtl']){
  await wait(card,'book card');await wait(async()=>!(await probe()).sceneCovered,'library ready');
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:resource.title,currentPageIndex:20,totalPages:resource.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:flow==='rtl'?'right-to-left':'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:true,immersive:false}}));
  card().querySelector('strong').click();
  await wait(()=>active('.reader-stage.is-panorama')&&document.documentElement.dataset.nativeReader==='on','panorama pixels');
  await wait(async()=>!(await probe()).sceneCovered,'entry finished');await pause(450);
  const hidden=await probe(),stage=()=>active('.reader-stage').getBoundingClientRect();
  if(!baseline){assert(hidden.rootTopPadding===0,'panorama still reserves top cutout');assert(!hidden.statusBarVisible,'reader time bar not hidden');if(landscape)assert(hidden.cutoutLeft>0||hidden.cutoutRight>0,'landscape test did not rotate the cutout');}
  let r=stage();await tap(r.x+r.width/2,r.y+r.height/2);await wait(()=>active('.is-mobile-chrome-visible'),'show controls');await pause(150);
  const shown=await probe(),safe=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--android-reader-status-inset'))||0;
  let controlBounds=null;
  if(!baseline){
    assert(shown.rootTopPadding===0,'show controls moved canvas');assert(shown.webHeight===hidden.webHeight&&shown.webY===hidden.webY,'controls changed panorama viewport');assert(active('.reader-toolbar button').getBoundingClientRect().top>=safe,'toolbar overlaps status/cutout');
    const style=getComputedStyle(document.documentElement),edge=name=>Number.parseFloat(style.getPropertyValue('--android-reader-safe-'+name))||0;
    controlBounds=['.reader-footer','.mobile-reader-current','.mobile-reader-total','.mobile-reader-play'].map(selector=>({selector,rect:active(selector).getBoundingClientRect().toJSON()}));
    assert(controlBounds.every(({rect})=>rect.left>=edge('left')-.5&&rect.right<=innerWidth-edge('right')+.5&&rect.bottom<=innerHeight-edge('bottom')+.5),'footer extends outside safe area '+JSON.stringify({controlBounds,width:innerWidth,height:innerHeight,left:edge('left'),right:edge('right'),bottom:edge('bottom')}));
  }
  window.__omiShot='panorama1186-'+profile+'-'+flow+'-controls';await wait(()=>!window.__omiShot,'controls screenshot');
  if(!baseline){
    active('[aria-label="阅读设置"]').click();await wait(()=>document.querySelector('.mobile-sheet'),'reading settings');await pause(220);
    const sheet=document.querySelector('.mobile-sheet').getBoundingClientRect(),style=getComputedStyle(document.documentElement),edge=name=>Number.parseFloat(style.getPropertyValue('--android-reader-safe-'+name))||0;
    assert(sheet.x>=edge('left')&&sheet.right<=innerWidth-edge('right')+1&&sheet.y>=edge('top'),'reading settings overlap cutout');
    window.dispatchEvent(new Event('omi-back',{cancelable:true}));await wait(()=>!document.querySelector('.mobile-sheet'),'close settings');
  }
  r=stage();await tap(r.x+r.width/2,r.y+r.height/2);await wait(()=>!active('.is-mobile-chrome-visible'),'hide controls');await pause(150);
  const vertical=flow==='vertical',sign=flow==='rtl'?-1:1;
  let trackedIndex=null,trackedCenter=0,travel=0;
  const position=()=>{
    const clip=stage(),nodes=[...active('.reader-stage').querySelectorAll('[data-reader-page-index]')].map(node=>({index:Number(node.dataset.readerPageIndex),rect:node.getBoundingClientRect()})).filter(n=>n.rect.width>0&&n.rect.height>0).sort((a,b)=>a.index-b.index);
    const center=rect=>vertical?rect.y+rect.height/2:rect.x+rect.width/2;
    if(!nodes.length)return NaN;
    const previous=nodes.find(node=>node.index===trackedIndex);
    if(previous)travel+=(trackedCenter-center(previous.rect))*(vertical?1:sign);
    // Track a real visible page through window rebasing. Unknown offscreen page
    // dimensions must not be multiplied by a book-wide index to infer movement.
    const nearest=nodes.reduce((a,b)=>Math.abs(center(a.rect)-center(clip))<Math.abs(center(b.rect)-center(clip))?a:b);
    trackedIndex=nearest.index;trackedCenter=center(nearest.rect);
    return travel;
  };
  const gestures=[];
  for(const [name,stepMs,distance] of [['slow',65,100],['fast',8,220]]){
    r=stage();const from={x:r.x+r.width*(flow==='rtl'?.25:.75),y:r.y+r.height*.65},to={x:from.x-(vertical?0:distance*sign),y:from.y-(vertical?distance:0)};
    const before=position(),samples=[],events=[];let running=true;
    const record=()=>{if(!running)return;samples.push({time:performance.now(),position:position()});requestAnimationFrame(record);};requestAnimationFrame(record);
    const event=e=>events.push({type:e.type,pointerType:e.pointerType,time:performance.now(),stamp:e.timeStamp,x:e.clientX,y:e.clientY});
    for(const name of ['pointerdown','pointermove','pointerup'])document.addEventListener(name,event,true);
    window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'record native');
    window.__omiDrag={from,to,viewport:innerWidth,stepMs,holdMs:10,async:true};await wait(()=>!window.__omiDrag,'native drag');
    await pause(900);running=false;
    for(const name of ['pointerdown','pointermove','pointerup'])document.removeEventListener(name,event,true);
    window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'native frames');
    const up=events.find(e=>e.type==='pointerup'),down=events.find(e=>e.type==='pointerdown');
    const held=samples.filter(f=>up&&f.time<=up.time).at(-1),after=samples.filter(f=>up&&f.time>=up.time+550)[0];
    assert(events.some(e=>e.pointerType==='touch'),'input did not reach touch path');
    assert(up&&down&&held&&after,'missing motion samples');
    const during=held.position-before,coast=after.position-held.position;
    assert(during>distance*.6,'drag did not follow finger');
    if(name==='fast')assert(coast>40,'fast release lost inertia '+JSON.stringify({flow,during,coast,inputMs:up.time-down.time,events}));
    if(name==='slow')assert(during<distance*1.25,'slow drag lost precision');
    const nativeFrames=window.__omiReaderMotionFrames;
    assert(nativeFrames.filter(f=>!f.sceneCovered&&f.active).every(f=>f.pixels),'blank native frame');
    gestures.push({name,distance,inputMs:up.time-down.time,during,coast,samples,events,nativeFrames});
    // A new finger must catch momentum, and holding it must keep that position.
    r=stage();await touch('down',r.x+r.width*.45,r.y+r.height*.5);const caught=position();await pause(180);assert(Math.abs(position()-caught)<1,'held finger did not stop inertia');await touch('cancel',r.x+r.width*.45,r.y+r.height*.5);await pause(120);
  }
  r=stage();const pivot={x:r.x+r.width*.5,y:r.y+r.height*.5};
  await touch('down',pivot.x,pivot.y);await touch('move',pivot.x-(vertical?0:55*sign),pivot.y-(vertical?55:0));const outbound=position();
  await touch('move',pivot.x-(vertical?0:25*sign),pivot.y-(vertical?25:0));const reversed=position();
  assert(reversed<outbound-20,'reversing finger did not reverse the page '+JSON.stringify({flow,outbound,reversed}));await pause(160);await touch('up',pivot.x-(vertical?0:25*sign),pivot.y-(vertical?25:0));await pause(250);
  assert(Math.abs(position()-reversed)<1,'paused reversal released stale momentum '+JSON.stringify({flow,outbound,reversed,after:position()}));
  assert(gestures[1].coast>gestures[0].coast+40,'fast fling was not faster than slow drag');
  window.__omiShot='panorama1186-'+profile+'-'+flow+'-hidden';await wait(()=>!window.__omiShot,'hidden screenshot');
  checks.push({flow,hidden,shown,controlBounds,gestures});
  window.dispatchEvent(new Event('omi-reader-back',{cancelable:true}));await wait(()=>!active('.reader-layout'),'exit');await wait(card,'return');await wait(async()=>!(await probe()).sceneCovered,'return finished');
  const returned=await probe();if(!baseline&&returned.cutoutTop)assert(returned.rootTopPadding>=returned.cutoutTop,'exit did not restore library safe area');
}
return{baseline,profile,checks,viewport:{width:innerWidth,height:innerHeight}};
