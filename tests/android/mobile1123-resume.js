const assert=(v,m)=>{if(!v)throw Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label,ms=350000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('Timeout '+label);await pause(50);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.getAttribute('aria-label')===label||e.textContent.trim()===label||e.querySelector('strong')?.textContent===label));
const tap=async e=>{assert(e,'Missing target');await pause(300);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'tap',10000);};
const fixture=window.__omiFixture||'home',scope=fixture.split('-')[0],short=fixture.endsWith('-short');
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Fixture root');
await value(api.updateSettings({language:'zh-CN',colorTheme:'mist',mobileReaderAutoHide:false,readerDefaultPanorama:false,readerDefaultImmersive:false,readerPageMode:'single'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path+'/Native112'}));
if(scope!=='home'){
  await tap(button('打开资源库'));
  await wait(()=>document.querySelector('.page-panel.is-visible .mobile-resource-card'),'library',15000);
}
if(scope==='reader'){
  const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(e=>e.querySelector('strong')?.textContent==='Pages');
  await wait(card,'Pages',15000);await tap(card());
  await wait(()=>document.querySelector('.page-panel.is-visible .reader-native-image'),'native reader',15000);
}
if(scope==='settings'){
  await tap(button('显示选项'));await wait(()=>button('应用设置'),'menu',10000);await tap(button('应用设置'));
  await wait(()=>button('外观与主题'),'settings',10000);await tap(button('外观与主题'));
  await wait(()=>document.querySelector('[role="combobox"][aria-label="界面主题"]'),'theme selector',10000);
  await tap(document.querySelector('[role="combobox"][aria-label="界面主题"]'));
  await wait(()=>[...document.querySelectorAll('[role="option"]')].some(e=>e.textContent.trim()==='夜色'),'theme menu',10000);
  await tap([...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()==='夜色'));
  await wait(()=>document.documentElement.dataset.colorTheme==='night','night theme',10000);
}
await wait(()=>!document.documentElement.dataset.mobileNavigation,'settled',10000);await pause(5000);
window.__omiResumeSentinel='retained-1123-'+Date.now();
const node=document.querySelector(scope==='home'?'.omi-home':scope==='settings'?'.mobile-settings-surface':'.page-panel.is-visible');
const original=document.startViewTransition?.bind(document),trace=[];
if(original)document.startViewTransition=update=>{trace.push({event:'transition',direction:document.documentElement.dataset.mobileNavigation,at:Date.now()});return original(update);};
for(const name of ['omi-app-pause','omi-app-resume','pagehide','pageshow'])window.addEventListener(name,()=>trace.push({event:name,at:Date.now()}));
document.addEventListener('visibilitychange',()=>trace.push({event:document.visibilityState,at:Date.now()}));
const state=()=>({sentinel:window.__omiResumeSentinel,timeOrigin:performance.timeOrigin,url:location.href,nodeRetained:node.isConnected&&visible(node),transition:document.documentElement.dataset.mobileNavigation??null,documentLoads:performance.getEntriesByType('navigation').length,theme:document.documentElement.dataset.colorTheme,readerPage:document.querySelector('.reader-native-image')?.dataset.nativeImage??null});
const routes=short?['icon-15000','lock-15000','trim-15000']:scope==='home'?['icon-300000','lock-150000','trim-15000']:['icon-180000','lock-150000','trim-15000'];
const results=[];
for(const route of routes){
  const before=state(),start=trace.length;
  window.__omiFrameProbe=true;await wait(()=>!window.__omiFrameProbe,'start pixels',10000);
  window.__omiLifecycle=route;await wait(()=>!window.__omiLifecycle,'real '+route);
  const after=state();window.__omiFrameProbeStop=true;await wait(()=>!window.__omiFrameProbeStop,'pixels',10000);
  const frames=window.__omiFrameProbeResult,events=trace.slice(start);
  results.push({route,before,after,native:window.__omiLifecycleResult,events,frames:{count:frames.count,uniformBlankFrames:frames.uniformBlankFrames,meanRgbRange:Math.max(...frames.frames.map(f=>f.meanRgb))-Math.min(...frames.frames.map(f=>f.meanRgb))}});
  assert(before.sentinel===after.sentinel&&before.timeOrigin===after.timeOrigin&&after.documentLoads===1,'Document reloaded');
  assert(after.nodeRetained&&before.readerPage===after.readerPage&&before.theme===after.theme,'Current page lost');
  assert(!after.transition&&!events.some(e=>e.event==='transition'),'Old navigation replayed');
  assert(window.__omiLifecycleResult.resumeSnapshotReleased,'Cover leaked');
}
// A real tap/back must work after the cover disappears, not merely DOM state.
if(scope==='home'){await tap(button('打开资源库'));await wait(()=>document.querySelector('.page-panel.is-visible .mobile-resource-card'),'tap after resume',15000);}
else {window.__omiKey=4;await wait(()=>!window.__omiKey,'back after resume',10000);await pause(500);assert(scope!=='reader'||!document.querySelector('.page-panel.is-visible .reader-native-image'),'Reader back was blocked');}
return {scope,results,realLockAndBackground:true,interactionAfterResume:true};
