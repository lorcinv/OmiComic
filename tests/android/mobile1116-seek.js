const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=25000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(20);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Missing fixture root');
const base=root.path+'/Native112',sourcePath=base+'/LargeSeek.cbz',book=await value(api.getResourcePages({path:sourcePath,type:'archive'}));
assert(book.total===200,'Expected 200 large JPEG pages');
const noPreload=window.__omiFixture==='no-preload';
await value(api.updateSettings({mobileReaderPreviews:true,mobilePreviewWidth:88,readerPreloadPages:noPreload?0:2,readerImageLoadConcurrency:2,readerMemoryCacheSizeMb:noPreload?0:100,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath,sourceType:'archive',title:book.title,currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing tap');e.scrollIntoView({block:'center'});await pause(350);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(50,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'stats');return window.__omiNativeStats;};
await tap(button('打开资源库'));
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent==='LargeSeek.cbz');
await wait(card,'card');await tap(card());
const body=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) [data-native-image]');
await wait(body,'body');await pause(400);
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible'))await tap(document.querySelector('.reader-stage'));
const sample=async()=>{
  const state=await stats(),rail=document.querySelector('.mobile-reader-filmstrip'),box=rail?.getBoundingClientRect();
  const nodes=[...document.querySelectorAll('.mobile-filmstrip-page')].filter(node=>{const r=node.getBoundingClientRect();return box&&r.right>box.left+10&&r.left<box.right-10;});
  const previews=nodes.map(node=>{const native=node.querySelector('[data-native-preview]'),img=node.querySelector('img'),r=node.getBoundingClientRect();return {page:node.querySelector('strong')?.textContent,url:native?.dataset.nativePreview,ready:Boolean(native&&state.previewRasterUrls.includes(native.dataset.nativePreview)||img?.complete&&img.naturalWidth>0),error:Boolean(node.querySelector('[title^="预览不可用"]')),x:r.x};});
  return {current:Number(document.querySelector('[aria-label="阅读进度"]').getAttribute('aria-valuenow')),bodyReady:state.rasters.some(r=>r.url===body()?.dataset.nativeImage),previews,scrollLeft:rail?.scrollLeft,native:state};
};
let target=-1;
const drag=async(ratio)=>{
  const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect();
  const landed=e=>{if(e.target.closest?.('.reader-progress-rail')){const box=rail.getBoundingClientRect();target=Math.round(Math.max(0,Math.min(1,(e.clientX-box.left)/box.width))*199);}};document.addEventListener('pointerup',landed,true);
  window.__omiDrag={from:{x:r.left+Math.max(1,Math.min(r.width-1,r.width*(Number(rail.getAttribute('aria-valuenow'))-1)/199)),y:r.top+r.height/2},to:{x:r.left+r.width*ratio,y:r.top+r.height/2},viewport:innerWidth,holdMs:10,stepMs:6};
  await wait(()=>!window.__omiDrag,'fast seek');
  document.removeEventListener('pointerup',landed,true);
};
const observations=[];
// Keep URL metadata warm while visiting enough large pages to evict native
// bitmaps and their tiny preview copies, then revisit the earlier location.
for(const ratio of [.1,.3,.5,.7,.9,.1]){
  await drag(ratio);let result;const started=performance.now();
  try{await wait(async()=>{result=await sample();return result.current===target+1&&result.bodyReady&&result.previews.length>=3&&result.previews.every(p=>p.ready);},'cache revisit',12000);}
  catch(error){throw new Error('Cache revisit failed '+JSON.stringify(result));}
  observations.push({kind:'revisit',settledMs:Math.round(performance.now()-started),...result});
}
for(const targets of [[.08,.85,.18,.93,.12,.72,.27,.87],[.09,.9,.08,.88,.07,.86,.06,.84]]){
  for(const ratio of targets)await drag(ratio);
  let result;const started=performance.now();
  await wait(async()=>{result=await sample();return result.current===target+1&&result.bodyReady&&result.previews.length>=3&&result.previews.every(p=>p.ready);},'stopped previews '+JSON.stringify(await sample()),12000);
  observations.push({kind:'progress',settledMs:Math.round(performance.now()-started),...result});
}
// Real native horizontal flicks exercise the filmstrip's independent scroll
// and inertia path, not just the progress slider.
for(let pass=0;pass<8;pass++){
  const r=document.querySelector('.mobile-reader-filmstrip').getBoundingClientRect(),reverse=pass>=4;
  window.__omiDrag={from:{x:r.left+r.width*(reverse?.15:.85),y:r.top+r.height*.42},to:{x:r.left+r.width*(reverse?.85:.15),y:r.top+r.height*.42},viewport:innerWidth,holdMs:10,stepMs:5};
  await wait(()=>!window.__omiDrag,'preview flick');
}
let last;await wait(async()=>{last=await sample();return last.bodyReady&&last.previews.length>=3&&last.previews.every(p=>p.ready);},'flick previews '+JSON.stringify(await sample()),12000);
observations.push({kind:'filmstrip',...last});
return {pages:book.total,fixture:'LargeSeek.cbz',noPreload,observations};
