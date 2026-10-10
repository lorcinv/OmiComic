// Built-app integration with real PDF/EPUB files, workers, bookmarks and restarts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');

async function verifyProgressAnimation(page, type) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    window.__originalAnimate = Element.prototype.animate;
    window.__jumpAnimations = [];
    Element.prototype.animate = function(keyframes, options) {
      const animation = window.__originalAnimate.call(this, keyframes, options);
      if (this.matches('.reader-panorama-jump-ghost, .reader-page-frame, .reader-page-spread.is-panorama-strip')) {
        animation.pause(); animation.currentTime = 0;
        window.__jumpAnimations.push(animation);
      }
      return animation;
    };
  });
  const rail = await page.getByRole('slider', { name: '阅读进度' }).boundingBox();
  await page.mouse.click(rail.x + 1, rail.y + rail.height / 2);
  await expect(page.locator('.reader-stage')).toHaveAttribute('data-panorama-jump-phase', 'departing');
  if (type === 'pdf') {
    assert.equal(await page.evaluate(() => {
      const sample = canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0; for (let i = 0; i < data.length; i += 101) sum += data[i];
        return sum;
      };
      const originals = [...document.querySelectorAll('.reader-page-spread [data-reader-page-index]')];
      const copies = [...document.querySelectorAll('.reader-panorama-jump-ghost [data-reader-page-index]')];
      return copies.length > 0 && copies.every(copy => {
        const source = originals.find(element => element.dataset.readerPageIndex === copy.dataset.readerPageIndex);
        const canvas = copy.querySelector('canvas');
        return canvas && sample(canvas) > 0 && sample(canvas) === sample(source.querySelector('canvas'));
      });
    }), true);
  } else {
    await expect(page.frameLocator('.reader-panorama-jump-ghost [data-reader-page-index="1"] iframe').getByRole('heading', { name: '第二章 · 模式与书签', exact: true }).first()).toBeVisible();
  }
  await page.evaluate(() => window.__jumpAnimations.forEach(animation => { animation.currentTime = 130; }));
  await page.screenshot({ path: `test-results/${type}-native-progress-departure.png` });
  await page.evaluate(() => window.__jumpAnimations.forEach(animation => animation.finish()));
  await expect(page.locator('.reader-stage')).toHaveAttribute('data-panorama-jump-phase', 'arriving');
  await page.evaluate(() => window.__jumpAnimations.forEach(animation => { if (animation.playState === 'paused') animation.currentTime = 140; }));
  await page.screenshot({ path: `test-results/${type}-native-progress-arrival.png` });
  await page.evaluate(() => window.__jumpAnimations.forEach(animation => { if (animation.playState === 'paused') animation.finish(); }));
  await expect(page.locator('.reader-stage')).not.toHaveAttribute('data-panorama-jump-phase');
  await expect(page.locator('.reader-panorama-jump-ghost')).toHaveCount(0);
  await expect(page.locator('.reader-page-spread [data-reader-page-index="0"]').locator(type === 'pdf' ? 'canvas' : '.reader-chapter')).toBeVisible();
  await page.evaluate(() => { Element.prototype.animate = window.__originalAnimate; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const input = page.locator('.reader-page-jump input');
  await input.fill('2'); await input.press('Enter');
  await expect(input).toHaveValue('2');
}

test('PDF and EPUB share the real reader, persist modes/bookmarks and leave sources unchanged', { timeout: 90000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-document-reader-'));
  const profile = path.join(dir, 'profile'); await fs.mkdir(profile);
  const loader = path.join(dir, 'launch.cjs');
  await fs.writeFile(loader, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('dist-electron/main.js'))});`);
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
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const launch = async (...files) => {
    electron = await _electron.launch({ executablePath: require('electron'), args: [loader, ...files], env: environment });
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
  await page.getByRole('button', { name: '适应宽度', exact: true }).click();
  await page.screenshot({ path: 'test-results/pdf-native-shared-reader.png' });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.getAppData())).data.bookmarks.length).toBe(1);
  let data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  const pdfProgress = Object.values(data.readingProgress).find(p => p.sourceType === 'pdf');
  assert.equal(pdfProgress.currentPageIndex, 1);
  assert.equal(pdfProgress.readerViewState.pageMode, 'double');
  assert.equal(pdfProgress.readerViewState.fitMode, 'fit-width');
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await electron.close(); electron = null;

  page = await launch(pdfPath);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await expect(page.locator('.reader-page-frame canvas')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '取消当前页书签', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '适应宽度', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '适应高度', exact: true }).click();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await verifyProgressAnimation(page, 'pdf');
  await electron.close(); electron = null;

  page = await launch(epubPath);
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '第一章 · 统一阅读', exact: true })).toBeVisible({ timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__publisherScriptRan), undefined);
  await expect(page.frameLocator('.reader-chapter iframe').locator('script')).toHaveCount(0);
  await expect(page.locator('.document-reader')).toHaveCount(0);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await page.getByRole('button', { name: '添加当前章书签', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消当前章书签', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await verifyProgressAnimation(page, 'epub');
  await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await page.getByRole('button', { name: '适应宽度', exact: true }).click();
  await expect(page.locator('[data-reader-page-index="1"] .reader-chapter')).toBeVisible();
  await page.screenshot({ path: 'test-results/epub-native-shared-reader.png' });
  await page.getByRole('button', { name: '沉浸', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.isFullscreen())).data).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.isFullscreen())).data).toBe(false);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  assert.equal(data.bookmarks.length, 2);
  assert.deepEqual(new Set(data.bookmarks.map(b => b.sourceType)), new Set(['pdf', 'epub']));
  // Other entry points must return to the exact same toolbar, modes and bookmark.
  await page.getByRole('button', { name: /^书签/ }).click();
  const epubCard = page.locator('.resource-card').filter({ hasText: 'EPUB 测试.epub' });
  await expect(epubCard.locator('.resource-card-page')).toContainText('第 2 / 3 章');
  await epubCard.dblclick();
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await expect(page.locator('.reader-toolbar')).toHaveCount(1);
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const epubRecord = Object.values(data.readingProgress).find(p => p.sourceType === 'epub');
  await page.evaluate(async record => { await window.omicomic.addFavorite(record); }, epubRecord);
  // Re-enter the library to refresh its favorite list through the public API.
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.getByRole('button', { name: /^收藏/ }).click();
  await page.locator('.resource-card').filter({ hasText: 'EPUB 测试.epub' }).dblclick();
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await expect(page.locator('.reader-toolbar')).toHaveCount(1);
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await electron.close(); electron = null;

  page = await launch(epubPath);
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await expect(page.locator('.reader-layout')).toHaveClass(/is-flow-vertical/);
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await expect(page.getByRole('button', { name: '取消当前章书签', exact: true })).toBeVisible();
  await expect(page.locator('[data-reader-page-index="1"] .reader-chapter')).toBeVisible();
  assert.deepEqual(await fs.readFile(pdfPath), pdfBytes);
  assert.deepEqual(await fs.readFile(epubPath), epubBytes);
});
