const assert=(value,message)=>{if(!value)throw new Error(message);};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+30000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(100);}};
const api=window.omicomic;
const value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData());
const root=data.library.roots.find(r=>r.name==='OmiSmoke');assert(root,'Previous directory grant was lost during upgrade');
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path}));
for(const name of ['Picture Book','Document.pdf','Story.epub'])assert(Object.values(data.readingProgress).some(p=>p.sourcePath.endsWith(name)&&p.currentPageIndex===1),'Upgrade lost progress: '+name);
const names=['RAR4.rar','RAR5.cbr','Seven.7z','Solid.cb7'];
const decoded=[];
for(const name of names) {
  const resource=await value(api.getResourcePages({path:root.path+'/'+name}));
  assert(resource.pages.map(p=>p.name).join('|')==='漫画/页1.png|漫画/页2.png|漫画/页10.png','Natural Unicode order: '+name);
  const pixels=[];
  for(const index of [2,0,1]) {
    const {url}=await value(api.getPageImage(resource.pages[index]));
    const img=new Image();img.src=url;await img.decode();assert(img.naturalWidth===800&&img.naturalHeight===1200,'Actual decoded image: '+name);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const pixel=[...ctx.getImageData(0,0,1,1).data].slice(0,3).join(',');
    assert(pixel===[ '226,232,238','210,222,223','233,223,209' ][index],'Wrong archive page: '+name+'/'+index);
    pixels.push(index+1);
  }
  const {url}=await value(api.getThumbnail({path:resource.sourcePath}));const cover=new Image();cover.src=url;await cover.decode();assert(cover.naturalWidth>0&&cover.naturalHeight<=720,'Archive cover: '+name);
  await value(api.saveReadingProgress({resourceKey:resource.resourceKey,sourcePath:resource.sourcePath,sourceType:resource.sourceType,title:resource.title,currentPageIndex:0,totalPages:3}));
  decoded.push({name,naturalOrder:true,randomAccess:pixels,cover:true});
}
for(const name of ['Encrypted.7z','Broken.rar','Empty.7z']) {
  const result=await api.getResourcePages({path:root.path+'/'+name});
  assert(!result.ok,'Invalid/encrypted/empty archive accepted: '+name);
  if(name==='Encrypted.7z')assert(JSON.stringify(result).includes('加密'),'Encrypted error not understandable');
}
document.querySelector('[aria-label="打开资源库"]').click();
await wait(()=>document.querySelector('.page-panel.is-visible .resource-card'),'library');
for(const name of names) {
  const card=[...document.querySelectorAll('.page-panel.is-visible .resource-card')].find(c=>c.textContent.includes(name));assert(card,'Card absent: '+name);card.click();
  await wait(()=>document.querySelector('.reader-layout'),'reader '+name);
  const page=()=>Number(document.querySelector('.reader-progress-rail')?.getAttribute('aria-valuenow'));
  const loaded=()=>Boolean(document.querySelector('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) .reader-native-image'))||[...document.querySelectorAll('.reader-page-spread img')].some(i=>i.complete&&i.naturalWidth===800);
  await wait(()=>page()===1&&loaded(),'render first page '+name);
  const rect=document.querySelector('.reader-stage').getBoundingClientRect();
  window.__omiTap={x:rect.left+rect.width*.85,y:rect.top+rect.height/2,viewport:innerWidth};
  await wait(()=>!window.__omiTap,'native next page tap');
  await wait(()=>page()===2&&loaded(),'render next page '+name);
  await wait(async()=>Object.values((await value(api.getAppData())).readingProgress).some(p=>p.sourcePath.endsWith(name)&&p.currentPageIndex===1),'saved '+name);
  window.dispatchEvent(new Event('omi-back'));await wait(()=>!document.querySelector('.reader-layout'),'reader closed');
}
const original=root.path+'/Solid.cb7';
const renamed=await value(api.changeLocalResource({path:original,action:'rename',name:'Renamed-Solid.cb7'}));
assert(renamed.appData.readingProgress['archive:'+renamed.newPath]?.currentPageIndex===1,'7z rename lost progress');
const resource=await value(api.getResourcePages({path:renamed.newPath}));assert(resource.total===3,'7z rename cache not invalidated');
await value(api.changeLocalResource({path:renamed.newPath,action:'rename',name:'Solid.cb7'}));
window.dispatchEvent(new Event('omi-back'));await wait(()=>document.querySelector('.omi-home'),'home');
return {upgradePreserved:true,decoded,readerPage:2,renamed7z:true,rejected:['encrypted','corrupt','empty'],viewport:innerWidth};
