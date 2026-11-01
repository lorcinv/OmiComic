import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for (const double of [false, true]) test(`PC ${double ? 'double' : 'single'} entry keeps the library until the complete fitted first group`, async ({ page }) => {
  await page.addInitScript(installMock, { count: 20 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).waitFor();
  await page.evaluate(double => {
    const api = window.omicomic, getPages = api.getResourcePages, getData = api.getAppData;
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 900); const url = canvas.toDataURL();
    const gates = new Map<number, () => void>();
    (window as any).__entryReleases = gates;
    api.getResourcePages = async input => {
      const result = await getPages(input), data = await getData();
      if (result.ok && data.ok) result.data.readerInit = { settings: { ...data.data.settings, readerPageMode: double ? 'double' : 'single', readerDefaultFitMode: 'fit-window', doublePageFirstSingle: false }, progress: null };
      return result;
    };
    api.getPageImage = async input => {
      const index = Number(input.sourcePath.match(/page(\d+)/)?.[1]);
      if (index < 2) await new Promise<void>(resolve => gates.set(index, resolve));
      return { ok: true, data: { url: url + '#' + index, width: 600, height: 900 } };
    };
    (window as any).__partialGroups = [];
    const sample = () => {
      const spread = document.querySelector('.page-panel.is-visible .reader-page-spread');
      if (spread && getComputedStyle(spread).visibility === 'visible') {
        const frames = [...spread.querySelectorAll<HTMLElement>('figure:not([aria-hidden="true"])')];
        const ready = frames.filter(node => { const img = node.querySelector<HTMLImageElement>('img'); return img?.complete && img.naturalWidth && getComputedStyle(img).visibility === 'visible'; });
        if (ready.length && ready.length < frames.length) (window as any).__partialGroups.push(ready.length);
      }
    };
    new MutationObserver(sample).observe(document, { childList: true, subtree: true, attributes: true });
    const frame = () => { sample(); requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  }, double);
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) }).dblclick();
  await expect(page.locator('.page-panel.is-visible .library-layout')).toBeVisible();
  await expect(page.locator('.reader-layout')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__entryReleases.has(0))).toBe(true);
  await expect(page.locator('.reader-page-loading:visible')).toHaveCount(0);
  await page.evaluate(() => (window as any).__entryReleases.get(0)());
  if (double) {
    await expect(page.locator('.reader-image').first()).toHaveJSProperty('naturalWidth', 600);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).__partialGroups)).toEqual([]);
    await page.evaluate(() => (window as any).__entryReleases.get(1)());
  }
  await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.page-panel.is-visible .reader-layout')).toBeVisible();
  await expect(page.locator('.reader-page-spread')).toBeVisible();
  const frames = page.locator('.reader-page-frame:not([aria-hidden="true"])');
  await expect(frames).toHaveCount(double ? 2 : 1);
  expect(await frames.evaluateAll(nodes => nodes.every(node => { const img = node.querySelector<HTMLImageElement>('img')!; return img.complete && img.naturalWidth && img.getBoundingClientRect().height > 100; }))).toBe(true);
});

test.describe('phone panorama progress follows a held touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const flow of ['horizontal', 'vertical', 'rtl'] as const) test(flow, async ({ page }) => {
    await page.addInitScript(installMock, { count: 40 });
    await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).waitFor();
    await page.evaluate(flow => {
      const api = window.omicomic, getPages = api.getResourcePages, getData = api.getAppData;
      api.getResourcePages = async input => {
        const resource = await getPages(input), data = await getData();
        if (resource.ok && data.ok) resource.data.readerInit = { settings: { ...data.data.settings, mobileReaderAutoHide: false, mobileReaderPreviews: true }, progress: { currentPageIndex: 0, readerViewState: { fitMode: 'fit-window', pageMode: 'single', pageDirection: flow === 'rtl' ? 'right-to-left' : 'left-to-right', flow: flow === 'vertical' ? 'vertical' : 'horizontal', panorama: true, immersive: false } } as any };
        return resource;
      };
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
      canvas.getContext('2d')!.fillRect(0, 0, 600, 900); const url = canvas.toDataURL();
      api.getPageImage = async () => ({ ok: true, data: { url, width: 600, height: 900 } });
    }, flow);
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await page.locator('.mobile-resource-card').filter({ has: page.getByText('Book', { exact: true }) }).click();
    const stage = page.locator('.page-panel.is-visible .reader-stage'); await expect(stage).toBeVisible();
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
    await stage.tap({ position: { x: 180, y: 300 } });
    const rail = page.getByRole('slider', { name: '阅读进度' }); await expect(rail).toBeVisible();
    const rect = (await rail.boundingBox())!, cdp = await page.context().newCDPSession(page);
    const x = (ratio: number) => rect.x + rect.width * (flow === 'rtl' ? 1 - ratio : ratio), y = rect.y + rect.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x(.02), y }] });
    try {
      for (const ratio of [.18, .4, .65, .85, .3]) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x(ratio), y }] });
        await expect(rail).toHaveClass(/is-dragging/);
        const expected = Math.round(ratio * 39);
        await expect.poll(() => stage.evaluate((stage, vertical) => {
          const clip = stage.getBoundingClientRect(), center = vertical ? clip.y + clip.height / 2 : clip.x + clip.width / 2;
          return [...stage.querySelectorAll<HTMLElement>('[data-reader-page-index]')].find(node => { const r = node.getBoundingClientRect(); return vertical ? r.top <= center && r.bottom >= center : r.left <= center && r.right >= center; })?.dataset.readerPageIndex;
        }, flow === 'vertical')).toBe(String(expected));
      }
    } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    await expect(rail).toHaveAttribute('aria-valuenow', String(Math.round(.3 * 39) + 1));
  });
});
