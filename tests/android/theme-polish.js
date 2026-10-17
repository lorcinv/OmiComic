const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+15000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(60);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root missing');
const base=root.path+'/Mobile113',book=await value(api.getResourcePages({path:base+'/Pages',type:'folder'}));
await value(api.updateSettings({colorTheme:'mist',mobileLibraryLayout:'grid',mobileGridColumns:2,mobileReaderPreviews:true,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'folder',title:'Pages',currentPageIndex:3,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const point=el=>{assert(el,'Touch target missing');const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2)};};
const tapAt=async p=>{window.__omiTap={...p,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const tap=async el=>{assert(el,'Missing tap target');el.scrollIntoView({block:'nearest'});await pause(450);await tapAt(point(el));};
const key=async()=>{window.__omiKey=4;await wait(()=>!window.__omiKey,'Back');await pause(280);};
const drag=async(from,to)=>{window.__omiDrag={from,to,holdMs:80,viewport:innerWidth};await wait(()=>!window.__omiDrag,'native drag');await pause(250);};
const shot=async name=>{window.__omiShot=name;await wait(()=>!window.__omiShot,'screenshot');};
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent==='Pages');
await tap(button('打开资源库'));await wait(()=>card()?.querySelector('.mobile-card-pages')?.textContent.includes('33%'),'card progress');
const meta=card().querySelector('.mobile-card-pages');assert(/^4\/12 · 33% [\d.]+MB$/.test(meta.textContent),'Metadata format '+meta.textContent);assert(getComputedStyle(meta).backgroundColor==='rgba(0, 0, 0, 0)','Capsule remains');
await shot('android1110-library');
let reads=0;const list=api.listDirectory;api.listDirectory=(...args)=>{reads++;return list(...args);};
const frames=[];let sample=true,last=performance.now();
const frame=t=>{if(!sample)return;const panel=document.querySelector('.mobile-sheet-overlay.is-side-drawer .mobile-sheet');if(panel)frames.push({dt:t-last,x:panel.getBoundingClientRect().x,blur:getComputedStyle(panel).backdropFilter});last=t;requestAnimationFrame(frame);};requestAnimationFrame(frame);
await tap(button('资源库目录'));await wait(()=>document.querySelector('.is-side-drawer .mobile-sheet'),'left drawer');await pause(300);const afterFirst=reads;await key();await wait(()=>!document.querySelector('.mobile-sheet'),'left Back');
await tap(button('资源库目录'));await pause(400);assert(reads===afterFirst,'Drawer reopened with directory reread');await drag({x:250,y:240},{x:100,y:242});await wait(()=>!document.querySelector('.mobile-sheet'),'left swipe close');
await tap(button('显示选项'));await tap(button('标签管理'));await wait(()=>document.querySelector('.is-right-drawer'),'right drawer');await tap(button('选择'));await tap(button('全选'));await key();await wait(()=>button('选择'),'Back exits tag selection');assert(document.querySelector('.is-right-drawer'),'Back closed tags before leaving selection');await key();await wait(()=>!document.querySelector('.mobile-sheet'),'second Back closes tags');await tap(button('显示选项'));await tap(button('标签管理'));await drag({x:150,y:240},{x:300,y:242});await wait(()=>!document.querySelector('.mobile-sheet'),'right swipe close');sample=false;
assert(frames.length>5,'Drawer frame samples missing');assert(frames.every(f=>f.blur==='none'),'Drawer blur remains');assert(new Set(frames.map(f=>Math.round(f.x))).size>4,'Drawer does not animate');
await tap(card().querySelector('.resource-preview'));await wait(()=>document.querySelector('.reader-image'),'reader');await tap(document.querySelector('.reader-stage'));await tap(button('阅读设置'));await tap(button('开启全景连环画'));await key();await wait(()=>!document.querySelector('.mobile-sheet'),'reader settings closed');
const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect(),y=r.y+r.height/2;
await drag({x:r.x+5,y},{x:r.x+r.width*.45,y});await wait(()=>document.querySelector('.mobile-reader-previews'),'filmstrip');const film=getComputedStyle(document.querySelector('.mobile-reader-previews'));assert(film.backdropFilter==='none','Filmstrip blur remains');assert(/\/ 0\.5\)/.test(film.backgroundColor),'Filmstrip opacity '+film.backgroundColor);await shot('android1110-filmstrip');
await tapAt({x:innerWidth/2,y:230});await wait(()=>!document.querySelector('.mobile-reader-previews'),'outside dismiss');assert(visible(document.querySelector('.reader-footer')),'Outside tap hid controls');
const layers={frames:0,violations:0};let sampleLayers=true;
const check=()=>{if(!sampleLayers)return;if(document.querySelector('.reader-panorama-jump-ghost')){layers.frames++;for(const bar of document.querySelectorAll('.reader-toolbar,.reader-footer')){const r=bar.getBoundingClientRect(),hit=document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2);if(hit.indexOf(bar)>hit.findIndex(el=>el.classList.contains('reader-stage')))layers.violations++;}}requestAnimationFrame(check);};requestAnimationFrame(check);
await tapAt({x:r.x+r.width*.85,y});await pause(1400);sampleLayers=false;assert(layers.frames>3,'Jump animation not sampled');assert(layers.violations===0,'Comic covered a reader bar');await key();await wait(()=>!document.querySelector('.reader-layout'),'Back to library');
const colors=[];
for(const [theme,name] of [['mist','雾蓝'],['nord','北境'],['sand','暖沙'],['night','夜色']]){
  await tap(button('显示选项'));await tap(button('应用设置'));await tap(button('外观与主题配色、卡片布局与缩略预览'));await tap(button('界面主题'));await tap([...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.replace('✓','').trim()===name));await key();await key();
  assert(document.documentElement.dataset.colorTheme===theme,'Theme switch');await tap(button('资源库目录'));await shot('android1110-'+theme+'-drawer');const style=getComputedStyle(document.querySelector('.mobile-sheet'));colors.push({theme,color:style.color,background:style.backgroundColor});await key();await wait(()=>!document.querySelector('.mobile-sheet'),'theme drawer closed');
}
await tap(button('显示选项'));await tap(button('应用设置'));await tap(button('性能与缓存图片缓存、预加载与并发'));
for(const [label,amount,keyName] of [['阅读页面磁盘缓存',640,'readerLimit'],['封面与预览磁盘缓存',192,'thumbnailLimit']]){
 const input=document.querySelector('input[aria-label="'+label+'"]');assert(input,'Cache control missing');
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(amount));input.dispatchEvent(new Event('input',{bubbles:true}));
 await wait(async()=> (await value(api.getAndroidCacheInfo()))[keyName]===amount*1048576,'Cache slider applied');
}
await shot('android1110-cache-settings');await tap(button('清理磁盘缓存'));await wait(async()=>{const c=await value(api.getAndroidCacheInfo());return c.readerBytes===0&&c.thumbnailBytes===0;},'clear cache');
assert((await value(api.getResourcePages({path:base+'/Pages',type:'folder'}))).total===12,'Clearing cache changed source comic');
await value(api.updateSettings({androidReaderDiskCacheSizeMb:512,androidThumbnailCacheSizeMb:128}));await key();await key();
return {metadata:meta.textContent,drawerFrames:frames.length,drawerPositions:new Set(frames.map(f=>Math.round(f.x))).size,drawerFrameP95:frames.map(f=>f.dt).sort((a,b)=>a-b)[Math.floor(frames.length*.95)],directoryReopenExtraReads:0,tagSelectionBack:true,previewBlur:'none',previewOpacity:.5,jumpLayers:layers,themes:colors,cacheSettingsApplied:true,clearCachePreservesComic:true};
