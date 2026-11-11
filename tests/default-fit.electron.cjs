const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const { _electron, expect } = require('@playwright/test');

test('packaged defaults persist through process restarts and determine fresh comic sizing', { timeout: 120000 }, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-default-fit-'));
  const profile = path.join(directory, 'profile');
  await fs.mkdir(profile);
  const executable = path.resolve(process.env.OMICOMIC_PACKAGED_EXE || 'release/win-unpacked/OmiComic.exe');
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS:'1', OMICOMIC_TEST_PROFILE:profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  t.after(async () => {
    if (app) await app.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('omicomic-default-fit-'));
    await fs.rm(directory, {recursive:true,force:true});
  });
  const launch = async (args = []) => {
    app = await _electron.launch({ executablePath:executable, args, env });
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
    const page = await app.firstWindow();
    await page.emulateMedia({reducedMotion:'reduce'});
    return page;
  };
  const close = async () => { await app.close(); app = null; };
  let page = await launch();
  const runtime = await app.evaluate(({app,BrowserWindow})=>({version:app.getVersion(),packaged:app.isPackaged,visible:BrowserWindow.getAllWindows().some(window=>window.isVisible())}));
  assert.equal(runtime.version,require('../package.json').version);
  assert.equal(runtime.packaged,true); assert.equal(runtime.visible,false);
  const result = await page.evaluate(()=>window.omicomic.updateSettings({showHomePage:false,startupPage:'directory',readerPageMode:'single',readerDefaultPanorama:false}));
  assert.equal(result.ok,true);
  await close();
  const checks = [];
  for (const [value,label] of [['fit-window','适应窗口'],['fit-height','适应高度'],['fit-width','适应宽度'],['original','原始尺寸']]) {
    const book = path.join(directory,value);
    await fs.mkdir(book);
    const source = path.join(book,'1.png');
    await fs.writeFile(source,new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#bed5e7"/></svg>').render().asPng());
    page = await launch();
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.locator('#settings-category-reader-default').click();
    const select = page.getByRole('combobox',{name:'默认缩放模式',exact:true});
    await select.click(); await page.getByRole('option',{name:label,exact:true}).click();
    await expect.poll(async()=>{const data=await page.evaluate(()=>window.omicomic.getAppData());return data.ok&&data.data.settings.readerDefaultFitMode;}).toBe(value);
    await close();
    page = await launch([source]);
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy','false');
    await expect(page.locator('.reader-fit-select')).toContainText(label);
    await expect.poll(()=>page.locator('.reader-page-spread img').first().evaluate(image=>image.complete&&image.naturalWidth===800)).toBe(true);
    const metrics = await page.locator('.reader-stage').evaluate(stage=>{
      const css=getComputedStyle(stage),image=stage.querySelector('img').getBoundingClientRect();
      return {width:image.width,height:image.height,availableWidth:stage.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight),availableHeight:stage.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom)};
    });
    if(value==='original'){assert.ok(Math.abs(metrics.width-800)<1);assert.ok(Math.abs(metrics.height-1200)<1);}
    else if(value==='fit-height')assert.ok(Math.abs(metrics.height-metrics.availableHeight)<1);
    else if(value==='fit-width')assert.ok(Math.abs(metrics.width-metrics.availableWidth)<1);
    else{assert.ok(metrics.width<=metrics.availableWidth+1);assert.ok(metrics.height<=metrics.availableHeight+1);}
    checks.push({value,label,metrics});
    await close();
  }
  await fs.mkdir('test-results',{recursive:true});
  await fs.writeFile('test-results/default-fit-packaged.json',JSON.stringify({runtime,checks,processRestart:true},null,2));
});
