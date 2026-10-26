import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test('default home composition scales together from a small window to fullscreen', async ({ page }) => {
  await page.addInitScript(installMock, { count: 120 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
  let previous: { width: number; height: number }[] | undefined;
  for (const viewport of [{ width: 960, height: 640 }, { width: 1440, height: 900 }, { width: 2560, height: 1392 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.locator('.omi-home__stage').evaluate(element => Number((element as HTMLElement).style.getPropertyValue('--omi-home-scale')))).toBeCloseTo(Math.min(viewport.width / 1440, viewport.height / (1653 / 2480 * 1440)), 2);
    const bounds = await Promise.all(['.omi-home__cover', '.omi-home__art > img', '.omi-home__signature-mark', '.omi-home__mascot--peek'].map(async selector => {
      const element = page.locator(selector).first();
      await expect(element).toBeVisible();
      return (await element.boundingBox())!;
    }));
    if (previous) {
      const scale = bounds[0].width / previous[0].width;
      expect(scale).toBeGreaterThan(1.25);
      bounds.forEach((box, i) => {
        expect(box.width / previous![i].width).toBeCloseTo(scale, 2);
        expect(box.height / previous![i].height).toBeCloseTo(scale, 2);
      });
    }
    previous = bounds;
    expect(await page.locator('.omi-home').evaluate(element => element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight)).toBe(true);
    await expect.poll(() => page.locator('.omi-home__art > img, .omi-home__mascot').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `test-results/omi-home-${viewport.width}.png` });
  }
  for (const theme of ['mist', 'nord', 'sand', 'night']) {
    await page.evaluate(theme => document.documentElement.dataset.colorTheme = theme, theme);
    await expect(page.locator('#omi-home-palette feFlood').first()).not.toHaveCSS('flood-color', 'rgb(0, 0, 0)');
    await page.screenshot({ path: `test-results/omi-home-${theme}.png` });
    if (theme === 'night') {
      const artPaper = await page.locator('#omi-home-palette feFlood[result="paperColor"]').evaluate(element => getComputedStyle(element).floodColor);
      await expect(page.locator('.omi-home__signature-word')).toHaveCSS('color', artPaper);
      await expect(page.locator('.omi-home__signature-word > i')).toHaveCSS('color', artPaper);
      for (const name of ['peek', 'side', 'signature']) {
        const bounds = (await page.locator(`.omi-home__mascot.omi-home__mascot--${name}`).boundingBox())!;
        await page.screenshot({ path: `test-results/omi-finish/${name}-actual.png`, clip: { x: bounds.x - 15, y: bounds.y - 15, width: bounds.width + 30, height: bounds.height + 50 } });
      }
      const art = (await page.locator('.omi-home__art').boundingBox())!;
      const scale = art.width / 1155;
      for (const [name, x, y, width, height] of [['neck', 320, 570, 200, 200], ['legs', 0, 1280, 510, 283]] as const) {
        await page.screenshot({ path: `test-results/omi-finish/${name}-actual.png`, clip: { x: art.x + x * scale, y: art.y + y * scale, width: width * scale, height: height * scale } });
      }
    }
  }
  await page.setViewportSize({ width: 2480, height: 1653 });
  await page.evaluate(() => document.documentElement.dataset.colorTheme = 'mist');
  await expect.poll(() => page.locator('.omi-home__art').evaluate(image => Math.round(image.getBoundingClientRect().x))).toBe(1300);
  const figure = (await page.locator('.omi-home__art').boundingBox())!;
  expect(figure.y).toBeCloseTo(77, 0);
  expect(figure.width).toBeCloseTo(1155, 0);
  expect(figure.height).toBeCloseTo(1563, 0);
  const paper = await page.locator('.omi-home__art > img').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 1159; canvas.height = 1567;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [[200, 1350], [300, 1450]].map(([x, y]) => context.getImageData(x + 2, y + 2, 1, 1).data[3]);
  });
  expect(paper).toEqual([255, 255]);
  expect(await page.locator('.omi-home__art > img').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 1159; canvas.height = 1567;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [[370, 675], [401, 651], [235, 1490], [200, 1520]].map(([x, y]) => context.getImageData(x + 2, y + 2, 1, 1).data[3]);
  })).toEqual([0, 0, 0, 0]);
  expect(await page.locator('.omi-home__mascot--peek').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 268; canvas.height = 171;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [[57, 120], [61, 133]].map(([x, y]) => context.getImageData(x + 2, y + 2, 1, 1).data[3]);
  })).toEqual([255, 255]);
  await expect(page.locator('.omi-home__mascot-front')).toHaveCount(1);
  for (const [name, x, y, width] of [['peek', 617, 353, 264], ['signature', 100, 1087, 299]] as const) {
    const bounds = (await page.locator(`.omi-home__mascot.omi-home__mascot--${name}`).boundingBox())!;
    expect(Math.abs(bounds.x + 2 - x)).toBeLessThan(2);
    expect(Math.abs(bounds.y + 2 - y)).toBeLessThan(2);
    expect(Math.abs(bounds.width - 4 - width)).toBeLessThan(1);
  }
  const card = (await page.locator('.omi-home__content').boundingBox())!;
  const side = (await page.locator('.omi-home__mascot--side').boundingBox())!;
  const sideContact = await page.locator('.omi-home__mascot--side').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 191; canvas.height = 250;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    const alpha = (x: number, y: number) => context.getImageData(x + 18, y + 2, 1, 1).data[3];
    return {
      face: [76, 100, 130].map(y => alpha(35,y)), guide: alpha(31,100), hair: alpha(45,36), skirt: alpha(15,185),
      aboveHand: [[30,136],[30,137],[30,138],[30,139]].map(([x,y])=>alpha(x,y)),
      cheekAndSleeve: [[35,137],[36,143],[30,179],[30,180]].map(([x,y])=>alpha(x,y)),
      palmBottom: [[9,174],[10,175],[16,177],[20,176]].map(([x,y])=>alpha(x,y)),
    };
  });
  expect(sideContact.face.every(alpha => alpha > 250)).toBe(true);
  expect(sideContact.guide).toBe(0);
  expect(sideContact.hair).toBe(255);
  expect(sideContact.skirt).toBe(255);
  expect(sideContact.aboveHand).toEqual([0,0,0,0]);
  expect(sideContact.cheekAndSleeve.every(alpha=>alpha>250)).toBe(true);
  expect(sideContact.palmBottom.every(alpha=>alpha>128)).toBe(true);
  expect(side.x + 53).toBeCloseTo(card.x + card.width, 0);
  expect(side.x + (53 - 28 * 2480 / 1440)).toBeCloseTo(card.x + card.width - 28 * 2480 / 1440, 0);
  expect(side.y + 189).toBeCloseTo(card.y + card.height, 0);
  const badge = (await page.locator('.omi-home__signature-mark').boundingBox())!;
  expect(Math.abs(badge.x + badge.width / 2 - 250)).toBeLessThan(2);
  expect(Math.abs(badge.y + badge.height / 2 - 1284)).toBeLessThan(2);
  expect(await page.locator('.omi-home__mascot-front').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 303; canvas.height = 254;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return context.getImageData(217, 219, 1, 1).data[3];
  })).toBeGreaterThan(200);
  expect(await page.locator('.omi-home__mascot.omi-home__mascot--signature').evaluate(image => {
    const canvas = document.createElement('canvas'); canvas.width = 303; canvas.height = 254;
    const context = canvas.getContext('2d')!; context.drawImage(image as HTMLImageElement, 0, 0);
    return [[80,190],[85,193]].map(([x,y]) => context.getImageData(x+2,y+2,1,1).data[3]);
  })).toEqual([255,255]);
  await page.screenshot({ path: 'test-results/omi-corrected/reference-size.png' });
});

test('a missing custom image restores the complete default mascot scene', async ({ page }) => {
  await page.addInitScript(installMock, { count: 120 });
  await page.addInitScript(() => {
    (window as any).omicomic.getHomeArtwork = async () => ({ ok: true, data: { name: 'Missing', url: '/missing-home-mascot.png' } });
  });
  await page.goto('/');
  await expect(page.locator('.omi-home__art')).not.toHaveClass(/is-custom/);
  await expect(page.locator('.omi-home__art > img')).toHaveAttribute('alt', 'Omi 抱着小 Omi 坐在漫画书上');
  await expect(page.locator('.omi-home__mascot')).toHaveCount(3);
});
