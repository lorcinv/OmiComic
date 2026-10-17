const result=await window.omicomic.getAppData();
if(!result.ok)throw new Error(JSON.stringify(result));
const root=result.data.library.roots.find(r=>r.name==='OmiSmoke');
if(!root)throw new Error('Persistent test directory grant missing');
const listing=await window.omicomic.listDirectory(root.path);
if(!listing.ok)throw new Error('Directory grant no longer readable');
return {data:result.data,files:listing.data.items.map(item=>item.name)};
