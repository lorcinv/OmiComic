const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(ok,label)=>{if(!ok)throw Error(label);};
const wait=async(fn,label)=>{const end=Date.now()+18000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-500));await pause(20);}};
const value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');
await value(api.updateSettings({readerPreloadPages:1,readerMemoryCacheSizeMb:200,mobileReaderAutoHide:false,doublePageFirstSingle:false,mobileReaderPreviews:true}));
const checks=[],report=window.__omiMotionReport={checks};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
const home=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='打开资源库');if(home)home.click();
for(let i=0;i<5&&!card('Quick1172.cbz');i++){window.dispatchEvent(new Event('omi-back'));await pause(160);}
const back=async()=>{for(let i=0;i<4&&document.querySelector('.page-panel.is-visible .reader-stage');i++){window.dispatchEvent(new Event('omi-back'));await pause(150);}await wait(()=>card('Quick1172.cbz'),'library');await pause(260);};
for(const name of (window.__omiFixture.includes('preview')?['Preview1173.pdf']:window.__omiFixture.includes('document')?['Document.pdf']:['Quick1172.cbz','Preview1173.pdf','Document.pdf']))for(const mode of ['single','double','double-rtl']){
 const path=root.path+'/'+name,book=await value(api.getResourcePages({path,type:name.endsWith('.pdf')?'pdf':'archive'})),step=mode==='single'?1:2;
 book.total=name==='Document.pdf'?6:100;
 await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:path,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:mode==='single'?'single':'double',pageDirection:mode==='double-rtl'?'right-to-left':'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
 await wait(()=>card(name),'book '+name);card(name).click();
 const stage=()=>document.querySelector('.page-panel.is-visible .reader-stage'),progress=()=>document.querySelector('[aria-label="阅读进度"]');
 await wait(()=>stage()&&document.querySelector('.reader-layout')?.getAttribute('aria-busy')==='false','ready');await pause(300);
 const gestures=[];report.current={name,mode,gestures};
 for(let attempt=0;attempt<Math.min(3,Math.floor((book.total-1)/step));attempt++){
  const before=Number(progress().getAttribute('aria-valuenow')),target=before-1+step;
  // A final double-page spread reports the book's last page on the progress
  // rail. Check its real first page below rather than assuming the rail is +2.
  const expected=target+step>=book.total?book.total:target+1;
  let copies;
  if(name.endsWith('.pdf')){
   await wait(()=>stage().querySelectorAll('.reader-swipe-preview[data-swipe-group$=":'+target+'"] canvas.reader-pdf-canvas').length===step,'complete PDF neighbour before touch');
   copies=[...stage().querySelectorAll('.reader-swipe-preview[data-swipe-group$=":'+target+'"] canvas')];assert(copies.every(c=>c.width>0&&c.height>0),'empty warm PDF canvas');
  }
  const frames=[],events=[],start=performance.now();let recording=true;
  report.gesture={name,mode,before,target,frames,events};
  const pointer=event=>events.push({type:event.type,x:event.clientX,y:event.clientY,at:event.timeStamp,offset:parseFloat(stage()?.querySelector('.reader-page-spread')?.style.translate)||0});
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])stage().addEventListener(type,pointer);
  const record=()=>{if(!recording)return;const spread=stage()?.querySelector('.reader-page-spread'),offset=parseFloat(spread?.style.translate)||0;frames.push({at:performance.now()-start,offset,page:progress()?.getAttribute('aria-valuenow')});requestAnimationFrame(record);};requestAnimationFrame(record);
  const rect=stage().getBoundingClientRect(),sign=mode==='double-rtl'?1:-1,x=rect.x+rect.width*(sign>0?.3:.7),y=rect.y+rect.height*.5;
  window.__omiDrag={from:{x,y},to:{x:x+sign*64,y:y+12},viewport:innerWidth,shell:true,durationMs:90};await wait(()=>!window.__omiDrag,'light native swipe');
  await wait(()=>Number(progress().getAttribute('aria-valuenow'))===expected,'one light swipe must turn exactly one group');
  await wait(()=>!stage().querySelector('.reader-swipe-preview[data-swipe-active="true"]'),'handoff');await pause(100);recording=false;
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])stage().removeEventListener(type,pointer);
  const moving=frames.filter(f=>Math.abs(f.offset)>.5),positions=new Set(moving.map(f=>Math.round(f.offset))),gaps=moving.slice(1).map((f,i)=>f.at-moving[i].at);
  assert(positions.size>=3,'No intermediate tracking/settle frames');
  if(name.endsWith('.pdf'))assert(stage().querySelector('[data-reader-page-index="'+target+'"]:not([aria-hidden="true"]) canvas')?.width>0,'PDF handoff lost its real page');
  assert(stage().querySelector('[data-reader-page-index="'+target+'"]:not([aria-hidden="true"])'),'Light swipe skipped a logical page group');
  gestures.push({before,after:expected,firstPageIndex:target,distance:64,durationMs:90,intermediateFrames:positions.size,maxFrameGapMs:Math.max(0,...gaps),frames});
 }
 const geometry=[...stage().querySelectorAll('.reader-page-frame:not([aria-hidden="true"]) canvas.reader-pdf-canvas')].map(canvas=>({width:canvas.width,height:canvas.height,rect:canvas.getBoundingClientRect().toJSON(),host:canvas.parentElement.style.cssText,parents:[canvas.parentElement.parentElement,canvas.parentElement.parentElement.parentElement].map(el=>({rect:el.getBoundingClientRect().toJSON(),style:el.style.cssText}))}));
 checks.push({flow:'light-swipe',name,mode,preparedWholeSpread:name.endsWith('.pdf'),gestures,geometry});
 window.__omiShot='swipe200-'+name.toLowerCase().replace(/\W/g,'-')+'-'+mode;await wait(()=>!window.__omiShot,'swipe screenshot');await back();
}
const methods=[],post=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(message,...rest){try{methods.push(JSON.parse(message).method);}catch{}return post.call(this,message,...rest);};
await wait(()=>card('DocumentUI1163'),'container folder');const begin=methods.length;card('DocumentUI1163').click();
await wait(()=>!card('Quick1172.cbz'),'entered folder');await pause(400);
assert(!methods.slice(begin).includes('readerIntent'),'Container folder triggered reader opening');assert(!document.querySelector('.page-panel.is-visible .reader-stage'),'Folder opened reader');
checks.push({flow:'folder',readerIntent:false,sceneMethods:methods.slice(begin)});MessagePort.prototype.postMessage=post;
window.__omiShot='swipe200-folder';await wait(()=>!window.__omiShot,'folder screenshot');
return {checks,input:'Android native touchscreen 64px light flicks on CBZ and both PDF fixtures, single/double/RTL; ordinary folder transition'};
