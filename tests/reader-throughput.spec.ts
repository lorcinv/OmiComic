import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test('zoom retains the completed fit raster and restores it without another worker job', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 1 });
  await page.addInitScript(() => {
    const c = document.createElement('canvas'); c.width = 1400; c.height = 2100;
    const ctx = c.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1400, 2100);
    ctx.fillStyle = 'black'; for (let x = 0; x < 1400; x += 7) ctx.fillRect(x, 0, 2, 2100);
    const url = c.toDataURL(); window.omicomic.getPageImage = async () => ({ ok: true, data: { url, width: 1400, height: 2100 } });
    (window as any).__fitJobs = 0;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
      const worker = new Target(...args as [string, WorkerOptions]);
      if (String(args[0]).includes('displaySampling')) {
        const post = worker.postMessage.bind(worker);
        worker.postMessage = (...params: Parameters<Worker['postMessage']>) => { (window as any).__fitJobs++; post(...params); };
      }
      return worker;
    } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator('.has-display-raster')).toHaveCount(1);
  const fit = page.locator('.reader-display-raster'), before = await fit.evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  const jobs = await page.evaluate(() => (window as any).__fitJobs);
  const box = (await page.locator('.reader-stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -150); await page.keyboard.up('Control');
  await expect(page.locator('[data-viewport-ready="true"]')).toHaveCount(1);
  expect(await fit.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual(before);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, 150); await page.keyboard.up('Control');
  await expect(page.locator('.has-display-raster')).toHaveCount(1);
  expect(await fit.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual(before);
  expect(await page.evaluate(() => (window as any).__fitJobs)).toBe(jobs);
  await expect(page.locator('.reader-quality-transition')).toHaveCount(0);
});

test('panorama read-ahead refills a freed lane while an unrelated page is still decoding', async ({ page }) => {
  await page.addInitScript(installMock, { count: 24 });
  await page.addInitScript(() => {
    const api = window.omicomic, get = api.getAppData;
    api.getAppData = async () => { const r = await get(); if (r.ok) Object.assign(r.data.settings, { readerPreloadPages: 0, readerImageLoadConcurrency: 4, readerMemoryCacheSizeMb: 256 }); return r; };
    const urls = Array.from({ length: 24 }, (_, index) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 900;
      const ctx = c.getContext('2d')!; ctx.fillStyle = `hsl(${index * 15},70%,45%)`; ctx.fillRect(0, 0, 600, 900);
      ctx.fillStyle = 'white'; ctx.font = '100px sans-serif'; ctx.fillText(String(index), 50, 200); return c.toDataURL();
    });
    (window as any).__reads = [];
    api.getPageImage = async input => {
      const index = Number(input.sourcePath.match(/page(\d+)/)?.[1]);
      (window as any).__reads.push({ index, at: performance.now() });
      await new Promise(resolve => setTimeout(resolve, index === 2 ? 2000 : 30));
      return { ok: true, data: { url: urls[index], width: 600, height: 900 } };
    };
  });
  await page.goto('/'); await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator('.reader-page-frame:not([aria-hidden="true"]) :is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible();
  const start = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__reads.some((r: any) => r.index === 6)), { timeout: 1000 }).toBe(true);
  const latency = await page.evaluate(start => (window as any).__reads.find((r: any) => r.index === 6).at - start, start);
  expect(latency).toBeLessThan(900);
  await expect(page.locator('[data-reader-page-index="6"] img.reader-image')).toHaveJSProperty('naturalWidth', 600);
  console.log(JSON.stringify({ nextLaneStartedMs: latency, heldPageMs: 2000 }));
});

