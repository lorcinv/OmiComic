const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+15000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(60);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root missing');
const base=root.path+'/Mobile113',book=await value(api.getResourcePages({path:base+'/Pages',type:'folder'}));
await value(api.updateSettings({colorTheme:'mist',mobileLibraryLayout:'grid',mobileGridColumns:2,readerPreloadPages:4,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',doublePageDirection:'left-to-right'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'folder',title:'Pages',hasStartedReading:true,currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false,autoRead:{intervalSeconds:3,scrollPixelsPerSecond:80}}}));
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tapAt=async p=>{window.__omiTap={...p,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const tap=async el=>{assert(el,'Missing target');el.scrollIntoView({block:'nearest'});await pause(100);const r=el.getBoundingClientRect();await tapAt({x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2)});};
const key=async()=>{window.__omiKey=4;await wait(()=>!window.__omiKey,'Back');await pause(220);};
const drag=async(from,to)=>{window.__omiDrag={from,to,holdMs:80,viewport:innerWidth};await wait(()=>!window.__omiDrag,'native drag');await pause(240);};
const shot=async name=>{window.__omiShot=name;await wait(()=>!window.__omiShot,'screenshot');};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
await tap(button('打开资源库'));await wait(()=>card('Pages'),'library');
await wait(()=>/^1\/12 · 8% [\d.]+MB$/.test(card('Pages').querySelector('.mobile-card-pages').textContent),'loaded metadata: '+card('Pages').querySelector('.mobile-card-pages').textContent);


const touch=async(action,x,y=220)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'touch '+action);await pause(60);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
const drawerSamples=[];
for(const right of [false,true]){
  const start=right?innerWidth-12:12,sign=right?-1:1;
  await touch('down',start);
  for(const distance of [60,120,200,140,80]){
    await touch('move',start+sign*distance);
    await wait(()=>document.querySelector('.is-side-drawer .mobile-sheet'),'drawer');
    const panel=document.querySelector('.is-side-drawer .mobile-sheet'),box=panel.getBoundingClientRect();
    const expected=right?innerWidth-distance:-box.width+distance;
    assert(Math.abs(box.x-expected)<4,'Drawer did not follow finger: '+JSON.stringify({right,distance,x:box.x,expected}));
    drawerSamples.push({right,distance,x:Math.round(box.x),opacity:Number(getComputedStyle(document.querySelector('.mobile-sheet-backdrop')).opacity)});
    if(distance===140)await shot('android1111-'+(right?'right':'left')+'-partial');
  }
  await touch('up',start+sign*80);await wait(()=>!document.querySelector('.mobile-sheet-overlay'),'reversed drawer closed');
  // A longer opening and partial closing reversed back to open.
  await touch('down',start);await touch('move',start+sign*90);await touch('move',start+sign*250);await touch('up',start+sign*250);
  await pause(220);const panel=document.querySelector('.is-side-drawer .mobile-sheet');assert(panel,'Long opening vanished');
  const rect=panel.getBoundingClientRect(),inside=right?rect.x+40:rect.right-40;
  await touch('down',inside);await touch('move',inside-sign*100);await touch('move',inside-sign*25);await touch('up',inside-sign*25);await pause(220);
  assert(document.querySelector('.mobile-sheet'),'Closing reversal failed');await key();await wait(()=>!document.querySelector('.mobile-sheet-overlay'),'drawer fully dismissed');
}
const transitions=[],startTransition=document.startViewTransition?.bind(document);
assert(startTransition,'Packaged WebView lacks view transitions');
document.startViewTransition=update=>{transitions.push(document.documentElement.dataset.mobileNavigation);return startTransition(update);};
const list=api.listDirectory;api.listDirectory=async path=>{if(path===base+'/Deep24')await pause(400);return list(path);};
await tap(card('Deep24'));assert(card('Pages'),'Directory cleared before result');await wait(()=>card('L01'),'child directory');await key();await wait(()=>card('Pages'),'parent');api.listDirectory=list;
await tap(card('Pages').querySelector('[aria-label="打开资源信息"]'));await wait(()=>document.querySelector('.resource-detail-page'),'detail');await key();await wait(()=>card('Pages'),'detail back');
const image=api.getPageImage;api.getPageImage=async input=>{await pause(600);return image(input);};
await tap(card('Pages'));await wait(()=>document.querySelector('.mobile-reader-preparing'),'reader staging');assert(card('Pages'),'Old library removed before first page');await shot('android1111-reader-preparing');
await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader reveal');api.getPageImage=image;
const shown=()=>document.querySelector('.reader-page-frame:not([aria-hidden]) .reader-image');await wait(()=>shown()?.complete&&shown()?.naturalWidth,'decoded visible image');
await wait(()=>document.querySelector('[data-reader-page-index="1"] img')?.complete,'warm neighbour');
const warm=document.querySelector('[data-reader-page-index="1"] img');
let blanks=0,frames=0,active=true,maxGap=0,last=performance.now();
const probe=t=>{if(!active)return;frames++;maxGap=Math.max(maxGap,t-last);last=t;const img=shown();if(!img||!img.complete||!img.naturalWidth)blanks++;requestAnimationFrame(probe);};requestAnimationFrame(probe);
const go=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'page key');};
await go(22);await wait(()=>shown()?.alt===warm.alt,'next page');assert(shown()===warm,'Neighbour was remounted');
for(let n=0;n<6;n++){await go(22);await go(21);}
active=false;assert(blanks===0,'Blank reader frames: '+blanks);await shot('android1111-reader-warm');
await key();await wait(()=>card('Pages'),'reader back');await shot('android1111-library');
assert(transitions.includes('forward')&&transitions.includes('back'),'Missing scene transitions');
await shot('android-mobile-transitions');
return {drawerSamples,transitions,reader:{frames,blankFrames:blanks,maxFrameGapMs:Math.round(maxGap),warmNodeReused:true},version:(await api.getAppInfo()).version};
