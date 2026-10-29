import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

async function open(page: Page, sizes = [[600, 900], [600, 900], [1200, 1000], [1200, 1000], [6000, 400], [400, 6000], [1200, 400]], resumeIndex = 0) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: sizes.length });
  await page.addInitScript(({ sizes, resumeIndex }) => {
    const api = (window as any).omicomic, getData = api.getAppData;
    api.getAppData = async () => {
      const result = await getData(); result.data.settings.readerDefaultFitMode = 'fit-window';
      result.data.recentOpened[0].currentPageIndex = resumeIndex;
      return result;
    };
    if (resumeIndex > 0) api.getReadingProgress = async () => ({ ok: true, data: { currentPageIndex: resumeIndex, readerViewState: { fitMode: 'fit-window', pageMode: 'double', pairingAnchor: 0, pageDirection: 'left-to-right', flow: 'horizontal', panorama: false, immersive: false } } });
    const pictures = sizes.map(([width, height], index) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = index % 2 ? '#d8cfb9' : '#b7cce0'; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#455f7c'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, width - 12, height - 12);
      return { url: canvas.toDataURL(), width, height };
    });
    api.getPageImage = async (input: any) => ({ ok: true, data: pictures[Number(/page(\d+)/.exec(input.sourcePath)?.[1] ?? 0)] });
  }, { sizes, resumeIndex });
  await page.goto('/');
  await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toBeEnabled();
  await expectReaderPixels(page.locator('.reader-page-spread img').first());
}

async function fit(page: Page, label: string) {
  await page.getByRole('combobox', { name: '缩放方式' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await expect(page.getByRole('combobox', { name: '缩放方式' })).toContainText(label);
  await expect(page.getByRole('combobox', { name: '缩放方式' })).toHaveAttribute('aria-expanded', 'false');
}

async function jump(page: Page, value: number) {
  const input = page.getByRole('textbox', { name: '跳转到页码' });
  await input.fill(String(value)); await input.press('Enter');
  await expectReaderPixels(page.locator(`[data-reader-page-index="${value - 1}"] img`));
}

async function contained(page: Page, centered = true) {
  await expect.poll(() => page.locator('.reader-stage').evaluate((stage, centered) => {
    const box = stage.getBoundingClientRect(), css = getComputedStyle(stage);
    const x = box.left + parseFloat(css.paddingLeft), y = box.top + parseFloat(css.paddingTop);
    const width = stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const height = stage.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const images = [...stage.querySelectorAll<HTMLImageElement>('.reader-page-spread img')];
    const bounds = stage.querySelector('.reader-page-spread')!.getBoundingClientRect();
    return images.every(image => {
      const r = image.getBoundingClientRect();
      return image.complete && image.naturalWidth > 0 && r.left >= x - 1 && r.right <= x + width + 1 && r.top >= y - 1 && r.bottom <= y + height + 1
        && Math.abs(r.width / r.height - image.naturalWidth / image.naturalHeight) < .02;
    }) && (!centered || Math.abs(bounds.x + bounds.width / 2 - x - width / 2) < 1 && Math.abs(bounds.y + bounds.height / 2 - y - height / 2) < 1);
  }, centered)).toBe(true);
}

test('ordinary reader contains extreme images and centers short fit-width pages', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('combobox', { name: '缩放方式' })).toContainText('适应窗口');
  for (const index of [5, 6]) {
    await jump(page, index); await contained(page);
    if (index === 5) {
      await expect(page.locator('.reader-stage')).toHaveCSS('padding-left', '0px');
      const stage = (await page.locator('.reader-stage').boundingBox())!;
      const image = (await page.locator('[data-reader-page-index="4"] img').boundingBox())!;
      expect(Math.abs(image.x - stage.x)).toBeLessThan(1);
      expect(Math.abs(image.width - stage.width)).toBeLessThan(1);
    }
    await fit(page, '适应高度');
    await expect.poll(() => page.locator('.reader-stage').evaluate(stage => {
      const css = getComputedStyle(stage), image = stage.querySelector('img')!.getBoundingClientRect();
      return Math.abs(image.height - stage.clientHeight + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom));
    })).toBeLessThan(1);
    if (index === 5) {
      await expect.poll(() => page.locator('.reader-stage').evaluate(stage => stage.scrollWidth - stage.clientWidth)).toBeGreaterThan(1000);
      await page.locator('.reader-stage').evaluate(stage => { stage.scrollLeft = stage.scrollWidth; });
      await expect.poll(() => page.locator('.reader-stage').evaluate(stage => {
        const image = stage.querySelector('img')!.getBoundingClientRect();
        return Math.abs(image.right - stage.getBoundingClientRect().right + parseFloat(getComputedStyle(stage).paddingRight));
      })).toBeLessThan(2);
    } else await contained(page);
    await fit(page, '适应窗口');
  }
  await jump(page, 7); await fit(page, '适应宽度'); await contained(page);
  await page.screenshot({ path: 'test-results/reader-centered-fit-width.png' });
  await fit(page, '原始尺寸');
  await expect.poll(() => page.locator('[data-reader-page-index="6"] img').evaluate(img => img.getBoundingClientRect().width)).toBe(1200);
});

