const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+15000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(60);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root missing');
const base=root.path+'/Mobile113',book=await value(api.getResourcePages({path:base+'/Pages',type:'folder'}));
await value(api.updateSettings({colorTheme:'mist',mobileLibraryLayout:'grid',mobileGridColumns:2,readerPreloadPages:2,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',doublePageDirection:'left-to-right'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'folder',title:'Pages',hasStartedReading:true,currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false,autoRead:{intervalSeconds:3,scrollPixelsPerSecond:80}}}));
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tapAt=async p=>{window.__omiTap={...p,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const tap=async el=>{assert(el,'Missing target');el.scrollIntoView({block:'nearest'});await pause(300);const r=el.getBoundingClientRect();await tapAt({x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2)});};
const key=async()=>{window.__omiKey=4;await wait(()=>!window.__omiKey,'Back');await pause(220);};
const drag=async(from,to)=>{window.__omiDrag={from,to,holdMs:80,viewport:innerWidth};await wait(()=>!window.__omiDrag,'native drag');await pause(240);};
const shot=async name=>{window.__omiShot=name;await wait(()=>!window.__omiShot,'screenshot');};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
await tap(button('打开资源库'));await wait(()=>card('Pages'),'library');
await wait(()=>/^1\/12 · 8% [\d.]+MB$/.test(card('Pages').querySelector('.mobile-card-pages').textContent),'loaded metadata: '+card('Pages').querySelector('.mobile-card-pages').textContent);

const drawerRuns=[];let reads=0;const list=api.listDirectory;api.listDirectory=(...args)=>{reads++;return list(...args);};
for(const right of [false,true]){
  if(right){await tap(button('显示选项'));await tap(button('标签管理'));}else await tap(button('资源库目录'));
  await wait(()=>document.querySelector('.is-side-drawer .mobile-sheet'),'drawer');await pause(500);
  const panel=document.querySelector('.is-side-drawer .mobile-sheet'),shade=document.querySelector('.mobile-sheet-backdrop'),samples=[];let active=true,last=performance.now();
  const sample=t=>{if(!active)return;if(panel.isConnected)samples.push({x:panel.getBoundingClientRect().x,opacity:Number(getComputedStyle(shade).opacity),dt:t-last});last=t;requestAnimationFrame(sample);};requestAnimationFrame(sample);
  await drag({x:right?120:250,y:250},{x:right?280:95,y:252});await wait(()=>!panel.isConnected,'drawer exit');active=false;
  assert(samples.length>=4,'Missing drawer samples');let resets=0;for(let i=1;i<samples.length;i++)if((samples[i].x-samples[i-1].x)*(right?1:-1)<-2)resets++;
  assert(resets===0,'Drawer flashed to its open position');drawerRuns.push({side:right?'right':'left',samples:samples.length,resetFrames:resets});
  if(!right){const before=reads;await tap(button('资源库目录'));await pause(500);assert(reads===before,'Warm drawer reread directories');await key();}
}

let flashes=0,observing=true;
const flashProbe=()=>{if(!observing)return;for(const el of document.querySelectorAll('.library-opening-status,.global-glass-tooltip,.loading-mark,.book-reader-settings [role="status"]'))if(visible(el))flashes++;requestAnimationFrame(flashProbe);};requestAnimationFrame(flashProbe);
const originalList=api.listDirectory;api.listDirectory=async path=>{if(path===base+'/Deep24')await pause(1000);return originalList(path);};
await tap(card('Deep24'));await pause(250);assert(card('Pages'),'Old directory was blanked while reading');await wait(()=>card('L01'),'next directory');await key();await wait(()=>card('Pages'),'back to parent');api.listDirectory=originalList;
const originalPages=api.getResourcePages;api.getResourcePages=async input=>{if(input.path===book.sourcePath)await pause(1000);return originalPages(input);};
await tap(card('Pages'));await wait(()=>document.querySelector('.reader-image')?.complete,'reader');api.getResourcePages=originalPages;observing=false;assert(flashes===0,'Transient filename/loading overlay');
await tap(document.querySelector('.reader-stage'));await tap(button('阅读设置'));await tap(button('当前从左到右阅读，点击切换为从右到左'));await key();
const rail=document.querySelector('[aria-label="阅读进度"]'),current=document.querySelector('.mobile-reader-current'),total=document.querySelector('.mobile-reader-total');
let r=rail.getBoundingClientRect(),c=current.getBoundingClientRect(),t=total.getBoundingClientRect(),glyph=document.querySelector('.mobile-reader-play svg').getBoundingClientRect();
assert(t.x<r.x&&c.x>r.right,'RTL number placement');assert(Math.abs(glyph.y+glyph.height/2-r.y-r.height/2)<1,'Play icon not centered');
assert(getComputedStyle(document.querySelector('.reader-stage')).backgroundColor==='rgb(239, 239, 237)','Mist reader tint');await shot('android1110-rtl-reader');

const playing=()=>document.querySelector('.mobile-reader-play').getAttribute('aria-pressed')==='true',page=()=>Number(rail.getAttribute('aria-valuenow'));
await tap(button('开始自动阅读'));assert(playing()&&visible(document.querySelector('.mobile-reader-play')),'Playback icon hidden or not toggled');const first=page();await wait(()=>page()>first,'automatic page');
await tapAt({x:innerWidth/2,y:250});assert(playing(),'Comic tap stopped playback');await tapAt({x:innerWidth/2,y:250});assert(playing(),'Toolbar toggle stopped playback');
await tap(button('阅读设置'));const held=page();await pause(3300);assert(page()===held&&playing(),'Settings did not temporarily hold playback');await key();await wait(()=>page()>held,'continue after settings');
await tap(button('暂停自动阅读'));assert(!playing(),'Pause toggle failed');const stopped=page();await pause(3300);assert(page()===stopped,'Paused reader advanced');
await tap(button('开始自动阅读'));await tap(button('阅读设置'));window.dispatchEvent(new Event('omi-pause'));await wait(()=>!playing(),'background stop');await key();
const resumedFrom=page();await tap(button('开始自动阅读'));await wait(()=>page()>resumedFrom,'explicit restart after background');await tap(button('暂停自动阅读'));
await tap(button('阅读设置'));await tap(button('开启全景连环画'));await key();await tap(button('开始自动阅读'));
const frame=document.querySelector('.reader-page-frame'),start=frame.getBoundingClientRect();await pause(600);await tapAt({x:innerWidth/2,y:250});assert(playing(),'Panorama tap stopped playback');await pause(800);const end=frame.getBoundingClientRect();assert(Math.abs(end.x-start.x)+Math.abs(end.y-start.y)>20,'Panorama did not keep moving');
await tapAt({x:innerWidth/2,y:250});await tap(button('暂停自动阅读'));await key();
return {nativeTouches:true,drawerRuns,directoryReopenExtraReads:0,transientLoadingFrames:flashes,rtlNumbers:true,playGlyphCentered:true,manualTapKeepsPlaying:true,settingsHoldAndResume:true,explicitPause:true,backgroundRestart:true,panoramaContinues:true,mistBackground:'#efefed'};
