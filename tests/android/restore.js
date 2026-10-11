const data=(await window.omicomic.getAppData()).data;
const root=data.library.roots.find(r=>r.name==='OmiSmoke');
if(!root)throw new Error('Persistent directory grant missing');
const listing=await window.omicomic.listDirectory(root.path);
if(!listing.ok||listing.data.items.length!==5)throw new Error('Directory grant or file changes not restored');
for(const name of ['Picture Book','Document.pdf','Story.epub']) {
  const record=Object.values(data.readingProgress).find(r=>r.sourcePath.endsWith(name));
  if(record?.currentPageIndex!==1)throw new Error('Progress not restored: '+name);
}
const wait=async(fn)=>{const end=Date.now()+20000;while(!fn()){if(Date.now()>end)throw new Error('Restored reader did not become ready');await new Promise(r=>setTimeout(r,100));}};
await wait(()=>document.querySelectorAll('.omi-home__book').length===3);
const book=[...document.querySelectorAll('.omi-home__book')].find(b=>b.textContent.includes('Picture Book'));
if(!book)throw new Error('Recent comic not restored to home');
book.click();
await wait(()=>document.querySelector('.reader-footer input[aria-label]')?.value==='2'&&[...document.querySelectorAll('.reader-page-spread img')].some(i=>i.complete&&i.naturalWidth===800));
return {restarted:true,grantRetained:true,recordsRestored:3,resumedImagePage:2,localFiles:listing.data.items.map(i=>i.name)};
