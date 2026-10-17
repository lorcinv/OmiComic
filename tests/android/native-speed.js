const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+20000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await new Promise(requestAnimationFrame);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const trace=[],longTasks=[],send=MessagePort.prototype.postMessage,ports=new WeakSet();let traceOrigin=0;
const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(traceOrigin)longTasks.push({start:Math.round(entry.startTime-traceOrigin),duration:Math.round(entry.duration)});});observer.observe({type:'longtask',buffered:false});
MessagePort.prototype.postMessage=function(message,...args){
  if(!ports.has(this)){ports.add(this);this.addEventListener('message',event=>{try{const reply=JSON.parse(event.data),entry=trace.find(e=>e.id===reply.id);if(entry)entry.end=Math.round(performance.now()-traceOrigin);}catch{}});}
  try{const request=JSON.parse(message);if(traceOrigin&&request.id&&trace.length<100)trace.push({id:request.id,method:request.method,start:Math.round(performance.now()-traceOrigin)});}catch{}
  return send.call(this,message,...args);
};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Native112';
await value(api.updateSettings({mobileLibraryLayout:'grid',mobileGridColumns:2,readerPreloadPages:3,readerMemoryCacheSizeMb:100,readerPageMode:'single',readerDefaultPanorama:false}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
const prepared={};
for(const name of ['Pages','Large','Deflate.cbz','Many.cbz']){
  const start=performance.now(),book=await value(api.getResourcePages({path:base+'/'+name}));prepared[name]=Math.round(performance.now()-start);
  await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:book.sourceType,title:book.title,currentPageIndex:0,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
}
document.querySelector('[aria-label="打开资源库"]').click();
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
await wait(()=>card('Pages'),'library');
const shown=()=>document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"])');
const ready=()=>{const el=shown(),image=el?.querySelector('.reader-image');return image&&(image.hasAttribute('data-native-image')||image.complete&&image.naturalWidth>0);};
const open=[],turns=[];let blanks=0,frames=0,monitor=false;
const probe=()=>{if(monitor){frames++;if(!ready())blanks++;}requestAnimationFrame(probe);};requestAnimationFrame(probe);
for(const name of ['Pages','Large','Deflate.cbz','Pages']){
  const start=performance.now();if(!open.length)traceOrigin=start;card(name).click();await wait(ready,'ready '+name);open.push({name,ms:Math.round(performance.now()-start)});
  await pause(350);
  if(name==='Pages'){
    monitor=true;
    for(let i=0;i<10;i++){
      const old=shown().dataset.readerPageIndex,start=performance.now();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:i%2?'ArrowLeft':'ArrowRight',bubbles:true}));
      await wait(()=>shown()?.dataset.readerPageIndex!==old&&ready(),'turn');await new Promise(requestAnimationFrame);turns.push(Math.round(performance.now()-start));
    }
    monitor=false;
  }
  window.dispatchEvent(new Event('omi-back'));await wait(()=>card('Pages'),'back');await pause(300);
}
MessagePort.prototype.postMessage=send;
observer.disconnect();return {version:(await api.getAppInfo()).version,indexMs:prepared,openToDecodedSceneMs:open,warmPageTurnMs:turns,frameSamples:frames,blankSamples:blanks,trace,longTasks};
