const database='omi-pdf-covers-v1',limit=96;
let opened:Promise<IDBDatabase|null>|undefined;
function open(){
  return opened??=new Promise<IDBDatabase|null>(resolve=>{
    if(typeof indexedDB==='undefined'){resolve(null);return;}
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('covers',{keyPath:'key'});store.createIndex('created','created');};
    request.onsuccess=()=>resolve(request.result);request.onerror=request.onblocked=()=>resolve(null);
  });
}
export async function readPdfCover(key:string):Promise<string|null>{
  try{const db=await open();if(!db)return null;return await new Promise(resolve=>{
    const request=db.transaction('covers','readonly').objectStore('covers').get(key);
    request.onsuccess=()=>resolve(request.result?.url??null);request.onerror=()=>resolve(null);
  });}catch{return null;}
}
export async function savePdfCover(key:string,path:string,url:string):Promise<void>{
  if(url.length>512*1024||!url.startsWith('data:image/jpeg;'))return;
  try{const db=await open();if(!db)return;await new Promise<void>(resolve=>{
    const transaction=db.transaction('covers','readwrite'),store=transaction.objectStore('covers');
    store.put({key,path,url,created:Date.now()});const count=store.count();
    count.onsuccess=()=>{let remaining=count.result-limit;if(remaining<=0)return;const cursor=store.index('created').openKeyCursor();cursor.onsuccess=()=>{const item=cursor.result;if(!item||remaining--<=0)return;store.delete(item.primaryKey);item.continue();};};
    transaction.oncomplete=transaction.onerror=transaction.onabort=()=>resolve();
  });}catch{/* A cache failure must not prevent a cover from displaying. */}
}
export async function clearPdfCovers(path?:string):Promise<void>{
  try{const db=await open();if(!db)return;const transaction=db.transaction('covers','readwrite'),store=transaction.objectStore('covers');
    if(!path){store.clear();return;}
    const target=path.replace(/\\/g,'/').replace(/\/$/,''),cursor=store.openCursor();
    cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const candidate=String(item.value.path).replace(/\\/g,'/').replace(/\/$/,'');if(candidate===target||candidate.startsWith(target+'/')||target.startsWith(candidate+'/'))item.delete();item.continue();};
  }catch{/* Optional derived data. */}
}
