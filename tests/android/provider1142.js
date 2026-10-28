const end=Date.now()+30000;window.__omiCatalogProviderTest=true;
while(window.__omiCatalogProviderTest){if(Date.now()>end)throw new Error('Native provider checks timed out');await new Promise(resolve=>setTimeout(resolve,50));}
return window.__omiCatalogProviderResult;
