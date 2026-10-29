// Packaged cold-catalog regression and real drop-notice layout/typography.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron, expect } = require('@playwright/test');

(async () => {
  const base = path.resolve('.cache/first-random-1148'), books = path.join(base, 'Large library');
  const incoming = path.join(base, 'Dropped folder'), profile = path.join(base, 'profile-' + Date.now());
  const output = path.resolve('output/hotfix-1148-r1');
  const pixel = await fs.readFile('tests/fixtures/images/pixel.png');
  for (let index = 0; index < 120; index++) {
    const book = path.join(books, `Group ${String(index).padStart(3, '0')}`, 'Comic');
    await fs.mkdir(book, { recursive: true });
    for (const name of ['1.png', '2.png']) await fs.writeFile(path.join(book, name), pixel);
  }
  await fs.mkdir(incoming, { recursive: true }); await fs.writeFile(path.join(incoming, '1.png'), pixel);
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  try {
    app = await _electron.launch({ executablePath: path.resolve('release/win-unpacked/OmiComic.exe'), env });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => !!window.omicomic);
    await page.evaluate(async books => {
      const api = window.omicomic;
      for (const result of [await api.addLibraryRoot({ path: books, name: 'Cold random library' }),
        await api.updateSettings({ showHomePage: false, pageSize: 50, cardScale: 40, desktopGlobalFontSize: 14 })]) {
        if (!result.ok) throw Error(result.error.message);
      }
    }, books);
    await page.reload(); await expect(page.locator('.library-main')).toBeVisible();
    await expect(page.getByRole('switch', { name: '随机阅读', exact: true })).toBeEnabled();
    await page.evaluate(() => {
      window.__firstRandomPrefix = null;
      const observer = new MutationObserver(() => {
        if (document.documentElement.dataset.randomBrowse !== 'on') return;
        const keys = [...document.querySelectorAll('.resource-card')].map(el => el.getAttribute('data-selection-key'));
        if (!keys.length) return;
        window.__firstRandomPrefix = keys; observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
    await expect(page.locator('.resource-card')).toHaveCount(50, { timeout: 30000 });
    const batch = await page.locator('.resource-card').evaluateAll(items => items.map(el => el.getAttribute('data-selection-key')));
    assert.equal(new Set(batch).size, 50);
    const prefix = await page.evaluate(() => window.__firstRandomPrefix);
    assert.ok(prefix?.length > 0); assert.deepEqual(batch.slice(0, prefix.length), prefix);
    // No redraw was clicked: the initial incremental scan must fill the batch.
    await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
    const cdp = await page.context().newCDPSession(page);
    const drop = async () => {
      const data = { items: [], files: [incoming], dragOperationsMask: 1 };
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp.send('Input.dispatchDragEvent', { type, x: 650, y: 350, data });
      await expect(page.locator('.directory-drop-notice')).toBeVisible();
    };
    const geometry = () => page.evaluate(() => {
      const main = document.querySelector('.page-panel.is-visible .library-main').getBoundingClientRect();
      const notice = document.querySelector('.directory-drop-notice'), box = notice.getBoundingClientRect();
      return { paneX: main.x + main.width / 2, paneY: main.y + main.height / 2, x: box.x + box.width / 2, y: box.y + box.height / 2,
        font: parseFloat(getComputedStyle(notice).fontSize), closeFont: parseFloat(getComputedStyle(notice.querySelector('button')).fontSize), text: notice.querySelector('span').textContent };
    });
    const centered = async () => {
      await expect.poll(async () => { const g = await geometry(); return Math.max(Math.abs(g.x - g.paneX), Math.abs(g.y - g.paneY)); }).toBeLessThan(1);
      const value = await geometry(); assert.ok(!/[。．.]$/.test(value.text)); return value;
    };
    await drop(); const normal = await centered(); assert.equal(normal.font, 13);
    await page.screenshot({ path: path.join(output, 'notice-default.png'), timeout: 10000 });
    await page.evaluate(async () => {
      const result = await window.omicomic.updateSettings({ desktopGlobalFontSize: 20 });
      if (!result.ok) throw Error(result.error.message);
    });
    await page.reload(); await expect(page.locator('.library-main')).toBeVisible();
    await drop(); const larger = await centered();
    assert.ok(Math.abs(larger.font / normal.font - 20 / 14) < .01);
    assert.ok(Math.abs(larger.closeFont / normal.closeFont - 20 / 14) < .01);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 820)); await centered();
    await page.screenshot({ path: path.join(output, 'notice-large-font.png'), timeout: 10000 });
    assert.deepEqual(errors, []);
    const result = { version: (await page.evaluate(() => window.omicomic.getAppInfo())).version, coldFolders: 120, initialPrefix: prefix.length,
      firstRandomCount: batch.length, redrawRequired: false, stablePrefix: true, normal, larger, resizeCentered: true };
    await fs.writeFile(path.join(output, 'pc-runtime.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
