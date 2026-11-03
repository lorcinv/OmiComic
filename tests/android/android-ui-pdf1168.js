const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label,timeout=30000)=>{const end=Date.now()+timeout;while(!await fn()){if(Date.now()>end)throw Error(label+' '+JSON.stringify({body:document.body.innerText.slice(-500),reader:document.querySelector('.reader-layout')?.outerHTML.slice(0,500),reads:window.__omiMotionReport?.reads.length}));await pause(20);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,initial=await value(api.getAppData()),baseline=window.__omiFixture.endsWith('baseline');
const root=initial.library.roots.find(item=>item.name==='OmiSmoke')??initial.library.roots[0];assert(root,'Synthetic library grant');
const base=root.path,path=base+'/Document.pdf';
const button=label=>[...document.querySelectorAll('button')].find(el=>el.getBoundingClientRect().width>0&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tap=async el=>{
  assert(el,'Missing tap target');const label=el.getAttribute('aria-label');let rect;
  for(let attempt=0;attempt<8;attempt++){
    if(!el.isConnected&&label)el=[...document.querySelectorAll('[aria-label]')].find(node=>node.getAttribute('aria-label')===label)??el;
    el.scrollIntoView({block:'center',behavior:'instant'});await pause(180);rect=el.getBoundingClientRect();
    const x=rect.x+rect.width/2,y=rect.y+Math.min(38,rect.height/2);
    if(el.isConnected&&rect.width>0&&y>8&&y<innerHeight-8&&el.contains(document.elementFromPoint(x,y)))break;
    rect=null;
  }
  assert(rect,'Native tap target did not settle: '+label);
  window.__omiTap={x:rect.x+rect.width/2,y:rect.y+Math.min(38,rect.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');
};
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent==='Document.pdf');
const visibleCanvases=()=>[...document.querySelectorAll('.page-panel.is-visible .reader-page-frame canvas.reader-pdf-canvas')].filter(c=>{const frame=c.closest('.reader-page-frame'),rect=c.getBoundingClientRect();return frame.getAttribute('aria-hidden')!=='true'&&getComputedStyle(frame).visibility!=='hidden'&&rect.width>1&&rect.height>1&&c.width>0&&c.height>0&&c.getContext('2d').getImageData(0,0,1,1).data[3]>0;});
const reads=[],read=api.readDocumentRange;api.readDocumentRange=async(...args)=>{const start=performance.now(),result=await read(...args);reads.push({bytes:args[2]-args[1],ms:performance.now()-start});return result;};
const checks=[];
window.__omiMotionReport={reads,checks,openMethod:'DOM card activation; native page-turn and seek input'};
for(const panorama of (baseline?[false]:[false,true])){
  await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:2,readerPageMode:'single',readerDefaultPanorama:panorama,readerDefaultFlow:'horizontal',mobilePanoramaTapPaging:true,mobileReaderAutoHide:false,mobileReaderPreviews:true}));
  const resource=await value(api.getResourcePages({path,type:'pdf'}));
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:path,sourceType:'pdf',title:'Document.pdf',currentPageIndex:0,totalPages:3,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama,immersive:false}}));
  await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:base}));
  if(button('打开资源库'))await tap(button('打开资源库'));
  for(let attempt=0;attempt<3&&!card();attempt++){window.dispatchEvent(new Event('omi-back'));await pause(250);}
  await wait(card,'PDF library card');
  const start=performance.now();card().click();await wait(()=>visibleCanvases().length,'PDF pixels',baseline?90000:30000);
  const openMs=performance.now()-start;await pause(800);
  const marker=document.createElement('div');marker.style.cssText='position:fixed;left:4px;top:4px;width:12px;height:12px;background:#f0f;z-index:2147483647;pointer-events:none';document.body.append(marker);await pause(160);
  let samples=0,blankFrames=0,monitor=true;
  const sample=()=>{if(!monitor)return;if(document.querySelector('.page-panel.is-visible .reader-stage')){samples++;if(!visibleCanvases().length)blankFrames++;}requestAnimationFrame(sample);};requestAnimationFrame(sample);
  const stage=document.querySelector('.page-panel.is-visible .reader-stage'),rect=stage.getBoundingClientRect();
  const flipStart=performance.now();window.__omiTap={x:rect.x+rect.width*.94,y:rect.y+rect.height*.5,viewport:innerWidth};await wait(()=>!window.__omiTap,'page-turn tap');
  await wait(()=>Number(document.querySelector('[aria-label="阅读进度"]')?.getAttribute('aria-valuenow'))>=2,'next PDF page');
  await wait(()=>visibleCanvases().some(c=>Number(c.closest('[data-reader-page-index]').dataset.readerPageIndex)>=1),'next PDF pixels');
  const flipMs=performance.now()-flipStart;await pause(220);monitor=false;marker.remove();
  window.__omiTap={x:rect.x+rect.width*.5,y:rect.y+rect.height*.5,viewport:innerWidth};await wait(()=>!window.__omiTap,'show PDF controls');
  await wait(()=>document.querySelector('.reader-layout.is-mobile-chrome-visible'),'PDF controls');
  const rail=document.querySelector('[aria-label="阅读进度"]'),r=rail.getBoundingClientRect();
  window.__omiDrag={from:{x:r.x+r.width*.3,y:r.y+r.height/2},to:{x:r.x+r.width*.65,y:r.y+r.height/2},viewport:innerWidth,holdMs:40};
  await wait(()=>!window.__omiDrag,'real PDF progress drag');
  if(!baseline){await wait(()=>document.querySelectorAll('.mobile-reader-previews img').length>0,'PDF drag previews');assert(blankFrames===0,'PDF turn exposed blank frames: '+blankFrames);}
  checks.push({panorama,openMs,flipMs,samples,blankFrames,previews:document.querySelectorAll('.mobile-reader-previews img').length});
  window.dispatchEvent(new Event('omi-back'));await pause(120);if(document.querySelector('.page-panel.is-visible .reader-stage'))window.dispatchEvent(new Event('omi-back'));await wait(card,'return to library');
}
return {baseline,checks,reads};
