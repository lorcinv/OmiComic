const assert=(value,message)=>{if(!value)throw new Error(message);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(50);}};
const visible=e=>e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(e=>visible(e)&&(e.textContent.trim()===label||e.querySelector('strong')?.textContent===label));
const tap=async e=>{assert(e,'Missing touch target');e.scrollIntoView({block:'nearest'});await pause(300);const r=e.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(40,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'touch');};
const originalFetch=window.fetch.bind(window);
const endpoint='https://api.github.com/repos/lorcinv/OmiComic/releases';
const releaseURL='https://github.com/lorcinv/OmiComic/releases/tag/v9.9.9';
// A real request checks Android's permission, CSP and native request allowlist.
const response=await originalFetch(endpoint+'?per_page=1',{signal:AbortSignal.timeout(15000)});
assert(response.ok,'Official releases request failed: HTTP '+response.status);
assert(Array.isArray(await response.json()),'Official release metadata missing');
if(button('设置'))await tap(button('设置'));else window.dispatchEvent(new Event('omi-open-settings'));
await wait(()=>button('关于 OmiComic'),'settings');
await tap(button('关于 OmiComic'));await wait(()=>document.querySelector('.omi-update-check'),'updates');
const status=()=>document.querySelector('.omi-update-result').textContent;
const payload=[{tag_name:'v9.9.9',html_url:releaseURL,draft:false,prerelease:false,body:'更新提醒界面测试',assets:[{name:'OmiComic-9.9.9-android.apk',size:123,browser_download_url:'https://github.com/lorcinv/OmiComic/releases/download/v9.9.9/OmiComic-9.9.9-android.apk'}]}];
try{
  window.fetch=(url,options)=>String(url).startsWith(endpoint)?Promise.reject(new TypeError('Test offline')):originalFetch(url,options);
  await tap(button('检查更新'));await wait(()=>status().includes('暂时无法检查更新'),'manual failure');
  window.fetch=(url,options)=>String(url).startsWith(endpoint)?Promise.resolve(new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}})):originalFetch(url,options);
  await tap(button('检查更新'));await wait(()=>status().includes('发现新版本 9.9.9'),'retry and available version');
  const link=document.querySelector('.omi-update-result a');
  assert(link.href===releaseURL&&!link.target,'Release link must use native main-frame handoff');
  await tap(link);await pause(500);
  return {officialNetworkStatus:response.status,manualFailure:true,retry:true,releaseURL,version:(await window.omicomic.getAppInfo()).version};
}finally{window.fetch=originalFetch;}
