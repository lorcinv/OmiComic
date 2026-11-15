const { chooseReaderFit, expectReaderFit } = require('./helpers/readerControls.cjs');
// Built-app integration with real PDF/EPUB files, workers, bookmarks and restarts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');

async function verifyProgressAnimation(page,type) {
  await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy','false');
  const counter=page.getByRole('textbox',{name:'跳转到页码'});
  const rail=await page.getByRole('slider',{name:'阅读进度'}).boundingBox();
  await page.mouse.click(rail.x+1,rail.y+rail.height/2);
  await expect(counter).toHaveValue('1');
  const first=page.locator('.reader-stage [data-reader-page-index="0"]');
  await expect(first).toBeVisible();
  if(type==='pdf'){
    await expect.poll(()=>first.locator('canvas').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<240||pixels[i+1]<240||pixels[i+2]<240)ink++;return ink;})).toBeGreaterThan(20);
  }else await expect(first.frameLocator('iframe').getByRole('heading',{name:'第一章 · 统一阅读',exact:true})).toBeVisible();
  await counter.fill('2');await counter.press('Enter');await expect(counter).toHaveValue('2');
  await expect(page.locator('.reader-stage [data-reader-page-index="1"]')).toBeVisible();
}

test('PDF and EPUB share the real reader, persist modes/bookmarks and leave sources unchanged', { timeout: 90000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-document-reader-'));
  const profile = path.join(dir, 'profile'); await fs.mkdir(profile);
  const loader = path.join(dir, 'launch.cjs');
  await fs.writeFile(loader, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); app.setAppPath(${JSON.stringify(process.cwd())}); require(${JSON.stringify(path.resolve('dist-electron/main.js'))});`);
  const pdfPath = path.join(dir, 'PDF 测试.pdf'), epubPath = path.join(dir, 'EPUB 测试.epub');
  const pdfBytes = await fs.readFile('tests/fixtures/documents/three-pages.pdf');
  const epubBytes = zip([
    ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
    ['OPS/book.opf', '<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="three" href="three.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/><itemref idref="three"/></spine></package>'],
    ['OPS/one.xhtml', '<h1>第一章 · 统一阅读</h1><p>在同一个窗口中阅读文档。</p><script>window.top.__publisherScriptRan=true</script><img src="https://example.invalid/tracker.png"/>'],
    ['OPS/two.xhtml', '<h1>第二章 · 模式与书签</h1><p>使用相同的工具栏，保留阅读模式和章节书签。</p>'.repeat(4)],
    ['OPS/three.xhtml', '<h1>第三章 · 长章节</h1>' + '<p>这段文字用来验证长章节全部展开，由主阅读区域滚动。</p>'.repeat(70)],
  ]);
  await fs.writeFile(pdfPath, pdfBytes); await fs.writeFile(epubPath, epubBytes);
  let electron;
  t.after(async () => {
    if (electron) await electron.close();
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('omicomic-document-reader-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const environment = { ...process.env, OMICOMIC_TEST_HEADLESS:'1', OMICOMIC_TEST_PROFILE:profile }; delete environment.ELECTRON_RUN_AS_NODE;delete environment.VITE_DEV_SERVER_URL;
  const launch = async (...files) => {
    electron = await _electron.launch({ executablePath: process.env.OMICOMIC_PACKAGED_EXE||require('electron'), args: process.env.OMICOMIC_PACKAGED_EXE?files:[loader, ...files], env: environment });
    const page = await electron.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    return page;
  };
  let page = await launch(pdfPath);
  await expect(page.locator('.reader-layout')).toBeVisible();
  await expect(page.locator('.reader-page-frame canvas')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.document-reader')).toHaveCount(0);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await page.getByRole('button', { name: '添加当前页书签', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消当前页书签', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click();
  await expect(page.locator('.reader-page-frame canvas')).toHaveCount(2);
  await chooseReaderFit(page,'适应宽度');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.getAppData())).data.bookmarks.length).toBe(1);
  let data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  const pdfProgress = Object.values(data.readingProgress).find(p => p.sourceType === 'pdf');
  assert.equal(pdfProgress.currentPageIndex, 1);
  assert.equal(pdfProgress.readerViewState.pageMode, 'double');
  assert.equal(pdfProgress.readerViewState.fitMode, 'fit-width');
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.isVisible()).length), 0);
  await electron.close(); electron = null;

  page = await launch(pdfPath);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  // Fit-width preserves the selected scale, so a pair too wide for this viewport stays single.
  await expect(page.locator('.reader-page-frame canvas')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '当前双页，点击切换单页', exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消当前页书签', exact: true })).toBeVisible();
  await expectReaderFit(page,'适应宽度');
  await chooseReaderFit(page,'适应高度');
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await verifyProgressAnimation(page, 'pdf');
  await electron.close(); electron = null;

  page = await launch(epubPath);
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '第一章 · 统一阅读', exact: true })).toBeVisible({ timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__publisherScriptRan), undefined);
  await expect(page.frameLocator('.reader-chapter iframe').locator('script')).toHaveCount(0);
  await expect(page.locator('.document-reader')).toHaveCount(0);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await page.getByRole('button', { name: '添加当前页书签', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消当前页书签', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await verifyProgressAnimation(page, 'epub');
  await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await expectReaderFit(page,'适应宽度',true);
  await expect(page.locator('[data-reader-page-index="1"] .reader-chapter')).toBeVisible();
  // Native fullscreen makes a hidden Windows window visible; keep this background check hidden.
  await page.getByRole('button', { name: '返回', exact: true }).click();
  data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  assert.equal(data.bookmarks.length, 2);
  assert.deepEqual(new Set(data.bookmarks.map(b => b.sourceType)), new Set(['pdf', 'epub']));
  // Other entry points must return to the exact same toolbar, modes and bookmark.
  await page.getByRole('button', { name: /^书签/ }).click();
  const epubCard = page.locator('.resource-card').filter({ hasText: 'EPUB 测试.epub' });
  await expect(epubCard.locator('.resource-card-page')).toContainText(/^2\/\d+$/);
  await epubCard.dblclick();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await expect(page.locator('.reader-toolbar')).toHaveCount(1);
  await expect(page.locator('.reader-stage')).toHaveClass(/(^|\s)is-panorama(\s|$)/);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const epubRecord = Object.values(data.readingProgress).find(p => p.sourceType === 'epub');
  await page.evaluate(async record => { await window.omicomic.addFavorite(record); }, epubRecord);
  // Re-enter the library to refresh its favorite list through the public API.
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.getByRole('button', { name: /^收藏/ }).click();
  await page.locator('.resource-card').filter({ hasText: 'EPUB 测试.epub' }).dblclick();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await expect(page.locator('.reader-toolbar')).toHaveCount(1);
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.isVisible()).length), 0);
  await electron.close(); electron = null;

  page = await launch(epubPath);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await expect(page.locator('.reader-layout')).toHaveClass(/is-flow-vertical/);
  await expect(page.locator('.reader-stage')).toHaveClass(/(^|\s)is-panorama(\s|$)/);
  await expect(page.getByRole('button', { name: '取消当前页书签', exact: true })).toBeVisible();
  await expect(page.locator('[data-reader-page-index="1"] .reader-chapter')).toBeVisible();
  assert.deepEqual(await fs.readFile(pdfPath), pdfBytes);
  assert.deepEqual(await fs.readFile(epubPath), epubBytes);
});
