import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function open(page: Page, { mobile = false, mode = 'single', slow = false, delayedSizes = false } = {}) {
  await page.addInitScript(installMock, { count: 72 });
  await page.addInitScript(({ mode, slow, delayedSizes }) => {
    const api = window.omicomic, get = api.getAppData;
    api.getAppData = async () => { const r = await get(); if (r.ok) { r.data.recentOpened[0].currentPageIndex = 12; Object.assign(r.data.settings, { readerMemoryCacheSizeMb: 256, readerPreloadPages: 4, readerImageLoadConcurrency: 4, doublePageFirstSingle: false, mobileReaderAutoHide: false }); } return r; };
    const images = [0, 1].map(n => {
      const c = document.createElement('canvas'); c.width = 1500 + n * 200; c.height = 2200;
      const ctx = c.getContext('2d')!; ctx.fillStyle = n ? '#d6e9fa' : '#f2e3cf'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#242424'; for (let y = 0; y < c.height; y += 24) ctx.fillRect(0, y, c.width, 5);
      return { url: c.toDataURL(), width: c.width, height: c.height };
    });
    api.getPageImage = async request => {
      const index = Number(request.sourcePath.match(/page(\d+)\.png$/)?.[1] ?? 0);
      if (delayedSizes && Math.abs(index - 12) > 1) await new Promise(resolve => setTimeout(resolve, 400 + index % 4 * 100));
      return { ok: true, data: images[index % 2] };
    };
    api.getReadingProgress = async () => ({ ok: true, data: { currentPageIndex: 12, readerViewState: { fitMode: 'fit-window', pageMode: mode === 'single' ? 'single' : 'double', pageDirection: mode === 'double-rtl' ? 'right-to-left' : 'left-to-right', flow: 'horizontal', panorama: false, immersive: false } } as any });
    if (slow) {
      const NativeWorker = window.Worker;
      window.Worker = new Proxy(NativeWorker, { construct(Target, args) {
        const worker = new Target(...args as [string, WorkerOptions]);
        if (String(args[0]).includes('displaySampling')) { let listener: ((event: MessageEvent) => void) | undefined; Object.defineProperty(worker, 'onmessage', { set(fn) { if (listener) worker.removeEventListener('message', listener); listener = event => setTimeout(() => fn?.(event), 180); worker.addEventListener('message', listener); }, configurable: true }); }
        return worker;
      } });
    }
  }, { mode, slow, delayedSizes });
  await page.goto('/');
  if (mobile) { await page.evaluate(() => document.documentElement.dataset.platform = 'android'); await page.getByRole('button', { name: '打开资源库', exact: true }).click(); await page.locator('.mobile-resource-card').filter({ has: page.getByText('Book', { exact: true }) }).click(); }
  else await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator('[data-reader-page-index="12"] .has-display-raster')).toHaveCount(1);
  await page.waitForTimeout(250);
}

async function record(page: Page) {
  await page.evaluate(() => {
    (window as any).__presentationFrames = []; (window as any).__recordPresentation = true;
    const run = () => {
      if (!(window as any).__recordPresentation) return;
      const stage = document.querySelector<HTMLElement>('.reader-stage')!, clip = stage.getBoundingClientRect();
      const frames = [...stage.querySelectorAll<HTMLElement>('.reader-page-frame')].filter(e => {
        const r = e.getBoundingClientRect(); return getComputedStyle(e).visibility === 'visible' && Number(getComputedStyle(e).opacity) > 0 && r.right > clip.left && r.left < clip.right && r.bottom > clip.top && r.top < clip.bottom;
      });
      const surfaces = frames.map(e => {
        const host = e.querySelector<HTMLElement>('.reader-effects')!, r = host.getBoundingClientRect();
        const c = host.querySelector<HTMLCanvasElement>('.reader-display-raster'), image = host.querySelector<HTMLImageElement>('img');
        const cr = c?.getBoundingClientRect();
        return { index: e.dataset.readerPageIndex, width: r.width, height: r.height, canvasWidth: cr?.width ?? 0, canvasHeight: cr?.height ?? 0, sampled: host.classList.contains('has-display-raster'), pixels: Boolean(c && c.width && getComputedStyle(c).visibility === 'visible' || image?.complete && image.naturalWidth && getComputedStyle(image).visibility === 'visible') };
      });
      (window as any).__presentationFrames.push({ scale: Number(stage.dataset.readerZoom), phase: stage.dataset.panoramaJumpPhase ?? '', surfaces });
      requestAnimationFrame(run);
    }; requestAnimationFrame(run);
  });
}
async function stop(page: Page) { return page.evaluate(() => { (window as any).__recordPresentation = false; return (window as any).__presentationFrames as { scale: number; phase: string; surfaces: { index: string; width: number; height: number; canvasWidth: number; canvasHeight: number; sampled: boolean; pixels: boolean }[] }[]; }); }

