import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function setup(page: Page, theme = 'night') {
  await page.addInitScript(installMock, { count: 12 });
  await page.addInitScript(async theme => {
    const result = await window.omicomic.getAppData();
    if (result.ok) result.data.settings.colorTheme = theme as 'night';
  }, theme);
  await page.goto('/');
  await expect(page.locator('.omi-home__book').first()).toBeVisible();
  await expect(page.locator('.omi-home .omi-brand-icon')).toBeEnabled();
}

for (const mobile of [false, true]) test.describe(mobile ? 'phone Omi brand' : 'desktop Omi brand', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});

  for (const theme of ['night', 'mist']) test(`the left shell stays matte in ${theme}`, async ({ page }) => {
    await setup(page, theme);
    await page.mouse.move(0, 0);
    const buffer = await page.locator('.omi-home .omi-brand-icon__graphic').screenshot({ scale: 'css' });
    const pixels = await page.evaluate(async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return { width: canvas.width, height: canvas.height, data: [...context.getImageData(0, 0, canvas.width, canvas.height).data] };
    }, buffer.toString('base64'));
    const y = Math.floor(pixels.height / 2);
    // Sample across the left shell's solid interior. An inset hairline changes
    // these pixels even though the circle's silhouette remains unchanged.
    for (let x = Math.ceil(pixels.width * 7 / 64); x <= Math.floor(pixels.width * 12 / 64); x++) {
      const offset = (y * pixels.width + x) * 4;
      expect(pixels.data.slice(offset, offset + 4), `shell pixel ${x},${y}`).toEqual([120, 131, 142, 255]);
    }
    await page.screenshot({ path: `test-results/brand1175-${mobile ? 'phone' : 'desktop'}-${theme}.png` });
  });

  for (const failed of [false, true]) test(`opening a recent book keeps the logo steady through ${failed ? 'failure' : 'entry'}`, async ({ page }) => {
    await setup(page);
    await page.evaluate(() => {
      const read = window.omicomic.getResourcePages;
      Object.assign(window, { __brandReads: 0, __brandSamples: [], __brandRecord: true });
      window.omicomic.getResourcePages = async input => {
        (window as any).__brandReads++;
        const failed = await new Promise<boolean>(resolve => { (window as any).__brandRelease = resolve; });
        return failed ? { ok: false, error: { code: 'IO_ERROR', message: 'Controlled opening failure' } } : read(input);
      };
      const icon = document.querySelector<HTMLButtonElement>('.omi-home .omi-brand-icon')!;
      const sample = () => {
        if (!(window as any).__brandRecord) return;
        if (icon.getClientRects().length) (window as any).__brandSamples.push({ opacity: getComputedStyle(icon).opacity, blinking: icon.classList.contains('is-blinking') });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const book = page.locator('.omi-home__book').first(), icon = page.locator('.omi-home .omi-brand-icon');
    if (mobile) await book.tap(); else await book.dblclick();
    await expect.poll(() => page.evaluate(() => (window as any).__brandReads)).toBe(1);
    await expect(icon).toBeDisabled();
    await expect(icon).toHaveAttribute('aria-busy', 'true');
    await page.waitForTimeout(240);
    expect(await icon.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    await icon.evaluate((el: HTMLButtonElement) => el.click());
    expect(await page.evaluate(() => (window as any).__brandReads)).toBe(1);
    await page.evaluate(failed => (window as any).__brandRelease(failed), failed);
    if (failed) {
      await expect(page.locator('.omi-home__error')).toContainText('Controlled opening failure');
      await expect(icon).toBeEnabled();
      await expect(icon).toHaveAttribute('aria-busy', 'false');
    } else await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
    const samples = await page.evaluate(() => { (window as any).__brandRecord = false; return (window as any).__brandSamples as Array<{ opacity: string; blinking: boolean }>; });
    expect(samples.length).toBeGreaterThan(5);
    expect(samples.every(sample => sample.opacity === '1' && !sample.blinking)).toBe(true);
  });

  test('the recent-reading tab keeps the same undimmed brand', async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    const icon = page.locator('.page-panel.is-visible .omi-brand-icon');
    await expect(icon).toBeEnabled();
    await icon.evaluate(el => { (window as any).__brandNode = el; });
    await page.locator('.sidebar-primary-nav .sidebar-item').filter({ has: page.locator('span', { hasText: /^最近阅读$/ }) }).click();
    await expect(page.locator(mobile ? '.mobile-resource-card' : '.resource-card').first()).toContainText('First');
    expect(await icon.evaluate(el => ({ same: el === (window as any).__brandNode, opacity: getComputedStyle(el).opacity, blinking: el.classList.contains('is-blinking') })))
      .toEqual({ same: true, opacity: '1', blinking: false });
  });
});
