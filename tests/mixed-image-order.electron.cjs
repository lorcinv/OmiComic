const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron}=require('@playwright/test');
const {zip}=require('./helpers/documentFixtures.cjs');
const names=require('./helpers/mixedImageNames.cjs');

test('packaged folder and CBZ readers interleave numbered GIF and JPG pages', {timeout:60000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-order-'));
  const book=path.join(root,'Mixed');await fs.mkdir(book);
  const gif=await fs.readFile(path.join(__dirname,'fixtures/animations/animated.gif'));
  const still=await fs.readFile(path.join(__dirname,'fixtures/images/panorama-800x1200.jpg'));
  const entries=[...names].reverse().map(name=>[name,name.endsWith('.gif')?gif:still]);
  for(const [name,bytes]of entries)await fs.writeFile(path.join(book,name),bytes);
  const cbz=path.join(root,'Mixed.cbz'),bytes=zip(entries);await fs.writeFile(cbz,bytes);
  let app;
  t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-order-'));await fs.rm(root,{recursive:true,force:true});});
  const env={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  app=await _electron.launch({executablePath:process.env.OMICOMIC_PACKAGED_EXE||require('electron'),args:process.env.OMICOMIC_PACKAGED_EXE?[]:['.'],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.omicomic);
  assert.equal((await page.evaluate(p=>window.omicomic.addLibraryRoot({path:p,name:'Mixed pages'}),root)).ok,true);
  for(const input of [{path:book,type:'folder'},{path:cbz,type:'archive'}]){
    const result=await page.evaluate(input=>window.omicomic.getResourcePages(input),input);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.deepEqual(result.data.pages.map(p=>p.name),names);
    assert.equal(result.data.pages[3].name,'00016-GIF.gif');
    const image=await page.evaluate(p=>window.omicomic.getPageImage(p),result.data.pages[3]);
    assert.equal(image.ok,true,JSON.stringify(image));
    assert.ok(await page.evaluate(url=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0);image.onerror=()=>resolve(false);image.src=url;}),image.data.url));
  }
  assert.deepEqual(await fs.readFile(cbz),bytes);
  assert.deepEqual(await fs.readFile(path.join(book,'00016-GIF.gif')),gif);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().some(w=>w.isVisible())),false);
});
