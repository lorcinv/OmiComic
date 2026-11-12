const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');
test('packaged Apple reader: native app menu, real archives, PDF, seven sizes, reopen', {timeout: 180000}, async () => {
  const output = path.resolve('test-results/apple-desktop'); await fs.mkdir(output, {recursive:true});
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const env = {...process.env, OMICOMIC_TEST_PROFILE:profile, OMICOMIC_TEST_HEADLESS:'1'}; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({executablePath:process.env.OMICOMIC_PACKAGED_EXE, env, args:[]});
  try {
    const page = await app.firstWindow(); await page.waitForFunction(()=>!!window.omicomic);
    const info = await page.evaluate(()=>window.omicomic.getAppInfo()); assert.equal(info.platform,'darwin'); assert.equal(info.arch,process.arch);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.platform),'darwin');
    assert.ok(await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.length >= 4));
    const source = path.resolve('tests/fixtures/android-archives');
    assert.equal((await page.evaluate(path=>window.omicomic.addLibraryRoot({path,name:'Archive test'}),source)).ok,true);
    for (const name of ['RAR4.rar','RAR5.cbr','Seven.7z','Solid.cb7']) {
      const opened = await page.evaluate(path=>window.omicomic.getResourcePages({path,type:'archive'}),path.join(source,name));
      assert.equal(opened.ok,true,JSON.stringify(opened)); assert.ok(opened.data.pages.length>0);
      const image = await page.evaluate(input=>window.omicomic.getPageImage(input),opened.data.pages[0]); assert.equal(image.ok,true,JSON.stringify(image));
      assert.ok(await page.evaluate(url=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);image.src=url;}),image.data.url));
    }
    const documents = path.resolve('tests/fixtures/documents');
    await page.evaluate(path=>window.omicomic.addLibraryRoot({path,name:'PDF test'}),documents);
    const pdf = await page.evaluate(path=>window.omicomic.openDocument({path,type:'pdf',id:'apple-pdf-test'}),path.join(documents,'three-pages.pdf'));
    assert.equal(pdf.ok,true,JSON.stringify(pdf)); assert.ok(pdf.data.size>0);
    const bytes = await page.evaluate(async()=>{const r=await window.omicomic.readDocumentRange('apple-pdf-test',0,5); return r.ok?Array.from(r.data):null;});
    assert.deepEqual(bytes,[37,80,68,70,45]);
    await page.evaluate(()=>window.omicomic.closeDocument('apple-pdf-test'));
    await page.evaluate(async path=>{await window.omicomic.updateSettings({startupPage:'directory',hideBookshelfItemsInLibrary:false});await window.omicomic.updateLibraryState({lastActiveRootPath:path,lastCurrentPath:path});},source);
    await page.reload();
    await expect(page.locator('.resource-list .resource-card').first()).toBeVisible();
    const window = await app.browserWindow(page), measurements=[];
    const slider = page.locator('.card-scale-control[data-card-scale-scope="library"] input');
    for (const width of [1440,2560]) {
      await window.evaluate((window,width)=>window.setSize(width,960),width);
      for(let index=0;index<7;index++) {
        await slider.evaluate((input,index)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(index));input.dispatchEvent(new Event('input',{bubbles:true}));},index);
        await expect(slider).toHaveAttribute('aria-valuetext',`尺寸 ${index+1} / 7`);
        const size=await page.locator('.resource-card').first().evaluate(element=>element.getBoundingClientRect().width);
        measurements.push({window:width,index,size});
      }
    }
    for(let i=0;i<7;i++) {
      assert.ok(measurements[i+7].size/measurements[i].size>=0.84 && measurements[i+7].size/measurements[i].size<=1.18);
      if(i)assert.ok(measurements[i].size>measurements[i-1].size);
    }
    await page.keyboard.press('Meta+k');
    assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'INPUT');
    await page.screenshot({path:path.join(output,'mac-library.png')});
    await page.close(); await app.evaluate(({app})=>app.emit('activate'));
    await expect.poll(async()=>app.windows().filter(w=>!w.isClosed()&&w.url().endsWith('/index.html')).length).toBe(1);
    const reopened=app.windows().find(w=>!w.isClosed()&&w.url().endsWith('/index.html'));
    await expect(reopened.locator('.app-shell')).toBeVisible();
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({info,archives:4,pdf:true,measurements,reopened:true},null,2));
  } finally { await app.close(); }
});
