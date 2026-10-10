import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
  test(`home dissolve keeps the brand anchored at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.addInitScript(installMock, { count: 100 });
    await page.goto('/');
    await expect(page.locator('.omi-home__book')).toHaveCount(3);
    await expect.poll(() => page.locator('.omi-home__art > img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const before = await page.locator('.omi-home .omi-page-brand .omi-brand-icon').boundingBox();
    const recent = (await page.locator('.omi-home__content').boundingBox())!;
    const signature = (await page.locator('.omi-home__signature').boundingBox())!;
    expect(signature.y).toBeGreaterThanOrEqual(recent.y + recent.height - 1);
    expect(recent.y).toBeLessThan(viewport.height * .27);
    expect(await page.locator('.omi-home__signature').evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0);
    expect(await page.evaluate(() => {
      const home = document.querySelector('.omi-home')!;
      return home.scrollHeight <= home.clientHeight && home.scrollWidth <= home.clientWidth;
    })).toBe(true);
    await page.screenshot({ path: `test-results/home-glass-${viewport.width}.png` });

    // Freeze the browser's real transition to inspect intermediate masks, not a mocked animation.
    await page.evaluate(() => {
      const original = document.startViewTransition.bind(document);
      (document as any).startViewTransition = (update: () => void) => {
        const transition = original(update);
        (window as any).__homeTransitionReady = transition.ready.then(() => {
          const dissolve = document.getAnimations().find(animation => ['page-dissolve-to-brand', 'page-expand-from-brand'].includes((animation as CSSAnimation).animationName))!;
          dissolve.pause();
          dissolve.currentTime = 0;
          (window as any).__homeDissolve = dissolve;
        });
        (window as any).__homeTransitionFinished = transition.finished;
        return transition;
      };
      (document.querySelector('.omi-home__library') as HTMLButtonElement).click();
    });
    await page.waitForFunction(() => !!(window as any).__homeTransitionReady);
    await page.evaluate(() => (window as any).__homeTransitionReady);
    const radii: number[] = [];
    for (const time of [0, 260, 520]) {
      const frame = await page.evaluate(async time => {
        (window as any).__homeDissolve.currentTime = time;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const style = getComputedStyle(document.documentElement, '::view-transition-old(reader-content)');
        return { radius: parseFloat(style.getPropertyValue('--page-reveal-radius')), mask: style.maskImage };
      }, time);
      expect(frame.mask).toContain('radial-gradient');
      expect(frame.radius).toBeGreaterThan(0);
      radii.push(frame.radius);
      if (viewport.width === 1440) await page.screenshot({ path: `test-results/home-dissolve-${time}.png` });
    }
    expect(radii[0]).toBeGreaterThan(radii[1]);
    expect(radii[1]).toBeGreaterThan(radii[2]);
    await page.evaluate(async () => {
      (window as any).__homeDissolve.finish();
      await (window as any).__homeTransitionFinished;
    });
    await expect(page.locator('html')).not.toHaveClass(/is-home-library-transition/);
    const after = await page.locator('.page-panel.is-visible .omi-page-brand .omi-brand-icon').boundingBox();
    expect(after).toEqual(before);
    await page.screenshot({ path: `test-results/library-glass-${viewport.width}.png` });
    await page.evaluate(() => (document.querySelector('.page-panel.is-visible .brand-home-button') as HTMLButtonElement).click());
    await page.evaluate(() => (window as any).__homeTransitionReady);
    const expandedRadii: number[] = [];
    for (const time of [0, 260, 520]) {
      const radius = await page.evaluate(async time => {
        (window as any).__homeDissolve.currentTime = time;
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return parseFloat(getComputedStyle(document.documentElement, '::view-transition-new(reader-content)').getPropertyValue('--page-reveal-radius'));
      }, time);
      expandedRadii.push(radius);
      if (viewport.width === 1440 && time === 260) await page.screenshot({ path: 'test-results/home-expand-260.png' });
    }
    expect(expandedRadii[0]).toBe(0);
    expect(expandedRadii[1]).toBeGreaterThan(expandedRadii[0]);
    expect(expandedRadii[2]).toBeGreaterThan(expandedRadii[1]);
    await page.evaluate(async () => { (window as any).__homeDissolve.finish(); await (window as any).__homeTransitionFinished; });
    expect(await page.locator('.omi-home .omi-brand-icon').boundingBox()).toEqual(before);
    await expect(page.locator('html')).not.toHaveClass(/is-revealing-home/);
    expect(errors).toEqual([]);
  });
}

test('reduced motion switches immediately and preserves library navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 100 });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.page-panel.is-visible .library-layout')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/is-home-library-transition/);
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
});

test('home restores its theme without initializing the library, then preserves the library instance', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 12 });
  await page.addInitScript(() => {
    const api = (window as any).omicomic;
    const read = api.getAppData, list = api.listDirectory;
    (window as any).__directoryReads = 0;
    api.getAppData = async () => { const result = await read(); result.data.settings.colorTheme = 'night'; return result; };
    api.listDirectory = (...args: unknown[]) => { (window as any).__directoryReads++; return list(...args); };
  });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'night');
  await expect(page.locator('.library-layout')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__directoryReads)).toBe(0);
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(14);
  await page.evaluate(() => { (window as any).__libraryNode = document.querySelector('.library-layout'); });
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.omi-home')).toBeVisible();
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__libraryNode === document.querySelector('.library-layout'))).toBe(true);
});
