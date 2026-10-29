const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron}=require('@playwright/test');

test('shipped desktop excludes unsupported files from directory and catalog IPC', {timeout:60000}, async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-supported-files-')),books=path.join(root,'Books');await fs.mkdir(books);
  let app;t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-supported-files-'));await fs.rm(root,{recursive:true,force:true});});
  for(const name of ['Book.CBZ','Book.PDF','Book.EPUB','Video.mp4','Audio.mp3','notes.txt','README'])await fs.writeFile(path.join(books,name),'fixture');
  await fs.copyFile(path.join(__dirname,'fixtures/images/pixel.png'),path.join(books,'Page.PNG'));await fs.mkdir(path.join(books,'Folder.mp4'));
  const env={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:path.join(root,'profile')};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  app=await _electron.launch({executablePath:path.resolve(process.env.OMICOMIC_PACKAGED_EXE||'release/win-unpacked/OmiComic.exe'),env});
  const page=await app.firstWindow();await page.waitForFunction(()=>window.omicomic);
  const result=await page.evaluate(async root=>{
    const a=window.omicomic,added=await a.addLibraryRoot({path:root,name:'Supported types'});if(!added.ok)throw Error(added.error.message);
    const directory=await a.listDirectory(root),catalog=await a.scanLibrary(root,true,false,{incremental:true,restart:true});return {directory,catalog};
  },books);
  assert.equal(result.directory.ok,true);assert.equal(result.directory.data.total,5);
  assert.deepEqual(result.directory.data.items.map(x=>x.name).sort(),['Book.CBZ','Book.PDF','Book.EPUB','Page.PNG','Folder.mp4'].sort());
  assert.equal(result.catalog.ok,true);assert.ok(result.catalog.data.items.every(x=>x.type!=='unknown'&&!['Video.mp4','Audio.mp3','notes.txt','README'].includes(x.name)));
});
