const assert=(v,m)=>{if(!v)throw new Error(m);};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke'),base=root.path+'/Native112';
const decoded=[];
for(const [name,count] of [['Stored.cbz',12],['Deflate.cbz',12],['Zip64.cbz',1],['Unicode.cbz',2],['Many.cbz',2500]]){
  const start=performance.now(),book=await value(api.getResourcePages({path:base+'/'+name})),indexMs=Math.round(performance.now()-start);assert(book.total===count,'count '+name);
  if(name==='Unicode.cbz')assert(book.pages[0].name==='漫画/页1.png','Unicode name changed');
  const order=[count-1,0,Math.floor(count/2),count-1],times=[];
  for(const index of order){const start=performance.now(),{url}=await value(api.getPageImage(book.pages[index]));const img=new Image();img.src=url;await img.decode();assert(img.naturalWidth===1200&&img.naturalHeight===1800,'wrong pixels '+name);times.push(Math.round(performance.now()-start));}
  decoded.push({name,indexMs,randomReadMs:times});await value(api.releaseReaderResource(book.sourcePath));
}
for(const name of ['Encrypted.cbz','Truncated.cbz'])assert(!(await api.getResourcePages({path:base+'/'+name})).ok,'bad archive accepted '+name);
const bad=await value(api.getResourcePages({path:base+'/BadCRC.cbz'})),{url}=await value(api.getPageImage(bad.pages[0]));assert(!(await fetch(url)).ok,'CRC corruption not rejected');
const metadata=[];
for(const name of ['LongName.cbz','LongName.zip','NameBudget.cbz','NameBudget.zip','UnicodeBudget.cbz']){
  const result=await api.getResourcePages({path:root.path+'/Metadata/'+name});
  assert(!result.ok&&/路径过长|目录超过安全读取上限/.test(result.error.message),'Unbounded archive metadata: '+name+' '+JSON.stringify(result.ok?{pages:result.data.total}:result));
  metadata.push({name,rejected:true,error:result.error.message});
}
for(let i=0;i<2;i++){const allowed=await value(api.getResourcePages({path:root.path+'/Metadata/LongAllowed.cbz'}));assert(allowed.total===1&&allowed.pages[0].name.length===4096,'Valid name boundary or cached index changed');}
return {decoded,encryptedRejected:true,truncatedRejected:true,crcChecked:true,metadata,validNameBoundaryAndCache:true};
