const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(25);}};
const value=async task=>{const result=await task;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(item=>item.name==='Halftone1149')??data.library.roots[0];
await value(api.updateSettings({readerPageMode:'single',readerDefaultPanorama:false,readerDefaultFlow:'horizontal',readerPreloadPages:2,mobileReaderAutoHide:false,mobileReaderPreviews:true}));
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
const openLibrary=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='打开资源库');if(openLibrary)openLibrary.click();
for(let i=0;i<5&&!card('Preview1173.pdf');i++){window.dispatchEvent(new Event('omi-back'));await pause(180);}
const checks=[],report=window.__omiMotionReport={checks};
for(const name of ['Quick1172.cbz','Preview1173.pdf']){
 const path=root.path+'/'+name,book=await value(api.getResourcePages({path,type:name.endsWith('.pdf')?'pdf':'archive'}));
 await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:path,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:100,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
 await wait(()=>card(name),'source '+name);card(name).click();
 await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader stage');
 await wait(()=>document.querySelector('.reader-layout')?.getAttribute('aria-busy')==='false','reader ready');
 const stage=()=>document.querySelector('.page-panel.is-visible .reader-stage'),progress=()=>document.querySelector('[aria-label="阅读进度"]');
 if(name.endsWith('.pdf'))await wait(()=>stage()?.querySelector('canvas.reader-pdf-canvas')?.width>0,'PDF pixels');
 if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){const r=stage().getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'toolbar tap');}
 await wait(progress,'progress rail');await pause(180);
 const swipe=async(r,from,to,durationMs)=>{window.__omiDrag={from:{x:r.x+r.width*from,y:r.y+r.height*.45},to:{x:r.x+r.width*to,y:r.y+r.height*.45},viewport:innerWidth,shell:true,durationMs};await wait(()=>!window.__omiDrag,'native swipe');};
 await swipe(progress().getBoundingClientRect(),.2,.4,180);
 await wait(()=>document.querySelector('.mobile-reader-filmstrip'),'previews');await pause(350);
 const rail=document.querySelector('.mobile-reader-filmstrip'),trace=report[name]={positions:[],seeks:[],nativePans:0},original=rail.scrollTo.bind(rail);
 rail.scrollTo=(...args)=>{trace.seeks.push(args);original(...args);};
 rail.addEventListener('pointercancel',()=>{trace.nativePans++;});
 rail.addEventListener('touchend',()=>{trace.released=rail.scrollLeft;});
 rail.addEventListener('scroll',()=>{trace.positions.push({at:performance.now(),left:rail.scrollLeft});trace.last=performance.now();});
 const settle=async()=>{await wait(()=>performance.now()-(trace.last||0)>260,'scroll rest');return rail.scrollLeft;};
 const r=rail.getBoundingClientRect(),before=rail.scrollLeft;await swipe(r,.85,.15,90);const stopped=await settle(),released=trace.released;
 assert(trace.nativePans>0,'Touch was captured instead of native scrolling');
 assert(stopped>before+4*96,'Fast swipe did not travel across pages');
 assert(stopped>released+96,'Fast swipe lost native inertia');
 assert(trace.seeks.length===0,'Preview scheduled a seek during native scrolling');
 const first={before,released,stopped,inertia:stopped-released};
 for(let i=0;i<2;i++)await swipe(r,.85,.15,100);
 const forward=await settle();assert(forward>stopped+4*96,'Repeated swipes were blocked');
 await swipe(r,.15,.85,100);const reverse=await settle();assert(reverse<forward-2*96,'Reverse swipe was blocked');
 const stable=rail.scrollLeft;await pause(650);assert(Math.abs(rail.scrollLeft-stable)<1,'Preview recentered after stopping');
 const selected=rail.querySelector('[aria-pressed="true"]'),sr=selected?.getBoundingClientRect(),error=sr?Math.abs(sr.x+sr.width/2-r.x-r.width/2):Infinity;
 assert(error<=49,'Selection did not follow the real offset');
 const selectedPage=Math.round(stable/96)+1;await wait(()=>Number(progress()?.getAttribute('aria-valuenow'))===selectedPage,'reader follows the final preview page');
 await wait(()=>{const img=rail.querySelector('[aria-pressed="true"] img');return img?.complete&&img.naturalWidth>0;},'selected thumbnail decoded');
 assert(rail.querySelectorAll('.mobile-filmstrip-page').length<15,'Unbounded virtual previews');
 await pause(180);window.__omiShot=name.endsWith('.pdf')?'filmstrip1173-pdf':'filmstrip1173-comic';await wait(()=>!window.__omiShot,'screenshot');
 checks.push({name,first,forward,reverse,stable,nativePans:trace.nativePans,seeks:trace.seeks.length,selectionError:error,selectedPage,decoded:true});
 window.dispatchEvent(new Event('omi-back'));await pause(150);if(document.querySelector('.page-panel.is-visible .reader-stage'))window.dispatchEvent(new Event('omi-back'));await wait(()=>card(name),'return');
}
return {checks,input:'Android native fast touchscreen swipes; source cards activated in DOM'};
