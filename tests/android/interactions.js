const assert=(value,message)=>{if(!value)throw new Error(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+30000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(100);}};
const api=window.omicomic;
const value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const root=(await value(api.getAppData())).library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Test grant');
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path}));
assert(!(await api.openDocument({path:root.path+'/Unsafe.epub',type:'epub',id:'unsafe'})).ok,'EPUB DTD was accepted');
const match=window.matchMedia.bind(window);window.matchMedia=query=>{const m=match(query);if(query.includes('pointer:'))Object.defineProperty(m,'matches',{value:false});return m;};
let doubleClicks=0;window.addEventListener('dblclick',()=>doubleClicks++);
const tap=async element=>{
  assert(element,'Tap target absent');element.scrollIntoView({block:'center'});await pause(150);
  const rect=element.getBoundingClientRect();assert(rect.width>0&&rect.height>0,'Tap target invisible');
  window.__omiTap={x:rect.left+rect.width/2,y:rect.top+rect.height/2,viewport:innerWidth};
  await wait(()=>window.__omiTap===null,'instrumented touch');
};
const names=['Picture Book','Renamed.cbz','RAR5.cbr','Solid.cb7','Document.pdf','Story.epub'];
for(const name of names){
  const resource=await value(api.getResourcePages({path:root.path+'/'+name}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:resource.title,currentPageIndex:0,totalPages:name.endsWith('.epub')?2:3}));
}
await tap(document.querySelector('[aria-label="打开资源库"]'));
await wait(()=>document.querySelector('.page-panel.is-visible .resource-card'),'library');
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .resource-card')].find(c=>c.textContent.includes(name));
const results=[];
for(const name of names){
  const start=performance.now();await tap(card(name));
  await wait(()=>document.querySelector('.reader-layout'),'single-tap reader '+name);
  const page=()=>document.querySelector('.reader-footer input[aria-label]');
  await wait(()=>page()?.value==='1','page one '+name);
  if(name.endsWith('.pdf'))await wait(()=>document.querySelector('.reader-page-spread canvas')?.width>0,'PDF raster');
  else if(name.endsWith('.epub'))await wait(()=>document.querySelector('.reader-chapter iframe')?.contentDocument?.body.textContent.includes('Android Chapter One'),'EPUB chapter');
  else await wait(()=>[...document.querySelectorAll('.reader-page-spread img')].some(i=>i.complete&&i.naturalWidth>0),'decoded image');
  const firstPageMs=Math.round(performance.now()-start);
  await tap([...document.querySelectorAll('.reader-layout button')].find(b=>b.getAttribute('aria-label')==='下一页'||b.textContent.trim()==='下一页'));
  await wait(()=>page()?.value==='2','page two '+name);
  await wait(async()=>Object.values((await value(api.getAppData())).readingProgress).some(p=>p.sourcePath.endsWith(name)&&p.currentPageIndex===1),'saved progress');
  results.push({name,nativeSingleTouch:true,firstPageMs,page:2});
  window.dispatchEvent(new Event('omi-back'));await wait(()=>!document.querySelector('.reader-layout'),'back');
}
await tap(card('Renamed.cbz').querySelector('[aria-label="打开资源信息"]'));
await wait(()=>document.querySelector('.resource-detail-page'),'details');assert(!document.querySelector('.reader-layout'),'Info tap incorrectly opened book');
await wait(()=>document.querySelectorAll('.resource-detail-thumbnail').length===3,'page previews');
await tap(document.querySelectorAll('.resource-detail-thumbnail')[2]);
await wait(()=>document.querySelector('.reader-footer input[aria-label]')?.value==='3','preview single-tap page three');
assert(doubleClicks===0,'Synthetic double-click was dispatched');assert(!window.hacked,'EPUB script escaped');
return {formats:results,coarsePointer:false,syntheticDoubleClicks:doubleClicks,nestedInfoButton:true,previewSingleTouch:true,epubIsolation:true};
