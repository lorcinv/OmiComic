import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test.describe('phone entry waits only for the current page', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const mode of ['horizontal', 'vertical', 'reduced-motion'] as const) test(`panorama ${mode} enters before neighbours and gathers them without moving the current page`, async ({ page }) => {
    if (mode === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(installMock, { count: 20 });
    await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).waitFor();
    await page.evaluate(async mode => {
      const vertical = mode !== 'horizontal', width = vertical ? 600 : 240;
      const api = window.omicomic, getPages = api.getResourcePages, getData = api.getAppData;
      api.getResourcePages = async input => {
        const result = await getPages(input), data = await getData();
        if (result.ok && data.ok) result.data.readerInit = { settings: data.data.settings, progress: { currentPageIndex: 4, readerViewState: { fitMode: 'fit-window', pageMode: 'single', flow: vertical ? 'vertical' : 'horizontal', pageDirection: 'left-to-right', panorama: true, immersive: false } } as any };
        return result;
      };
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 900;
      canvas.getContext('2d')!.fillRect(0, 0, width, 900); const url = canvas.toDataURL();
      let current!: () => void, previous!: () => void, next!: () => void;
      const first = new Promise<void>(resolve => { current = resolve; }), left = new Promise<void>(resolve => { previous = resolve; }), right = new Promise<void>(resolve => { next = resolve; });
      Object.assign(window, { __releaseCurrent: current, __releasePrevious: previous, __releaseNext: next, __entryReads: [], __sceneCalls: [], __gather: [] });
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames: any, options: any) {
        const animation = animate.call(this, frames, options);
        if (this.matches('.reader-page-frame') && this.closest('[data-panorama-entry-phase]')) {
          animation.pause(); animation.currentTime = 0;
          (window as any).__gather.push({ index: Number((this as HTMLElement).dataset.readerPageIndex), animation, frames, options });
        }
        return animation;
      };
      api.getPageImage = async input => {
        const index = Number(input.sourcePath.match(/page(\d+)/)?.[1]);
        (window as any).__entryReads.push(index);
        await (index === 4 ? first : index < 4 ? left : right);
        return { ok: true, data: { url: url + '#' + index, width, height: 900 } };
      };
      // Exercise the real navigation MessagePort. Only the native scene host is
      // simulated here; final APK checks also inspect real native motion frames.
      const { connectAndroid } = await import('/src/android/bridge.ts');
      const channel = new MessageChannel(), connecting = connectAndroid();
      channel.port1.onmessage = event => {
        const call = JSON.parse(event.data); (window as any).__sceneCalls.push({ method: call.method, direction: call.args?.direction });
        if (call.id) channel.port1.postMessage(JSON.stringify({ id: call.id, data: true }));
      };
      window.postMessage('omi-native', '*', [channel.port2]); await connecting;
    }, mode);
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    const card = page.locator('.mobile-resource-card').filter({ has: page.getByText('Book', { exact: true }) });
    await expect(card).toBeVisible();
    await page.evaluate(() => { (window as any).__sceneCalls.length = 0; });
    await card.click();
    await expect.poll(() => page.evaluate(() => (window as any).__sceneCalls.some((call: any) => call.method === 'beginScene'))).toBe(true);
    expect(await page.evaluate(() => (window as any).__sceneCalls.some((call: any) => call.method === 'commitScene' && call.direction === 'forward'))).toBe(false);
    expect(await page.evaluate(() => (window as any).__entryReads.every((index: number) => index === 4))).toBe(true);
    await page.evaluate(() => (window as any).__releaseCurrent());
    if (mode !== 'reduced-motion') await expect.poll(() => page.evaluate(() => (window as any).__sceneCalls.some((call: any) => call.method === 'commitScene' && call.direction === 'forward'))).toBe(true);
    await expect(page.locator('.page-panel.is-visible .reader-stage.is-panorama')).toBeVisible();
    await expect(page.locator('[data-reader-page-index="4"] :is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__entryReads.some((index: number) => index !== 4))).toBe(true);
    const before = await page.locator('[data-reader-page-index="4"]').boundingBox();
    await page.evaluate(() => (window as any).__releasePrevious());
    await expect(page.locator('[data-reader-page-index="3"] img')).toHaveJSProperty('naturalWidth', mode === 'horizontal' ? 240 : 600);
    if (mode !== 'reduced-motion') {
      await expect(page.locator('[data-reader-page-index="3"]')).toBeHidden();
      expect(await page.evaluate(() => (window as any).__gather.length)).toBe(0);
    }
    await page.evaluate(() => (window as any).__releaseNext());
    await expect(page.locator('[data-reader-page-index="5"] img')).toHaveJSProperty('naturalWidth', mode === 'horizontal' ? 240 : 600);
    if (mode !== 'reduced-motion') {
      await expect.poll(() => page.evaluate(() => (window as any).__gather.length)).toBe(2);
      const gathers = await page.evaluate(() => (window as any).__gather.map((g: any) => ({ index: g.index, frames: g.frames, duration: g.options.duration })));
      expect(gathers.map((g: any) => g.index).sort()).toEqual([3, 5]);
      for (const g of gathers) { expect(g.duration).toBe(240); expect(g.frames[0].opacity).toBe(.84); }
      const offsets = gathers.map((g: any) => ({ index: g.index, values: g.frames[0].transform.match(/translate3d\(([^)]+)\)/)[1].split(',').map(Number.parseFloat) }));
      expect(offsets.find((g: any) => g.index === 3).values[mode === 'vertical' ? 1 : 0]).toBeLessThanOrEqual(-28);
      expect(offsets.find((g: any) => g.index === 5).values[mode === 'vertical' ? 1 : 0]).toBeGreaterThanOrEqual(28);
      await page.evaluate(() => { for (const g of (window as any).__gather) g.animation.finish(); });
      await expect(page.locator('[data-panorama-entry-phase]')).toHaveCount(0);
    } else expect(await page.evaluate(() => (window as any).__gather.length)).toBe(0);
    const after = await page.locator('[data-reader-page-index="4"]').boundingBox();
    expect(Math.abs(before!.x - after!.x)).toBeLessThan(2);
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(2);
  });
});

