import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { installMock } from './mock';

async function open(page: Page, mobile = false, mode = 'single', start = 12, delayed = false) {
  await page.addInitScript(installMock, { count: 48 });
  await page.addInitScript(async ({ mode, start, delayed }) => {
    const api = window.omicomic, data = (await api.getAppData()).data!;
    Object.assign(data.settings, { readerMemoryCacheSizeMb: 256, readerPreloadPages: 4, mobileReaderAutoHide: false, readerDefaultFitMode: 'fit-window', doublePageFirstSingle: false });
    data.recentOpened[0].currentPageIndex = start;
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1800;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, 1200, 1800); ctx.fillStyle = '#242424';
    for (let y = 0; y < 1800; y += 24) ctx.fillRect(0, y, 1200, 5);
    const url = canvas.toDataURL(), releases: (() => void)[] = [];
    (window as any).__releaseNeighbour = () => { delayed = false; releases.splice(0).forEach(release => release()); };
    api.getPageImage = async request => { if (delayed && request.index === start + 1) await new Promise<void>(resolve => releases.push(resolve)); return { ok: true, data: { url, width: 1200, height: 1800 } }; };
    api.getReadingProgress = async () => ({ ok: true, data: { currentPageIndex: start, readerViewState: { fitMode: 'fit-window', pageMode: mode === 'single' ? 'single' : 'double', pageDirection: mode === 'double-rtl' ? 'right-to-left' : 'left-to-right', flow: 'horizontal', panorama: false, immersive: false } } as any });
  }, { mode, start, delayed });
  await page.goto('/');
  if (mobile) {
    await page.evaluate(() => document.documentElement.dataset.platform = 'android');
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await page.locator('.mobile-resource-card').filter({ has: page.getByText('Book', { exact: true }) }).click();
  } else await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator(`[data-reader-page-index="${start}"] .has-display-raster`)).toHaveCount(1);
  await page.waitForTimeout(220);
}
const progress = (page: Page) => page.locator('[role="slider"][aria-label="阅读进度"]').getAttribute('aria-valuenow');
const offset = async (page: Page) => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.locator('.reader-page-spread').evaluate(e => Number.parseFloat((e as HTMLElement).style.translate) || 0);
};

async function record(page: Page) {
  await page.evaluate(() => {
    const started = performance.now(), frames: any[] = [];
    (window as any).__motionFrames = frames;
    const frame = () => {
      const stage = document.querySelector<HTMLElement>('.reader-stage')!, spread = stage.querySelector<HTMLElement>('.reader-page-spread')!;
      const visible = [...stage.querySelectorAll<HTMLCanvasElement | HTMLImageElement>('.reader-page-frame canvas,.reader-page-frame img')].some(e => {
        const r = e.getBoundingClientRect(), clip = stage.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > clip.left && r.left < clip.right && r.bottom > clip.top && r.top < clip.bottom && getComputedStyle(e).visibility === 'visible' && (e instanceof HTMLCanvasElement ? e.width > 0 && e.height > 0 : e.complete && e.naturalWidth > 0);
      });
      frames.push({ time: performance.now() - started, scale: Number(stage.dataset.readerZoom), offset: parseFloat(spread.style.translate) || 0, pixels: visible, ...(!visible ? { surfaces: [...stage.querySelectorAll('.reader-page-frame .reader-effects')].map(e => ({ status: (e as HTMLElement).dataset.displaySampling, rect: e.getBoundingClientRect().toJSON(), images: [...e.querySelectorAll('canvas,img')].map(i => ({ tag: i.tagName, width: (i as HTMLCanvasElement).width, rect: i.getBoundingClientRect().toJSON(), visibility: getComputedStyle(i).visibility })) })) } : {}) });
      if (performance.now() - started < 650) requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  });
}
async function frames(page: Page) { await page.waitForTimeout(670); return page.evaluate(() => (window as any).__motionFrames as { time: number; scale: number; offset: number; pixels: boolean }[]); }

for (const mode of ['ordinary', 'horizontal', 'vertical']) for (const slider of ['-100', '55']) {
  test(`desktop ${mode} restores ${slider === '-100' ? 'shrunk' : 'enlarged'} pixels through intermediate frames`, async ({ page }, info) => {
    await open(page);
    if (mode !== 'ordinary') await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    if (mode === 'vertical') await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
    await page.getByRole('button', { name: '缩放', exact: true }).click();
    await page.getByRole('slider', { name: '缩放比例', exact: true }).fill(slider);
    await page.waitForTimeout(230);
    const before = await progress(page), scale = Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'));
    await record(page); await page.getByRole('button', { name: '重置大小', exact: true }).click();
    const captured = await frames(page), middle = captured.filter(f => Math.abs(f.scale - scale) > .002 && Math.abs(f.scale - 1) > .002);
    await info.attach('restore-frames', { body: JSON.stringify(captured), contentType: 'application/json' });
    if (captured.some(f => !f.pixels)) console.log(JSON.stringify({ mode, slider, blank: captured.filter(f => !f.pixels).slice(0, 4) }));
    expect(middle.length).toBeGreaterThanOrEqual(4);
    expect(captured.every(f => f.pixels)).toBe(true);
    for (let i = 1; i < captured.length; i++) expect((captured[i].scale - captured[i - 1].scale) * (1 - scale)).toBeGreaterThanOrEqual(-.001);
    expect(captured.at(-1)!.scale).toBe(1); expect(await progress(page)).toBe(before);
  });
}

test('a new Control-wheel gesture interrupts restore at its current scale', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: '缩放', exact: true }).click();
  await page.getByRole('slider', { name: '缩放比例', exact: true }).fill('65');
  await page.getByRole('button', { name: '重置大小', exact: true }).click(); await page.waitForTimeout(45);
  const box = (await page.locator('.reader-stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, -140); await page.keyboard.up('Control');
  await page.waitForTimeout(60); const interrupted = await page.locator('.reader-stage').getAttribute('data-reader-zoom');
  expect(Number(interrupted)).toBeGreaterThan(1.1); await page.waitForTimeout(400);
  await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom', interrupted!);
});

