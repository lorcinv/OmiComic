const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { Resvg } = require('@resvg/resvg-js');
const { zip } = require('./helpers/documentFixtures.cjs');

// Screen pixels are required: canvas snapshots only expose a default frame.
for (const format of ['gif', 'webp', 'png', 'apng']) for (const source of ['folder', 'archive']) test(`desktop ${source} animated ${format} keeps playing`, { timeout: 90000 }, async t => {
  const gif = await fs.readFile(path.join(__dirname, 'fixtures/animations', `animated.${format}`));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-gif-'));
  const books = path.join(root, 'Books'), profile = path.join(root, 'profile');
  await fs.mkdir(books); await fs.mkdir(profile);
  const still = format === 'webp' ? await fs.readFile(path.join(__dirname, 'fixtures/animations/static.webp')) : new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#567087"/><circle cx="300" cy="400" r="200" fill="#dab594"/></svg>').render().asPng();
  await fs.writeFile(path.join(books, `01.${format}`), gif);
  await fs.writeFile(path.join(books, `02.${format === 'webp' ? 'webp' : 'png'}`), still);
  const archive = path.join(books, 'Animation.cbz');
  await fs.writeFile(archive, zip([[`01.${format.toUpperCase()}`, gif], [`02.${format === 'webp' ? 'webp' : 'png'}`, still]], true));
  await fs.writeFile(path.join(profile, 'omicomic-data.json'), JSON.stringify({ version: 1,
    library: { roots: [{ path: books, name: 'Books', addedAt: 1, lastOpenedAt: 1 }] },
    settings: { readerPageMode: 'single' } }));
  let app;
  t.after(async () => {
    if (app) await app.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-gif-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const env = { ...process.env, OMICOMIC_TEST_PROFILE: profile, OMICOMIC_TEST_HEADLESS: '1' };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const executable = process.env.OMICOMIC_PACKAGED_EXE || require('electron');
  const file = source === 'archive' ? archive : path.join(books, `01.${format}`);
  app = await _electron.launch({ executablePath: executable, args: process.env.OMICOMIC_PACKAGED_EXE ? [file] : ['.', file], env });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const current = page.locator('[data-reader-page-index="0"]');
  await expect(current.locator('img.reader-image')).toBeVisible({ timeout: 20000 });
  await page.mouse.move(0, 0);
  const results = [];
  const sample = async label => {
    const box = await current.boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0);
    const clip = { x: Math.floor(box.x + box.width / 2), y: Math.floor(box.y + box.height / 2), width: 2, height: 2 };
    const pixels = [];
    for (let n = 0; n < 7; n++) {
      pixels.push(await app.evaluate(async ({ BrowserWindow }, rect) => {
        const window = BrowserWindow.getAllWindows().find(window => !window.getParentWindow());
        const image = await window.webContents.capturePage(rect, { stayHidden: true, stayAwake: true });
        return [...image.toBitmap().subarray(0, 4)];
      }, clip));
      await page.waitForTimeout(135);
    }
    const colors = [...new Set(pixels.map(pixel => pixel.join(',')))];
    const state = await current.locator('.reader-effects').evaluate(element => ({ processing: element.dataset.processing, sampling: element.dataset.displaySampling, filter: getComputedStyle(element).filter }));
    results.push({ label, colors, ...state });
  };
  const adjust = async (sharpen, denoise, brightness = 100) => {
    await page.getByRole('button', { name: '画面调整', exact: true }).click();
    await page.getByRole('slider', { name: '锐化', exact: true }).fill(String(sharpen));
    await page.getByRole('slider', { name: '降噪', exact: true }).fill(String(denoise));
    await page.getByRole('slider', { name: '亮度', exact: true }).fill(String(brightness));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  };
  await sample('default');
  await adjust(0, 0, 125); await sample('brightness');
  await adjust(40, 0); await sample('sharpen');
  await adjust(0, 40); await sample('denoise');
  await adjust(40, 40, 125); await sample('combined');
  await page.getByRole('button', { name: '缩放', exact: true }).click();
  await page.getByRole('slider', { name: '缩放比例', exact: true }).fill('35');
  await page.keyboard.press('Escape');
  await sample('zoomed');
  await page.getByRole('button', { name: '缩放', exact: true }).click();
  await page.getByRole('button', { name: '重置大小', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-reader-page-index="1"] .reader-effects')).toHaveAttribute('data-processing', 'ready', { timeout: 20000 });
  await page.keyboard.press('ArrowLeft');
  await expect(current).toBeVisible();
  await page.waitForTimeout(800); await sample('return-from-still');
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await page.waitForTimeout(800); await sample('panorama');
  const result = { version: await app.evaluate(({ app }) => app.getVersion()), system: os.release(), source, format, staticProcessingPassed: true, results };
  t.diagnostic(JSON.stringify(result));
  await fs.mkdir('test-results', { recursive: true });
  await fs.writeFile(`test-results/reader-animation-${format}-${source}.json`, JSON.stringify(result, null, 2));
  for (const result of results) {
    const colors = result.colors.map(color => color.split(',').map(Number));
    assert.ok(colors.some(([b, , r, a]) => r > b + 100 && a === 255) && colors.some(([b, , r, a]) => b > r + 100 && a === 255),
      `${source}/${result.label}: animation must display both red and blue frames; ${JSON.stringify(result)}`);
    assert.equal(result.sampling, 'original');
    assert.equal(result.processing, 'original');
  }
  assert.match(results.find(result => result.label === 'brightness').filter, /brightness\(1.25\)/);
});
