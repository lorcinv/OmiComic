const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {_electron,expect}=require('@playwright/test');
const {prepare}=require('./helpers/largeAnimationFixtures.cjs');
let fixtures;
const cases=['gif','webp','apng'].flatMap(format=>['folder','archive','epub'].map(source=>({format,source})));
cases.push({format:'gif',source:'7z'},{format:'gif',source:'mixed'});
if(process.env.OMICOMIC_REAL_GIF)cases.push({format:'gif',source:'real'});
for(const {format,source} of cases)test(`large ${source} ${format} plays and returns`,{timeout:90000},async t=>{
  fixtures??=prepare();const books=await fixtures;
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'omi-large-animation-'));
  await fs.writeFile(path.join(profile,'omicomic-data.json'),JSON.stringify({version:1,library:{roots:[{path:books,name:'Books',addedAt:1,lastOpenedAt:1}]},settings:{readerPageMode:'single',readerPreloadPages:0}}));
  const env={...process.env,OMICOMIC_TEST_PROFILE:profile,OMICOMIC_TEST_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  const file=source==='real'?path.join(books,'Lorenzo','01.gif'):path.join(books,`Large-${format}`)+(source==='epub'?'.epub':source==='mixed'?'.mixed.epub':source==='archive'?'.cbz':source==='7z'?'.cb7':`/01.${format}`);
  let app;
  t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(profile),path.resolve(os.tmpdir()));assert.ok(path.basename(profile).startsWith('omi-large-animation-'));await fs.rm(profile,{recursive:true,force:true});});
  app=await _electron.launch({executablePath:process.env.OMICOMIC_PACKAGED_EXE||require('electron'),args:process.env.OMICOMIC_PACKAGED_EXE?[file]:['.',file],env});
  const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});
  const current=source==='mixed'?page.locator('[data-reader-page-index="0"]').frameLocator('iframe').locator('img'):page.locator('[data-reader-page-index="0"] img.reader-image');
  await expect(current).toBeVisible({timeout:35000});await page.mouse.move(0,0);
  await expect.poll(()=>current.evaluate(i=>i.complete&&i.naturalWidth>0)).toBeTruthy();
  const sample=async label=>{
    const box=await current.boundingBox(),pixels=[];
    const rect={x:Math.floor(box.x+box.width/2),y:Math.floor(box.y+box.height/2),width:source==='real'?32:2,height:source==='real'?32:2};
    for(let n=0;n<10;n++){
      pixels.push(await app.evaluate(async({BrowserWindow},rect)=>{const win=BrowserWindow.getAllWindows().find(w=>!w.getParentWindow());return (await win.webContents.capturePage(rect,{stayHidden:true,stayAwake:true})).toBitmap().toString('base64');},rect));
      await page.waitForTimeout(source==='real'?230:135);
    }
    assert.ok(new Set(pixels).size>1,`${source}/${format}/${label}: displayed frames did not change`);
    if(source!=='real'){const colors=pixels.map(p=>[...Buffer.from(p,'base64').subarray(0,4)]);assert.ok(colors.some(([b,g,r])=>r>b+100)&&colors.some(([b,g,r])=>b>r+100),JSON.stringify(colors));}
    return {label,uniqueFrames:new Set(pixels).size};
  };
  const results=[await sample('open')];
  await page.keyboard.press('ArrowRight');await expect(page.locator('[data-reader-page-index="1"]')).toBeVisible();
  await page.keyboard.press('ArrowLeft');await expect(current).toBeVisible();results.push(await sample('return'));
  await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();results.push(await sample('panorama'));
  const result={format,source,bytes:(await fs.stat(file)).size,platform:process.platform,arch:process.arch,results};t.diagnostic(JSON.stringify(result));
  await fs.mkdir('test-results/large-animations',{recursive:true});await fs.writeFile(`test-results/large-animations/${source}-${format}.json`,JSON.stringify(result,null,2));
});
