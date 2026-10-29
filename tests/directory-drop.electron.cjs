// Real native-backed drag payloads, packaged preload and persistence; isolated profile.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');

(async () => {
  const base = path.resolve('.cache/directory-drop-1148'), profile = path.join(base, 'profile-' + Date.now());
  const output = path.resolve('output/drag-drop-1148');
  const roots = ['首页拖入漫画', 'Settings folder', 'Reader folder', 'EPUB folder'].map(name => path.join(base, name));
  await fs.mkdir(output, { recursive: true });
  for (const root of roots) {
    await fs.mkdir(root, { recursive: true });
    for (const name of ['01.webp', '02.webp']) await fs.copyFile('tests/fixtures/omi-icon.webp', path.join(root, name));
  }
  const epub = path.join(roots[0], 'Drag check.epub');
  await fs.writeFile(epub, zip([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OPS/book.opf', '<package version="3.0" xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>'],
    ['OPS/chapter.xhtml', '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Drag test chapter</title></head><body><h1>EPUB drop area</h1><p>Keep this chapter open while importing.</p></body></html>'],
  ]));
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  try {
    app = await _electron.launch({ executablePath: path.resolve('release/win-unpacked/OmiComic.exe'), env });
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.omi-home')).toBeVisible();
    assert.equal((await page.evaluate(() => window.omicomic.getAppInfo())).version, '1.1.48');
    const cdp = await page.context().newCDPSession(page);
    const drop = async (files, point = { x: 500, y: 350 }) => {
      const data = { items: [], files, dragOperationsMask: 1 };
      await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', ...point, data });
      await expect(page.locator('.directory-drop-overlay')).toBeVisible();
      await cdp.send('Input.dispatchDragEvent', { type: 'dragOver', ...point, data });
      await cdp.send('Input.dispatchDragEvent', { type: 'drop', ...point, data });
      await expect(page.locator('.directory-drop-overlay')).toHaveCount(0);
    };
    const data = async () => (await page.evaluate(() => window.omicomic.getAppData())).data;
    const count = async () => (await data()).library.roots.length;
    await drop([roots[0]]); await expect.poll(count).toBe(1);
    await expect(page.locator('.directory-drop-notice')).toContainText('目录已加入资源库');
    await expect(page.locator('.omi-home')).toBeVisible();
    const beforeDuplicate = (await data()).library;
    await drop([roots[0]]); await expect(page.locator('.directory-drop-notice')).toContainText('该目录已在资源库');
    assert.deepEqual((await data()).library, beforeDuplicate);
    await drop([roots[1], roots[2]]); await expect(page.locator('.directory-drop-notice')).toContainText('请每次拖入一个文件夹'); assert.equal(await count(), 1);
    await drop([path.join(roots[0], '01.webp')]); await expect(page.locator('.directory-drop-notice')).toContainText('请拖入单个文件夹'); assert.equal(await count(), 1);
    const fake = await page.evaluate(() => window.omicomic.importDroppedDirectory(new File(['test'], 'fake-folder')));
    assert.equal(fake.ok, false);

    await page.locator('.omi-home__library').click();
    await expect(page.locator('.page-panel.is-visible .resource-card')).toHaveCount(3);
    await page.locator('.sidebar-settings-button').click();
    await expect(page.locator('#settings-category-appearance')).toBeVisible();
    await drop([roots[1]]); await expect.poll(count).toBe(2);
    await expect(page.locator('#settings-category-appearance')).toBeVisible();
    assert.equal((await data()).library.lastCurrentPath, roots[0]);
    await page.keyboard.press('Escape'); await expect(page.locator('#settings-category-appearance')).toHaveCount(0);
    // The currently mounted library must receive the new root without a restart.
    const rootSelector = page.getByRole('button', { name: '切换资源目录', exact: true });
    await rootSelector.click(); await expect(page.getByRole('option', { name: 'Settings folder', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    const openFile = async filename => {
      await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, filename);
      const result = await page.evaluate(() => window.omicomic.chooseExternalFiles()); assert.equal(result.ok, true);
    };
    await openFile(path.join(roots[0], '02.webp'));
    await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
    await expect(page.locator('.reader-page-frame img').first()).toBeVisible();
    await page.evaluate(() => { window.__originalReaderImage = document.querySelector('.reader-page-frame img'); });
    await drop([roots[2]]); await expect.poll(count).toBe(3);
    await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
    assert.equal(await page.evaluate(() => window.__originalReaderImage === document.querySelector('.reader-page-frame img')), true);
    await openFile(epub); await expect(page.locator('.reader-chapter iframe').first()).toBeVisible();
    const box = await page.locator('.reader-chapter iframe').first().boundingBox();
    await drop([roots[3]], { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + Math.min(box.height / 2, 160)) });
    await expect.poll(count).toBe(4); await expect(page.locator('.reader-chapter iframe').first()).toBeVisible();
    assert.equal((await data()).library.lastCurrentPath, roots[0]);
    const capture = process.env.OMICOMIC_DROP_SCREENSHOTS === '1';
    if (capture) await page.screenshot({ path: path.join(output, 'pc-reader-drop.png') });
    for (const theme of ['mist', 'nord', 'sand', 'night']) {
      await page.evaluate(theme => { document.documentElement.dataset.colorTheme = theme; }, theme);
      await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 500, y: 350, data: { items: [], files: [roots[0]], dragOperationsMask: 1 } });
      await expect(page.locator('.directory-drop-overlay')).toBeVisible();
      if (capture) await page.screenshot({ path: path.join(output, 'pc-drag-' + theme + '.png') });
      await cdp.send('Input.dispatchDragEvent', { type: 'dragCancel', x: 500, y: 350, data: { items: [], files: [], dragOperationsMask: 1 } });
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await expect(page.locator('.directory-drop-overlay')).toHaveCount(0);
    }
    await app.close(); app = undefined;
    const saved = JSON.parse(await fs.readFile(path.join(profile, 'omicomic-data.json'), 'utf8'));
    assert.deepEqual(saved.library.roots.map(root => root.path), roots);
    const result = { version: '1.1.48', packagedApp: true, profile, nativeFolderDrop: true, home: true, settings: true, readerPositionAndImagePreserved: true, epub: true,
      duplicateIdempotent: true, multipleRejected: true, regularFileRejected: true, syntheticFileRejected: true, existingRootOrderAndSelectionPreserved: true,
      persistedRoots: saved.library.roots.length, themes: ['mist', 'nord', 'sand', 'night'] };
    await fs.writeFile(path.join(output, 'pc-drag-runtime.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
