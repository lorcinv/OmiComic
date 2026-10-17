const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(35);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label));
const tap=async e=>{assert(e,'Missing tap target');e.scrollIntoView({block:'nearest'});await pause(280);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap');};
const back=async()=>{window.__omiKey=4;await wait(()=>!window.__omiKey,'back');await pause(320);};
window.__omiResumeSentinel='retained-'+Date.now();
const resumes=[];
const resume=async route=>{window.__omiLifecycle=route;await wait(()=>!window.__omiLifecycle,'background and launcher '+route);resumes.push({...window.__omiLifecycleResult,page:document.querySelector('.page-panel.is-visible .reader-stage')?'reader':document.querySelector('.omi-home')?'home':'library'});};
const sample=async run=>{window.__omiFrameProbe=true;await wait(()=>!window.__omiFrameProbe,'frame probe');await run();await pause(350);window.__omiFrameProbeStop=true;await wait(()=>!window.__omiFrameProbeStop,'frame result');const result=window.__omiFrameProbeResult;assert(result.count>=5,'Too few frames');assert(result.uniformBlankFrames===0,'Blank composed frame: '+JSON.stringify(result));return result;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root');
await value(api.updateSettings({language:'zh-CN',colorTheme:'mist',mobileReaderAutoHide:false,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single',readerPreloadPages:2}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path+'/Native112'}));
const home=await sample(async()=>{await resume('icon');await resume('other-app');await resume('icon');});
await tap(button('打开资源库'));
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent==='Pages');
await wait(card,'library');await pause(400);
const library=await sample(async()=>{await resume('icon');await resume('pending-capture');});
const transitions=await sample(async()=>{
  for(let i=0;i<4;i++){
    await tap(card());await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'reader');
    await pause(350);
    if(i===0){await resume('icon');await resume('other-app');await resume('pending-capture');}
    await back();await wait(card,'reader back');
  }
  await tap(button('显示选项'));await tap(button('应用设置'));await pause(250);await resume('icon');
  assert(document.querySelector('.mobile-settings-surface'),'Settings lost on resume');await back();
});
assert(!document.documentElement.dataset.mobileNavigation,'Web transition marker survived');
return {resumes,home,library,transitions,readerRoundTrips:4,settingsRetained:true,realAndroidInput:true};
