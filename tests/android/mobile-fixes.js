// Final APK, neutral fixture files, native Android touch/key input.
const assert=(value,message)=>{if(!value)throw new Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+18000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(70);}};
const api=window.omicomic,value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root');
localStorage.removeItem('omi.mobile-directory-index.v2');
const base=root.path+'/Fixes116',book=await value(api.getResourcePages({path:base+'/Pages64',type:'folder'}));assert(book.total===64,'64 neutral pages');
await value(api.updateSettings({mobileLibraryLayout:'grid',mobileGridColumns:2,mobilePageSize:50,mobileReaderPreviews:true,mobilePreviewWidth:88,readerVolumeKeys:true,readerVolumeKeysReversed:false,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',readerPreloadPages:0,tagSearchMode:'fuzzy'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
const identity={resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'folder',title:'Pages64'};
await value(api.saveReadingProgress({...identity,title:'LongComicTitle'.repeat(20),currentPageIndex:0,totalPages:64,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
await value(api.updateResourceMeta({...identity,tags:['科幻'],note:'原始简介'}));
let shelf=initial.virtualFolders.find(f=>f.name==='测试文件夹书架');
if(!shelf)shelf=await value(api.createVirtualFolder({name:'测试文件夹书架',bookshelfId:initial.bookshelves[0].id}));
await value(api.addVirtualFolderItems({folderId:shelf.id,items:[identity]}));
await value(api.updateLibraryState({activeBookshelfId:shelf.bookshelfId}));
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const point=el=>{assert(el,'Missing touch target');const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+Math.min(60,r.height/2)};};
const tapAt=async target=>{await pause(350);const p=typeof target==='function'?target():target;window.__omiTap={...p,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const tap=async el=>{
  assert(el,'Missing tap');await pause(350);el.scrollIntoView({block:'nearest'});
  // Wait for keyboard/viewport animation before computing native coordinates.
  let previous=point(el),stable=0;for(let i=0;i<12&&stable<6;i++){await pause(120);const current=point(el);stable=Math.hypot(current.x-previous.x,current.y-previous.y)<1?stable+1:0;previous=current;}
  await tapAt(()=>point(el));
};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'native key');await pause(180);};
const drag=async(from,to,holdMs=80)=>{await pause(350);window.__omiDrag={from,to,holdMs,viewport:innerWidth};await wait(()=>!window.__omiDrag,'native drag');};
const shot=async name=>{await pause(300);window.__omiShot=name;await wait(()=>!window.__omiShot,'screenshot');};
const setInput=(el,text)=>{assert(el,'Input missing');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,String(text));el.dispatchEvent(new Event('input',{bubbles:true}));};
const cards=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')],card=name=>cards().find(el=>el.querySelector('strong')?.textContent===name);
const nav=name=>[...document.querySelectorAll('.sidebar-primary-nav button')].find(el=>el.textContent.includes(name));
await tap(button('打开资源库'));await wait(()=>document.querySelector('.mobile-page-pill'),'library pagination');
const pill=document.querySelector('.mobile-page-pill');assert(pill.getBoundingClientRect().width<170,'Pager too wide');
await tap(pill.querySelector('.mobile-page-number'));await wait(()=>document.querySelector('[aria-label="跳转页码输入"]'),'page jump input');
setInput(document.querySelector('[aria-label="跳转页码输入"]'),2);await tap(button('跳转'));await wait(()=>document.querySelector('.mobile-page-pill output')?.textContent==='2 / 2','jump page 2');await wait(()=>card('Pages64'),'Page 2 book');
// Measure drawer API work independently from library/cover requests.
const listDirectory=api.listDirectory;let reads=0;api.listDirectory=path=>{reads++;return listDirectory(path);};
await tap(button('资源库目录'));await wait(()=>button('展开 Fixes116'),'fixture tree');await tap(button('展开 Fixes116'));await wait(()=>button('ArchiveLeaf'),'leaf tree');
assert(!button('展开 ArchiveLeaf'),'Leaf has misleading expand icon');await wait(()=>!document.body.textContent.includes('正在读取目录'),'index completed');
const firstReads=reads;await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'drawer Back');
await tap(button('资源库目录'));await wait(()=>button('展开 Fixes116'),'cached drawer');await tap(button('展开 Fixes116'));await wait(()=>button('ArchiveLeaf'),'cached children');await pause(150);assert(reads===firstReads,'Reopening directory caused repeated reads');
assert(localStorage.getItem('omi.mobile-directory-index.v2')?.includes('ArchiveLeaf'),'Tree index missing on disk');await shot('android-fixes-directory');await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'drawer closed');api.listDirectory=listDirectory;
await tap(card('Pages64').querySelector('.mobile-card-info'));await wait(()=>document.querySelector('.resource-detail-page'),'detail');
await tap(button('添加标签'));assert(!document.querySelector('textarea[aria-label="资源简介"]'),'Adding tag opened note editor');setInput(document.querySelector('[aria-label="新标签"]'),'彩色');await tap(button('添加'));await wait(()=>button('移除标签：彩色'),'tag saved');
let meta=(await value(api.getAppData())).resourceMeta[book.resourceKey];assert(meta.note==='原始简介','Adding tags erased note');
await tap(document.querySelector('#resource-detail-title'));await tap(button('编辑简介'));assert(!button('移除标签：彩色'),'Editing note entered tag editing');setInput(document.querySelector('[aria-label="资源简介"]'),'独立修改后的简介');await tap(button('保存简介'));await wait(()=>!document.querySelector('textarea[aria-label="资源简介"]'),'note saved');
meta=(await value(api.getAppData())).resourceMeta[book.resourceKey];assert(meta.tags.includes('彩色')&&meta.note==='独立修改后的简介','Note save erased tags');
const tag=button('彩色');await drag(point(tag),point(tag),650);await wait(()=>button('移除标签：彩色'),'long press tags enters delete mode');await tap(document.querySelector('#resource-detail-title'));
const detail=document.querySelector('.resource-detail-page');detail.scrollTop=600;await wait(()=>document.querySelector('[aria-label="浮动预览分页"]'),'floating detail pager');
await shot('android-fixes-detail-pager');await tap(document.querySelector('[aria-label="浮动预览分页"] .mobile-page-number'));await wait(()=>document.querySelector('[aria-label="跳转页码输入"]'),'detail page input');setInput(document.querySelector('[aria-label="跳转页码输入"]'),2);await tap(button('跳转'));
// The short last group may expose the dock again when the browser clamps scroll.
await wait(()=>!document.querySelector('[aria-label="跳转页码输入"]')&&document.querySelector('.mobile-detail-page-dock output')?.textContent==='2 / 2','detail page input survives keyboard');
await key(4);await wait(()=>!document.querySelector('.resource-detail-page'),'detail Back');await tap(card('Pages64'));await wait(()=>document.querySelector('.reader-image')?.naturalWidth>0,'reader');
// Hold decoding of the actual destination DOM image to expose old-page removal.
const originalDecode=HTMLImageElement.prototype.decode;
HTMLImageElement.prototype.decode=async function(){await originalDecode.call(this);if(this.classList.contains('reader-image')&&this.closest('[data-reader-page-index="1"]'))await new Promise(resolve=>window.__releaseDecode=resolve);};
let probes=0,blankFrames=0,monitor=true;
const probe=()=>{if(!monitor)return;probes++;const ready=[...document.querySelectorAll('.reader-page-frame:not([aria-hidden="true"]) img')].some(el=>el.naturalWidth>0&&getComputedStyle(el).visibility==='visible');if(!ready)blankFrames++;requestAnimationFrame(probe);};requestAnimationFrame(probe);
await key(25);await wait(()=>typeof window.__releaseDecode==='function','destination DOM decode held');assert(document.querySelector('[data-reader-page-index="0"] img')?.naturalWidth>0,'Old decoded page disappeared');
window.__releaseDecode();await wait(()=>!document.querySelector('[data-reader-page-index="0"]'),'atomic page swap');HTMLImageElement.prototype.decode=originalDecode;
for(let i=2;i<6;i++){await key(25);await wait(()=>document.querySelector('.reader-page-frame:not([aria-hidden="true"])')?.getAttribute('data-reader-page-index')===String(i),'next decoded frame');}
monitor=false;assert(blankFrames===0,'Blank frames during non-panorama paging: '+blankFrames);await tap(document.querySelector('.reader-stage'));
const rail=document.querySelector('.reader-progress-rail'),r=rail.getBoundingClientRect();await drag({x:r.x+r.width*.1,y:r.y+r.height/2},{x:r.x+r.width*.5,y:r.y+r.height/2});await wait(()=>document.querySelector('.mobile-reader-previews'),'drag preview');assert(!button('收起页面预览'),'Preview close X retained');
const preview=document.querySelector('.mobile-reader-previews'),css=getComputedStyle(preview);assert(css.paddingTop===css.paddingBottom,'Preview padding unequal');await shot('android-fixes-reader-preview');
const before=rail.getAttribute('aria-valuenow');await tapAt({x:innerWidth-20,y:180});await wait(()=>!document.querySelector('.mobile-reader-previews'),'first outside touch dismisses strip');assert(rail.getAttribute('aria-valuenow')===before&&visible(document.querySelector('.reader-toolbar')),'Outside dismissal hid controls or paged');
await tap(button('阅读设置'));const box=document.querySelector('.mobile-sheet');assert(box.scrollWidth<=box.clientWidth+1,'Reader sheet overflow');await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'reader sheet Back');await key(4);await wait(()=>!document.querySelector('.reader-layout'),'reader Back');
await tap(button('显示选项'));await tap([...document.querySelectorAll('button')].find(el=>el.textContent.includes('标签管理')));await wait(()=>document.querySelector('.is-right-drawer'),'right tag drawer');assert(!document.querySelector('.is-right-drawer input'),'Tag manager has search input');await tap(button('选择'));await tap(button('全选'));await shot('android-fixes-tag-manager');await key(4);assert(document.querySelector('.is-right-drawer'),'Back skipped tag selection');await key(4);await wait(()=>!document.querySelector('.mobile-sheet'),'tag drawer Back');
await tap(button('显示选项'));await tap([...document.querySelectorAll('button')].find(el=>el.textContent.includes('应用设置')));await tap([...document.querySelectorAll('.mobile-setting-category')].find(el=>el.textContent.includes('漫画阅读设置')));await wait(()=>document.querySelector('.book-reader-settings'),'book settings');
const body=document.querySelector('.mobile-settings-body');assert(body.scrollWidth<=body.clientWidth+1,'Per-book settings width overflow');for(const el of body.querySelectorAll('.glass-select,input[type=range]')){const rect=el.getBoundingClientRect();assert(rect.x>=0&&rect.right<=innerWidth+1,'Setting beyond screen');}await shot('android-fixes-book-settings');
await key(4);await wait(()=>document.querySelectorAll('.mobile-setting-category').length===7,'settings category Back');await tap([...document.querySelectorAll('.mobile-setting-category')].find(el=>el.textContent.includes('资源库')));await tap(button('搜索匹配方式'));await tap(button('精准（全部条件）'));await key(4);await wait(()=>document.querySelectorAll('.mobile-setting-category').length===7,'search setting Back');await key(4);await wait(()=>!document.querySelector('.mobile-settings-page'),'settings closed');
assert((await value(api.getAppData())).settings.tagSearchMode==='exact','Search mode persistence');
await tap(nav('书架'));await wait(()=>document.querySelector('.mobile-bookshelf-card'),'folder shelf');const shelfCard=document.querySelector('.mobile-bookshelf-card');assert(shelfCard.querySelector('.mobile-bookshelf-stack'),'Stacked covers missing');await drag(point(shelfCard),point(shelfCard),650);await tap(button('排序'));assert(getComputedStyle(shelfCard).outlineStyle==='none','Dashed shelf outline');assert(getComputedStyle(shelfCard,'::after').backgroundColor==='rgba(112, 173, 225, 0.26)','Blue sorting mask missing');await shot('android-fixes-folder-shelf');await key(4);
return {nativeTouches:true,directoryReopenExtraReads:reads-firstReads,leafNoExpand:true,persistedDirectoryIndex:true,compactPagerDirectInput:true,detailPagerKeyboard:true,independentTagNoteSaves:true,longPressTagEdit:true,nonPanoramaFrameProbes:probes,blankFrames,firstOutsideDismiss:true,rightTagManagerNoSearch:true,settingsFitScreen:true,exactSearchSaved:true,folderPocketBlueSort:true,layeredBack:true};
