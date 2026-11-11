const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-1000));await pause(40);}};
const button=name=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&(el.getAttribute('aria-label')===name||el.textContent.trim()===name));
const tap=async element=>{if(!element)throw Error('Missing tap target');await wait(()=>![...document.querySelectorAll('.mobile-sheet')].some(sheet=>sheet.style.willChange==='transform'),'sheet settled');await wait(()=>!element.closest('.page-panel.is-hidden')&&getComputedStyle(element).visibility!=='hidden'&&element.getBoundingClientRect().width>0,'visible tap target');const r=element.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const settled=()=>wait(()=>!document.documentElement.hasAttribute('data-mobile-navigation'),'navigation settled');
const root=()=>document.querySelector('.bookshelf-root-view');
const books=()=>document.querySelector('[aria-label="书架资源列表"]');
const target=()=>[...document.querySelectorAll('.mobile-bookshelf-card')].find(el=>el.querySelector('strong')?.textContent==='Shelf 20');
const nav=name=>[...document.querySelectorAll('.sidebar-primary-nav .sidebar-item')].find(el=>el.querySelector('span')?.textContent===name);
const near=(actual,expected)=>Math.abs(actual-expected)<2;
const back=async()=>{window.__omiBack=true;await wait(()=>!window.__omiBack,'Android Back');await settled();};
const select=async(label,value)=>{
  const control=document.querySelector(`[role="combobox"][aria-label="${label}"]`);
  if(!control)throw Error('Missing '+label);
  control.scrollIntoView({block:'center'});await pause(100);await tap(control);
  await wait(()=>document.querySelector('[role="listbox"]'),'options');
  const option=[...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()===value);
  if(!option)throw Error('Missing option '+value);
  option.scrollIntoView({block:'nearest'});await pause(80);await tap(option);await wait(()=>!document.querySelector('[role="listbox"]'),'option saved');
};

if(window.__omiFixture.includes('restore')){
  await wait(root,'startup bookshelf root');await settled();
  await wait(()=>near(root().scrollTop,0),'process restart root top');
  const state=await window.omicomic.getAppData();
  if(!state.ok||state.data.settings.startupPage!=='bookshelf')throw Error('Startup preference not retained');
  root().scrollTop=state.data.settings.navigationMemoryTestRoot;root().dispatchEvent(new Event('scroll'));await wait(target,'seeded shelf');
  await tap(target());await wait(books,'fresh shelf');await settled();
  await wait(()=>near(books().scrollTop,0),'process restart book top');
  return {processRestart:true,startupPage:'bookshelf',rootScrollTop:0,booksScrollTop:0};
}

if(button('打开资源库'))await tap(button('打开资源库'));
await wait(()=>document.querySelector('.page-panel.is-visible .sidebar-primary-nav'),'library');await settled();
await tap(nav('书架'));await wait(()=>root()||books(),'shelf location');await settled();
if(books())await back();
await wait(root,'shelf list');
const checks=[];
for(const layout of ['grid','list']){
  if(layout==='list'){
    await tap(button('显示选项'));await wait(()=>button('应用设置'),'settings link');await tap(button('应用设置'));
    await wait(()=>button('外观与主题配色、卡片布局与缩略预览'),'appearance');
    await tap(button('外观与主题配色、卡片布局与缩略预览'));await settled();
    await wait(()=>document.querySelector('[aria-label="调整栏目布局"]'),'appearance content and updated layout label');
    await select('卡片布局','缩略图与说明');
    await tap(button('返回设置'));await wait(()=>button('关闭设置'),'settings categories');await tap(button('关闭设置'));await settled();await wait(()=>!document.querySelector('.mobile-settings-surface')&&document.querySelector('.mobile-cards-list'),'list layout');
  }
  const grid=root().querySelector('.bookshelf-folder-grid'),card=grid.querySelector('.mobile-bookshelf-card'),style=getComputedStyle(grid);
  const columns=style.gridTemplateColumns.split(/\s+/).length,stride=card.getBoundingClientRect().height+(parseFloat(style.rowGap)||0);
  root().scrollTop=Math.floor(20/columns)*stride-80;root().dispatchEvent(new Event('scroll'));await wait(target,'target shelf');await pause(150);
  target().scrollIntoView({block:'center'});await pause(120);const rootTop=root().scrollTop;
  await tap(target());await wait(books,'books');await settled();
  books().scrollTop=950;books().dispatchEvent(new Event('scroll'));await wait(()=>near(books().scrollTop,950),'scroll books');
  await back();await wait(root,'returned root');await wait(()=>near(root().scrollTop,rootTop),'root restored');
  await tap(target());await wait(books,'reentered books');await settled();await wait(()=>near(books().scrollTop,950),'book position restored');
  await tap(nav('资源库'));await settled();await tap(nav('书架'));await settled();await wait(books,'tab returned folder');await wait(()=>near(books().scrollTop,950),'tab retained books');
  await tap(nav('书架'));await settled();await wait(root,'reselected root');await wait(()=>near(root().scrollTop,0),'reselected root top');
  root().scrollTop=rootTop;root().dispatchEvent(new Event('scroll'));await wait(target,'shelf again');await tap(target());await settled();await wait(()=>books()&&near(books().scrollTop,950),'shelf session retained');
  checks.push({layout,rootScrollTop:rootTop,booksScrollTop:950});
  if(layout==='grid'){await back();await wait(root,'grid root');await wait(()=>near(root().scrollTop,rootTop),'grid root kept');}
}
// Save a fixture locator so the restart check can manually reach Shelf 20
// after first verifying that its parent starts at the top.
const save=await window.omicomic.updateSettings({startupPage:'bookshelf',showHomePage:true,navigationMemoryTestRoot:checks[1].rootScrollTop});if(!save.ok)throw Error(save.error.message);
await pause(250);
return {checks,startupPage:'bookshelf',transport:'final APK on Android emulator; native bridge, real taps and Android Back'};
