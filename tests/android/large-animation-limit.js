const api=window.omicomic,root=window.__omiTabletRoot;
const result=await api.getPageImage({type:'folder-image',sourcePath:root+'/LargeAnimationLimits/TooLarge.gif'});
if(result.ok||!result.error?.message?.includes('256 MiB'))throw Error('Incorrect large animation error: '+JSON.stringify(result));
return {version:(await api.getAppInfo()).version,overLimitRejected:true,message:result.error.message};
