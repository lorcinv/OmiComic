const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=25000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(40);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Formats116';
await value(api.updateSettings({mobileReaderPreviews:true,readerMemoryCacheSizeMb:100,readerPreloadPages:2,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false,mobileViewDisplays:{directory:{layout:'grid',columns:2,coverSize:82}},mobileImageAdjustments:{enabled:true,brightness:100,contrast:100,gamma:1,warmth:0,grayscale:false,invert:false,sharpen:0,denoise:0}}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
const names=['Images','01.jpg','02.jpeg','03.png','04.webp','05.bmp','06.gif','Stored.zip','Deflate.cbz','Lzma.zip','Bzip2.zip','RAR4.rar','RAR5.cbr','Seven.7z','Solid.cb7','Document.pdf','Story.epub'];
const books=new Map(),decoded=[];
for(const name of names){
  const start=performance.now(),book=await value(api.getResourcePages({path:base+'/'+name}));books.set(name,book);
  const item={name,indexMs:Math.round(performance.now()-start),pages:book.total,pixels:[]};
  if(book.pages.length){
    const indices=/^\d/.test(name)?[book.pages.findIndex(p=>p.name===name)]:[book.total-1,0,Math.floor(book.total/2)];
    for(const index of indices){
      const {url}=await value(api.getPageImage(book.pages[index])),img=new Image();img.src=url;await img.decode();
      assert(img.naturalWidth===800&&img.naturalHeight===1200,'Decoded dimensions '+name);
      const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const pixel=[...ctx.getImageData(0,0,1,1).data].slice(0,3),legacy=/^(RAR|Seven|Solid)/.test(name),expected=legacy?[[226,232,238],[210,222,223],[233,223,209]][index]:[226,232,238];
      assert(pixel.every((v,i)=>Math.abs(v-expected[i])<=4),'Wrong pixels '+name+'/'+index+': '+pixel);item.pixels.push({page:index+1,pixel});
    }
    await value(api.releaseReaderResource(book.sourcePath));
  }
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:book.total||(/\.pdf$/.test(name)?3:2),readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
  decoded.push(item);
}
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing target');e.scrollIntoView({block:'center'});await pause(280);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'stats');return window.__omiNativeStats;};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);
const shown=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"])');
await tap(button('打开资源库'));await wait(()=>card('Images'),'library');
const opened=[];
for(const name of names){
  await wait(()=>card(name),'card '+name);await tap(card(name));await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'open '+name);
  const ready=async()=>{
    if(name.endsWith('.epub')){const doc=document.querySelector('.reader-chapter iframe')?.contentDocument;return doc?.body.textContent.includes('Chapter')&&[...doc.images].some(i=>i.complete&&i.naturalWidth>0&&i.naturalWidth<=800&&Math.abs(i.naturalWidth/i.naturalHeight-2/3)<.01);}
    if(name.endsWith('.pdf'))return [...document.querySelectorAll('.reader-page-spread canvas')].some(c=>c.width>0&&c.height>0&&c.getContext('2d').getImageData(0,0,1,1).data[3]>0);
    const node=shown(),native=node?.querySelector('[data-native-image]'),img=node?.querySelector('img');
    return native?(await stats()).rasters.some(r=>r.url===native.dataset.nativeImage&&r.width===800&&r.height===1200):img?.complete&&img.naturalWidth===800;
  };
  await wait(ready,'visible pixels '+name);
  const before=document.querySelector('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'),first=Number(before)-1;
  if(/^\d/.test(name))assert(books.get(name).pages[first]?.name===name,'Single image did not open its matching page: '+name);
  window.__omiKey=first>=5?21:22;await wait(()=>!window.__omiKey,'next key');
  await wait(()=>document.querySelector('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow')!==before,'page changed '+name);await wait(ready,'next pixels '+name);
  const documentSession=/\.(pdf|epub)$/.test(name);
  if(documentSession){window.__omiSessionScratch=true;await wait(()=>!window.__omiSessionScratch,'document session scratch '+name);}
  const row={name,first:first+1,next:Number(document.querySelector('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow')),visiblePixels:true};opened.push(row);
  window.__omiKey=4;await wait(()=>!window.__omiKey,'back');await wait(()=>!document.querySelector('.reader-layout')&&card(name),'close '+name);await pause(180);
  if(documentSession){
    await wait(async()=>!(await value(api.getAndroidCacheInfo())).readerTemporaryBytes,'document scratch cleanup '+name);
    window.__omiSessionScratchCheck=true;await wait(()=>!window.__omiSessionScratchCheck,'document session closed '+name);
    assert(window.__omiSessionScratchRemoved,'Whole-file scratch retained after '+name);row.sessionScratchCleared=true;
  }
}
assert(!window.unsafe116,'EPUB script escaped');
const rejected=[];
for(const name of ['Encrypted.7z','Broken.rar','Empty.7z']){const r=await api.getResourcePages({path:base+'/'+name});assert(!r.ok,'Bad archive accepted '+name);rejected.push({name,error:r.error});}
return {decoded,opened,rejected,epubBitmap:true,epubScriptIsolated:true,realAndroidInput:true};
