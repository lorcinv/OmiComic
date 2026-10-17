const assert=(v,m)=>{if(!v)throw new Error(m);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(100);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const root=(await value(api.getAppData())).library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Test grant');
const base=root.path+'/Update112',sorting=[];
const button=(label,parent=document)=>[...parent.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')===label||b.textContent.trim()===label)&&b.getBoundingClientRect().width>0);
let lastTouch=0;
const tap=async element=>{
  assert(element,'Missing tap target');
  await pause(Math.max(0,400-(Date.now()-lastTouch)));
  element.scrollIntoView({block:'center',behavior:'instant'});
  await wait(()=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&element.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));},'touch target settled');
  const rect=element.getBoundingClientRect();assert(rect.width>0&&rect.height>0,'Invisible tap target');
  window.__omiTap={x:rect.left+rect.width/2,y:rect.top+rect.height/2,viewport:innerWidth};
  await wait(()=>window.__omiTap===null,'native touch');
  lastTouch=Date.now();
};
const setRange=(label,n)=>{
  const input=document.querySelector('input[aria-label="'+label+'"]');assert(input&&!input.disabled,'Slider '+label);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(n));input.dispatchEvent(new Event('input',{bubbles:true}));
};
for(const [name,type] of [['Pages','folder'],['Sorted.cbz','archive']]){
  const resource=await value(api.getResourcePages({path:base+'/'+name,type}));
  assert(resource.pages.every(p=>p.modifiedAt>0),'Native modification times absent: '+name);
  const current=resource.pages.find(p=>p.name==='1.png');
  for(const mark of await value(api.getBookmarks()))if(mark.resourceKey===resource.resourceKey)await value(api.removeBookmark(mark.id));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:type,title:name,currentPageIndex:0,currentPageId:current.pageId,currentPageName:current.name,totalPages:3}));
  await value(api.toggleBookmark({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:type,title:name,pageIndex:0,pageId:current.pageId,pageName:current.name,archiveInnerPath:current.archiveInnerPath,totalPages:3}));
  const orders=[];
  for(const [mode,expected] of [['name-desc','10.png|2.png|1.png'],['time-asc','2.png|10.png|1.png'],['time-desc','1.png|10.png|2.png']]){
    const result=await value(api.setReaderPageSort({path:resource.sourcePath,type,mode,currentPageId:current.pageId}));
    assert(result.resource.pages.map(p=>p.name).join('|')===expected,'Wrong '+mode+' order for '+name);
    assert(result.resource.pages[result.progress.currentPageIndex].pageId===current.pageId,'Reading identity moved');
    const bookmark=(await value(api.getBookmarks())).find(b=>b.resourceKey===resource.resourceKey);
    assert(bookmark.pageId===current.pageId&&bookmark.pageIndex===result.progress.currentPageIndex,'Bookmark moved');
    orders.push(mode);
  }
  await value(api.setReaderPageSort({path:resource.sourcePath,type,mode:'name-asc',currentPageId:current.pageId}));
  sorting.push({name,orders,bookmarkAndProgressRetained:true});
}
const collection=await value(api.getThumbnail({path:base+'/Collection',type:'folder'}));assert(collection.itemCount===2,'Collection counts image pages or unrelated files');
assert(!('itemCount' in await value(api.getThumbnail({path:base+'/Pages',type:'folder'}))),'Image folder counted as a collection');
const epub=await value(api.getThumbnail({path:base+'/Covered.epub',type:'epub'}));
for(const url of [collection.url,epub.url]){const image=new Image();image.src=url;await image.decode();assert(image.naturalWidth>0,'Cover failed to decode');}
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await tap(button('打开资源库'));await wait(()=>document.querySelector('.resource-card'),'library');
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .resource-card')].find(c=>c.querySelector('.resource-details strong')?.textContent===name);
await wait(()=>card('Document.pdf')?.querySelector('img')?.naturalWidth>0,'PDF cover');
await tap(card('Pages'));await wait(()=>document.querySelector('.reader-image')?.naturalWidth>0,'reader');
await tap(button('画面调整'));await wait(()=>document.querySelector('.reader-tool-panel'),'adjustments');
const panel=document.querySelector('.reader-tool-panel').getBoundingClientRect();assert(panel.left>=0&&panel.right<=innerWidth+1&&panel.bottom<=innerHeight+1,'Panel overflows phone');
assert(document.querySelector('.reader-toolbar').getBoundingClientRect().height<=110,'Toolbar wastes phone reading space');
window.dispatchEvent(new Event('omi-back'));await wait(()=>!document.querySelector('.reader-tool-panel'),'system back closes adjustments');
assert(document.querySelector('.reader-layout'),'System back exited reading before closing panel');await tap(button('画面调整'));
setRange('伽马',1.4);setRange('锐化',70);setRange('降噪',45);await tap(button('关闭面板'));
await wait(()=>document.querySelector('.reader-effects[data-processing="ready"]'),'real worker result');
assert(document.querySelector('.reader-processed-image')?.naturalWidth>0,'Processed image missing');
await tap(button('返回'));await wait(()=>!document.querySelector('.reader-layout'),'reader back');
await tap(button('设置'));await wait(()=>document.querySelector('.settings-window'),'settings');
await tap([...document.querySelectorAll('[role=tab]')].find(t=>t.textContent.startsWith('阅读器')));
await wait(()=>document.querySelector('[aria-label="翻页间隔"]'),'per-book settings');
setRange('翻页间隔',1);setRange('滚动速度',150);await wait(()=>document.querySelector('.book-reader-settings')?.getAttribute('aria-busy')==='false','settings persisted');
const sort=document.querySelector('[aria-label="页面排序"]');await tap(sort);
await wait(()=>document.querySelector('[role=option]'),'sort options');
assert([...document.querySelectorAll('[role=option]')].filter(o=>o.textContent.includes('修改时间')).every(o=>o.getAttribute('aria-disabled')!=='true'),'Time sort disabled');
await tap([...document.querySelectorAll('[role=option]')].find(o=>o.textContent==='文件名自然降序'));
await wait(()=>document.querySelector('.book-reader-settings')?.getAttribute('aria-busy')==='false','sort persisted');
await tap(button('关闭设置'));await tap(card('Pages'));await wait(()=>document.querySelector('.reader-footer input[aria-label]')?.value==='3','resume same image after reverse');
await tap(button('上一页'));await wait(()=>document.querySelector('.reader-footer input[aria-label]')?.value==='2','page two');
await tap(button('开始自动阅读'));await wait(()=>document.querySelector('.reader-footer input[aria-label]')?.value==='3','automatic next');
await wait(()=>button('开始自动阅读'),'end stops');
await tap(button('上一页'));await tap(button('开始自动阅读'));window.dispatchEvent(new Event('omi-pause'));
await wait(()=>button('开始自动阅读'),'background pauses');await pause(1300);
assert(document.querySelector('.reader-footer input[aria-label]').value==='2','Background kept playing');
await tap(button('开启全景连环画'));await wait(()=>document.querySelector('.reader-stage.is-panorama'),'panorama');
const translation=()=>document.querySelector('.reader-page-spread').style.getPropertyValue('--reader-panorama-translate');
const before=translation();await tap(button('开始自动阅读'));
await wait(()=>translation()!==before,'continuous automatic scrolling');
await tap(button('暂停自动阅读'));await tap(button('关闭全景连环画'));
await tap(button('返回'));await wait(()=>!document.querySelector('.reader-layout'),'back before documents');
const documents=[];
for(const name of ['Document.pdf','Covered.epub']){
  await tap(card(name));await wait(()=>document.querySelector('.reader-layout'),'document '+name);
  await wait(()=>name.endsWith('.pdf')?document.querySelector('.reader-page-spread canvas')?.width>0:document.querySelector('.reader-chapter iframe')?.contentDocument?.body?.textContent.includes('Android Chapter'),'document ready');
  await tap(button('画面调整'));setRange('伽马',1.2);
  if(name.endsWith('.pdf')){setRange('锐化',50);setRange('降噪',20);await tap(button('关闭面板'));await wait(()=>document.querySelector('.reader-effects[data-processing="ready"]'),'PDF worker');}
  else{assert(document.querySelector('[aria-label="锐化"]').disabled&&document.querySelector('[aria-label="降噪"]').disabled,'EPUB raster not disabled');await tap(button('关闭面板'));}
  documents.push({name,effects:true,raster:name.endsWith('.pdf')});await tap(button('返回'));await wait(()=>!document.querySelector('.reader-layout'),'document back');
}
await tap(card('Pages'));await wait(()=>document.querySelector('.reader-image')?.naturalWidth>0,'final reader');
await tap(button('画面调整'));
assert(document.querySelector('input[aria-label="伽马"]').value==='1.4','Per-book image settings lost');
assert(document.documentElement.scrollWidth<=innerWidth,'Phone horizontal overflow');
return {sorting,covers:{collection:true,epub:true,pdf:true},phonePanelFits:true,worker:true,autoPage:true,autoScroll:true,endStops:true,backgroundPauses:true,documents,nativeTouches:true};
