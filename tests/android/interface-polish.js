// Release APK verification with Android native taps, drags and Back events.
const assert=(value,message)=>{if(!value)throw new Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label+' '+JSON.stringify(window.__noteDebug||{}));await pause(80);}};
window.__noteDebug={events:[],taps:[]};window.addEventListener('pointerdown',e=>{window.__noteDebug.events.push({x:e.clientX,y:e.clientY,tag:e.target.tagName,cls:e.target.className,text:e.target.textContent?.slice(0,24),overlay:!!document.querySelector('.mobile-sheet-overlay,.root-delete-overlay')});if(window.__noteDebug.events.length>12)window.__noteDebug.events.shift();},true);
const api=window.omicomic,value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root');
const base=root.path+'/Mobile113',book=await value(api.getResourcePages({path:base+'/Pages',type:'folder'}));
const identity={resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'folder',title:'Pages'};
await value(api.updateSettings({colorTheme:'mist',mobileLibraryLayout:'grid',mobileGridColumns:2,mobileReaderPreviews:false,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({...identity,currentPageIndex:3,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
await value(api.updateResourceMeta({...identity,tags:['科幻','彩色'],note:'独立简介'}));
const covers=[identity,...['Pages64','Book01'].map(title=>({resourceKey:'folder:'+root.path+'/Fixes116/'+title,sourcePath:root.path+'/Fixes116/'+title,sourceType:'folder',title}))];
let shelf=initial.virtualFolders.find(item=>item.name==='三层封面验证');
if(!shelf)shelf=await value(api.createVirtualFolder({name:'三层封面验证',bookshelfId:initial.bookshelves[0].id}));
await value(api.addVirtualFolderItems({folderId:shelf.id,items:covers}));await value(api.updateLibraryState({activeBookshelfId:shelf.bookshelfId}));
const deletePath=root.path+'/Fixes116/ArchiveLeaf';await value(api.addLibraryRoot({path:deletePath,name:'仅索引删除验证'}));
const sourceBefore=await value(api.listDirectory(deletePath));
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const point=el=>{assert(el,'Missing touch target');const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+Math.min(60,r.height/2)};};
const tapAt=async target=>{await pause(350);const p=typeof target==='function'?target():target;window.__omiTap={...p,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const tap=async el=>{
  assert(el,'Missing tap');await pause(350);el.scrollIntoView({block:'nearest'});
  // Wait for keyboard/viewport animation before computing native coordinates.
  let previous=point(el),stable=0;for(let i=0;i<12&&stable<6;i++){await pause(120);const current=point(el);stable=Math.hypot(current.x-previous.x,current.y-previous.y)<1?stable+1:0;previous=current;}
  const pt=point(el);window.__noteDebug.taps.push({intended:el.className||el.getAttribute('aria-label'),point:pt,hit:document.elementFromPoint(pt.x,pt.y)?.className,h:innerHeight,scroll:document.querySelector('.resource-detail-page')?.scrollTop});await tapAt(()=>point(el));
};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'native key');await pause(180);};
const drag=async(from,to,holdMs=80)=>{await pause(350);window.__omiDrag={from,to,holdMs,viewport:innerWidth};await wait(()=>!window.__omiDrag,'native drag');};
const shot=async name=>{await pause(300);window.__omiShot=name;await wait(()=>!window.__omiShot,'screenshot');};
const setInput=(el,text)=>{assert(el,'Input missing');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,String(text));el.dispatchEvent(new Event('input',{bubbles:true}));};
const cards=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')],card=name=>cards().find(el=>el.querySelector('strong')?.textContent===name);
const nav=name=>[...document.querySelectorAll('.sidebar-primary-nav button')].find(el=>el.textContent.includes(name));

const home=button('打开资源库');assert(home.textContent.includes('进入资源库'),'Home entry label');
await tap(home);await wait(()=>card('Pages'),'mobile library');
await wait(()=>card('Pages')?.querySelector('.mobile-card-pages')?.textContent.includes('/12页') && card('Pages')?.querySelector('.mobile-card-info'),'loaded page metadata');assert(getComputedStyle(card('Pages').querySelector('.mobile-card-pages')).borderRadius==='0px','Page capsule remains');
await tap(card('Pages').querySelector('.mobile-card-info'));await wait(()=>document.querySelector('.resource-detail-page'),'detail');
await drag(point(button('科幻')),point(button('科幻')),650);await wait(()=>button('移除标签：科幻'),'long press edits tags');assert(!button('完成'),'Redundant Done button');assert(!document.querySelector('textarea'),'Tag edit opened notes');
await tap(document.querySelector('#resource-detail-title'));await wait(()=>!button('移除标签：科幻'),'outside exits tags');
await tap(button('编辑简介'));setInput(document.querySelector('[aria-label="资源简介"]'),'界面 1.1.7 原生保存');await tap(document.querySelector('.resource-detail-direct-tags .resource-detail-field-label'));await wait(()=>!document.querySelector('textarea'),'outside saves note');
assert((await value(api.getAppData())).resourceMeta[book.resourceKey].note==='界面 1.1.7 原生保存','Note not persisted');
await shot('android117-detail');await key(4);await wait(()=>!document.querySelector('.resource-detail-page'),'detail Back');
await tap(card('Pages'));await wait(()=>document.querySelector('.reader-image'),'reader');await tap(document.querySelector('.reader-stage'));await tap(button('阅读设置'));
await tap(button('开启全景连环画'));await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'close settings');
const rail=document.querySelector('[aria-label="阅读进度"]');const before=Number(rail.getAttribute('aria-valuenow'));assert(before===4,'Resume page');
const x=index=>document.querySelector('[data-reader-page-index="'+index+'"]')?.getBoundingClientRect().x;
await wait(()=>x(4)>x(3),'LTR page order');await tap(button('阅读设置'));await tap(button('当前从左到右阅读，点击切换为从右到左'));await key(4);await wait(()=>x(4)<x(3),'RTL page order');assert(Number(rail.getAttribute('aria-valuenow'))===before,'Changing direction changed page');
const stage=document.querySelector('.reader-stage').getBoundingClientRect();await drag({x:stage.x+stage.width*.18,y:stage.y+stage.height*.5},{x:stage.x+stage.width*.85,y:stage.y+stage.height*.5});await wait(()=>Number(rail.getAttribute('aria-valuenow'))>before,'RTL native drag advances');
await shot('android117-panorama-rtl');await key(4);await wait(()=>document.querySelector('.page-panel.is-visible .mobile-library-bar'),'reader Back');
// Tag drawer opens by swiping left; its first Back closes just that layer.
await drag({x:innerWidth-28,y:180},{x:65,y:180});await wait(()=>document.querySelector('[aria-label="标签管理"]'),'left swipe tag manager');assert(getComputedStyle(document.querySelector('.mobile-sheet-overlay')).backdropFilter==='none','Tag overlay blur');await shot('android117-tags');await key(4);
await tap(button('资源库目录'));await wait(()=>button('管理资源库 仅索引删除验证'),'root menu');await tap(button('管理资源库 仅索引删除验证'));await wait(()=>button('删除资源库'),'delete root action');assert(!button('完成'),'Root menu Done button');
await tapAt({x:innerWidth-12,y:200});await wait(()=>!button('删除资源库'),'blank closes top sheet');assert(document.querySelector('[aria-label="资源库"]'),'Blank closed parent drawer');
await tap(button('管理资源库 仅索引删除验证'));await tap(button('删除资源库'));await wait(()=>document.querySelector('#root-delete-title'),'confirm root');const confirm=document.querySelector('.root-delete-overlay'),deleteButton=[...confirm.querySelectorAll('button')].find(b=>b.textContent.trim()==='删除');assert(document.elementFromPoint(point(deleteButton).x,point(deleteButton).y).closest('.root-delete-overlay'),'Confirmation covered by drawer');await shot('android117-root-confirm');await tap(deleteButton);await wait(()=>!document.querySelector('.root-delete-overlay'),'root removed');assert(!(await value(api.getAppData())).library.roots.some(r=>r.path===deletePath),'Root index retained');const sourceAfter=await value(api.listDirectory(deletePath));assert(JSON.stringify(sourceBefore.items.map(i=>i.name))===JSON.stringify(sourceAfter.items.map(i=>i.name)),'Deleting index changed source files');await key(4);
await tap(nav('书架'));await wait(()=>document.querySelector('[data-shelf-id="'+shelf.id+'"] .mobile-shelf-layer img'),'shelf first cover');const shelfEl=document.querySelector('[data-shelf-id="'+shelf.id+'"]');shelfEl.scrollIntoView({block:'center'});await wait(()=>shelfEl.querySelectorAll('.mobile-shelf-layer img').length===3,'three shelf covers');assert(new Set([...shelfEl.querySelectorAll('img')].map(i=>i.src)).size===3,'Distinct covers missing');await shot('android117-shelves');
await tap(button('书架分类'));const category=initial.bookshelves.find(s=>s.id===shelf.bookshelfId);await tap(button('管理分类 '+category.name));await tap(button('重命名分类'));await wait(()=>document.querySelector('.root-delete-overlay input'),'rename on drawer');const input=document.querySelector('.root-delete-overlay input');assert(document.elementFromPoint(point(input).x,point(input).y).closest('.root-delete-overlay'),'Rename covered by drawer');await shot('android117-category-rename');for(let i=0;i<2&&document.querySelector('.root-delete-overlay');i++)await key(4);await wait(()=>!document.querySelector('.root-delete-overlay'),'rename Back closes dialog');assert(document.querySelector('[aria-label="书架分类"]'),'Rename Back closed drawer');await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'category drawer Back');
for(const theme of ['夜色','暖沙']){
  await tap(button('显示选项'));await tap(button('应用设置'));await tap(button('外观与主题配色、卡片布局与缩略预览'));
  await tap(button('界面主题'));await wait(()=>document.querySelector('[role="listbox"]'),'theme menu');const option=[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()===theme);await tap(option);await key(4);await key(4);await tap(button('书架分类'));await shot('android117-'+(theme==='夜色'?'night':'sand')+'-drawer');assert(getComputedStyle(document.querySelector('.mobile-sheet-overlay')).backdropFilter==='none','Theme overlay blur');await key(4);
}
await value(api.updateSettings({colorTheme:'mist'}));
return {panoramaRTL:true,nativeDrag:true,metadataIndependent:true,sourceFilesPreserved:true,stackedCovers:3,dialogsAboveDrawers:true,tagSwipe:true,themes:['night','sand']};
