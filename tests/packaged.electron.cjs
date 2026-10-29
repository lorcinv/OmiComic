// Run after npm run dist:win. Exercises the shipped EXE/ASAR/worker/7-Zip with no visible windows.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');
const asar = require('@electron/asar');

test('shipped Windows EXE reads images, ZIP, 7z, PDF and EPUB with isolated persisted data', { timeout: 120000 }, async t => {
  const executable = path.resolve(process.env.OMICOMIC_PACKAGED_EXE || 'release/win-unpacked/OmiComic.exe');
  const resourceDir = path.join(path.dirname(executable), 'resources');
  const contents = asar.listPackage(path.join(resourceDir, 'app.asar'));
  assert.ok(!contents.some(file => file.includes('node_modules')), 'runtime has no redundant dependency tree');
  assert.ok(contents.some(file => file.endsWith('licenses/7zip-License.txt') || file.endsWith('licenses\\7zip-License.txt')));
  await fs.access(path.join(resourceDir, 'app.asar.unpacked', 'dist-electron', 'epubWorker.js'));
  await fs.access(path.join(resourceDir, '7zip', '7z.dll'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-package-'));
  const profile = path.join(root, 'profile');
  const books = path.join(root, '测试文档');
  await fs.mkdir(profile); await fs.mkdir(books);
  const pixel = await fs.readFile('tests/fixtures/images/pixel.png');
  await fs.writeFile(path.join(books, '01.png'), pixel);
  await fs.writeFile(path.join(books, '02.png'), pixel);
  await fs.writeFile(path.join(books, '漫画.cbz'), zip([['01.png', pixel], ['02.png', pixel]]));
  execFileSync(path.join(resourceDir, '7zip', '7z.exe'), ['a', '-t7z', path.join(books, '漫画.cb7'), path.join(books, '*.png')], { windowsHide: true, stdio: 'ignore' });
  await fs.copyFile('tests/fixtures/documents/three-pages.pdf', path.join(books, '文档.pdf'));
  await fs.writeFile(path.join(books, '电子书.epub'), zip([
    ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
    ['OPS/book.opf', '<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>'],
    ['OPS/one.xhtml', '<h1>安装版 EPUB 第一章</h1><p>独立 worker 正常工作。</p>'],
    ['OPS/two.xhtml', '<h1>安装版 EPUB 第二章</h1><p>保存与恢复章节。</p>'],
  ]));
  let electron;
  t.after(async () => {
    if (electron) await electron.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-package-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const names = ['01.png', '漫画.cbz', '漫画.cb7', '文档.pdf', '电子书.epub'];
  const results = [];
  for (const name of names) {
    const start = performance.now();
    electron = await _electron.launch({ executablePath: executable, args: [path.join(books, name)], env });
    const page = await electron.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const app = await electron.evaluate(({ app, BrowserWindow }) => ({ packaged: app.isPackaged, version: app.getVersion(), profile: app.getPath('userData'), visible: BrowserWindow.getAllWindows().some(window => window.isVisible()) }));
    assert.equal(app.packaged, true); assert.equal(app.version, require('../package.json').version); assert.equal(app.profile, profile); assert.equal(app.visible, false);
    await expect(page.locator('.reader-layout')).toBeVisible();
    const pageInput = page.getByRole('textbox', { name: name.endsWith('.epub') ? '跳转到章节' : '跳转到页码' });
    await expect(pageInput).toHaveValue('1');
    const content = name.endsWith('.pdf') ? '.reader-page-spread canvas' : name.endsWith('.epub') ? '.reader-chapter' : '.reader-page-spread img';
    await expect(page.locator(name.endsWith('.epub') ? content : name.endsWith('.pdf') ? '.reader-page-spread canvas:visible' : '.reader-page-spread :is(.reader-image,.reader-processed-image,.reader-display-raster):visible').first()).toBeVisible();
    if (name.endsWith('.epub')) await expect(page.frameLocator('.reader-chapter iframe').first().getByRole('heading', { name: '安装版 EPUB 第一章' })).toBeVisible();
    else if (!name.endsWith('.pdf')) await expect.poll(() => page.locator(content).first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(pageInput).toHaveValue('2');
    await expect.poll(async () => Object.values((await page.evaluate(() => window.omicomic.getAppData())).data.readingProgress).some(record => record.currentPageIndex === 1 && (record.sourcePath.endsWith(name) || name === '01.png'))).toBe(true);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.locator('.library-layout')).toBeVisible();
    results.push({ format: path.extname(name), openAndVerifyMs: Math.round(performance.now() - start) });
    await electron.close(); electron = null;
  }
  electron = await _electron.launch({ executablePath: executable, args: [], env });
  const page = await electron.firstWindow();
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
  const data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  assert.equal(data.temporaryOpened.length, 5);
  assert.deepEqual(await fs.readFile(path.join(books, '01.png')), pixel);
  const renamed = await page.evaluate(sourcePath => window.omicomic.changeLocalResource({path:sourcePath,action:'rename',name:'重命名漫画.cbz'}),path.join(books,'漫画.cbz'));
  assert.equal(renamed.ok,true,JSON.stringify(renamed));
  assert.equal(renamed.data.appData.readingProgress[`archive:${renamed.data.newPath}`].currentPageIndex,1);
  await fs.access(renamed.data.newPath);
  const hidden = await page.evaluate(sourcePath=>window.omicomic.changeLocalResource({path:sourcePath,action:'index'}),renamed.data.newPath);
  assert.equal(hidden.ok,true);await fs.access(renamed.data.newPath);
  const listing = await page.evaluate(sourcePath=>window.omicomic.listDirectory(sourcePath),books);
  assert.ok(!listing.data.items.some(i=>i.path===renamed.data.newPath));
  assert.equal((await page.evaluate(()=>window.omicomic.restoreResourceIndex())).ok,true);
  const disposable=path.join(books,'删除测试.cbz');
  await fs.writeFile(disposable,zip([['01.png',pixel]]));
  const trashed=await page.evaluate(sourcePath=>window.omicomic.changeLocalResource({path:sourcePath,action:'trash'}),disposable);
  assert.equal(trashed.ok,true,JSON.stringify(trashed));await assert.rejects(fs.access(disposable));
  const protectedRoot=await page.evaluate(sourcePath=>window.omicomic.changeLocalResource({path:sourcePath,action:'trash'}),books);
  assert.equal(protectedRoot.ok,false);await fs.access(books);
  await fs.mkdir('test-results', { recursive: true });
  await fs.writeFile('test-results/packaged-smoke.json', JSON.stringify({ executable, version: require('../package.json').version, formats: results, persistedTemporaryRecords: data.temporaryOpened.length }, null, 2));
});
