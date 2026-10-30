import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function open(page: Page, mode = 'single') {
  await page.addInitScript(installMock, { count: 24 });
  await page.addInitScript(({ mode }) => {
    const api = window.omicomic, get = api.getAppData;
    api.getAppData = async () => { const r = await get(); if (r.ok) { r.data.recentOpened[0].currentPageIndex = 8; Object.assign(r.data.settings, { readerPreloadPages: 4, readerMemoryCacheSizeMb: 256, doublePageFirstSingle: false }); } return r; };
    const c = document.createElement('canvas'); c.width = 2124; c.height = 3000;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#222';
    for (let y = 0; y < c.height; y += 26) ctx.fillRect(0, y, c.width, 6);
    const url = c.toDataURL(); api.getPageImage = async () => ({ ok: true, data: { url, width: c.width, height: c.height } });
    api.getReadingProgress = async () => ({ ok: true, data: { currentPageIndex: 8, readerViewState: { fitMode: 'fit-window', pageMode: mode, pageDirection: 'left-to-right', flow: 'horizontal', panorama: false, immersive: false } } as any });
    (window as any).__samplingJobs = [];
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
      const worker = new Target(...args as [string, WorkerOptions]);
      if (String(args[0]).includes('displaySampling')) { const post = worker.postMessage.bind(worker); worker.postMessage = ((data: any, ...rest: any[]) => { (window as any).__samplingJobs.push({ time: performance.now(), width: data.width, height: data.height }); return (post as any)(data, ...rest); }) as any; }
      return worker;
    } });
  }, { mode });
  await page.goto('/'); await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator('[data-reader-page-index="8"] .has-display-raster')).toHaveCount(1);
  await page.waitForTimeout(1200);
}

for (const mode of ['single', 'double']) test(`warm ${mode} page turns publish prepared pixels promptly`, async ({ page }, info) => {
  await open(page, mode);
  const results = [];
  for (const label of ['下一页', '上一页', '下一页', '下一页', '上一页']) {
    const result = await page.evaluate(async label => {
      const shown = () => [...document.querySelectorAll('.reader-page-frame:not([aria-hidden="true"])')].map(e => e.getAttribute('data-reader-page-index')).join(',');
      const before = shown(), start = performance.now(), jobs = (window as any).__samplingJobs.length;
      ([...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === label || e.textContent?.trim() === label) as HTMLButtonElement).click();
      let blankFrames = 0;
      while (shown() === before && performance.now() - start < 6000) {
        await new Promise(requestAnimationFrame);
        if (![...document.querySelectorAll('.reader-page-frame:not([aria-hidden="true"]) .reader-display-raster')].some(e => getComputedStyle(e).visibility === 'visible' && (e as HTMLCanvasElement).width > 0)) blankFrames++;
      }
      return { latency: performance.now() - start, before, after: shown(), blankFrames, jobs: (window as any).__samplingJobs.length - jobs };
    }, label);
    results.push(result); await page.waitForTimeout(700);
  }
  console.log(JSON.stringify({ mode, results }));
  await info.attach('page-latency', { body: JSON.stringify(results), contentType: 'application/json' });
  expect(results.every(r => r.before !== r.after && r.blankFrames === 0)).toBe(true);
  if (!process.env.OMI_BASELINE) expect(Math.max(...results.map(r => r.latency))).toBeLessThan(160);
});

test('zoom samples settle once and quality replacement uses a visible transition', async ({ page }, info) => {
  await open(page);
  const stage = page.locator('.reader-stage'), box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control');
  const count = await page.evaluate(() => (window as any).__samplingJobs.length);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -70); await page.waitForTimeout(210); }
  await page.keyboard.up('Control');
  const during = await page.evaluate(count => (window as any).__samplingJobs.length - count, count);
  const blends = await page.evaluate(async () => {
    const frames: { visible: number; opacity: number[] }[] = [];
    const until = performance.now() + 950;
    while (performance.now() < until) {
      await new Promise(requestAnimationFrame);
      frames.push({ visible: [...document.querySelectorAll('.reader-page-frame:not([aria-hidden="true"]) .reader-display-raster')].filter(e => getComputedStyle(e).visibility === 'visible').length, opacity: [...document.querySelectorAll('.reader-quality-transition')].map(e => Number(getComputedStyle(e).opacity)) });
    }
    return frames;
  });
  await page.waitForTimeout(900);
  console.log(JSON.stringify({ during, total: await page.evaluate(count => (window as any).__samplingJobs.length - count, count) }));
  await info.attach('zoom-jobs', { body: JSON.stringify(await page.evaluate(() => (window as any).__samplingJobs)), contentType: 'application/json' });
  if (!process.env.OMI_BASELINE) { expect(during).toBe(0); expect(blends.every(f => f.visible > 0)).toBe(true); expect(blends.some(f => f.opacity.some(n => n > .05 && n < .95))).toBe(true); }
});