async function finger(page: Page, context: BrowserContext, right = false) {
  const cdp = await context.newCDPSession(page), r = (await page.locator('.reader-stage').boundingBox())!, x = r.x + r.width * (right ? .2 : .8), y = r.y + r.height / 2;
  return { x, y, cdp, touch: (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', px = x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: px, y, id: 1 }] }) };
}
test.describe('phone motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const mode of ['single', 'double', 'double-rtl']) test(`${mode} follows 1:1 and sends intermediate settle positions before one handoff`, async ({ page, context }, info) => {
    await open(page, true, mode); const first = Number(await progress(page)), sign = mode === 'double-rtl' ? 1 : -1, { x, touch } = await finger(page, context, sign > 0);
    await touch('touchStart'); await touch('touchMove', x + sign * 25);
    await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(mode === 'single' ? 1 : 2);
    await touch('touchMove', x + sign * 80); const a = await offset(page);
    await touch('touchMove', x + sign * 150); const b = await offset(page);
    expect((b - a) * sign).toBeCloseTo(70, 0); expect(Number(await progress(page))).toBe(first);
    await record(page); await touch('touchEnd'); const captured = await frames(page);
    expect(new Set(captured.filter(f => Math.abs(f.offset) > 160).map(f => Math.round(f.offset))).size).toBeGreaterThanOrEqual(3);
    await expect.poll(async () => Number(await progress(page))).toBe(first + (mode === 'single' ? 1 : 2));
    await expect(page.locator('.reader-swipe-preview')).toHaveCount(0);
    await info.attach('settle-frames', { body: JSON.stringify(captured), contentType: 'application/json' });
  });
  test('a delayed neighbour never holds the finger then jumps when decoding finishes', async ({ page, context }) => {
    await open(page, true, 'single', 12, true); const { x, touch } = await finger(page, context), first = await progress(page);
    await touch('touchStart'); await touch('touchMove', x - 80); expect(await offset(page)).toBeCloseTo(-72, 0);
    await page.waitForTimeout(150); expect(await offset(page)).toBeCloseTo(-72, 0);
    await page.evaluate(() => (window as any).__releaseNeighbour());
    await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(1); expect(await offset(page)).toBeCloseTo(-72, 0);
    await page.waitForTimeout(160); await touch('touchEnd'); await expect.poll(() => offset(page)).toBe(0); expect(await progress(page)).toBe(first);
  });
  test('a short paused drag returns smoothly and does not fall through to the old swipe action', async ({ page, context }) => {
    await open(page, true); const first = await progress(page), { x, touch } = await finger(page, context);
    await touch('touchStart'); await touch('touchMove', x - 70); await page.waitForTimeout(180);
    await record(page); await touch('touchEnd'); const captured = await frames(page);
    expect(new Set(captured.filter(f => f.offset < -.5 && f.offset > -62).map(f => f.offset)).size).toBeGreaterThanOrEqual(3);
    expect(await progress(page)).toBe(first); expect(await offset(page)).toBe(0);
  });
  test('the first-page edge resists further pulling and returns without a turn', async ({ page, context }) => {
    await open(page, true, 'single', 0); const { x, touch } = await finger(page, context, true);
    await touch('touchStart'); await touch('touchMove', x + 80); const a = await offset(page);
    await touch('touchMove', x + 180); const b = await offset(page); expect(a).toBeGreaterThan(0); expect(b).toBeGreaterThan(a); expect(b - a).toBeLessThan(25);
    await touch('touchEnd'); await expect.poll(() => offset(page)).toBe(0); expect(await progress(page)).toBe('1');
  });
  test('a new finger catches the settling group without snapping back to rest', async ({ page, context }) => {
    await open(page, true); const first = await progress(page), { x, touch } = await finger(page, context);
    await touch('touchStart'); await touch('touchMove', x - 25); await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(1); await touch('touchMove', x - 150);
    await page.evaluate(() => document.addEventListener('pointerdown', () => (window as any).__caughtOffset = parseFloat((document.querySelector('.reader-page-spread') as HTMLElement).style.translate), { capture: true, once: true }));
    await touch('touchEnd'); await touch('touchStart', 70); const caught = await offset(page), atDown = await page.evaluate(() => (window as any).__caughtOffset);
    expect(caught).toBeLessThan(-100); expect(Math.abs(caught - atDown)).toBeLessThan(1);
    await touch('touchMove', 70 - caught - 35); await page.waitForTimeout(160); await touch('touchEnd');
    await expect.poll(() => offset(page)).toBe(0); expect(await progress(page)).toBe(first);
  });
  test('recent release direction can cancel a long drag and can fling after a long initial hold', async ({ page, context }) => {
    await open(page, true); const first = Number(await progress(page)), { x, touch } = await finger(page, context);
    await touch('touchStart'); await touch('touchMove', x - 200); await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(1); await page.waitForTimeout(180);
    for (const d of [180, 160, 140]) await touch('touchMove', x - d);
    await touch('touchEnd'); await expect.poll(() => offset(page)).toBe(0); expect(Number(await progress(page))).toBe(first);
    await touch('touchStart'); await touch('touchMove', x - 25); await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(1); await page.waitForTimeout(220);
    for (const d of [45, 65, 85, 105]) await touch('touchMove', x - d);
    await touch('touchEnd'); await expect.poll(async () => Number(await progress(page))).toBe(first + 1);
  });
  test('pinch restore has intermediate pixel frames and a second finger cancels page settling', async ({ page, context }) => {
    await open(page, true); const first = await progress(page), { cdp, x, y, touch } = await finger(page, context);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }] });
    for (const d of [50, 60, 70, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }] });
    await touch('touchEnd'); const stage = (await page.locator('.reader-stage').boundingBox())!;
    await record(page); await page.touchscreen.tap(stage.x + stage.width / 2, y); await page.touchscreen.tap(stage.x + stage.width / 2, y);
    const captured = await frames(page); expect(captured.filter(f => f.scale > 1.001 && f.scale < 1.99).length).toBeGreaterThanOrEqual(4); expect(captured.every(f => f.pixels)).toBe(true); expect(await progress(page)).toBe(first);
    await touch('touchStart'); await touch('touchMove', x - 25); await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(1); await touch('touchMove', x - 140);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 140, y, id: 1 }, { x: x - 60, y, id: 2 }] });
    await touch('touchEnd'); await page.waitForTimeout(450); expect(await progress(page)).toBe(first); expect(await offset(page)).toBe(0);
  });
});
