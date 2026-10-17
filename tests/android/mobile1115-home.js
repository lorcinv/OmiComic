const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout '+label);await pause(30);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Missing fixture root');
const names=['Pages','Large','Deflate.cbz','Many.cbz'];
for(const name of names){const b=await value(api.getResourcePages({path:root.path+'/Native112/'+name}));await value(api.saveReadingProgress({resourceKey:b.resourceKey,sourcePath:b.sourcePath,sourceType:b.sourceType,title:b.title,currentPageIndex:0,totalPages:b.total}));}
document.querySelector('.mobile-home-nav button:nth-child(2)').click();
await wait(()=>document.querySelectorAll('.omi-home__book').length===4,'home cards');await pause(500);
const hits=[...document.querySelectorAll('.omi-home__book')].slice(0,2).flatMap(book=>{
  const r=book.querySelector('.omi-home__cover').getBoundingClientRect();
  return [.03,.1,.25,.5,.9].flatMap(y=>[.03,.1,.5,.9].map(x=>({book:book.getAttribute('aria-label'),hit:document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.closest('button')?.getAttribute('aria-label'),x:r.x+r.width*x,y:r.y+r.height*y})));
});
const icon=document.querySelector('.omi-brand-icon'),iconBox=icon.getBoundingClientRect(),graphicBox=icon.querySelector('svg').getBoundingClientRect();
const events=[],opened=[],read=api.getResourcePages;
api.getResourcePages=input=>{opened.push(input.path);return read(input);};
for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>events.push({type,trusted:event.isTrusted,x:event.clientX,y:event.clientY,target:event.target?.closest('button')?.getAttribute('aria-label')}),true);
const target=document.querySelectorAll('.omi-home__book')[1],label=target.getAttribute('aria-label'),r=target.querySelector('.omi-home__cover').getBoundingClientRect();
window.__omiTap={x:r.x+r.width*.1,y:r.y+r.height*.1,viewport:innerWidth};await wait(()=>!window.__omiTap,'touch');
await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader');
assert(hits.every(hit=>hit.book===hit.hit),'A first-row cover hits the brand shortcut');
assert(opened.length===1&&opened[0]===basePath(),'Touch opened the wrong comic: '+JSON.stringify({opened,label,events}));
function basePath(){return root.path+'/Native112/'+target.querySelector('.omi-home__book-title').textContent;}
return {viewport:[innerWidth,innerHeight],icon:iconBox.toJSON(),graphic:graphicBox.toJSON(),mismatches:hits.filter(h=>h.book!==h.hit),events,opened,expectedLabel:label};
