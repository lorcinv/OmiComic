const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(ok,label)=>{if(!ok)throw Error(label);};
const wait=async(fn,label)=>{const end=Date.now()+30000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(20);}};
const value=async task=>{const result=await task;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(item=>item.name==='Halftone1149')??data.library.roots[0];
await value(api.updateSettings({readerPageMode:'single',readerDefaultPanorama:false,readerDefaultFlow:'horizontal',readerPreloadPages:2,mobileReaderAutoHide:false,mobileReaderPreviews:true}));
const button=label=>[...document.querySelectorAll('button')].find(el=>el.getBoundingClientRect().width>0&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
if(button('打开资源库'))button('打开资源库').click();
for(let i=0;i<4&&!card('Document.pdf');i++){window.dispatchEvent(new Event('omi-back'));await pause(220);}
const checks=[];window.__omiMotionReport={checks};
for(const name of(window.__omiFixture.endsWith('stress')?['Many.cbz']:['Document.pdf','Quick1170.cbz'])){
 const path=root.path+'/'+name,book=await value(api.getResourcePages({path,type:name.endsWith('.pdf')?'pdf':'archive'}));
 await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:path,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:6,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
 await wait(()=>card(name),'book card '+name);const started=performance.now();card(name).click();
 await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader');
 const stage=()=>document.querySelector('.page-panel.is-visible .reader-stage'),rail=()=>document.querySelector('[aria-label="阅读进度"]');
 await wait(()=>rail()&&Number(rail().getAttribute('aria-valuemax'))>1,'page manifest');
 if(name.endsWith('.pdf'))await wait(()=>stage()?.querySelector('canvas.reader-pdf-canvas')?.width>0,'PDF body');
 const openMs=performance.now()-started;
 if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){const r=stage().getBoundingClientRect();window.__omiTap={x:r.x+r.width*.5,y:r.y+r.height*.5,viewport:innerWidth};await wait(()=>!window.__omiTap,'show toolbar');}
 let monitor=true,emptyFrames=0,samples=0;
 const sample=()=>{if(!monitor)return;const panel=document.querySelector('.mobile-reader-previews');if(panel){samples++;if(!panel.querySelector('.mobile-filmstrip-page'))emptyFrames++;}requestAnimationFrame(sample);};requestAnimationFrame(sample);
 for(const end of[.8,.15,.65,.25,.9,.1,.7,.3]){
  const r=rail().getBoundingClientRect(),start=end>.5?.2:.8;
  window.__omiDrag={from:{x:r.x+r.width*start,y:r.y+r.height/2},to:{x:r.x+r.width*end,y:r.y+r.height/2},viewport:innerWidth,shell:true,durationMs:200};await wait(()=>!window.__omiDrag,'real fast seek');
 }
 const target=Number(rail().getAttribute('aria-valuenow'))-1;
 await wait(()=>{const img=document.querySelector('.mobile-reader-previews [aria-pressed="true"] img');return img?.complete&&img.naturalWidth>0;},'selected preview pixels '+name);
 await wait(()=>Number(document.querySelector('.mobile-reader-previews [aria-pressed="true"] strong')?.textContent)===target+1,'selected preview identity');
 monitor=false;assert(emptyFrames===0,'Preview strip lost its pages during seek');
 checks.push({name,openMs,seeks:8,samples,emptyFrames,selectedPage:target+1,decodedPreviews:[...document.querySelectorAll('.mobile-reader-previews img')].filter(img=>img.complete&&img.naturalWidth>0).length});
 window.__omiShot=name.endsWith('.pdf')?'pdf-previews1170':'comic-previews1170';await wait(()=>!window.__omiShot,'preview screenshot');
 window.dispatchEvent(new Event('omi-back'));await pause(150);if(document.querySelector('.page-panel.is-visible .reader-stage'))window.dispatchEvent(new Event('omi-back'));await wait(()=>card(name),'reader return');
}
return {checks};
