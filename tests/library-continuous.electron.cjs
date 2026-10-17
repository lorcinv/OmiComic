const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');

test('packaged library scrolls continuously and identifies real collection folders', { timeout: 90000 }, async t => {
  const executable = path.resolve(process.env.OMICOMIC_PACKAGED_EXE || 'release/win-unpacked/OmiComic.exe');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-library-scroll-'));
  const profile = path.join(root, 'profile'), books = path.join(root, '真实目录');
  await fs.mkdir(profile); await fs.mkdir(books);
  const pixel = await fs.readFile('tests/fixtures/images/pixel.png');
  await fs.mkdir(path.join(books, '000 集合', '子文件夹', '下一级'), { recursive: true });
  for (let i = 1; i < 130; i++) {
    const folder = path.join(books, `${String(i).padStart(3, '0')} 图片`);
    await fs.mkdir(folder); await fs.writeFile(path.join(folder, 'cover.png'), pixel);
    await fs.writeFile(path.join(folder, '2.png'), pixel);
  }
  await fs.writeFile(path.join(books, '002 图片', 'a.cbz'), '');
  await fs.writeFile(path.join(books, '002 图片', 'b.pdf'), '');
  let app;
  t.after(async () => {
    if (app) await app.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-library-scroll-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  app = await _electron.launch({ executablePath: executable, args: [], env });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const info = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged }));
  assert.equal(info.version, require('../package.json').version); assert.equal(info.packaged, true);
  assert.equal(await page.evaluate(async books => {
    const api = window.omicomic;
    const added = await api.addLibraryRoot({ path: books, name: '真实目录' });
    await api.updateLibraryState({ lastActiveRootPath: books, lastCurrentPath: books });
    await api.updateSettings({ cardScale: 40, pageSize: 60 });
    return added.ok;
  }, books), true);
  await page.reload(); await page.locator('.omi-home__library').click();
  const cards = page.locator('.resource-card');
  await expect(page.locator('.page-size-effective')).toHaveCount(0);
  await expect(cards.filter({ hasText: '000 集合' }).locator('.resource-card-info > span').first()).toHaveText('1 文件夹');
  await expect(cards.filter({ hasText: '001 图片' }).locator('.resource-card-info > span').first()).toHaveText('0/2 · 0%');
  await expect(cards.filter({ hasText: '002 图片' }).locator('.resource-card-info > span').first()).toHaveText('');
  await cards.filter({ hasText: '000 集合' }).dblclick();
  await expect(cards).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(cards.filter({ hasText: '000 集合' })).toBeVisible();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '当前页码' })).toHaveValue('2');
  await expect(page.locator('[data-library-index="63"]')).toBeVisible();
  const scroll = page.getByLabel('当前目录文件列表', { exact: true });
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('textbox', { name: '当前页码' })).toHaveValue('3');
  await expect(page.locator('[data-library-index="129"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/packaged-library-continuous.png' });
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await cards.filter({ hasText: '001 图片' }).dblclick();
  const fit = page.getByRole('combobox', { name: '缩放方式', exact: true });
  await expect(fit).toBeEnabled();
  assert.equal(Math.round((await fit.boundingBox()).width), 96);
  const result = { executable, version: info.version, libraryPassed: true, folders: 130, pageSize: 63, fitWidth: 96 };
  await fs.writeFile('test-results/library-continuous-smoke.json', JSON.stringify(result, null, 2) + '\n');
});
