const assert=(v,m)=>{if(!v)throw new Error(m);},api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');
const restoredCache=await value(api.getAndroidCacheInfo());assert(restoredCache.readerLimit===768*1048576&&restoredCache.thumbnailLimit===192*1048576,'Budgets lost after restart');
const books=[];
for(const name of ['Book01.cbz','Solid.cbr','Solid.cb7']){
 const book=await value(api.getResourcePages({path:root.path+'/Performance/'+name}));assert(book.total===64,'Restored book index');
 for(const i of [0,31,63]){const {url}=await value(api.getPageImage(book.pages[i]));const r=await fetch(url+'&restart='+Date.now(),{cache:'no-store'});assert(r.ok,'Restored page response');const src=URL.createObjectURL(await r.blob()),img=new Image();try{img.src=src;await img.decode();assert(img.naturalWidth===512,'Restored image');}finally{URL.revokeObjectURL(src);}}
 books.push(name);
}
await value(api.updateSettings({androidReaderDiskCacheSizeMb:512,androidThumbnailCacheSizeMb:128}));
return {budgetsRestored:true,books,pages:9,cache:restoredCache};
