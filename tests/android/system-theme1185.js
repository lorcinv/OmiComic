const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const wait=async(fn,label)=>{const end=performance.now()+15000;while(!await fn()){if(performance.now()>end)throw Error(label+' '+document.body.innerText.slice(-600));await pause(30);}};
const probe=async()=>{window.__omiNativeProbe=true;await wait(()=>!window.__omiNativeProbe,'native probe');return window.__omiNativeStats;};
const mode=async dark=>{window.__omiNightMode=dark?'yes':'no';await wait(()=>!window.__omiNightMode,'system appearance');};
const checks=[],profile=innerWidth<600?'phone':'tablet';
await mode(false);
// Each run starts from the manual-light state, including after an interrupted test.
const reset=await window.omicomic.updateSettings({colorTheme:'mist',dayColorTheme:'mist',followSystemTheme:false});assert(reset.ok,'reset test appearance');
document.querySelector('.mobile-home-nav button:last-child').click();await wait(()=>document.querySelector('.mobile-setting-category'),'settings');
[...document.querySelectorAll('.mobile-setting-category')].find(el=>el.textContent.includes('外观与主题')).click();await wait(()=>document.querySelector('[aria-label="界面主题"]'),'appearance');
const follow=[...document.querySelectorAll('label.settings-toggle')].find(el=>el.textContent.includes('跟随系统主题')).querySelector('input');
assert(!follow.checked,'manual appearance was not loaded');
async function choose(label){document.querySelector('[role="combobox"][aria-label="界面主题"]').click();await wait(()=>[...document.querySelectorAll('[role="option"]')].some(el=>el.textContent.trim()===label),'theme option '+label);[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()===label).click();await wait(()=>!document.querySelector('[role="listbox"]'),'theme selected');}
await choose('暖沙');follow.click();await wait(()=>document.documentElement.dataset.followSystemTheme==='true','follow enabled');
await wait(async()=>document.documentElement.dataset.colorTheme==='sand'&&(await probe()).systemTheme==='sand','native light theme');
document.querySelector('[role="combobox"][aria-label="界面主题"]').click();await wait(()=>document.querySelector('[role="listbox"]'),'themes');const night=[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()==='夜色');assert(night.getAttribute('aria-disabled')==='true','daytime night option is enabled');window.dispatchEvent(new Event('omi-close-select'));await wait(()=>!document.querySelector('[role="listbox"]'),'close themes');
window.__omiShot='system-theme1185-'+profile+'-light';await wait(()=>!window.__omiShot,'light screenshot');
await mode(true);await wait(async()=>document.documentElement.dataset.colorTheme==='night'&&(await probe()).systemTheme==='night','native system dark');checks.push({system:'dark',theme:document.documentElement.dataset.colorTheme,native:await probe()});
window.__omiShot='system-theme1185-'+profile+'-dark';await wait(()=>!window.__omiShot,'dark screenshot');
await choose('北境');assert(document.documentElement.dataset.colorTheme==='night','day preference overrides automatic night');
await mode(false);await wait(async()=>document.documentElement.dataset.colorTheme==='nord'&&(await probe()).systemTheme==='nord','restore daytime palette');
follow.click();await wait(()=>document.documentElement.dataset.followSystemTheme==='false','follow disabled');await mode(true);await pause(400);assert(document.documentElement.dataset.colorTheme==='nord'&&(await probe()).systemTheme==='nord','disabled follow changed theme');
await mode(false);const data=await window.omicomic.getAppData();assert(data.ok&&data.data.settings.dayColorTheme==='nord'&&data.data.settings.followSystemTheme===false,'settings were not persisted');checks.push({system:'light',settings:data.data.settings,theme:document.documentElement.dataset.colorTheme});
return {checks,viewport:{width:innerWidth,height:innerHeight},physicalDevice:false};
