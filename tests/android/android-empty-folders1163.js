const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const deadline=Date.now()+20000;while(!await fn()){if(Date.now()>deadline)throw Error(label+' '+document.body.innerText.slice(-700));await pause(40);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;},api=window.omicomic;
const data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='Halftone1149');assert(root,'Missing fixture root');
const read=async path=>{for(let i=0;i<40;i++){const result=await value(api.getThumbnail({path,type:'folder'}));if(!result.pending)return result;await pause(40);}throw Error('Folder discovery never completed');};
const cases=[];
for(const name of ['EmptyUI1163','EmptyTreeUI1163','NotesUI1163','ContentUI1163','DocumentUI1163']){
  const result=await read(root.path+'/'+name),empty=name.startsWith('Empty')||name.startsWith('Notes');
  assert((result.emptyFolder===true)===empty,'Wrong emptiness for '+name+': '+JSON.stringify(result));cases.push({name,emptyFolder:result.emptyFolder===true});
}
const names=()=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card strong')].map(node=>node.textContent);
await wait(()=>names().includes('ContentUI1163')&&names().includes('DocumentUI1163'),'nonempty folder cards');
await wait(()=>!names().some(name=>['EmptyUI1163','EmptyTreeUI1163','NotesUI1163'].includes(name)),'empty folder cards removed');
return {cases,emptyFolderCardsHidden:true,nonemptyFolderCardsRetained:true};
