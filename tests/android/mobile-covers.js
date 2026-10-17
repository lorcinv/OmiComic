const assert=(v,m)=>{if(!v)throw new Error(m);};
const value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const api=window.omicomic,root=(await value(api.getAppData())).library.roots.find(r=>r.name==='OmiSmoke');
assert(root,'OmiSmoke grant required');
const base=root.path+'/Mobile113',results=[];
await value(api.listDirectory(base));
assert((await value(api.listDirectory(base+'/Wide120'))).items.length===121,'120 empty folders must reach the device');
for(const name of ['Deep24','Wide120']){
  const path=base+'/'+name,start=performance.now();let cover,rounds=0;
  do{cover=await value(api.getThumbnail({path,type:'folder'}));rounds++;}while(cover.pending&&rounds<120);
  const coldMs=Math.round(performance.now()-start);
  let decoded=false,warmMs=null;
  if(cover.url){const img=new Image();img.src=cover.url;await img.decode();decoded=img.naturalWidth>0;const warm=performance.now();const again=await value(api.getThumbnail({path,type:'folder'}));warmMs=Math.round(performance.now()-warm);assert(again.url===cover.url,'Warm cover changed');}
  results.push({name,rounds,coldMs,decoded,warmMs});
}
const revisits=[];
for(let i=0;i<12;i++){const t=performance.now();await value(api.listDirectory(base));const cover=await value(api.getThumbnail({path:base+'/Deep24',type:'folder'}));assert(cover.url&&!cover.pending,'Returning to a folder restarted its cover scan');revisits.push(Math.round(performance.now()-t));}
const start=performance.now();
await api.refreshThumbnails?.();
const background=Array.from({length:8},()=>api.getThumbnail({path:base+'/Deep24',type:'folder'}));
const pages=await value(api.getResourcePages({path:base+'/Pages',type:'folder'}));
assert(pages.total===12,'Foreground page count');
const img=new Image();img.src=(await value(api.getPageImage(pages.pages[0]))).url;await img.decode();
const foregroundMs=Math.round(performance.now()-start);await Promise.all(background);
if((await api.getAppInfo()).version!=='1.1.2')assert(results.every(r=>r.decoded),'Deep covers failed');
return {results,revisits,foregroundMs};
