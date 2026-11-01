const assert=(v,m)=>{if(!v)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=20000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-900));await pause(40);}};
const value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;},api=window.omicomic;
const baseline=window.__omiFixture.endsWith('baseline'),color=window.__omiFixture.includes('color'),name=color?'Color.cbz':'Many.cbz';
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Missing test root');
await value(api.updateSettings({readerMemoryCacheSizeMb:100,readerPreloadPages:3,readerImageLoadConcurrency:4,mobileReaderAutoHide:false,mobileReaderPreviews:false,mobilePanoramaTapPaging:false,readerPageMode:'single',doublePageFirstSingle:false,doublePageDirection:'left-to-right'}));
const book=await value(api.getResourcePages({path:root.path+'/'+name,type:'archive'}));
await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:book.sourcePath,sourceType:'archive',title:name,currentPageIndex:4,totalPages:book.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:true,immersive:false}}));
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent===name);
await wait(card,'book card');card().scrollIntoView({block:'nearest'});await pause(400);let box=card().getBoundingClientRect();
window.__omiTap={x:box.x+box.width/2,y:box.y+35,viewport:innerWidth};await wait(()=>!window.__omiTap,'open touch');await wait(()=>document.querySelector('.reader-stage.is-panorama'),'panorama');
const stats=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native stats');return window.__omiNativeStats;};await wait(async()=>(await stats()).visiblePages>0,'first clear page');await pause(500);
if(window.__omiFixture.includes('cover')){
 const cover=await value(api.getThumbnail({path:book.sourcePath,type:'archive'}));assert(cover.url,'Missing cover URL');window.__omiWarmCoverCheck={url:cover.url};await wait(()=>!window.__omiWarmCoverCheck,'cached cover while cleaning reader');
 if(!baseline)assert(window.__omiWarmCoverResult.cachePaintIndependent,'Cached cover waited for reader cleanup');return {baseline,cover:window.__omiWarmCoverResult};
}
const errors=new Set();let observe=true;const inspect=()=>{document.querySelectorAll('.reader-page-error').forEach(e=>errors.add(e.textContent));if(observe)requestAnimationFrame(inspect);};requestAnimationFrame(inspect);
const begin=async()=>{window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'start native frames');};
const finish=async()=>{await pause(400);window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'stop native frames');return window.__omiReaderMotionFrames;};
const burst=async(paths,steps,stepMs,gapMs)=>{window.__omiNativeGestureBurst={paths,steps,stepMs,gapMs,viewport:innerWidth};await wait(()=>!window.__omiNativeGestureBurst,'native gesture burst');};
const latest=async()=>{
 const stage=document.querySelector('.reader-stage').getBoundingClientRect(),center=stage.x+stage.width/2;
 const node=[...document.querySelectorAll('.reader-page-frame [data-native-image]')].find(n=>{const r=n.getBoundingClientRect();return r.left<=center&&r.right>=center;});
 return node&&(await stats()).rasters.some(r=>r.url===node.dataset.nativeImage&&!r.preview);
};
const reverse=window.__omiFixture.includes('reverse'),from=Number(document.querySelector('[aria-label="阅读进度"]').getAttribute('aria-valuenow'));
box=document.querySelector('.reader-stage').getBoundingClientRect();const y=box.y+box.height*.5,paths=Array.from({length:reverse?4:8},()=>({from:{x:box.x+box.width*(reverse?.12:.88),y},to:{x:box.x+box.width*(reverse?.88:.12),y}}));
await begin();await burst(paths,8,16,35);await wait(latest,'clear page after fast dragging');const dragFrames=await finish();
const dragTo=Number(document.querySelector('[aria-label="阅读进度"]').getAttribute('aria-valuenow'));
// Include every painted sliver; removing a neighbour narrower than the 2px
// gap tolerance can turn a normal 1px rounding seam into a false blank edge.
const gaps=[];for(const f of dragFrames){if(!f.clip)continue;const slots=f.slots.filter(s=>s.left+s.width>f.clip[0]&&s.left<f.clip[2]).sort((a,b)=>a.left-b.left);let end=f.clip[0];for(const s of slots){if(s.left>end+2)gaps.push({time:f.time,width:s.left-end});end=Math.max(end,s.left+s.width);}if(end<f.clip[2]-2)gaps.push({time:f.time,width:f.clip[2]-end});}
window.__omiMotionReport={phase:'drag',baseline,from,dragTo,gaps,errors:[...errors],dragFrames};
if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){box=document.querySelector('.reader-stage').getBoundingClientRect();window.__omiTap={x:box.x+box.width/2,y:box.y+box.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'show chrome');}await pause(600);
const rail=document.querySelector('[aria-label="阅读进度"]');box=rail.getBoundingClientRect();let target=-1;
const landing=e=>{if(e.target.closest?.('.reader-progress-rail')){const r=rail.getBoundingClientRect();target=Math.round((e.clientX-r.left)/r.width*(book.total-1));}};document.addEventListener('pointerup',landing,true);
let ratio=(Number(rail.getAttribute('aria-valuenow'))-1)/(book.total-1);const jumps=[];for(const next of [.05,.94,.08,.9,.12,.86,.2,.8,.07,.93,.18,.82]){const y=box.y+box.height/2;jumps.push({from:{x:box.x+box.width*ratio,y},to:{x:box.x+box.width*next,y}});ratio=next;}
await begin();await burst(jumps,3,12,18);await wait(()=>target>=0,'jump pointerup');await wait(latest,'latest native page after repeated seeks');const jumpFrames=await finish();document.removeEventListener('pointerup',landing,true);
const cover=await value(api.getThumbnail({path:book.sourcePath,type:'archive'}));assert(cover.url,'Missing cover URL');window.__omiWarmCoverCheck={url:cover.url};await wait(()=>!window.__omiWarmCoverCheck,'cached cover under reader cleanup');
observe=false;const final=await stats(),to=Number(rail.getAttribute('aria-valuenow'));
const center=document.querySelector('.reader-stage').getBoundingClientRect(),node=[...document.querySelectorAll('[data-native-image]')].find(n=>{const r=n.getBoundingClientRect();return r.left<=center.x+center.width/2&&r.right>=center.x+center.width/2;});
const targetFrames=jumpFrames.filter(f=>f.slots.some(s=>s.url===node?.dataset.nativeImage)),targetPaint=targetFrames.find(f=>f.time>=window.__omiNativeGestureResult.lastUpUptime)||targetFrames.at(-1);
assert(targetPaint,'Missing final native paint');const settledMs=Math.max(0,targetPaint.time-window.__omiNativeGestureResult.lastUpUptime);
const result={baseline,book:name,reverse,from,dragTo,to,target:target+1,settledMs,gaps,errors:[...errors],dragFrames,jumpFrames,cover:window.__omiWarmCoverResult,final};window.__omiMotionReport=result;
if(!baseline){assert(reverse?dragTo<=from-2:dragTo>=from+3,'Fast swipes did not advance enough pages');assert(to===target+1,'Did not reach final seek');assert(settledMs<1500,'Latest page waited behind old requests');assert(errors.size===0,'Navigation became page error: '+JSON.stringify([...errors]));assert(gaps.length===0,'Fast panorama exposed empty edges: '+JSON.stringify(gaps.slice(0,8)));assert(dragFrames.every(f=>f.slots.every(s=>s.visibleSample===1||s.pixelDensity<=1.01)),'Fast dragging enlarged undersized pixels');assert(result.cover.cachePaintIndependent,'Cached cover waited for reader cleanup');assert(final.bitmapBytes+final.tileBytes<=final.budget,'Reader exceeded bitmap budget');}
return result;
