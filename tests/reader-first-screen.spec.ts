import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for (const scenario of ['saved-double', 'default-double', 'saved-single', 'async-double'] as const) test(`reader entry keeps its ${scenario} mode from the first visible frame`, async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 32 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).waitFor();
  await page.evaluate(scenario => {
    const api = window.omicomic, getData = api.getAppData, getPages = api.getResourcePages;
    const pageMode = scenario === 'saved-single' ? 'single' : 'double';
    const view = { fitMode: 'fit-window', pageMode, flow: 'horizontal', panorama: false, immersive: false, pageDirection: 'right-to-left', pairingAnchor: 20 };
    const progress = { currentPageIndex: 20, readerViewState: scenario === 'default-double' ? undefined : view } as any;
    let opening = false;
    api.getAppData = async () => {
      if (opening && scenario === 'async-double') await new Promise(resolve => setTimeout(resolve, 120));
      const result = await getData();
      if (result.ok) Object.assign(result.data.settings, { readerPageMode: scenario === 'saved-double' ? 'single' : 'double', doublePageDirection: 'right-to-left', readerDefaultFitMode: 'fit-window', doublePageFirstSingle: false });
      return result;
    };
    api.getReadingProgress = async () => ({ ok: true, data: progress });
    api.getResourcePages = async input => {
      const result = await getPages(input), data = await getData();
      if (result.ok && data.ok && scenario !== 'async-double') {
        Object.assign(data.data.settings, { readerPageMode: scenario === 'saved-double' ? 'single' : 'double', doublePageDirection: 'right-to-left', readerDefaultFitMode: 'fit-window', doublePageFirstSingle: false });
        result.data.readerInit = { settings: data.data.settings, progress };
      }
      opening = true;
      return result;
    };
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 900); const url = canvas.toDataURL();
    let release!: () => void;
    const pixels = new Promise<void>(resolve => { release = resolve; });
    (window as any).__releaseModeEntry = release;
    api.getPageImage = async () => { await pixels; return { ok: true, data: { url, width: 600, height: 900 } }; };
    (window as any).__entryModes = [];
    const sample = () => {
      const reader = document.querySelector('.page-panel.is-visible .reader-layout');
      const button = reader?.querySelector<HTMLElement>('.reader-page-count-toggle');
      if (button && getComputedStyle(button).visibility === 'visible') {
        (window as any).__entryModes.push({ mode: button.textContent, page: reader?.querySelector<HTMLInputElement>('input[aria-label="跳转到页码"]')?.value });
      }
    };
    new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const frame = () => { sample(); requestAnimationFrame(frame); }; requestAnimationFrame(frame);
  }, scenario);
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  const card = page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) });
  for (let entry = 0; entry < 2; entry++) {
    await page.evaluate(() => { (window as any).__entryModes.length = 0; });
    await card.dblclick();
    const mode = page.locator('.reader-page-count-toggle');
    await expect(mode).toBeHidden();
    await expect(mode).toHaveText(scenario === 'saved-single' ? '1' : '2');
    await expect(page.locator('input[aria-label="跳转到页码"]')).toHaveValue('21');
    await page.evaluate(() => (window as any).__releaseModeEntry());
    await expect(mode).toBeVisible();
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
    await expect.poll(() => page.locator('.reader-image').evaluateAll(nodes => nodes.length > 0 && nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const samples = await page.evaluate(() => (window as any).__entryModes);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((sample: any) => sample.mode === (scenario === 'saved-single' ? '1' : '2') && sample.page === '21')).toBe(true);
    const frames = page.locator('.reader-page-frame:not([aria-hidden="true"])');
    await expect(frames).toHaveCount(scenario === 'saved-single' ? 1 : 2);
    if (scenario !== 'saved-single') expect(await frames.evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-reader-page-index'))))).toEqual([21, 20]);
    await page.keyboard.press('Escape');
    await expect(card).toBeVisible();
  }
});

for (const mode of ['single', 'double', 'panorama'] as const) test(`library ${mode} entry retains its outgoing screen until decoded and defers hidden pages until the first frame`, async ({ page }) => {
  await page.addInitScript(installMock, { count: 64 });
  await page.addInitScript(async mode => {
    const api = window.omicomic, getData = api.getAppData;
    const view = { fitMode: 'fit-window', pageMode: mode === 'double' ? 'double' : 'single', flow: 'horizontal', panorama: mode === 'panorama', immersive: false, pageDirection: 'left-to-right', pairingAnchor: 20 };
    api.getAppData = async () => {
      const result = await getData();
      if (result.ok) Object.assign(result.data.settings, { showHomePage: false, readerPageMode: view.pageMode, doublePageFirstSingle: false, readerMemoryCacheSizeMb: 128, readerPreloadPages: 12 });
      return result;
    };
    api.getReadingProgress = async () => ({ ok: true, data: { currentPageIndex: 20, readerViewState: view } as any });
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    canvas.getContext('2d')!.fillRect(0, 0, 600, 900); const url = canvas.toDataURL();
    let release!: () => void;
    const firstPage = new Promise<void>(resolve => { release = resolve; });
    (window as any).__releaseEntry = release;
    (window as any).__entryReads = [];
    (window as any).__firstFrameAt = null;
    const sample = () => {
      const reader = document.querySelector('.page-panel.is-visible .reader-stage');
      if (reader) {
        const clip = reader.getBoundingClientRect();
        const frames = [...reader.querySelectorAll<HTMLElement>('.reader-page-frame')].filter(node => {
          const r = node.getBoundingClientRect(); return getComputedStyle(node).visibility !== 'hidden' && r.width > 1 && r.height > 1 && r.right > clip.left && r.left < clip.right && r.bottom > clip.top && r.top < clip.bottom;
        });
        if (frames.length && frames.every(node => { const img = node.querySelector<HTMLImageElement>('img.reader-image'); return img?.complete && img.naturalWidth > 0; })) {
          (window as any).__firstFrameAt = performance.now(); return;
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    api.getPageImage = async input => {
      const index = Number(input.sourcePath.match(/page(\d+)/)?.[1]);
      (window as any).__entryReads.push({ index, prefetch: Boolean(input.prefetch), at: performance.now() });
      if (index === 20 || mode === 'double' && index === 21) await firstPage;
      return { ok: true, data: { url: url + '#' + index, width: 600, height: 900 } };
    };
  }, mode);
  await page.goto('/');
  const card = page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) });
  await card.dblclick();
  await expect(card).toBeVisible();
  await expect(page.locator('.reader-layout')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as any).__entryReads.length)).toBeGreaterThan(0);
  const pending = await page.evaluate(() => (window as any).__entryReads);
  expect(pending.every((read: any) => !read.prefetch && (read.index === 20 || mode === 'double' && read.index === 21))).toBe(true);
  await page.evaluate(() => (window as any).__releaseEntry());
  await expect(page.locator('.page-panel.is-visible .reader-layout')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('21');
  await expect.poll(() => page.evaluate(() => (window as any).__entryReads.some((r: any) => r.prefetch))).toBe(true);
  const measured = await page.evaluate(() => ({ ready: (window as any).__firstFrameAt, reads: (window as any).__entryReads }));
  expect(measured.ready).toBeGreaterThan(0);
  expect(measured.reads.filter((r: any) => r.prefetch).every((r: any) => r.at > measured.ready)).toBe(true);
  if (mode === 'panorama') expect(measured.reads.filter((r: any) => !r.prefetch).map((r: any) => r.index)).toEqual(expect.arrayContaining([19, 20, 21]));
});
