// Runs against the signed APK with real Android touch, IME and Back input.
const assert=(value,message)=>{if(!value)throw new Error(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+22000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(70);}};
const api=window.omicomic,value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiRegression1141');
assert(root,'Authorized root was lost during upgrade');
assert(initial.favorites.some(f=>f.title==='Upgrade preservation'&&f.note==='Preserve this record'),'Favorite was lost during upgrade');
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tap=async el=>{
  assert(el,'Missing touch target');el.scrollIntoView({block:'nearest'});await pause(220);
  let r=el.getBoundingClientRect(),stable=0;
  for(let i=0;i<10&&stable<3;i++){await pause(100);const next=el.getBoundingClientRect();stable=Math.hypot(next.x-r.x,next.y-r.y)<1?stable+1:0;r=next;}
  window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(60,r.height/2),viewport:innerWidth};
  await wait(()=>!window.__omiTap,'native touch');await pause(100);
};
const key=async code=>{window.__omiKey=code;await wait(()=>!window.__omiKey,'native key');await pause(220);};
const setInput=(el,text)=>{assert(el,'Missing search field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));};
const cards=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')];
const card=name=>cards().find(el=>el.querySelector('strong')?.textContent===name);
const virtualCount=()=>{
  const grid=document.querySelector('.page-panel.is-visible .resource-list'),canvas=grid?.closest('.library-virtual-canvas');
  if(!grid||!canvas||!cards().length)return 0;
  const css=getComputedStyle(grid),gap=parseFloat(css.rowGap)||0,columns=css.gridTemplateColumns.split(/\s+/).length;
  const stride=Math.max(...cards().slice(0,columns).map(el=>el.getBoundingClientRect().height))+gap;
  return Math.round((parseFloat(canvas.style.height)+gap)/stride)*columns;
};
const nav=name=>[...document.querySelectorAll('.sidebar-primary-nav button')].find(el=>el.textContent.includes(name));
const search=()=>document.querySelector('.mobile-library-bar input[role="searchbox"]');
let scans=0;const scan=api.scanLibrary;api.scanLibrary=(...args)=>{scans++;return scan(...args);};
await tap(button('打开资源库'));await wait(()=>cards().length>6,'library cards');await pause(1500);
assert(scans===0,'Ordinary browsing performed a full catalog scan');
await tap(button('搜索'));await wait(()=>search(),'search opened');setInput(search(),'Target');
await wait(()=>cards().length===1&&card('Artists'),'root search folder');
assert(document.querySelectorAll('.mobile-library-bar button').length===1,'Search has duplicate close buttons');
await key(66);await wait(()=>search()?.value==='Target','Enter preserves query');
await pause(300);assert(search()?.value==='Target','IME hide cleared an Enter-confirmed query');
for(const [from,to] of [['Artists','Volumes'],['Volumes','Series'],['Series','Target JK.cbz']]){
  await tap(card(from));await wait(()=>cards().length===1&&card(to),'search branch '+to);
}
await tap(card('Target JK.cbz'));await wait(()=>document.querySelector('.reader-layout'),'reader opened');
await key(4);await wait(()=>search()?.value==='Target'&&card('Target JK.cbz'),'reader Back preserves search');
await key(4);await wait(()=>!search()&&card('Target JK.cbz'),'next Back cancels search');
for(const name of ['Series','Volumes','Artists']){await key(4);await wait(()=>card(name),'parent Back '+name);}
await tap(button('搜索'));await wait(()=>search(),'reopen search');setInput(search(),'Target');await wait(()=>card('Artists')&&cards().length===1,'search ready');
await tap(button('清空搜索'));await wait(()=>search()?.value==='','first cross clears');
await tap(button('关闭搜索'));await wait(()=>!search(),'second cross closes');
await tap(button('搜索'));await wait(()=>search(),'IME Back search');setInput(search(),'Target');
await key(4);await wait(()=>!search(),'IME Back clears and exits');
for(const label of ['收藏','书签','最近阅读','书架','资源库']){await tap(nav(label));await wait(()=>!search(),'navigation '+label);}
await wait(()=>card('Artists'),'resource root restored');
for(let round=0;round<3;round++){
  await tap(card('Artists'));await wait(()=>card('Volumes'),'Artists enter');
  await tap(card('Volumes'));await wait(()=>card('Series'),'Volumes enter');
  await key(4);await wait(()=>card('Volumes'),'Volumes Back');
  await key(4);await wait(()=>card('Artists'),'Artists Back');
}
await tap(button('显示选项'));await wait(()=>button('随机阅读'),'random switch');
const coldStart=performance.now();await tap(button('随机阅读'));await tap(button('关闭显示选项'));
await wait(()=>cards().length>0&&button('重新抽取')&&!button('重新抽取').disabled,'random batch');
assert(virtualCount()===50,'Random batch size differs from page size: '+virtualCount());
const randomColdMs=Math.round(performance.now()-coldStart),first=cards().map(el=>el.querySelector('strong')?.textContent).join('|');
assert(button('重新抽取').textContent.trim()==='重新抽取'&&!button('重新抽取').querySelector('svg'),'Random refresh is not text');
const repeatStart=performance.now();await tap(button('重新抽取'));await wait(()=>cards().length>0&&!button('重新抽取').disabled&&cards().map(el=>el.querySelector('strong')?.textContent).join('|')!==first,'new random batch');
assert(virtualCount()===50,'Redraw changed batch size');
const randomRepeatMs=Math.round(performance.now()-repeatStart);
assert(randomColdMs<10000&&randomRepeatMs<4000,'Random browse too slow');
await tap(button('显示选项'));await tap(button('随机阅读'));await tap(button('关闭显示选项'));await wait(()=>card('Artists'),'random restores browse');
const pages=await value(api.getResourcePages({path:root.path+'/Other/Nested.zip',type:'archive'}));assert(pages.total===8,'Nested ZIP pages missing');
await value(api.getPageImage(pages.pages[0]));
window.__omiShot='android-regression1141-complete';await wait(()=>!window.__omiShot,'screenshot');
return {version:(await api.getAppInfo()).version,upgradePreserved:true,nativeTouch:true,realBack:true,enterPreservesSearch:true,readerReturnsToSearch:true,oneSearchCross:true,imeBackClears:true,tabSwitches:5,folderBackRounds:3,noUnsolicitedScan:true,randomColdMs,randomRepeatMs,nestedZipPages:pages.total,scans};
