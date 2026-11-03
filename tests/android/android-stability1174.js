const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(ok,label)=>{if(!ok)throw Error(label);};
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-500));await pause(25);}};
const value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');
const checks=[],report=window.__omiMotionReport={checks};
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
const home=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='打开资源库');if(home)home.click();
for(let i=0;i<5&&!card('Quick1172.cbz');i++){window.dispatchEvent(new Event('omi-back'));await pause(180);}
await wait(()=>card('Quick1172.cbz'),'root fixtures');
const tap=async el=>{el.scrollIntoView({block:'nearest',behavior:'instant'});const r=el.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
await value(api.updateSettings({mobileReaderAutoHide:false,mobileReaderPreviews:true}));
await tap(card('Quick1172.cbz'));
await wait(()=>document.querySelector('.reader-layout')?.getAttribute('aria-busy')==='false','reader ready');await pause(300);
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){const r=document.querySelector('.reader-stage').getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'show controls');}
const rail=document.querySelector('[aria-label="阅读进度"]');await wait(()=>rail.getBoundingClientRect().width>40,'progress rail');
const r=rail.getBoundingClientRect(),before=Number(rail.getAttribute('aria-valuenow'));
window.__omiDrag={from:{x:r.x+r.width*.2,y:r.y+r.height/2},to:{x:r.x+r.width*.65,y:r.y+r.height/2},viewport:innerWidth,shell:true,durationMs:180};await wait(()=>!window.__omiDrag,'native progress drag');
await wait(()=>Number(rail.getAttribute('aria-valuenow'))>=60,'progress drag seeks');rail.focus();
const style=getComputedStyle(rail);assert(style.outlineStyle==='none','Mobile progress acquired a focus ring');assert(style.webkitTapHighlightColor==='rgba(0, 0, 0, 0)','Mobile progress acquired a tap highlight');
await wait(()=>document.querySelector('.mobile-reader-filmstrip [aria-pressed="true"]')?.getAttribute('aria-label')?.startsWith('第 '+rail.getAttribute('aria-valuenow')+' 页：'),'progress preview follows the settled page');
checks.push({flow:'progress',before,after:Number(rail.getAttribute('aria-valuenow')),outline:style.outlineStyle,tapHighlight:style.webkitTapHighlightColor,nativeDrag:true});
window.__omiShot='stability1174-progress';await wait(()=>!window.__omiShot,'focused progress screenshot');
for(let i=0;i<4&&document.querySelector('.page-panel.is-visible .reader-stage');i++){window.dispatchEvent(new Event('omi-back'));await pause(140);}
await wait(()=>card('DocumentUI1163'),'container folder');

// Disposable synthetic directories exercise long-to-short handoff without
// depending on a user's storage. Real Android transitions and input still run.
const folderPath=root.path+'/DocumentUI1163',list=api.listDirectory,pages=api.getResourcePages,thumb=api.getThumbnail,count=api.getReadablePageCount,check=api.checkResourcePath;
const fixture=path=>path.startsWith(folderPath+'/Entry');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC';
api.listDirectory=async path=>path===folderPath?{ok:true,data:{path,parentPath:root.path,items:Array.from({length:240},(_,i)=>({id:'stability'+i,name:'Entry'+String(i).padStart(3,'0'),path:folderPath+'/Entry'+String(i).padStart(3,'0'),type:'folder',extension:'',containsImages:false})),total:240}}:fixture(path)?{ok:true,data:{path,parentPath:folderPath,items:[{id:'one',name:'one.png',path:path+'/one.png',type:'image',extension:'png'}],total:1}}:list(path);
api.getResourcePages=async input=>input.path===folderPath||fixture(input.path)?{ok:false,error:{code:'NO_IMAGES',message:'Directory fixture'}}:pages(input);
api.getThumbnail=async input=>fixture(input.path)?{ok:true,data:{url:image}}:thumb(input);
api.getReadablePageCount=async input=>fixture(input.path)?{ok:true,data:1}:count(input);
api.checkResourcePath=async input=>fixture(input.path)?{ok:true,data:{path:input.path,exists:true,readable:true}}:check(input);
const body=()=>document.querySelector('.page-panel.is-visible .resource-list-scroll');
const beginFrames=async()=>{window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'start native frames');};
const endFrames=async()=>{window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'stop native frames');return window.__omiReaderMotionFrames;};
const transition=document.startViewTransition;
try{
 for(const nativeFallback of [false,true]){
  if(nativeFallback)document.startViewTransition=undefined;
  for(let pass=0;pass<2;pass++){
   await beginFrames();await tap(card('DocumentUI1163'));await wait(()=>card('Entry000'),'long folder');await pause(260);
   assert(body().scrollTop<1,'Reentered directory restored its old scroll offset');
   body().scrollTop=2400;await wait(()=>body().scrollTop>2350,'scroll long folder');await pause(160);
   const container=body().getBoundingClientRect(),entry=[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>{const b=el.getBoundingClientRect();return b.y>container.y+10&&b.bottom<container.bottom-10;});assert(entry,'Visible nested folder missing');
   const name=entry.querySelector('strong').textContent;await tap(entry);await wait(()=>card('one.png'),'short folder');await pause(260);
   assert(body().scrollTop<1,'Short folder inherited the outgoing long-list offset');assert(document.querySelectorAll('.page-panel.is-visible .mobile-resource-card').length===1,'Short folder window was empty or stale');
   window.dispatchEvent(new Event('omi-back'));await wait(()=>card('Entry000'),'back to long folder');await pause(260);assert(body().scrollTop<1,'Returning to folder restored its old offset');
   body().scrollTop=2200;await wait(()=>body().scrollTop>2150,'second scroll');
   window.dispatchEvent(new Event('omi-back'));await wait(()=>card('DocumentUI1163'),'back to root');await pause(280);
   const frames=await endFrames();assert(frames.length>=(nativeFallback?3:1),'Native frame recording empty');assert(frames.every(f=>f.sourceScale===1&&f.contentScale===1),'Folder transition scaled the interface');
   checks.push({flow:'folder',nativeFallback,pass,nested:name,reentryTop:true,shortFolderTop:true,returnTop:true,scaleStable:true,frames});
  }
 }
}finally{
 document.startViewTransition=transition;api.listDirectory=list;api.getResourcePages=pages;api.getThumbnail=thumb;api.getReadablePageCount=count;api.checkResourcePath=check;
}
window.__omiShot='stability1174-folders';await wait(()=>!window.__omiShot,'folder screenshot');
return {checks,input:'Android native progress drag and taps; web and native folder transitions; repeated long/short folder handoff'};
