// Thousands of neutral folders exercise the actual provider and separate work queues.
const assert=(value,message)=>{if(!value)throw new Error(message);};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,app=await value(api.getAppData()),root=app.library.roots.find(item=>item.name==='OmiRegression1141');
assert(root,'Authorized root missing');
await value(api.listDirectory(root.path));
const scanStart=performance.now(),canceled=api.scanLibrary(root.path,true,true);
const listStart=performance.now();await value(api.listDirectory(root.path));const foregroundListMs=Math.round(performance.now()-listStart);
api.cancelLibraryScan();const cancelStart=performance.now(),canceledResult=await canceled,cancelMs=Math.round(performance.now()-cancelStart);
assert(!canceledResult.ok,'Canceled scan was delivered as a successful complete inventory');
assert(foregroundListMs<1500&&cancelMs<1500,'Catalog blocked foreground operations');
const fullStart=performance.now(),pool=await value(api.scanLibrary(root.path,true,true)),fullScanMs=Math.round(performance.now()-fullStart);
const expectedBooks=window.__omiFixture==='formats1142'?98:83;
assert(pool.directories>=2080,'Large directory fixture missing');assert(pool.items.length===expectedBooks,'Books-only pool lost or duplicated books: '+pool.items.length);
const book=await value(api.getResourcePages({path:root.path+'/Group 000',type:'folder'}));assert(book.total===3,'Canceled scan affected folder reading');
return {version:(await api.getAppInfo()).version,directories:pool.directories,books:pool.items.length,fullScanMs,foregroundListMs,cancelMs,canceledScanMs:Math.round(cancelStart-scanStart),normalReadingAfterCancel:true};
