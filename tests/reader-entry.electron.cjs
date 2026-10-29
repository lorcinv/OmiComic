const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');
(async () => {
  const label = process.env.OMI_ENTRY_LABEL || 'after', base = path.resolve('.cache/reader-entry-1149');
  const root = path.join(base, 'Books'), profile = path.join(base, label + '-' + Date.now());
  const output = path.resolve('output/loading-1149'); await fs.mkdir(root, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const book = path.join(root, 'Entry benchmark.cbz');
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  try {
    app = await _electron.launch({ executablePath: path.resolve(process.env.OMI_ENTRY_EXE || 'release/win-unpacked/OmiComic.exe'), env });
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setSize(1440, 960); });
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => !!window.omicomic);
    const jpeg = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 3400;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f8f1e5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let n = 0; n < 2500; n++) { ctx.fillStyle = `hsl(${n * 137 % 360} 45% 40%)`; ctx.fillRect(n * 317 % 2350, n * 179 % 3350, 14 + n % 210, 14 + n % 190); }
      return canvas.toDataURL('image/jpeg', .92).split(',')[1];
    });
    const image = Buffer.from(jpeg, 'base64'); await fs.writeFile(book, zip(Array.from({ length: 20 }, (_, i) => [`${String(i + 1).padStart(3, '0')}.jpg`, image])));
    await page.evaluate(async ({ root, book }) => {
      const api = window.omicomic;
      await api.addLibraryRoot({ path: root, name: 'Reader entry benchmark' });
      await api.updateSettings({ showHomePage: false, readerPageMode: 'double', doublePageFirstSingle: false, readerDefaultImmersive: false });
      const opened = await api.getResourcePages({ path: book, type: 'archive' }); if (!opened.ok) throw Error(opened.error.message);
      const resource = opened.data;
      const saved = await api.saveReadingProgress({ resourceKey: resource.resourceKey, sourcePath: book, sourceType: 'archive', title: resource.title,
        currentPageIndex: 4, currentPageName: resource.pages[4].name, totalPages: 20, percent: 25, completed: false, updatedAt: Date.now(),
        readerViewState: { fitMode: 'fit-window', pageMode: 'double', pageDirection: 'left-to-right', flow: 'horizontal', panorama: false, immersive: false, pairingAnchor: 4 } });
      if (!saved.ok) throw Error(saved.error.message);
    }, { root, book });
    await page.reload(); await expect(page.locator('.resource-card')).toHaveCount(1);
    const samples = [];
    for (const round of ['first', 'reentry', 'reentry-again']) {
      await app.evaluate(({ ipcMain }) => {
        globalThis.__entryCalls = [];
        if (globalThis.__entryWrapped) return; globalThis.__entryWrapped = true;
        for (const name of ['阅读:获取图片列表', '数据:获取应用数据', '数据:获取阅读进度', '阅读:获取页面图片', '窗口:全屏', '阅读:设置会话']) {
          const handler = ipcMain._invokeHandlers.get(name); if (!handler) continue;
          ipcMain._invokeHandlers.set(name, async (...args) => { const start = performance.now(); const result = await handler(...args); globalThis.__entryCalls.push({ name, duration: performance.now() - start }); return result; });
        }
      });
      await page.evaluate(() => {
        window.__entryBench = { start: 0, readerMs: null, readyMs: null, loadingStates: 0 };
        document.querySelector('.resource-card').addEventListener('dblclick', () => {
          const stats = window.__entryBench; stats.start = performance.now();
          const observer = new MutationObserver(() => sample());
          const sample = () => {
            const reader = document.querySelector('.page-panel.is-visible .reader-layout');
            if (reader && stats.readerMs === null) stats.readerMs = performance.now() - stats.start;
            if (reader?.querySelector('.reader-page-loading')) stats.loadingStates++;
            const images = [4, 5].map(index => reader?.querySelector(`[data-reader-page-index="${index}"] img`));
            if (images.every(img => img?.complete && img.naturalWidth > 0)) {
              stats.readyMs = performance.now() - stats.start; observer.disconnect(); document.removeEventListener('load', sample, true);
            }
          };
          observer.observe(document.body, { childList: true, subtree: true, attributes: true });
          document.addEventListener('load', sample, true); sample();
        }, { once: true, capture: true });
      });
      await page.locator('.resource-card').dblclick(); await page.waitForFunction(() => window.__entryBench.readyMs !== null, {}, { timeout: 30000 });
      await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('5');
      const stats = await page.evaluate(() => window.__entryBench); delete stats.start;
      const calls = await app.evaluate(() => globalThis.__entryCalls); samples.push({ round, ...stats, calls });
      await page.locator('.reader-back').click(); await expect(page.locator('.page-panel.is-visible .library-main')).toBeVisible();
    }
    const result = { label, version: (await page.evaluate(() => window.omicomic.getAppInfo())).version, imagePixels: 2400 * 3400, encodedBytes: image.length, pageMode: 'double', selectedPages: [5, 6], samples };
    await fs.writeFile(path.join(output, 'reader-entry-' + label + '.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    assert.equal(samples.length, 3);
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
