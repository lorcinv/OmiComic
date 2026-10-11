// Real EXE + IPC + filesystem/archive metadata + worker. All data is disposable.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { _electron, expect } = require('@playwright/test');
const { Resvg } = require('@resvg/resvg-js');
const { zip } = require('./helpers/documentFixtures.cjs');

test('packaged reader sorts real folders/archives, restores identities and runs PDF/image processing', { timeout: 180000 }, async t => {
  const executable = path.resolve(process.env.OMICOMIC_PACKAGED_EXE || 'release/win-unpacked/OmiComic.exe');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-reader-tools-'));
  const profile = path.join(root, 'profile'), books = path.join(root, '样本');
  await fs.mkdir(profile); await fs.mkdir(books);
  const names = ['1.png','2.png','3.png','10.png'];
  const image = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="a"><stop stop-color="#567087"/><stop offset="1" stop-color="#8495a7"/></linearGradient></defs><rect width="600" height="900" fill="url(#a)"/><path d="M20 100H580M20 102H580M300 0V900" stroke="#424c56" stroke-width="1"/><text x="60" y="200" font-family="Arial" font-size="24" fill="#707c88">Text edge test</text></svg>').render().asPng();
  for (let i=0;i<names.length;i++) { const file=path.join(books,names[i]);await fs.writeFile(file,image);const date=new Date(`2026-01-0${[3,2,2,1][i]}T12:00:00Z`);await fs.utimes(file,date,date); }
  const originalHash = createHash('sha256').update(image).digest('hex');
  const sevenZip=path.join(path.dirname(executable),'resources','7zip','7z.exe');
  for(const [type,name] of [['zip','漫画.cbz'],['7z','漫画.cb7']])execFileSync(sevenZip,['a',`-t${type}`,path.join(books,name),path.join(books,'*.png')],{windowsHide:true,stdio:'pipe'});
  await fs.copyFile('tests/fixtures/android-archives/RAR5.cbr',path.join(books,'漫画.cbr'));
  await fs.copyFile('tests/fixtures/documents/three-pages.pdf',path.join(books,'文档.pdf'));
  await fs.writeFile(path.join(books,'章节.epub'),zip([
    ['META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
    ['OPS/book.opf','<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>'],
    ['OPS/one.xhtml','<h1>Original first chapter</h1>'],['OPS/two.xhtml','<h1>Original second chapter</h1>'],
  ]));
  let app;
  t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-reader-tools-'));await fs.rm(root,{recursive:true,force:true});});
  const env={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  const launch=async file=>{app=await _electron.launch({executablePath:executable,args:file?[file]:[],env});const page=await app.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});return page;};
  let page=await launch(path.join(books,'漫画.cbz'));
  const openSettings=async()=>{await page.getByRole('button',{name:'返回',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:/^阅读器 /}).click();await expect(page.getByRole('slider',{name:'翻页间隔',exact:true})).toBeVisible();};
  const resumeBook=async(file,type)=>{await expect(page.locator('.book-reader-settings')).toHaveAttribute('aria-busy','false');await page.getByRole('button',{name:'关闭设置',exact:true}).click();const key=await page.evaluate(async input=>(await window.omicomic.getResourcePages(input)).data.resourceKey,{path:file,type});await page.getByRole('button',{name:/^最近阅读/}).click();await page.locator('.resource-card[data-selection-key='+JSON.stringify(key)+']').dblclick();};

  await expect(page.locator('.reader-image').first()).toBeVisible();
  assert.equal((await page.evaluate(root=>window.omicomic.addLibraryRoot({path:root,name:'一次性测试样本'}),books)).ok,true);
  const info=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,profile:app.getPath('userData')}));assert.equal(info.packaged,true);assert.equal(info.version,require('../package.json').version);assert.equal(info.profile,profile);
  const cases=[];
  for(const [file,type] of [[books,'folder'],[path.join(books,'漫画.cbz'),'archive'],[path.join(books,'漫画.cb7'),'archive'],[path.join(books,'漫画.cbr'),'archive']]) {
    const result=await page.evaluate(async ({file,type})=>{
      const original=await window.omicomic.getResourcePages({path:file,type});if(!original.ok)throw Error(file+' '+JSON.stringify(original.error));
      const resource=original.data, current=resource.pages[1];
      await window.omicomic.toggleBookmark({resourceKey:resource.resourceKey,sourcePath:file,sourceType:type,title:resource.title,pageIndex:1,pageId:current.pageId,pageName:current.name,archiveInnerPath:current.archiveInnerPath,totalPages:resource.total});
      const orders=[];
      for(const mode of ['name-desc','time-asc','time-desc','name-asc']) {
        const sorted=await window.omicomic.setReaderPageSort({path:file,type,mode,currentPageId:current.pageId});if(!sorted.ok)throw Error(sorted.error.message);
        const reopened=await window.omicomic.getResourcePages({path:file,type});const progress=(await window.omicomic.getReadingProgress(resource.resourceKey)).data;
        const bookmarks=(await window.omicomic.getBookmarks()).data.filter(b=>b.resourceKey===resource.resourceKey);
        orders.push({mode,names:reopened.data.pages.map(p=>p.name),times:reopened.data.pages.map(p=>p.modifiedAt??null),current:reopened.data.pages[progress.currentPageIndex].pageId,id:current.pageId,bookmark:bookmarks[0]?.pageId,bookmarkIndex:bookmarks[0]?.pageIndex,index:progress.currentPageIndex});
      }
      return {name:file.split(/[\\/]/).pop(),orders};
    },{file,type});
    for(const order of result.orders){assert.equal(order.current,order.id);assert.equal(order.bookmark,order.id);assert.equal(order.bookmarkIndex,order.index);}
    if(!file.endsWith('.cbr')) {
      assert.deepEqual(result.orders[0].names,['10.png','3.png','2.png','1.png']);
      assert.deepEqual(result.orders[1].names,['10.png','2.png','3.png','1.png']);
      assert.deepEqual(result.orders[2].names,['1.png','2.png','3.png','10.png']);
      assert.ok(result.orders.filter(order=>order.mode.startsWith('time')).every(order=>order.times.every(time=>time>0)));
    } else assert.ok(result.orders[0].names[0].endsWith('页10.png'));
    cases.push(result);
  }
  // UI sort commits the current view first and cancels stale unmount saves.
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(page.getByRole('button',{name:'阅读器设置',exact:true})).toHaveCount(0);await openSettings();await page.getByRole('combobox',{name:'页面排序'}).click();await page.getByRole('option',{name:'文件名自然降序',exact:true}).click();await resumeBook(path.join(books,'漫画.cbz'),'archive');
  await expect(page.locator('#reader-title')).toContainText('/ 2.png');await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('3');
  await page.getByRole('button',{name:'画面调整',exact:true}).click();await page.getByRole('slider',{name:'伽马',exact:true}).fill('1.4');await page.getByRole('slider',{name:'锐化',exact:true}).fill('80');await page.getByRole('slider',{name:'降噪',exact:true}).fill('60');await page.getByRole('button',{name:'关闭面板'}).click();
  const start=performance.now();await expect(page.locator('.reader-effects').first()).toHaveAttribute('data-processing','ready',{timeout:15000});const processingMs=Math.round(performance.now()-start);
  await page.getByRole('button',{name:'返回',exact:true}).click();await app.close();app=null;
  page=await launch(path.join(books,'漫画.cbz'));
  await expect(page.locator('#reader-title')).toContainText('/ 2.png');await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('3');await expect(page.getByRole('button',{name:'开始自动阅读',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'画面调整',exact:true}).click();await expect(page.getByRole('slider',{name:'伽马',exact:true})).toHaveValue('1.4');await page.getByRole('button',{name:'恢复默认'}).click();await page.getByRole('button',{name:'关闭面板'}).click();await expect(page.locator('.reader-processed-image')).toHaveCount(0);await page.getByRole('button',{name:'返回',exact:true}).click();await app.close();app=null;
  const docs=[];
  for(const name of ['文档.pdf','章节.epub']) {
    page=await launch(path.join(books,name));await expect(page.locator(name.endsWith('.pdf')?'.reader-canvas':'.reader-chapter').first()).toBeVisible();
    await openSettings();await expect(page.getByRole('combobox',{name:'页面排序'})).toHaveCount(0);await expect(page.getByText('PDF / EPUB 保持文档原有顺序。')).toBeVisible();await resumeBook(path.join(books,name),name.endsWith('.pdf')?'pdf':'epub');
    await page.getByRole('button',{name:'画面调整',exact:true}).click();await page.getByRole('slider',{name:'伽马',exact:true}).fill('1.3');
    if(name.endsWith('.pdf')) {await page.getByRole('slider',{name:'锐化',exact:true}).fill('50');await page.getByRole('slider',{name:'降噪',exact:true}).fill('50');await page.getByRole('button',{name:'关闭面板'}).click();await expect(page.locator('.reader-effects').first()).toHaveAttribute('data-processing','ready',{timeout:15000});}
    else {await expect(page.getByRole('slider',{name:'锐化',exact:true})).toBeDisabled();await page.getByRole('button',{name:'关闭面板'}).click();}
    docs.push({format:path.extname(name),displayEffects:true,rasterProcessing:name.endsWith('.pdf')});await page.getByRole('button',{name:'返回',exact:true}).click();await app.close();app=null;
  }
  for(const name of names)assert.equal(createHash('sha256').update(await fs.readFile(path.join(books,name))).digest('hex'),originalHash);
  await fs.mkdir('test-results',{recursive:true});const result={executable,version:info.version,sorting:cases,documents:docs,processingMs,workerPassed:true,restartPassed:true,originalFilesUnchanged:true};
  await fs.writeFile('test-results/reader-tools-smoke.json',JSON.stringify(result,null,2)+'\n');t.diagnostic(JSON.stringify({formats:cases.map(c=>c.name),processingMs,restartPassed:true,documents:docs}));
});
