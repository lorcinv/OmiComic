const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Resvg } = require('@resvg/resvg-js');
const { _electron, expect } = require('@playwright/test');

test('shipped reader fits real wide/tall PNGs, pairs safely and separates panorama zoom', { timeout: 90000 }, async t => {
  const executable = path.resolve(process.env.OMICOMIC_PACKAGED_EXE || 'release/win-unpacked/OmiComic.exe');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-reader-layout-'));
  const profile = path.join(root, 'profile'), books = path.join(root, '阅读适配样本');
  await fs.mkdir(profile); await fs.mkdir(books);
  const sizes = [[600, 900], [600, 900], [1200, 1000], [1200, 1000], [6000, 400], [400, 6000], [1200, 400]];
  for (const [i, [width, height]] of sizes.entries()) {
    const png = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${i % 2 ? '#d8cfb9' : '#b7cce0'}"/><rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#455f7c" stroke-width="12"/></svg>`).render().asPng();
    await fs.writeFile(path.join(books, `${i + 1}.png`), png);
  }
  let app;
  t.after(async () => {
    if (app) await app.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-reader-layout-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  app = await _electron.launch({ executablePath: executable, args: [path.join(books, '1.png')], env });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
  const info = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), profile: app.getPath('userData') }));
  assert.equal(info.packaged, true); assert.equal(info.version, require('../package.json').version); assert.equal(info.profile, profile);
  const zoom = page.getByRole('combobox', { name: '缩放方式' });
  await expect(zoom).toBeEnabled(); await expect(zoom).toContainText('适应窗口');
  const fit = async label => {
    await zoom.click(); await page.getByRole('option', { name: label, exact: true }).click();
    await expect(zoom).toContainText(label); await expect(zoom).toHaveAttribute('aria-expanded', 'false');
  };
  const jump = async number => { const input = page.getByRole('textbox', { name: '跳转到页码' }); await input.fill(String(number)); await input.press('Enter'); await expect(page.locator(`[data-reader-page-index="${number - 1}"] img`)).toBeVisible(); };
  const contained = async () => expect.poll(() => page.locator('.reader-stage').evaluate(stage => {
    const r = stage.getBoundingClientRect(), css = getComputedStyle(stage);
    const left = r.left + parseFloat(css.paddingLeft), top = r.top + parseFloat(css.paddingTop);
    const width = stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight), height = stage.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const spread = stage.querySelector('.reader-page-spread').getBoundingClientRect();
    return [...stage.querySelectorAll('img')].every(img => {
      const box = img.getBoundingClientRect();
      return img.complete && img.naturalWidth > 0 && box.left >= left - 1 && box.right <= left + width + 1 && box.top >= top - 1 && box.bottom <= top + height + 1;
    }) && Math.abs(spread.x + spread.width / 2 - left - width / 2) < 1 && Math.abs(spread.y + spread.height / 2 - top - height / 2) < 1;
  })).toBe(true);
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click();
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2); await contained();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('[data-reader-page-index="2"] img')).toBeVisible();
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2); await contained();
  await fit('适应高度');
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(1); await contained();
  await page.getByRole('button', { name: '当前双页，点击切换单页', exact: true }).click();
  for (const number of [5, 6]) { await jump(number); await fit('适应窗口'); await contained(); }
  await jump(5);
  await expect.poll(() => page.locator('.reader-stage').evaluate(stage => Math.abs(stage.querySelector('img').getBoundingClientRect().width - stage.clientWidth))).toBeLessThan(1);
  await fit('适应高度');
  await expect.poll(() => page.locator('.reader-stage').evaluate(stage => {
    const css = getComputedStyle(stage);
    return Math.abs(stage.querySelector('img').getBoundingClientRect().height - stage.clientHeight + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom));
  })).toBeLessThan(1);
  await expect.poll(() => page.locator('.reader-stage').evaluate(stage => stage.scrollWidth - stage.clientWidth)).toBeGreaterThan(1000);
  await jump(7); await fit('适应宽度'); await contained();
  await app.evaluate(async ({ BrowserWindow }) => { await BrowserWindow.getAllWindows()[0].capturePage(undefined, { stayHidden: true, stayAwake: true }); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const capture = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].capturePage(undefined, { stayHidden: true, stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await fs.writeFile('test-results/packaged-reader-centered.png', Buffer.from(capture, 'base64'));
  await jump(6); await page.locator('.reader-stage').evaluate(stage => { stage.scrollTop = 1000; });
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect(zoom).toBeDisabled(); await expect(zoom).toContainText('适应高度');
  await expect.poll(() => page.locator('.reader-stage').evaluate(stage => stage.scrollTop)).toBe(0);
  const pageX = index => page.locator(`[data-reader-page-index="${index}"]`).evaluate(el => el.getBoundingClientRect().x);
  await expect.poll(async () => await pageX(6) - await pageX(5)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '当前从左到右阅读，点击切换为从右到左', exact: true }).click();
  await expect.poll(async () => await pageX(6) - await pageX(5)).toBeLessThan(0);
  await expect(page.getByRole('slider', { name: '阅读进度' })).toHaveAttribute('aria-valuenow', '6');
  await page.getByRole('button', { name: '当前从右到左阅读，点击切换为从左到右', exact: true }).click();
  await expect.poll(async () => await pageX(6) - await pageX(5)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await expect(zoom).toContainText('适应宽度'); await expect(zoom).toBeDisabled();
  await expect.poll(() => page.locator('[data-reader-page-index="5"] img').evaluate(img => {
    const stage = document.querySelector('.reader-stage'), css = getComputedStyle(stage);
    return Math.abs(img.getBoundingClientRect().width - stage.clientWidth + parseFloat(css.paddingLeft) + parseFloat(css.paddingRight));
  })).toBeLessThan(1);
  await page.getByRole('button', { name: '关闭全景连环画', exact: true }).click();
  await expect(zoom).toContainText('适应宽度'); await expect(zoom).toBeEnabled();
  await fit('适应窗口'); await contained();
  const immersive = page.getByRole('button', { name: '沉浸', exact: true });
  await immersive.click(); await expect(page.locator('.reader-layout')).toHaveClass(/is-immersive/);
  await page.keyboard.press('Escape'); await expect(page.locator('.reader-layout')).not.toHaveClass(/is-immersive/);
  await expect(immersive).toHaveCSS('outline-style', 'none');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  assert.ok(Object.values(data.readingProgress).some(p => p.readerViewState?.fitMode === 'fit-window'));
  await fs.mkdir('test-results', { recursive: true });
  await fs.writeFile('test-results/reader-layout-smoke.json', JSON.stringify({ executable, version: info.version, formats: 'real PNG', sizes, layoutPassed: true, panoramaDirection: true, zoomPersisted: true }, null, 2) + '\n');
});
