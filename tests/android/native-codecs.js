const api=window.omicomic,data=await api.getAppData(),root=data.data.library.roots.find(r=>r.name==='OmiSmoke');
const resource=await api.getResourcePages({path:root.path+'/Native112/Large'});if(!resource.ok)throw new Error(JSON.stringify(resource));
const image=await api.getPageImage(resource.data.pages[0]);if(!image.ok)throw new Error(JSON.stringify(image));window.__omiCodecUrl=image.data.url;return {prepared:true};
