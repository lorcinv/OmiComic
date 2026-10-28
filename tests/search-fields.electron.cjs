const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron, expect } = require('@playwright/test');

(async () => {
  const base = path.resolve('.cache/search-1143'), root = path.join(base, 'JK-parent-path');
  const output = path.resolve(process.env.OMICOMIC_TEST_OUTPUT || 'output/search-1143');
  await fs.mkdir(root, { recursive: true });
  const names = ['Name JK.cbr', 'Tag match.cbr', 'Note match.cbr', 'Unrelated.cbr'];
  for (const name of names) await fs.copyFile('tests/fixtures/android-archives/RAR5.cbr', path.join(root, name));
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: path.join(base, 'profile') };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const app = await _electron.launch({ executablePath: path.resolve('release/win-unpacked/OmiComic.exe'), env });
  try {
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !!window.omicomic);
    await page.evaluate(async ({ root, names }) => {
      const api = window.omicomic;
      for (const response of [await api.addLibraryRoot({ path: root, name: 'Search check' }), await api.updateLibraryState({ lastActiveRootPath: root, lastCurrentPath: root })]) if (!response.ok) throw new Error(response.error.message);
      for (const [index, name] of names.entries()) {
        const sourcePath = root + '\\' + name;
        const response = await api.updateResourceMeta({ resourceKey: 'archive:' + sourcePath, sourcePath, sourceType: 'archive', title: name, note: index === 2 ? 'About JK' : '', tags: index === 1 ? ['JK'] : [] });
        if (!response.ok) throw new Error(response.error.message);
      }
    }, { root, names });
    await page.locator('.omi-home__library').click();
    const cards = page.locator('.resource-card'), input = page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
    await expect(cards).toHaveCount(4);
    await input.fill('jk'); await expect(cards).toHaveCount(3);
    await expect.poll(async () => (await cards.locator('strong').allTextContents()).sort()).toEqual(names.slice(0, 3).sort());
    await input.fill('JK-parent-path'); await expect(cards).toHaveCount(0);
    await input.fill('tag:jk'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Tag match.cbr');
    await input.fill('note:jk'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Note match.cbr');
    await input.fill('jk'); await expect(cards).toHaveCount(3);
    await page.screenshot({ path: path.join(output, 'pc-search-fields.png') });
    await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
    await expect(page.getByRole('button', { name: '重随机', exact: true })).toBeVisible();
    await input.focus(); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '重随机', exact: true })).toHaveCount(0);
    await expect(input).toHaveValue('jk');
    const info = await page.evaluate(() => window.omicomic.getAppInfo()); assert.equal(info.version, require('../package.json').desktopVersion);
    const result = { info, nativeArchiveFiles: 4, parentPathExcluded: true, filenameMatched: true, tagMatched: true, noteMatched: true, randomEscapeBeforeSearch: true };
    await fs.writeFile(path.join(output, 'pc-runtime.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
