const pause=ms=>new Promise(r=>setTimeout(r,ms)),value=async p=>{const r=await p;if(!r.ok)throw new Error(JSON.stringify(r));return r.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(r=>r.name==='OmiSmoke');
const book=await value(api.getResourcePages({path:root.path+'/Png117/LargePng110.cbz'}));
const results=[];
for(let i=0;i<5;i++){
  const page=await value(api.getPageImage(book.pages[i]));
  window.__omiPngBench=page.url;const end=Date.now()+180000;
  while(window.__omiPngBench){if(Date.now()>end)throw new Error('Decode timeout');await pause(100);}
  results.push({page:i+1,...window.__omiPngBenchResult});
}
return {pages:book.total,results};
