// Signed APK, real SAF provider, incremental transport and persisted URI lookup.
const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const end=Date.now()+20000;while(!await fn()){if(Date.now()>end)throw new Error('Timeout: '+label);await pause(40);}};
const api=window.omicomic,value=async p=>{const r=await p;assert(r.ok,JSON.stringify(r));return r.data;};
const initial=await value(api.getAppData()),root=initial.library.roots.find(r=>r.name==='OmiRegression1141');
assert(root&&initial.favorites.some(f=>f.title==='Upgrade preservation'&&f.note==='Preserve this record'),'Upgrade data missing');
const probe=async(action='sample')=>{window.__omiLibraryProbe={action};await wait(()=>!window.__omiLibraryProbe,'library metrics');return window.__omiLibraryMetrics;};
await pause(450);
const before=await probe(),started=performance.now();
let batch=await value(api.scanLibrary(root.path,true,false,{incremental:true,restart:true}));
const firstBatchMs=Math.round(performance.now()-started),firstRecords=batch.items.length;
assert(!batch.complete&&firstRecords>0&&firstRecords<=128,'First batch waited for the whole library or exceeded its bound');
const records=new Map();let batches=0,maxRecords=0,maxBatchMs=firstBatchMs;
while(true){
  batches++;maxRecords=Math.max(maxRecords,batch.items.length);assert(batch.items.length<=128,'Unbounded native transport');
  for(const item of batch.items){assert(item.type!=='image'&&item.type!=='unknown','Page images leaked into catalog');records.set(item.path,item);}
  if(batch.complete)break;
  await pause(batch.yielded?100:1);
  const start=performance.now();batch=await value(api.scanLibrary(root.path,true,false,{incremental:true}));maxBatchMs=Math.max(maxBatchMs,Math.round(performance.now()-start));
}
const fullScanMs=Math.round(performance.now()-started),cold=await probe();
assert(batch.directories>=2086&&batch.skipped===0,'Missing/failed directories: '+JSON.stringify(batch));
assert([...records.values()].filter(r=>r.type==='archive'||r.type==='pdf'||r.type==='epub'||r.containsImages).length>=83,'Books missing');
await probe('clear-hot');await pause(350);
const uriBefore=await probe(),target=root.path+'/Artists/Volumes/Series/Target JK.cbz';
const book=await value(api.getResourcePages({path:target,type:'archive'}));assert(book.total>0,'Deep URI open failed');
const uriAfter=await probe();
assert(uriAfter.uriIndexHits>uriBefore.uriIndexHits,'Deep open did not use persisted URI');
assert(uriAfter.directoryQueries===uriBefore.directoryQueries,'Deep open walked parent directories');
await probe('clear-hot');await pause(350);
const directoryBefore=await probe();await value(api.listDirectory(root.path+'/Artists/Volumes/Series'));const directoryAfter=await probe();
assert(directoryAfter.directoryIndexHits>directoryBefore.directoryIndexHits,'Normal listing did not reuse scan snapshot');
assert(directoryAfter.directoryQueries===directoryBefore.directoryQueries,'Normal listing queried children despite matching disk version');
await pause(350);const warmBefore=await probe(),warmStart=performance.now();
batch=await value(api.scanLibrary(root.path,false,false,{incremental:true,restart:true}));let warmBatches=1;
while(!batch.complete){batch=await value(api.scanLibrary(root.path,false,false,{incremental:true}));warmBatches++;}
const warmMs=Math.round(performance.now()-warmStart),warmAfter=await probe();
assert(warmAfter.scannerIndexHits-warmBefore.scannerIndexHits>=2086,'Persistent summaries were not reused');
assert(warmAfter.scannerQueries===warmBefore.scannerQueries,'Warm summary replay rescanned provider');
window.__omiShortLifecycle=true;await wait(()=>!window.__omiShortLifecycle,'background and launcher resume');
assert(window.__omiShortLifecycleResult.sameActivityAndPage,'Resume replaced page');
return {version:(await api.getAppInfo()).version,upgradePreserved:true,firstBatchMs,firstRecords,maxRecords,maxBatchMs,batches,directories:batch.directories,resources:records.size,fullScanMs,warmMs,warmBatches,
  coldScannerQueries:cold.scannerQueries-before.scannerQueries,warmScannerQueries:warmAfter.scannerQueries-warmBefore.scannerQueries,warmIndexHits:warmAfter.scannerIndexHits-warmBefore.scannerIndexHits,
  deepOpen:{pages:book.total,uriHits:uriAfter.uriIndexHits-uriBefore.uriIndexHits,childQueries:uriAfter.directoryQueries-uriBefore.directoryQueries,statQueries:uriAfter.resolveQueries-uriBefore.resolveQueries},
  directoryDiskHits:directoryAfter.directoryIndexHits-directoryBefore.directoryIndexHits,resume:window.__omiShortLifecycleResult};
