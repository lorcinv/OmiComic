// Compare the original release and current renderer using isolated profiles and
// the same read-only comic directory. Never uses the installed user's profile.
const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
(async()=>{
  const directory=process.env.OMICOMIC_COVER_BENCH_ROOT;
  if(!directory)throw new Error('Set OMICOMIC_COVER_BENCH_ROOT');
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'omi-cover-compare-'));
  const results=[];
  try {
    for(const target of [
      {label:'original-1.1.40',exe:path.resolve('.cache/regression-1141/stable/OmiComic.exe'),args:[]},
      {label:'fixed-'+require('../package.json').version,exe:process.env.OMICOMIC_TEST_EXE||require('electron'),args:process.env.OMICOMIC_TEST_EXE?[]:['.']},
    ]){
      const profile=path.join(scratch,target.label);await fs.mkdir(profile);
      const env={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:profile};
      delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
      const app=await _electron.launch({executablePath:target.exe,args:target.args,env});
      try {
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
        const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});
        await page.waitForFunction(()=>window.omicomic!==undefined);
        const version=await page.evaluate(async directory=>{
          const api=window.omicomic,root=await api.addLibraryRoot({path:directory,name:'Cover benchmark'});
          if(!root.ok)throw new Error(root.error.message);
          await api.updateLibraryState({lastActiveRootPath:directory,lastCurrentPath:directory});
          await api.updateSettings({cardScale:100,pageSize:100,sortMode:'name-asc'});
          return (await api.getAppInfo()).version;
        },directory);
        await page.reload();await page.locator('.omi-home__library').waitFor();
        await page.evaluate(()=>{
          const start=performance.now();window.__coverBenchmark={start,first:0,sixth:0};
          const sample=()=>{
            const count=[...document.querySelectorAll('.resource-preview img')].filter(image=>image.complete&&image.naturalWidth>0).length;
            const data=window.__coverBenchmark;if(count&&!data.first)data.first=performance.now()-start;
            if(count>=6&&!data.sixth)data.sixth=performance.now()-start;
            if(!data.sixth)setTimeout(sample,16);
          };
          sample();
        });
        await page.locator('.omi-home__library').click();
        await page.waitForFunction(()=>window.__coverBenchmark.sixth>0,{},{timeout:45000});
        const metrics=await page.evaluate(()=>window.__coverBenchmark);
        results.push({label:target.label,version,firstMs:Math.round(metrics.first),sixCoversMs:Math.round(metrics.sixth)});
      } finally {await app.close();}
    }
    await fs.writeFile(process.env.OMICOMIC_COVER_BENCH_OUTPUT||'output/repair-1142/cover-comparison.json',JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
    assert.equal(results[0].version,'1.1.40');assert.equal(results[1].version,require('../package.json').version);
    assert.ok(results[1].sixCoversMs<=results[0].sixCoversMs*1.5+300,'Visible covers regressed beyond tolerance');
  } finally {
    assert.equal(path.dirname(scratch),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('omi-cover-compare-'));
    await fs.rm(scratch,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
