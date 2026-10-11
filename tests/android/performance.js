const assert=(value,message)=>{if(!value)throw new Error(message);};
const value=async promise=>{const r=await promise;assert(r.ok,JSON.stringify(r));return r.data;};
const api=window.omicomic;
const data=await value(api.getAppData()), root=data.library.roots.find(r=>r.name==='OmiSmoke');
assert(root,'Dedicated OmiSmoke directory grant required');
const version=(await api.getAppInfo()).version;
// Let startup rendering settle so it is not charged to an arbitrary first bridge reply.
await new Promise(resolve=>setTimeout(resolve,2000));
let start=performance.now();
const listing=await value(api.listDirectory(root.path+'/Performance'));
const listMs=Math.round(performance.now()-start);
assert(listing.items.length>=13,'Run performance-fixtures.cjs and copy to OmiSmoke/Performance');
const images=[];
const background=listing.items.flatMap(file=>[
  api.getThumbnail(file).then(async r=>{assert(r.ok,'cover metadata');const img=new Image();images.push(img);img.src=r.data.url;await img.decode();}),
  value(api.getReadablePageCount(file)),
]);
const target=listing.items.find(f=>f.name==='Book12.cbz');
start=performance.now();
const resource=await value(api.getResourcePages(target));
assert(resource.total===64,'64 real pages expected');
const openMs=Math.round(performance.now()-start);
const first=await value(api.getPageImage(resource.pages[0]));
const img=new Image();img.src=first.url;await img.decode();
assert(img.naturalWidth===512&&img.naturalHeight===768,'Large archive image did not decode');
const firstPageMs=Math.round(performance.now()-start);
await Promise.all(background);
const allCoversMs=Math.round(performance.now()-start);
const formats=[];
for(const name of ['Solid.cbr','Solid.cb7']) {
  if(!listing.items.some(f=>f.name===name))continue;
  start=performance.now();const book=await value(api.getResourcePages({path:root.path+'/Performance/'+name}));
  assert(book.total===64,'solid archive count');const indexedMs=Math.round(performance.now()-start);
  for(const index of [0,1,31,32,0]){const {url}=await value(api.getPageImage(book.pages[index]));const image=new Image();image.src=url;await image.decode();assert(image.naturalWidth===512,'solid page decode');}
  const readMs=Math.round(performance.now()-start);
  await value(api.releaseReaderResource(book.sourcePath));
  start=performance.now();assert((await value(api.getResourcePages({path:book.sourcePath}))).total===64,'cached reopen');
  formats.push({name,indexedMs,readMs,reopenMs:Math.round(performance.now()-start)});
}
return {version,books:listing.items.length,bytes:listing.items.reduce((s,f)=>s+f.size,0),pagesPerBook:64,listMs,openMs,firstPageMs,allCoversMs,formats};
