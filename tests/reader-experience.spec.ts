import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seedReader(page: Page, mixed = false, stall = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 40 });
  await page.addInitScript(({ mixed, stall }) => {
    const api = (window as any).omicomic;
    const getData = api.getAppData;
    api.getAppData = async () => {
      const result = await getData();
      result.data.settings.readerImageLoadConcurrency = 2;
      result.data.settings.readerMemoryCacheSizeMb = 256;
      result.data.settings.readerPreloadPages = 3;
      result.data.recentOpened[0].currentPageIndex = 12;
      return result;
    };
    const images = (mixed ? [[4000, 1000], [600, 5000], [1200, 1800]] : [[1000, 1600]]).map(([width, height]) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#c8d7e9'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#476184'; ctx.fillRect(width / 4, height / 4, width / 2, height / 2);
      return { url: canvas.toDataURL('image/png'), width, height };
    });
    (window as any).__pageRequests = [];
    (window as any).__thumbnailRequests = [];
    const thumbnail = api.getThumbnail;
    api.getThumbnail = async (input: any) => {
      (window as any).__thumbnailRequests.push(input.path);
      return thumbnail(input);
    };
    api.getPageImage = (input: any) => {
      const index = Number(/page(\d+)/.exec(input.sourcePath)?.[1] ?? 0);
      (window as any).__pageRequests.push(index);
      if (stall && index !== 12 && index !== 20) return new Promise(() => {});
      return Promise.resolve({ ok: true, data: images[index % images.length] });
    };
  }, { mixed, stall });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
}

async function openReader(page: Page) {
  await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toBeEnabled();
  await expect(page.locator('[data-reader-page-index="12"] img')).toBeVisible();
}

async function jump(page: Page, pageNumber: number) {
  const input = page.getByRole('textbox', { name: '跳转到页码' });
  await input.fill(String(pageNumber)); await input.press('Enter');
  await expect(input).toHaveValue(String(pageNumber));
}

test('branding separates main-page navigation from resume, and hidden library does no thumbnail work', async ({ page }) => {
  await seedReader(page);
  const requests = await page.evaluate(() => (window as any).__thumbnailRequests);
  expect(requests).toHaveLength(3);
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.page-panel.is-visible .library-layout')).toBeVisible();
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.omi-home')).toBeVisible();
  await openReader(page);
  await expect(page.locator('.reader-layout')).toBeVisible();
  await expect(page.locator('.omi-home')).toHaveCount(0);
});

test('wide and tall pages fit height in single, double and panorama modes without distorting aspect ratio', async ({ page }) => {
  await seedReader(page, true);
  await openReader(page);
  for (const mode of ['single', 'double', 'panorama-double', 'panorama-single']) {
    if (mode === 'double') await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click();
    if (mode === 'panorama-double') await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    if (mode === 'panorama-single') await page.getByRole('button', { name: '当前双页，点击切换单页', exact: true }).click();
    for (const index of [12, 13]) {
      await jump(page, index + 1);
      const img = page.locator(`[data-reader-page-index="${index}"] img`);
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate(element => {
        const image = element as HTMLImageElement;
        const stage = document.querySelector('.reader-stage')!;
        const style = getComputedStyle(stage);
        const available = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        return Math.abs(image.getBoundingClientRect().height - available);
      })).toBeLessThanOrEqual(2);
      const dimensions = await img.evaluate((image: HTMLImageElement) => ({ width: image.width, height: image.height, ratio: image.naturalWidth / image.naturalHeight }));
      expect(Math.abs(dimensions.width / dimensions.height - dimensions.ratio)).toBeLessThan(.01);
      await page.screenshot({ path: `test-results/fit-height-${mode}-${index}.png` });
    }
  }
});

test('a stalled prefetch cannot block a new visible page', async ({ page }) => {
  await seedReader(page, false, true);
  await openReader(page);
  expect(await page.evaluate(() => (window as any).__pageRequests[0])).toBe(12);
  await expect.poll(() => page.evaluate(() => (window as any).__pageRequests.some((index: number) => index !== 12))).toBe(true);
  const start = Date.now();
  await jump(page, 21);
  await expect(page.locator('[data-reader-page-index="20"] img')).toBeVisible({ timeout: 1500 });
  console.log(`Visible page bypassed stalled prefetch in ${Date.now() - start}ms`);
});