for (const large of [false, true]) test(`distinct ${large ? '24 MP' : 'ordinary'} pages cover both panorama edges throughout a continuous drag`, async ({ page }, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 24 });
  await page.addInitScript(({ large }) => {
    const api = window.omicomic, get = api.getAppData;
    api.getAppData = async () => { const r = await get(); if (r.ok) { r.data.recentOpened[0].currentPageIndex = 8; Object.assign(r.data.settings, { readerPreloadPages: 6, readerImageLoadConcurrency: 4, readerMemoryCacheSizeMb: 512 }); } return r; };
    const width = large ? 4000 : 900, height = large ? 6000 : 1350;
    const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d')!;
    const urls = Array.from({ length: 24 }, (_, index) => {
      ctx.fillStyle = `hsl(${index * 15},75%,40%)`; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'white'; ctx.font = '100px sans-serif'; ctx.fillText(String(index), 40, 200); return c.toDataURL();
    });
    api.getPageImage = async input => { const index = Number(input.sourcePath.match(/page(\d+)/)?.[1]); await new Promise(resolve => setTimeout(resolve, 60)); return { ok: true, data: { url: urls[index], width, height } }; };
  }, { large });
  await page.goto('/'); await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator('[data-reader-page-index="8"] img.reader-image')).toHaveJSProperty('naturalWidth', large ? 4000 : 900);
  await expect(page.locator('[data-reader-page-index="8"] :is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await expect(page.locator('[data-reader-page-index="9"] img.reader-image')).toHaveJSProperty('naturalWidth', large ? 4000 : 900);
  await page.waitForTimeout(250);
  const stage = (await page.locator('.reader-stage').boundingBox())!, x = stage.x + stage.width * .8, y = stage.y + stage.height / 2;
  const samples: any[] = [];
  await page.mouse.move(x, y); await page.mouse.down();
  for (let n = 1; n <= 96; n++) {
    await page.mouse.move(x - n * 25, y); await page.waitForTimeout(12);
    if (n % 4) continue;
    samples.push(await page.locator('.reader-stage').evaluate(stage => {
      const clip = stage.getBoundingClientRect();
      const frames = [...stage.querySelectorAll<HTMLElement>('[data-reader-page-index]')].filter(node => { const r = node.getBoundingClientRect(); return r.right > clip.left && r.left < clip.right; });
      return { missing: frames.filter(node => { const img = node.querySelector<HTMLImageElement>('img.reader-image'); return !img?.complete || !img.naturalWidth; }).map(n => n.dataset.readerPageIndex),
        cropped: frames.filter(node => {
          const host = node.querySelector<HTMLElement>('[data-viewport-ready="true"]'); if (!host) return false;
          const canvas = host.querySelector<HTMLCanvasElement>('.reader-viewport-raster')!, area = canvas.getBoundingClientRect(), image = host.querySelector('img')!.getBoundingClientRect();
          return !canvas.width || canvas.getContext('2d')!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3] !== 255
            || area.left > Math.max(clip.left, image.left) + 2 || area.right < Math.min(clip.right, image.right) - 2;
        }).map(n => n.dataset.readerPageIndex),
        left: Math.min(...frames.map(n => n.getBoundingClientRect().left)) - clip.left,
        right: Math.max(...frames.map(n => n.getBoundingClientRect().right)) - clip.right,
        pages: frames.map(n => Number(n.dataset.readerPageIndex)) };
    }));
  }
  await page.mouse.up();
  await info.attach('panorama-visible-coverage', { body: JSON.stringify({ large, samples }, null, 2), contentType: 'application/json' });
  for (const sample of samples) {
    expect(sample.missing, JSON.stringify(sample)).toEqual([]);
    expect(sample.cropped, JSON.stringify(sample)).toEqual([]);
    expect(sample.left, JSON.stringify(sample)).toBeLessThanOrEqual(1);
    expect(sample.right, JSON.stringify(sample)).toBeGreaterThanOrEqual(-1);
  }
  expect(Math.max(...samples.flatMap(s => s.pages))).toBeGreaterThan(12);
});

for(const flow of ['horizontal','vertical','rtl']) test(`zoomed PC ${flow} clicks use the outer 20 percent while normal clicks keep their original range`, async ({ page }) => {
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(flow => {
    const api=window.omicomic,get=api.getAppData;api.getAppData=async()=>{const r=await get();if(r.ok)Object.assign(r.data.settings,{readerDefaultFlow:flow==='vertical'?'vertical':'horizontal',doublePageDirection:flow==='rtl'?'right-to-left':'left-to-right'});return r;};
  },flow);
  await page.goto('/'); await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  const progress = page.getByRole('slider', { name: '阅读进度', exact: true });
  const stage = page.locator('.reader-stage');
  await expect(stage).toBeVisible();
  const box = (await stage.boundingBox())!;
  const normal = {x:box.x+box.width*(flow==='vertical'?.5:flow==='rtl'?.3:.7),y:box.y+box.height*(flow==='vertical'?.78:.5)};
  const edge = {x:box.x+box.width*(flow==='vertical'?.5:flow==='rtl'?.1:.9),y:box.y+box.height*(flow==='vertical'?.9:.5)};
  await page.mouse.click(normal.x, normal.y);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -150); await page.keyboard.up('Control');
  await expect.poll(() => stage.getAttribute('data-reader-zoom')).not.toBe('1');
  await page.waitForTimeout(450);
  await page.mouse.click(normal.x, normal.y);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await page.mouse.click(edge.x, edge.y);
  await expect(progress).toHaveAttribute('aria-valuenow', '3');
});
