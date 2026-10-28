const value=async promise=>{const result=await promise;if(!result.ok)throw new Error(JSON.stringify(result));return result.data;};
const api=window.omicomic,path=await value(api.selectFolder());
if(!path)throw new Error('Directory authorization was canceled');
const root=await value(api.addLibraryRoot({path,name:'OmiRegression1141'}));
await value(api.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path}));
return {root,authorized:true};
