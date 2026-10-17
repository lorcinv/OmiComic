const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const {_electron,expect}=require('@playwright/test');
const run=promisify(execFile);

test('detail top strip is a native caption while title and window buttons remain client controls', {timeout:60000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-window-drag-')),profile=path.join(root,'profile'),library=path.join(root,'Library'),book=path.join(library,'Book');
  let app;
  t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-window-drag-'));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(profile);await fs.mkdir(book,{recursive:true});await fs.copyFile('tests/fixtures/images/pixel.png',path.join(book,'01.png'));
  await fs.writeFile(path.join(profile,'omicomic-data.json'),JSON.stringify({version:1,library:{roots:[{path:library,name:'Library',addedAt:1,lastOpenedAt:1}],lastActiveRootPath:library,lastCurrentPath:library}}));
  const env={...process.env,OMICOMIC_TEST_PROFILE:profile,OMICOMIC_TEST_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  const executable=path.resolve(process.env.OMICOMIC_PACKAGED_EXE||'release/win-unpacked/OmiComic.exe');
  app=await _electron.launch({executablePath:executable,args:[],env});
  const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});
  const handle=await app.evaluate(({BrowserWindow})=>{const b=BrowserWindow.getAllWindows()[0].getNativeWindowHandle();return b.length===8?b.readBigUInt64LE().toString():String(b.readUInt32LE());});
  async function hits(points){
    const dpr=await page.evaluate(()=>devicePixelRatio),file=path.join(root,'hit-points.json');
    await fs.writeFile(file,JSON.stringify({handle,points:points.map(p=>({...p,x:Math.round(p.x*dpr),y:Math.round(p.y*dpr)}))}));
    const result=await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.resolve('tests/helpers/windowHitTest.ps1'),'-InputPath',file],{windowsHide:true,timeout:10000});
    return JSON.parse(result.stdout.trim());
  }
  await page.locator('.omi-home__library').click();
  await expect(page.locator('.library-controls')).toBeVisible();
  const toolbar=await hits([{name:'library-blank',x:1100,y:22}]);
  assert.equal(toolbar[0].result,2,'Existing library drag area must produce HTCAPTION');
  await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
  const title=page.locator('#resource-detail-title');await expect(title).toHaveText('Book');
  const rect=await title.boundingBox(),close=await page.getByRole('button',{name:'关闭窗口',exact:true}).boundingBox();
  const detail=await hits([{name:'detail-blank',x:500,y:22},{name:'detail-title',x:rect.x+20,y:rect.y+rect.height/2},{name:'window-close',x:close.x+close.width/2,y:close.y+close.height/2}]);
  const expected=process.env.OMICOMIC_EXPECT_DETAIL_DRAG==='0'?1:2;
  assert.equal(detail[0].result,expected,`Detail blank area native hit test: ${JSON.stringify(detail)}`);
  assert.equal(detail[1].result,1,'Title must remain selectable HTCLIENT');assert.equal(detail[2].result,1,'Window controls must remain HTCLIENT');
  const result={version:await app.evaluate(({app})=>app.getVersion()),executable,baseline:expected===1,toolbar,detail};
  await fs.writeFile(`test-results/window-drag-${result.version}.json`,JSON.stringify(result,null,2));
  t.diagnostic(JSON.stringify(result));
});