test('fast mouse drags cover more distance and retain stronger release momentum', async ({ page }) => {
  await seedReader(page);
  const measurements: Array<{ drag: number; coast: number }> = [];
  for (const delay of [100, 5]) {
    if (measurements.length) await page.reload();
    await openReader(page);
    await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    await expect(page.locator('.reader-stage.is-panorama')).toBeVisible();
    const figure = page.locator('[data-reader-page-index="12"]');
    const stage = (await page.locator('.reader-stage').boundingBox())!;
    const x = stage.x + stage.width * .7, y = stage.y + stage.height * .5;
    await page.mouse.move(x, y);
    const startX = (await figure.boundingBox())!.x;
    await page.evaluate(() => {
      // Measure release in the browser, so an automation round trip does not
      // turn a quick swipe into a deliberate pause before releasing the mouse.
      window.addEventListener('pointerup', () => {
        (window as any).__releaseX = document.querySelector('[data-reader-page-index="12"]')!.getBoundingClientRect().x;
      }, { once: true });
    });
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) {
      await page.waitForTimeout(delay);
      await page.mouse.move(x - step * 40, y);
    }
    await page.mouse.up();
    const releaseX = await page.evaluate(() => (window as any).__releaseX as number);
    await page.waitForTimeout(160);
    const endX = (await figure.boundingBox())!.x;
    measurements.push({ drag: startX - releaseX, coast: releaseX - endX });
  }
  console.log('Mouse drag measurements', JSON.stringify(measurements));
  expect(measurements[1].drag).toBeGreaterThan(measurements[0].drag * 1.3);
  expect(measurements[1].coast).toBeGreaterThan(measurements[0].coast * 2);
});

async function clickProgress(page: Page, index: number, rtl = false) {
  const rail = page.getByRole('slider', { name: '阅读进度' });
  const box = (await rail.boundingBox())!;
  const ratio = index / 39;
  await page.mouse.click(box.x + box.width * (rtl ? 1 - ratio : ratio), box.y + box.height / 2);
}

for (const flow of ['horizontal', 'vertical', 'rtl']) {
  test(`single-page panorama turns remain continuous across window rebasing: ${flow}`, async ({ page }) => {
    await seedReader(page, true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      const api = (window as any).omicomic, read = api.getPageImage;
      api.getPageImage = async (input: any) => {
        if (!/page12\.png$/.test(input.sourcePath)) await new Promise(resolve => setTimeout(resolve, 180));
        return read(input);
      };
    });
    await openReader(page);
    await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    if (flow === 'vertical') await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
    if (flow === 'rtl') await page.getByRole('button', { name: /当前从左到右/ }).click();
    await page.waitForTimeout(30);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    for (const [button, targetPage, repeats] of [
      ['下一页', 14, 1], ['上一页', 13, 1], ['下一页', 15, 2], ['上一页', 13, 2],
    ] as const) {
      await page.evaluate(vertical => {
        (window as any).__turnFrames = new Promise(resolve => {
          const samples: Array<{ time: number; position: number; loaded: boolean }> = [];
          const start = performance.now();
          function sample() {
            const frame = document.querySelector('[data-reader-page-index="12"]')!;
            const image = frame?.querySelector('img');
            const rect = frame?.getBoundingClientRect();
            samples.push({ time: performance.now() - start, position: rect ? vertical ? rect.y : rect.x : NaN,
              loaded: Boolean(image?.complete && image.naturalWidth && getComputedStyle(frame).visibility === 'visible') });
            if (performance.now() - start < 800) requestAnimationFrame(sample);
            else resolve(samples);
          }
          sample();
        });
      }, flow === 'vertical');
      await page.getByRole('button', { name: button, exact: true }).click();
      if (repeats === 2) {
        await page.waitForTimeout(70);
        await page.getByRole('button', { name: button, exact: true }).click();
      }
      const samples: Array<{ time: number; position: number; loaded: boolean }> = await page.evaluate(() => (window as any).__turnFrames);
      const direction = Math.sign(samples.at(-1)!.position - samples[0].position);
      const reversals = samples.slice(1).map((sample, i) => (sample.position - samples[i].position) * direction);
      expect(samples.every(sample => sample.loaded && Number.isFinite(sample.position))).toBe(true);
      expect(Math.abs(samples.at(-1)!.position - samples[0].position)).toBeGreaterThan(20);
      expect(Math.min(...reversals)).toBeGreaterThanOrEqual(-2);
      await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue(String(targetPage));
      const centerError = await page.locator(`[data-reader-page-index="${targetPage - 1}"]`).evaluate((frame, vertical) => {
        const rect = frame.getBoundingClientRect(), stage = document.querySelector('.reader-stage')!.getBoundingClientRect();
        return Math.abs(vertical ? rect.top + rect.height / 2 - stage.top - stage.height / 2
          : rect.left + rect.width / 2 - stage.left - stage.width / 2);
      }, flow === 'vertical');
      expect(centerError).toBeLessThan(2);
    }
  });
}