test('double pages fit the viewport, fall back for broad pairs and respond to resize', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click();
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2); await contained(page);
  await page.setViewportSize({ width: 800, height: 960 });
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2); await contained(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2); await contained(page);
  await page.keyboard.press('ArrowRight');
  await expectReaderPixels(page.locator('[data-reader-page-index="2"] img'));
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2); await contained(page);
  await fit(page, '适应高度');
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(1); await contained(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expectReaderPixels(page.locator('[data-reader-page-index="3"] img')); await contained(page);
  await page.screenshot({ path: 'test-results/reader-wide-pair-fallback.png' });
});

test('panorama uses its cross axis, clears old scroll, and restores the ordinary zoom', async ({ page }) => {
  await open(page); await jump(page, 6); await fit(page, '适应宽度');
  await page.locator('.reader-stage').evaluate(stage => { stage.scrollTop = 900; });
  await expect.poll(() => page.locator('.reader-stage').evaluate(stage => stage.scrollTop)).toBeGreaterThan(100);
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  const zoom = page.getByRole('combobox', { name: '缩放方式' });
  await expect(zoom).toBeDisabled(); await expect(zoom).toContainText('适应高度');
  await expect.poll(() => page.locator('.reader-stage').evaluate(stage => stage.scrollTop + Math.abs(stage.scrollLeft))).toBe(0);
  await jump(page, 5);
  await expect.poll(() => page.locator('[data-reader-page-index="4"] img').evaluate(image => {
    const stage = document.querySelector('.reader-stage')!, css = getComputedStyle(stage);
    return Math.abs(image.getBoundingClientRect().height - (stage.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)));
  })).toBeLessThan(1);
  await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await expect(zoom).toContainText('适应宽度'); await expect(zoom).toBeDisabled();
  await expect.poll(() => page.locator('[data-reader-page-index="4"] img').evaluate(image => {
    const stage = document.querySelector('.reader-stage')!, css = getComputedStyle(stage);
    return Math.abs(image.getBoundingClientRect().width - (stage.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)));
  })).toBeLessThan(1);
  await page.getByRole('button', { name: '关闭全景连环画', exact: true }).click();
  await expect(zoom).toBeEnabled(); await expect(zoom).toContainText('适应宽度'); await contained(page);
});

test('restoring the final page keeps it visible inside its fitted pair', async ({ page }) => {
  await open(page, [[1200, 1000], [1200, 1000]], 1);
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2);
  await expectReaderPixels(page.locator('[data-reader-page-index="1"] img'));
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await contained(page);
});

for (const flow of ['horizontal', 'vertical']) test(`single long panorama reaches both edges: ${flow}`, async ({ page }) => {
  await open(page, flow === 'horizontal' ? [[6000, 400]] : [[400, 6000]]);
  if (flow === 'vertical') await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect(page.locator('.reader-stage')).toHaveClass(/\bis-panorama\b/);
  for (const direction of [-1, 1]) {
    await page.locator('.reader-stage').evaluate((stage, direction) => {
      // Each wheel event is deliberately capped to 28% of the viewport.
      for (let i = 0; i < 100; i++) stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: direction * 1000 }));
    }, direction);
    await expect.poll(() => page.locator('.reader-stage').evaluate((stage, { direction, flow }) => {
      const box = stage.getBoundingClientRect(), image = stage.querySelector('img')!.getBoundingClientRect(), css = getComputedStyle(stage);
      return flow === 'horizontal'
        ? Math.abs(direction < 0 ? image.left - box.left - parseFloat(css.paddingLeft) : box.right - parseFloat(css.paddingRight) - image.right)
        : Math.abs(direction < 0 ? image.top - box.top - parseFloat(css.paddingTop) : box.bottom - parseFloat(css.paddingBottom) - image.bottom);
    }, { direction, flow })).toBeLessThan(2);
  }
});

test('Escape removes incidental button outlines while Tab retains a keyboard indicator', async ({ page }) => {
  await open(page);
  const immersive = page.getByRole('button', { name: '沉浸', exact: true });
  await immersive.click(); await page.keyboard.press('Escape');
  await expect(page.locator('.reader-layout')).not.toHaveClass(/is-immersive/);
  await expect(immersive).toHaveCSS('outline-style', 'none');
  const zoom = page.getByRole('combobox', { name: '缩放方式' });
  await zoom.click(); await page.keyboard.press('Escape');
  await expect(zoom).toHaveAttribute('aria-expanded', 'false');
  await expect(zoom).toHaveCSS('outline-style', 'none');
  await expect(page.locator('.reader-layout')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(immersive).toBeFocused();
  await expect(immersive).not.toHaveCSS('outline-style', 'none');
});
