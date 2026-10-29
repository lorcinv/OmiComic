const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');
(async () => {
  const base = path.resolve('.cache/panorama-drag-1149'), profile = path.join(base, 'profile-' + Date.now());
  const output = path.resolve('output/loading-1149'); await fs.mkdir(base, { recursive: true });
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  const watchdog = setTimeout(() => { if (app) void app.close(); }, 60000);
  try {
    app = await _electron.launch({ executablePath: path.resolve('release/win-unpacked/OmiComic.exe'), args: ['--disable-features=CalculateNativeWinOcclusion', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'], env });
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.webContents.setBackgroundThrottling(false); win.setFocusable(false); win.showInactive();
    });
    const page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.omi-home')).toBeVisible();
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1062; c.height = 1500; const ctx = c.getContext('2d');
      ctx.fillStyle = '#315a88'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#eef1f5';
      for (let n = 0; n < 1500; n += 150) ctx.fillRect(0, n, 1062, 12);
      return c.toDataURL().split(',')[1];
    });
    const book = path.join(base, 'Panorama.zip'); await fs.writeFile(book, zip(Array.from({ length: 24 }, (_, n) => [`${String(n).padStart(3, '0')}.png`, Buffer.from(png, 'base64')])));
    await page.evaluate(async ({ root, book }) => {
      const api = window.omicomic; await api.addLibraryRoot({ path: root, name: 'Panorama regression' });
      await api.updateSettings({ readerMemoryCacheSizeMb: 4096, readerPreloadPages: 48, readerImageLoadConcurrency: 12, desktopReaderAutoHide: false });
      const r = await api.getResourcePages({ path: book, type: 'archive' }); if (!r.ok) throw Error(r.error.message);
      const saved = await api.saveReadingProgress({ resourceKey: r.data.resourceKey, sourcePath: book, sourceType: 'archive', title: r.data.title, currentPageIndex: 8, currentPageName: r.data.pages[8].name, totalPages: 24, percent: 37, completed: false, updatedAt: Date.now(),
        readerViewState: { fitMode: 'fit-height', pageMode: 'double', pageDirection: 'left-to-right', flow: 'horizontal', panorama: true, immersive: false, pairingAnchor: 8 } });
      if (!saved.ok) throw Error(saved.error.message);
    }, { root: base, book });
    await app.evaluate(({ dialog }, book) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [book] }); }, book);
    const chosen = await page.evaluate(() => window.omicomic.chooseExternalFiles()); assert.equal(chosen.ok, true);
    try { await expect(page.locator('.reader-stage.is-panorama')).toBeVisible(); }
    catch (error) { console.error(JSON.stringify({ errors, body: await page.evaluate(() => document.body.innerText.slice(-2500)) })); throw error; }
    await expect.poll(() => page.locator('.is-panorama-strip img').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length)).toBeGreaterThan(10);
    const cases = [];
    for (const windowMode of ['maximized', 'vertical-fit', 'restored']) {
      await app.evaluate(({ BrowserWindow, screen }, mode) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (mode === 'maximized') win.maximize();
        else {
          win.unmaximize();
          if (mode === 'vertical-fit') { const area = screen.getPrimaryDisplay().workArea; win.setBounds({ x: area.x + 80, y: area.y, width: Math.min(1100, area.width - 160), height: area.height }); }
          else win.setSize(1100, 820);
        }
      }, windowMode);
      await expect.poll(() => page.evaluate(async () => (await window.omicomic.isWindowMaximized()).data)).toBe(windowMode === 'maximized');
      for (const flow of ['horizontal', 'vertical']) {
        await fs.appendFile(path.join(output, 'panorama-native-trace.log'), `${windowMode} ${flow}\n`);
        const vertical = await page.locator('.reader-stage').evaluate(element => element.classList.contains('is-flow-vertical'));
        if (vertical !== (flow === 'vertical')) await page.getByRole('button', { name: vertical ? '当前纵向阅读，点击切换横向阅读' : '当前横向阅读，点击切换纵向阅读', exact: true }).click();
        await page.waitForTimeout(150);
        const stage = await page.locator('.reader-stage').boundingBox(), x = stage.x + stage.width * .6, y = stage.y + stage.height * .6;
        await page.mouse.move(x, y); await page.mouse.down();
        const positions = [], painted = [];
        for (let step = 0; step < 24; step++) {
          await page.mouse.move(x - (flow === 'horizontal' ? step * 3 : 0), y - (flow === 'vertical' ? step * 3 : 0)); await page.waitForTimeout(24);
          if (step % 4 === 0) {
            const image = await Promise.race([app.evaluate(({ BrowserWindow }, rect) => {
              return BrowserWindow.getAllWindows()[0].webContents.capturePage(rect, { stayAwake: true }).then(image => {
                const bytes = image.getBitmap(); let blue = 0;
                for (let n = 0; n < bytes.length; n += 4) if (bytes[n + 1] === 90 && ((bytes[n] === 136 && bytes[n + 2] === 49) || (bytes[n] === 49 && bytes[n + 2] === 136))) blue++;
                return blue / (bytes.length / 4);
              });
            }, { x: Math.round(stage.x + stage.width / 2 - 50), y: Math.round(stage.y + stage.height / 2 - 50), width: 100, height: 100 }),
              new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Native capture timed out')), 4000); timer.unref(); })]);
            painted.push(image);
          }
          positions.push(await page.locator('.is-panorama-strip').evaluate((element, flow) => {
            const m = new DOMMatrix(getComputedStyle(element).transform); return (flow === 'horizontal' ? m.m41 : m.m42) * devicePixelRatio;
          }, flow));
        }
        await page.mouse.up();
        assert.ok(positions.every(value => Math.abs(value - Math.round(value)) < .02), 'Subpixel drag position');
        assert.ok(positions[0] - positions.at(-1) > 20, 'The native drag did not advance');
        assert.ok(positions.slice(1).every((value, n) => value <= positions[n] + 1), 'Drag moved backwards');
        assert.ok(painted.every(value => value > .2), 'Native capture showed a blank page');
        cases.push({ windowMode, flow, stage, positions, painted });
      }
    }
    const gpu = await app.evaluate(({ app, screen }) => ({ features: app.getGPUFeatureStatus(), scaleFactor: screen.getPrimaryDisplay().scaleFactor }));
    await fs.writeFile(path.join(output, 'panorama-native.json'), JSON.stringify({ cases, gpu, fixture: { pages: 24, width: 1062, height: 1500, cacheMb: 4096, preload: 48, concurrency: 12 } }, null, 2));
    console.log(JSON.stringify({ nativeWindowsCases: cases.map(({ windowMode, flow, painted }) => ({ windowMode, flow, paintedFrames: painted.length })), gpu }));
  } finally { clearTimeout(watchdog); if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
