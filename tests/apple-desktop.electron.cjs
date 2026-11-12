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
    await page.screenshot({path:path.join(output,'mac-startup.png')});
    const old = page; await old.close(); await app.evaluate(({app})=>app.emit('activate'));
    await expect.poll(async()=> (await app.windows()).filter(w=>!w.isClosed()).length).toBeGreaterThan(0);
    await fs.writeFile(path.join(output,'result.json'),JSON.stringify({info,archives:4,reopened:true},null,2));
  } finally { await app.close(); }
});