test('PC default reading flow uses horizontal and vertical labels', async ({ page }) => {
  await page.addInitScript(installMock, { count: 8 });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('#settings-category-reader-default').click();
  const select = page.getByRole('combobox', { name: '默认阅读流向', exact: true });
  await expect(select).toContainText('横向'); await select.click();
  await expect(page.getByRole('option', { name: '横向', exact: true })).toBeVisible();
  await page.getByRole('option', { name: '纵向', exact: true }).click();
  await expect(select).toContainText('纵向');
});

for (const double of [false, true]) test(`PC ${double ? 'double' : 'single'} cached entry never paints an empty or partial reader`, async ({ page }) => {
  await page.addInitScript(installMock, { count: 8 });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).waitFor();
  await page.evaluate(double => {
    const api = window.omicomic, getPages = api.getResourcePages, getData = api.getAppData;
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 900); const url = canvas.toDataURL();
    api.getResourcePages = async input => {
      const result = await getPages(input), data = await getData();
      if (result.ok && data.ok) result.data.readerInit = { settings: { ...data.data.settings, readerPageMode: double ? 'double' : 'single', readerDefaultFitMode: 'fit-window', doublePageFirstSingle: false }, progress: null };
      return result;
    };
    api.getPageImage = async () => ({ ok: true, data: { url, width: 600, height: 900 } });
    (window as any).__entryPaints = [];
    const sample = () => {
      if ((window as any).__recordEntry) {
        const reader = document.querySelector('.page-panel.is-visible .reader-stage');
        const frames = reader && [...reader.querySelectorAll<HTMLElement>('figure:not([aria-hidden="true"])')];
        const ready = frames && frames.length === (double ? 2 : 1) && frames.every(frame => { const img = frame.querySelector<HTMLImageElement>('img'); return img?.complete && img.naturalWidth && img.getBoundingClientRect().height > 1; });
        (window as any).__entryPaints.push(reader ? ready ? 'reader' : 'partial' : document.querySelector('.page-panel.is-visible .library-layout') ? 'library' : 'empty');
      }
      requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  }, double);
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  const card = page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) });
  await expect(card).toBeVisible();
  for (let entry = 0; entry < 2; entry++) {
    await page.evaluate(() => { Object.assign(window, { __entryPaints: [], __recordEntry: true }); });
    await card.dblclick();
    await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const paints = await page.evaluate(() => { (window as any).__recordEntry = false; return (window as any).__entryPaints; });
    expect(paints).toContain('reader'); expect(paints).not.toContain('partial'); expect(paints).not.toContain('empty');
    await expect(page.locator('.reader-entry-loading:visible,.reader-page-loading:visible')).toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(card).toBeVisible();
  }
});
