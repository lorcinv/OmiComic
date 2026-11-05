// Opt-in packaged Windows verification; the user's books stay outside the repo.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {_electron,expect}=require('@playwright/test');
const {longDocumentFixture}=require('./helpers/longDocumentFixture.cjs');

test('packaged Windows reads the original document samples and bounded long-image pages', {timeout:240000,skip:!process.env.OMI_ORIGINAL_DIR},async t=>{
  const directory=path.resolve(process.env.OMI_ORIGINAL_DIR),names=await fs.readdir(directory);
  const sample=(prefix,extension)=>path.join(directory,names.find(name=>name.startsWith(prefix)&&name.endsWith(extension)));
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-original-docs-'));
  let application;
  t.after(async()=>{await application?.close();assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));assert.ok(path.basename(temp).startsWith('omicomic-original-docs-'));await fs.rm(temp,{recursive:true,force:true});});
  const long=path.join(temp,'Long.epub');await fs.writeFile(long,longDocumentFixture().epub);
  const checks=[{kind:'text',file:sample('格式塔','.mobi')},{kind:'epub',file:sample('きらめく','.epub')},{kind:'comic',file:sample('葬送','.mobi')},{kind:'long',file:long},{kind:'pdf',file:path.resolve('tests/fixtures/documents/three-pages.pdf')}],results=[];
  for(const check of checks){
    const environment={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:path.join(temp,check.kind)};delete environment.ELECTRON_RUN_AS_NODE;
    const started=Date.now();application=await _electron.launch({executablePath:path.resolve(process.env.OMI_PACKAGED_EXE||'release/win-unpacked/OmiComic.exe'),args:[check.file],env:environment});
    const page=await application.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.emulateMedia({reducedMotion:'reduce'});
    await expect(page.locator('.reader-layout')).toBeAttached({timeout:45000});
    await page.waitForFunction(()=>[...document.querySelectorAll('.reader-page-frame')].some(frame=>{
      if(frame.querySelector('canvas')?.width>0)return true;
      const img=frame.querySelector('img.reader-image');if(img?.complete&&img.naturalWidth>0)return true;
      return !!frame.querySelector('iframe')?.contentDocument?.body?.textContent.trim();
    }),{timeout:45000});
    const openedMs=Date.now()-started,first=await page.locator('.reader-page-frame').first().boundingBox();
    const input=page.getByRole('textbox',{name:'跳转到页码'});await expect(input).toBeEnabled();
    const turn=Date.now();await input.fill('2');await input.press('Enter');await expect(input).toHaveValue('2');
    await page.waitForFunction(()=>{const frame=document.querySelector('.reader-page-frame[data-reader-page-index="1"]');if(!frame)return false;const image=frame.querySelector('img.reader-image');return !!(frame.querySelector('canvas')?.width||image?.complete&&image.naturalWidth||frame.querySelector('iframe')?.contentDocument?.body?.textContent.trim());},undefined,{timeout:30000});
    const turnMs=Date.now()-turn;
    await page.getByRole('button',{name:'添加当前页书签',exact:true}).click();
    await expect(page.getByRole('button',{name:'取消当前页书签',exact:true})).toBeAttached();
    const data=(await page.evaluate(()=>window.omicomic.getAppData())).data;
    assert.equal(data.bookmarks.length,1);assert.equal(data.bookmarks[0].pageIndex,1);assert.equal(errors.length,0,errors.join('; '));
    if(check.kind==='text')assert.ok((await page.frameLocator('.reader-page-frame[data-reader-page-index="1"] iframe').locator('body').textContent()).length>200);
    if(check.kind==='epub'||check.kind==='comic')await page.waitForFunction(()=>{const frame=document.querySelector('.reader-page-frame[data-reader-page-index="1"]'),image=frame?.querySelector('img')??frame?.querySelector('iframe')?.contentDocument?.images[0];return !!image?.complete&&image.naturalWidth>1000;},undefined,{timeout:10000});
    if(check.kind==='long'){
      await input.fill('5');await input.press('Enter');await page.waitForFunction(()=>!!document.querySelector('.reader-page-frame[data-reader-page-index="4"] canvas'));
      const color=await page.locator('.reader-page-frame[data-reader-page-index="4"] canvas').evaluate(canvas=>[...canvas.getContext('2d').getImageData(0,0,1,1).data]);assert.deepEqual(color.slice(0,3),[155,103,179]);
    }
    results.push({kind:check.kind,file:path.basename(check.file),openedMs,turnMs,firstHeight:first?.height,bookmark:true,errors});
    console.log('Verified original',JSON.stringify(results.at(-1)));
    await application.close();application=undefined;
    if(check.kind==='text'){
      application=await _electron.launch({executablePath:path.resolve(process.env.OMI_PACKAGED_EXE||'release/win-unpacked/OmiComic.exe'),args:[check.file],env:environment});
      const reopened=await application.firstWindow();await expect(reopened.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('2',{timeout:30000});
      await expect(reopened.getByRole('button',{name:'取消当前页书签',exact:true})).toBeAttached();
      results.at(-1).restartPreserved=true;await application.close();application=undefined;
    }
  }
  await fs.writeFile(process.env.OMI_ORIGINAL_REPORT||'.cache/perf1181/windows-originals.json',JSON.stringify({platform:'Windows x64 packaged',results},null,2));
});
