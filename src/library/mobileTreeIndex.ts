// Persist only navigation metadata, never page images. Refresh/file operations
// invalidate this index; closing a drawer does not invalidate completed work.
type Folder = { path:string; name:string };
type Entry = { folders:Folder[]; hasBooks:boolean };
export type TreeNode = Folder & { expandable:boolean };
const key='omi.mobile-directory-index.v2';
const entries=new Map<string,Entry>(), trees=new Map<string,TreeNode[]>(), pending=new Map<string,Promise<Entry>>();
let hydrated=false,epoch=0,active=0;
let persistTimer:ReturnType<typeof setTimeout>|undefined;
const waiting:Array<()=>void>=[];
function hydrate(){if(hydrated)return;hydrated=true;try{const raw=JSON.parse(localStorage.getItem(key)||'{}');if(Array.isArray(raw.entries))for(const [path,entry] of raw.entries.slice(-512))if(typeof path==='string'&&Array.isArray(entry?.folders)&&entry.folders.every((f:Folder)=>typeof f.path==='string'&&typeof f.name==='string'))entries.set(path,entry);if(Array.isArray(raw.trees))for(const [path,nodes] of raw.trees.slice(-128))if(typeof path==='string'&&Array.isArray(nodes)&&nodes.every((n:TreeNode)=>typeof n.path==='string'&&typeof n.name==='string'&&typeof n.expandable==='boolean'))trees.set(path,nodes);}catch{/* A discarded cache never blocks navigation. */}}
function persist(immediate=false){
  while(entries.size>512)entries.delete(entries.keys().next().value!);while(trees.size>128)trees.delete(trees.keys().next().value!);
  const write=()=>{persistTimer=undefined;try{localStorage.setItem(key,JSON.stringify({entries:[...entries],trees:[...trees]}));}catch{/* Storage pressure: retain the in-memory index. */}};
  if(immediate){clearTimeout(persistTimer);write();}else if(!persistTimer)persistTimer=setTimeout(write,250);
}
export function clearMobileTreeCache(){epoch++;clearTimeout(persistTimer);persistTimer=undefined;entries.clear();trees.clear();pending.clear();hydrated=true;try{localStorage.removeItem(key);}catch{}}
async function read(path:string):Promise<Entry>{
  hydrate();const saved=entries.get(path);if(saved)return saved;const existing=pending.get(path);if(existing)return existing;
  const generation=epoch;
  const promise=(async()=>{
    if(active>=2)await new Promise<void>(resolve=>waiting.push(resolve));else active++;
    try{
      const result=await window.omicomic.listDirectory(path);if(!result.ok)throw new Error(result.error.message);
      const entry:Entry={folders:result.data.items.filter(item=>item.type==='folder').map(({path,name})=>({path,name})),hasBooks:result.data.items.some(item=>['archive','pdf','epub'].includes(item.type))};
      if(generation===epoch){entries.set(path,entry);persist();}return entry;
    }finally{const next=waiting.shift();if(next)next();else active--;}
  })();pending.set(path,promise);try{return await promise;}finally{if(pending.get(path)===promise)pending.delete(path);}
}
export function cachedMobileTree(path:string):TreeNode[]|undefined{
  hydrate();if(trees.has(path))return trees.get(path);const entry=entries.get(path);if(!entry||entry.folders.some(folder=>!entries.has(folder.path)))return;
  return entry.folders.filter(folder=>{const child=entries.get(folder.path)!;return child.folders.length>0||child.hasBooks;}).map(folder=>({...folder,expandable:entries.get(folder.path)!.folders.length>0}));
}
export async function loadMobileTree(path:string):Promise<TreeNode[]>{
  const cached=cachedMobileTree(path);if(cached)return cached;const generation=epoch;
  const entry=await read(path),children=await Promise.all(entry.folders.map(folder=>read(folder.path)));
  const nodes=entry.folders.flatMap((folder,index)=>{const child=children[index];return child.folders.length||child.hasBooks?[{...folder,expandable:child.folders.length>0}]:[];}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  if(generation===epoch){trees.set(path,nodes);persist();}return nodes;
}
