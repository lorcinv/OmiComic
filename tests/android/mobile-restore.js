const assert=(v,m)=>{if(!v)throw new Error(m);};
const api=window.omicomic,data=(await api.getAppData()).data;
assert(data.settings.mobileLibraryLayout==='list'&&data.settings.readerVolumeKeys&&data.settings.readerVolumeKeysReversed,'Preferences lost after process restart');
const root=data.library.roots.find(r=>r.name==='OmiSmoke'),path=root.path+'/Mobile113/Deep24';
let start=performance.now();const cover=await api.getThumbnail({path,type:'folder'});
assert(cover.ok&&cover.data.url&&!cover.data.pending,'Persistent cover lookup failed');
const image=new Image();image.src=cover.data.url;await image.decode();
assert(image.naturalWidth>0,'Restarted cover did not decode');
return {preferencesRetained:true,grantRetained:true,coverDecoded:true,coverAfterRestartMs:Math.round(performance.now()-start)};
