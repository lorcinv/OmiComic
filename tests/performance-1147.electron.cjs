const {_electron}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const label=process.env.OMI_BENCH_LABEL||'current',exe=process.env.OMI_BENCH_EXE;
 const root=path.resolve('output/repair-1142/cover-fixture'),profile=path.resolve('.cache/performance-1147/'+label+'-'+Date.now());
 await fs.mkdir(profile,{recursive:true});
 const env={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const launch=()=>_electron.launch({executablePath:exe||path.resolve('release/win-unpacked/OmiComic.exe'),env});
 let app=await launch();
 try {const page=await app.firstWindow();await page.waitForFunction(()=>!!window.omicomic);await page.evaluate(async root=>{
   const api=window.omicomic;
   for(const result of [await api.addLibraryRoot({path:root,name:'Cover benchmark'}),await api.updateLibraryState({lastActiveRootPath:root,lastCurrentPath:root}),await api.updateSettings({showHomePage:true,cardScale:100,pageSize:100,sortMode:'name-asc'})])if(!result.ok)throw Error(result.error.message);
 },root);}finally{await app.close();}
 const results=[];
 for(const round of ['cold','restarted']){
  app=await launch();
  try {await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setSize(1440,960);});const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.omi-home__library').waitFor();
   // Probe the real IPC handler as well as pixels: hidden-window lazy image
   // display can be delayed independently of cover generation.
   await app.evaluate(({ipcMain})=>{const handler=ipcMain._invokeHandlers.get('缩略图:获取');if(!handler)throw Error('Missing cover handler');globalThis.__nativeCovers=[];ipcMain._invokeHandlers.set('缩略图:获取',async(...args)=>{const start=performance.now(),result=await handler(...args);globalThis.__nativeCovers.push({start,end:performance.now(),ready:!!result?.data?.url});return result;});});
   await page.evaluate(()=>{const stats=window.__coverBench={start:0,first:0,sixth:0};document.querySelector('.omi-home__library').addEventListener('click',()=>{stats.start=performance.now();},{capture:true,once:true});const sample=()=>{const ready=[...document.querySelectorAll('.resource-preview img')].filter(img=>img.complete&&img.naturalWidth>0).length;if(stats.start&&ready&&!stats.first)stats.first=performance.now()-stats.start;if(stats.start&&ready>=6&&!stats.sixth)stats.sixth=performance.now()-stats.start;if(!stats.sixth)setTimeout(sample,16);};sample();});
   await page.locator('.omi-home__library').click();await page.waitForFunction(()=>window.__coverBench.sixth>0,{},{timeout:45000});
   const sample=await page.evaluate(async()=>({version:(await window.omicomic.getAppInfo()).version,...window.__coverBench}));delete sample.start;
   const native=await app.evaluate(()=>{const calls=globalThis.__nativeCovers,first=Math.min(...calls.map(item=>item.start)),ready=calls.filter(item=>item.ready).sort((a,b)=>a.end-b.end);return {calls:calls.length,firstMs:ready[0]?.end-first,sixMs:ready[5]?.end-first};});
   results.push({round,...sample,native});
  }finally{await app.close();}
 }
 await fs.writeFile('output/performance-1147/covers-'+label+'.json',JSON.stringify(results,null,2));console.log(JSON.stringify({label,profile,results}));
})().catch(error=>{console.error(error);process.exitCode=1;});