test('single-page turns yield to reversal, mode changes and reduced motion without stale movement', async ({ page }) => {
  await seedReader(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openReader(page);
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  const frame = page.locator('[data-reader-page-index="12"]');
  const startX = (await frame.boundingBox())!.x;
  const input = page.getByRole('textbox', { name: '跳转到页码' });
  const moved = () => expect.poll(async () => (await frame.boundingBox())!.x).toBeLessThan(startX - 8);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await moved();
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await expect.poll(async () => Math.abs((await frame.boundingBox())!.x - startX)).toBeLessThan(1);
  await expect(input).toHaveValue('13');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await moved();
  await page.getByRole('button', { name: '关闭全景连环画', exact: true }).click();
  await expect(page.locator('.reader-stage')).not.toHaveClass(/\bis-panorama\b(?!-)/);
  await page.waitForTimeout(250);
  await expect(page.locator('.reader-page-spread img')).toBeVisible();
  await jump(page, 13);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(input).toHaveValue('14');
  const destination = page.locator('[data-reader-page-index="13"]');
  const before = await destination.boundingBox();
  await page.waitForTimeout(250);
  expect(await destination.boundingBox()).toEqual(before);
  await expect(page.locator('.reader-panorama-jump-ghost')).toHaveCount(0);
});

for (const flow of ['horizontal', 'vertical', 'rtl']) {
  test(`progress jump shrinks toward the destination and gathers neighboring pages: ${flow}`, async ({ page }) => {
    await seedReader(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openReader(page);
    await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    if (flow === 'vertical') await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
    if (flow === 'rtl') await page.getByRole('button', { name: /当前从左到右/ }).click();
    await page.evaluate(() => {
      const original = Element.prototype.animate;
      (window as any).__jumpAnimations = [];
      Element.prototype.animate = function(keyframes, options) {
        const animation = original.call(this, keyframes, options);
        if (this.matches('.reader-panorama-jump-ghost, .reader-page-frame, .reader-page-spread.is-panorama-strip')) {
          animation.pause(); animation.currentTime = 0;
          (window as any).__jumpAnimations.push(animation);
        }
        return animation;
      };
    });
    const stage = page.locator('.reader-stage');
    let previousIndex = 12;
    for (const index of [6, 28]) {
      await clickProgress(page, index, flow === 'rtl');
      await expect(stage).toHaveAttribute('data-panorama-jump-phase', 'departing');
      const departure = await page.evaluate(() => {
        const animation = (window as any).__jumpAnimations.at(-1) as Animation;
        animation.currentTime = Number(animation.effect?.getTiming().duration) * 0.8;
        const ghost = document.querySelector('.reader-panorama-jump-ghost')!;
        const matrix = new DOMMatrix(getComputedStyle(ghost).transform);
        return { scale: matrix.a, x: matrix.m41, y: matrix.m42 };
      });
      expect(departure.scale).toBeGreaterThan(.95);
      expect(departure.scale).toBeLessThan(.99);
      const direction = Math.sign(index - previousIndex) * (flow === 'rtl' ? -1 : 1);
      const viewport = (await stage.boundingBox())!;
      const axisSize = flow === 'vertical' ? viewport.height : viewport.width;
      expect((flow === 'vertical' ? departure.y : departure.x) * direction).toBeGreaterThan(axisSize * .15);
      if (flow === 'horizontal' && index === 6) await page.screenshot({ path: 'test-results/panorama-jump-departure.png' });
      await page.evaluate(() => (window as any).__jumpAnimations.forEach((animation: Animation) => {
        if (animation.playState === 'paused') animation.finish();
      }));
      await expect(stage).toHaveAttribute('data-panorama-jump-phase', 'arriving');
      const sample = () => page.evaluate(({ index, vertical }) => {
        const flow = document.querySelector('.reader-page-spread')!;
        const frame = (n: number) => flow.querySelector<HTMLElement>(`[data-reader-page-index="${n}"]`)!;
        const offset = (n: number) => {
          const matrix = new DOMMatrix(getComputedStyle(frame(n)).transform);
          return vertical ? matrix.m42 : matrix.m41;
        };
        const center = (n: number) => {
          const rect = frame(n).getBoundingClientRect();
          return vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
        };
        const translation = getComputedStyle(flow).translate.split(/\s+/).map(Number.parseFloat);
        return { slide: translation[vertical ? 1 : 0] || 0, width: frame(index).getBoundingClientRect().width, before: offset(index - 1), after: offset(index + 1),
          beforeSide: Math.sign(center(index - 1) - center(index)), afterSide: Math.sign(center(index + 1) - center(index)) };
      }, { index, vertical: flow === 'vertical' });
      const start = await sample();
      expect(start.slide * direction).toBeLessThan(-axisSize * .15);
      expect(start.before * start.beforeSide).toBeGreaterThan(20);
      expect(start.after * start.afterSide).toBeGreaterThan(20);
      await page.evaluate(() => (window as any).__jumpAnimations.forEach((animation: Animation) => {
        if (animation.playState === 'paused') animation.currentTime = 140;
      }));
      const middle = await sample();
      expect(Math.abs(middle.slide)).toBeLessThan(Math.abs(start.slide) * .65);
      expect(Math.abs(middle.slide)).toBeGreaterThan(5);
      expect(middle.width).toBeGreaterThan(start.width);
      expect(Math.abs(middle.before)).toBeLessThan(Math.abs(start.before));
      expect(Math.abs(middle.after)).toBeLessThan(Math.abs(start.after));
      if (flow === 'horizontal' && index === 6) await page.screenshot({ path: 'test-results/panorama-jump-arrival.png' });
      await page.evaluate(() => (window as any).__jumpAnimations.forEach((animation: Animation) => {
        if (animation.playState === 'paused') animation.finish();
      }));
      await expect(stage).not.toHaveAttribute('data-panorama-jump-phase');
      await expect(page.locator('.reader-panorama-jump-ghost')).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue(String(index + 1));
      expect(await page.locator(`.reader-page-spread [data-reader-page-index="${index}"]`).evaluate(element => getComputedStyle(element).transform)).toBe('none');
      expect(await page.locator('.reader-page-spread').evaluate(element => {
        const translate = getComputedStyle(element).translate;
        return (translate === 'none' || translate.split(/\s+/).every(value => Number.parseFloat(value) === 0))
          && element.getAnimations({ subtree: true }).length === 0;
      })).toBe(true);
      previousIndex = index;
    }
  });
}

test('a slow progress jump retains the old picture and yields to the latest click or mode change', async ({ page }) => {
  await seedReader(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openReader(page);
  await page.evaluate(() => {
    const api = (window as any).omicomic, read = api.getPageImage;
    api.getPageImage = async (input: any) => {
      if (/page3[56]\.png$/.test(input.sourcePath)) await new Promise(resolve => setTimeout(resolve, 1000));
      return read(input);
    };
  });
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await clickProgress(page, 35);
  await expect(page.locator('.reader-stage')).toHaveAttribute('data-panorama-jump-phase', 'departing');
  await expect(page.locator('.reader-panorama-jump-ghost [data-reader-page-index="12"] img')).toBeVisible();
  await clickProgress(page, 5);
  await expect(page.locator('.reader-stage')).toHaveAttribute('data-panorama-jump-phase', 'arriving');
  await clickProgress(page, 17);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('18');
  await expect(page.locator('.reader-stage')).not.toHaveAttribute('data-panorama-jump-phase');
  await page.waitForTimeout(1050);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('18');
  await expect(page.locator('.reader-page-spread [data-reader-page-index="17"] img')).toBeVisible();
  await expect(page.locator('.reader-panorama-jump-ghost')).toHaveCount(0);
  await clickProgress(page, 36);
  await page.getByRole('button', { name: '关闭全景连环画', exact: true }).click();
  await expect(page.locator('.reader-page-spread img').first()).toBeVisible();
  await expect(page.locator('.reader-panorama-jump-ghost')).toHaveCount(0);
  await expect(page.locator('.reader-stage')).not.toHaveAttribute('data-panorama-jump-phase');
});