test.describe('desktop presentation', () => {
  test.use({ viewport: { width: 1101, height: 821 }, deviceScaleFactor: 1.25 });
  for (const vertical of [false, true]) test(`panorama progress jump finishes with the full ${vertical ? 'vertical' : 'horizontal'} page proportions`, async ({ page }, info) => {
    await open(page, { slow: true }); await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    if (vertical) await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
    const rail = page.getByRole('slider', { name: '阅读进度', exact: true });
    const r = (await rail.boundingBox())!; await record(page); await page.mouse.click(r.x + r.width * .65, r.y + r.height / 2);
    await expect(page.locator('.reader-stage')).not.toHaveAttribute('data-panorama-jump-phase', /.+/);
    await page.waitForTimeout(1200); const frames = await stop(page); await info.attach('jump-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
    const final = frames.at(-1)!.surfaces.filter(s => s.sampled);
    expect(final.length).toBeGreaterThan(0);
    for (const s of final) { expect(Math.abs(s.canvasWidth - s.width), JSON.stringify(s)).toBeLessThan(1.1); expect(Math.abs(s.canvasHeight - s.height), JSON.stringify(s)).toBeLessThan(1.1); }
  });
  for (const mode of ['single', 'double']) test(`${mode} page handoff never exposes an empty or mis-sized display raster`, async ({ page }, info) => {
    await open(page, { mode, slow: true }); await record(page);
    for (const label of ['下一页','下一页','上一页','下一页','上一页']) { await page.getByRole('button', { name: label, exact: true }).click(); await page.waitForTimeout(650); }
    const frames = await stop(page); await info.attach('turn-frames', { body: JSON.stringify(frames), contentType: 'application/json' });
    if (frames.some(f => !f.surfaces.some(s => s.pixels))) console.log(JSON.stringify({ mode, badFrames: frames.map((frame, index) => ({ frame, index })).filter(({ frame }) => !frame.surfaces.some(s => s.pixels)) }));
    expect(frames.every(f => f.surfaces.some(s => s.pixels))).toBe(true);
    const bad = frames.flatMap(f => f.surfaces.filter(s => s.sampled && (!s.pixels || Math.abs(s.canvasWidth - s.width) > 1.1 || Math.abs(s.canvasHeight - s.height) > 1.1)));
    expect(bad.slice(0, 8)).toEqual([]);
  });
  test('aligning a prepared page during temporary jump scaling never bakes that scale into its raster', async ({page})=>{
    await open(page);await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();await page.waitForTimeout(450);
    await page.locator('.reader-page-spread').evaluate(async spread=>{
      const animation=spread.animate([{scale:'.97'},{scale:'.97'}],{duration:1000,fill:'both'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      spread.dispatchEvent(new Event('omi-reader-aligned'));
      animation.cancel();
    });
    const sizes=await page.locator('[data-reader-page-index="12"] .has-display-raster').evaluate(e=>{const r=e.getBoundingClientRect(),c=e.querySelector('canvas')!.getBoundingClientRect();return{width:r.width,height:r.height,canvasWidth:c.width,canvasHeight:c.height};});
    expect(Math.abs(sizes.width-sizes.canvasWidth)).toBeLessThan(1.1);expect(Math.abs(sizes.height-sizes.canvasHeight)).toBeLessThan(1.1);
  });
  test('zoom restores stable coverage through the final resampling swap and keeps scrollbars hidden', async ({ page }, info) => {
    await open(page, { slow: true });
    await page.getByRole('button', { name: '缩放', exact: true }).click(); await page.getByRole('slider', { name: '缩放比例', exact: true }).fill('-100'); await page.waitForTimeout(400);
    await record(page); await page.getByRole('button', { name: '重置大小', exact: true }).click(); await page.waitForTimeout(1000);
    const frames = await stop(page); await info.attach('restore-coverage', { body: JSON.stringify(frames), contentType: 'application/json' });
    const bad = frames.flatMap(f => f.surfaces.filter(s => s.sampled && (!s.pixels || Math.abs(s.canvasWidth - s.width) > 1.1 || Math.abs(s.canvasHeight - s.height) > 1.1)));
    expect(bad.slice(0, 8)).toEqual([]);
    await page.getByRole('slider', { name: '缩放比例', exact: true }).fill('65'); await page.keyboard.press('Escape');
    const stage = await page.locator('.reader-stage').evaluate(e => ({ overflow: getComputedStyle(e).overflow, scrollbar: getComputedStyle(e).scrollbarWidth, client: e.clientWidth, box: e.getBoundingClientRect().width }));
    expect(stage.overflow === 'hidden' || stage.overflow === 'clip' || stage.scrollbar === 'none', JSON.stringify(stage)).toBe(true);
  });
  for (const vertical of [false, true]) test(`panorama ${vertical?'vertical':'horizontal'} drag keeps its cross axis stable while neighbours prepare`, async ({ page }) => {
    await open(page,{delayedSizes:true});
    await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
    if(vertical)await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
    const stage=page.locator('.reader-stage'),r=(await stage.boundingBox())!,x=r.x+r.width*.6,y=r.y+r.height*.6;
    await page.mouse.move(x,y);await page.mouse.down();
    const positions:{main:number;cross:number;width:number;height:number}[]=[];
    for(let n=1;n<=35;n++){
      await page.mouse.move(x-(vertical?0:n*3),y-(vertical?n*3:0));await page.waitForTimeout(20);
      positions.push(await stage.locator('[data-reader-page-index="12"] .reader-effects').evaluate((e,vertical)=>{const r=e.getBoundingClientRect();return{main:vertical?r.top:r.left,cross:vertical?r.left:r.top,width:r.width,height:r.height};},vertical));
    }
    await page.mouse.up();
    expect(Math.max(...positions.map(p=>p.cross))-Math.min(...positions.map(p=>p.cross)),JSON.stringify(positions)).toBeLessThan(.9);
    expect(new Set(positions.map(p=>`${p.width.toFixed(2)}:${p.height.toFixed(2)}`)).size).toBe(1);
    for(let n=1;n<positions.length;n++)expect(positions[n].main-positions[n-1].main,JSON.stringify(positions)).toBeLessThanOrEqual(.1);
  });
});

test.describe('phone zoom paging', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const mode of ['single', 'double', 'double-rtl']) test(`${mode} pans to its enlarged edge then continues into the adjacent group`, async ({ page, context }) => {
    await open(page, { mobile: true, mode });
    const stage = page.locator('.reader-stage'), r = (await stage.boundingBox())!, cdp = await context.newCDPSession(page);
    const touch = (type: string, x: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: r.y + r.height / 2, id: 1 }] });
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, -240); await page.keyboard.up('Control');
    await expect.poll(async () => Number(await stage.getAttribute('data-reader-zoom'))).toBeGreaterThan(1.4);
    const sign = mode === 'double-rtl' ? 1 : -1, x = r.x + r.width * (sign > 0 ? .15 : .85);
    const progress = page.locator('[role="slider"][aria-label="阅读进度"]');
    const before = await progress.getAttribute('aria-valuenow');
    const trace:unknown[]=[];
    for (let attempt = 0; attempt < 4; attempt++) {
      await touch('touchStart', x); for (let step = 1; step <= 9; step++) await touch('touchMove', x + sign * step * 25);
      trace.push(await stage.evaluate(e=>({zoom:(e as HTMLElement).dataset.readerZoom,translate:(e.querySelector('.reader-page-spread') as HTMLElement)?.style.translate,preview:(e.querySelector('.reader-swipe-preview') as HTMLElement)?.style.cssText,canvases:[...e.querySelectorAll('.reader-swipe-preview .reader-effects')].map(n=>({status:(n as HTMLElement).dataset.displaySampling,rect:n.getBoundingClientRect().toJSON()}))})));
      await page.waitForTimeout(100); await touch('touchEnd', x + sign * 225); await page.waitForTimeout(900);
      if (await progress.getAttribute('aria-valuenow') !== before) break;
    }
    if(await progress.getAttribute('aria-valuenow')===before)console.log(JSON.stringify({mode,trace}));
    await expect(progress).not.toHaveAttribute('aria-valuenow', before!);
    expect(Number(await stage.getAttribute('data-reader-zoom'))).toBeGreaterThan(1.4);
  });
});
