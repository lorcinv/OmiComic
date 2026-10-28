// A fresh target process, retaining only actual app data and derived SQLite metadata.
const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(50);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiRegression1141');assert(root,'Restart lost root');
assert(data.favorites.some(f=>f.title==='Upgrade preservation'&&f.note==='Preserve this record'),'Restart lost favorite');
for(const name of ['Document.pdf','Story.epub'])assert(Object.values(data.readingProgress).some(p=>p.sourcePath.endsWith('/Formats116/'+name)&&p.currentPageIndex===1),'Restart lost reading progress '+name);
const probe=async()=>{window.__omiLibraryProbe={action:'sample'};await wait(()=>!window.__omiLibraryProbe,'metrics');return window.__omiLibraryMetrics;};
const decode=async url=>{const image=new Image();image.src=url;await image.decode();assert(image.naturalWidth>0&&image.naturalHeight>0,'Decoded no pixels');return {width:image.naturalWidth,height:image.naturalHeight};};
const before=await probe();assert(before.directoryDbVersion===3,'SQLite migration not applied');
const deep=await value(api.getResourcePages({path:root.path+'/Artists/Volumes/Series/Target JK.cbz'})),after=await probe();
assert(deep.total===8&&after.uriIndexHits>before.uriIndexHits&&after.directoryQueries===before.directoryQueries,'Process restart did not reuse deep URI');
const coverBefore=await probe(),start=performance.now(),thumbnail=await value(api.getThumbnail({path:root.path+'/Other/Nested.zip'})),cover=await decode(thumbnail.url),coverAfter=await probe();
const coverMs=Math.round(performance.now()-start),coverIndexes=coverAfter.previewIndexBuilds-coverBefore.previewIndexBuilds;
assert(cover.height<=720&&coverIndexes<=3,'Nested cover expanded unrelated archives');
const nested=await value(api.getResourcePages({path:root.path+'/Other/Nested.zip'}));assert(nested.total===8,'Nested reader inventory incomplete');
const pages=[];for(const index of [0,4,7]){const image=await value(api.getPageImage(nested.pages[index]));pages.push({index,...await decode(image.url)});}
return {processRestart:true,rootAndFavoritePreserved:true,pdfAndEpubProgressPreserved:true,directoryDbVersion:before.directoryDbVersion,deepUriHits:after.uriIndexHits-before.uriIndexHits,deepParentQueries:after.directoryQueries-before.directoryQueries,nestedCover:{coverMs,coverIndexes,...cover},nestedPages:8,decodedPages:pages};
