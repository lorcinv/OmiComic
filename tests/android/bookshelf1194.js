const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-800));await pause(30);}};
const button=name=>[...document.querySelectorAll('button')].find(el=>el.getClientRects().length&&(el.getAttribute('aria-label')===name||el.textContent.trim()===name));
const tap=async element=>{if(!element)throw Error('Missing tap target');const r=element.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const settled=()=>wait(()=>!document.documentElement.hasAttribute('data-mobile-navigation'),'navigation settled');
const root=()=>document.querySelector('.bookshelf-root-view');
const books=()=>document.querySelector('[aria-label="书架资源列表"]');
const target=()=>[...document.querySelectorAll('.mobile-bookshelf-card')].find(el=>el.querySelector('strong')?.textContent==='Shelf 20');
const near=(actual,expected)=>Math.abs(actual-expected)<2;

if(button('打开资源库'))await tap(button('打开资源库'));
await wait(()=>document.querySelector('.sidebar-primary-nav'),'library');
await settled();await pause(350);
const shelfNav=()=>[...document.querySelectorAll('.sidebar-primary-nav .sidebar-item')].find(el=>el.querySelector('span')?.textContent==='书架');
await tap(shelfNav());await wait(root,'shelf list');await settled();
const grid=root().querySelector('.bookshelf-folder-grid'),card=grid.querySelector('.mobile-bookshelf-card'),style=getComputedStyle(grid);
const columns=style.gridTemplateColumns.split(/\s+/).length,stride=card.getBoundingClientRect().height+(parseFloat(style.rowGap)||0);
root().scrollTop=Math.max(500,Math.floor(20/columns)*stride-80);root().dispatchEvent(new Event('scroll'));
await wait(target,'target shelf mounted');await pause(150);
target().scrollIntoView({block:'center'});await pause(150);
const rootTop=root().scrollTop,checks=[];
if(rootTop<500)throw Error('Shelf fixture did not scroll');

for(const exit of ['system-back','sidebar']){
  await tap(target());await wait(books,'shelf books');await settled();
  if(exit==='sidebar')await wait(()=>near(books().scrollTop,950),'remembered shelf position');
  books().scrollTop=950;books().dispatchEvent(new Event('scroll'));await wait(()=>near(books().scrollTop,950),'scroll shelf');await pause(150);
  if(exit==='system-back'){window.__omiBack=true;await wait(()=>!window.__omiBack,'Android Back');}else await tap(shelfNav());
  await wait(root,'returned to shelf list');await settled();await wait(()=>near(root().scrollTop,rootTop),'restored shelf list position');
  checks.push({exit,rootScrollTop:root().scrollTop,bookScrollTop:950});
}
await tap(target());await wait(books,'reentered shelf');await settled();await wait(()=>near(books().scrollTop,950),'restored shelf books position');
return {version:await window.omicomic.getAppInfo(),checks,reenteredScrollTop:books().scrollTop,transport:'final APK, native bridge, real taps and Android Back'};
