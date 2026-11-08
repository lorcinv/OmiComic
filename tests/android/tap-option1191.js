const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label,timeout=15000)=>{const end=performance.now()+timeout;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(20);}};
const api=window.omicomic,root=window.__omiTabletRoot,restoring=window.__omiFixture.endsWith('restore');
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const active=s=>document.querySelector('.page-panel.is-visible '+s);
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const settled=()=>wait(async()=>!(await probe()).sceneCovered,'scene transition');
const tap=async(x,y,repeat=1)=>{window.__omiTap={x,y,repeat,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const setting=()=>[...document.querySelectorAll('.mobile-volume-settings label')].find(n=>n.textContent==='双击放大画面')?.querySelector('input');
const openSettings=async()=>{
  if(!active('.is-mobile-chrome-visible')){const r=active('.reader-stage').getBoundingClientRect();await tap(r.x+r.width/2,r.y+r.height/2);await wait(()=>active('.is-mobile-chrome-visible'),'show controls');}
  active('[aria-label="阅读设置"]').click();await wait(setting,'reader setting');await pause(200);
};
const closeSettings=async()=>{window.dispatchEvent(new Event('omi-reader-back'));await wait(()=>!document.querySelector('.mobile-sheet-overlay'),'closed sheet');await pause(100);};
const setEnabled=async enabled=>{await openSettings();if(setting().checked!==enabled)setting().click();await wait(async()=>setting().checked===enabled&&(await value(api.getAppData())).settings.mobileReaderDoubleTapZoom===enabled,'saved switch');await closeSettings();};
const index=()=>Number(active('.reader-progress-rail').getAttribute('aria-valuenow'));
const stage=()=>active('.reader-stage');
const data=await value(api.getAppData());
if(restoring)assert(data.settings.mobileReaderDoubleTapZoom===false,'disabled preference lost after app restart');
await value(api.updateSettings({mobileReaderAutoHide:false,readerPreloadPages:3,...(!restoring?{mobileReaderDoubleTapZoom:true}:{})}));
window.__omiRotation=1;await wait(()=>window.__omiRotation==null,'portrait');await pause(200);
document.querySelector('[aria-label="打开资源库"]')?.click();
const card=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(c=>c.querySelector('strong')?.textContent==='Panorama.cbz');
await wait(card,'fixture card');await settled();
const resource=await value(api.getResourcePages({path:root+'/Panorama.cbz'}));
await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:'Panorama.cbz',currentPageIndex:20,totalPages:resource.total,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
card().querySelector('strong').click();await wait(()=>active('.reader-native-image'),'native image');await settled();await pause(250);
await openSettings();assert(setting().checked===!restoring,'reader switch did not load saved value');await closeSettings();
const frame=stage().getBoundingClientRect(),x=frame.x+frame.width*.85,y=frame.y+frame.height*.5,center=frame.x+frame.width*.5;
const timedPage=async()=>{
  const rail=active('.reader-progress-rail'),before=index();let released=0,elapsed=null;
  stage().addEventListener('pointerup',()=>released=performance.now(),{capture:true,once:true});
  const observer=new MutationObserver(()=>{if(index()!==before){elapsed=performance.now()-released;observer.disconnect();}});
  observer.observe(rail,{attributes:true,attributeFilter:['aria-valuenow']});
  await tap(x,y);await wait(()=>elapsed!==null,'page changed');assert(index()===before+1,'single tap page count');await pause(250);return elapsed;
};
let enabledDelay=null;
if(!restoring){enabledDelay=await timedPage();assert(enabledDelay>=170,'double-tap window missing');await setEnabled(false);}
const disabledDelay=await timedPage();assert(disabledDelay<160,'disabled tap still waited '+disabledDelay);
const sequence=index();await tap(x,y,2);await wait(()=>index()>=sequence+2,'consecutive immediate page turns');assert(index()===sequence+2,'rapid taps did not turn exactly two pages');
await tap(center,y,2);await pause(300);assert(Number(stage().dataset.readerZoom)===1,'disabled double tap zoomed');
await setEnabled(true);const before=index();await tap(x,y,2);await wait(()=>Number(stage().dataset.readerZoom)===2,'reenabled double tap');await pause(250);assert(index()===before,'double tap turned page');
const native=await probe();assert(native.currentZoom===2,'native surface did not zoom');
if(!restoring){
  await setEnabled(false);await tap(center,y,2);await pause(300);assert(Number(stage().dataset.readerZoom)===2,'disabled switch left legacy double-tap reset active');
  window.dispatchEvent(new Event('omi-reader-back'));await wait(()=>!active('.reader-layout'),'back');await settled();
  card().querySelector('strong').click();await wait(()=>active('.reader-native-image'),'reopened reader');await settled();
  await openSettings();assert(!setting().checked,'disabled preference lost on reopening');window.__omiShot='tap-option1191-off';await wait(()=>!window.__omiShot,'screenshot');await closeSettings();
  window.dispatchEvent(new Event('omi-reader-back'));await wait(()=>!active('.reader-layout'),'back to settings');await settled();
  active('[aria-label="显示选项"]').click();await wait(()=>document.querySelector('.mobile-settings-link'),'display options');
  [...document.querySelectorAll('.mobile-settings-link')].find(n=>n.textContent.trim()==='应用设置').click();await wait(()=>document.querySelector('.mobile-settings-page'),'global settings');
  [...document.querySelectorAll('.mobile-setting-category')].find(n=>n.querySelector('strong')?.textContent==='默认阅读').click();
  const globalSwitch=()=>[...document.querySelectorAll('.mobile-settings-page label')].find(n=>n.textContent==='双击放大画面')?.querySelector('input');
  await wait(globalSwitch,'global double tap switch');assert(!globalSwitch().checked,'global setting displays stale reader preference');
  window.__omiShot='tap-option1191-global';await wait(()=>!window.__omiShot,'global screenshot');
}else{
  await tap(x,y,2);await wait(()=>Number(stage().dataset.readerZoom)===1,'double tap restore');
}
return {restoredAfterRestart:restoring,enabledDelay,disabledDelay,rapidTapPages:2,reenabledZoom:native.currentZoom,disabledLegacyReset:!restoring,savedSetting:(await value(api.getAppData())).settings.mobileReaderDoubleTapZoom};
