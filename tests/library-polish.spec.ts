import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installMock } from './mock';
import { setCardScale } from './card-scale-helpers';

test.use({ screenshot: 'only-on-failure' });

async function openLibrary(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(({ cover }) => {
    const api = (window as any).omicomic;
    const getAppData = api.getAppData;
    api.getAppData = async () => {
      const result = await getAppData();
      result.data.resourceMeta['folder:/comics/Book'] = {
        resourceKey: 'folder:/comics/Book', sourcePath: '/comics/Book', sourceType: 'folder', title: 'Book',
        tags: ['作画参考', '人物设计', '色彩', '线稿', '构图', '收藏', '待整理', '这是一个很长的标签名称需要在浮层中完整显示'],
        note: '', updatedAt: 1,
      };
      result.data.resourceMeta['folder:/comics/Parent'] = {
        resourceKey: 'folder:/comics/Parent', sourcePath: '/comics/Parent', sourceType: 'folder', title: 'Parent',
        tags: ['米神'], note: '', updatedAt: 1,
      };
      return result;
    };
    const portrait = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="640"><rect width="240" height="640" fill="#9eacbc"/><path d="M0 200 240 480V640H0Z" fill="#4f647c"/></svg>');
    api.getThumbnail = async ({ path }: { path: string }) => ({ ok: true, data: { url: path.endsWith('/Parent') ? portrait : cover } });
    api.updateSettings = async (settings: any) => ({ ok: true, data: settings });
    api.addFavorite = async (input: any) => ({ ok: true, data: { ...input, addedAt: 1, updatedAt: 1 } });
    const listDirectory = api.listDirectory;
    api.listDirectory = async (path: string) => {
      if ((window as any).__holdDirectory) {
        await new Promise<void>(resolve => { (window as any).__releaseDirectory = resolve; });
      }
      return listDirectory(path);
    };
  }, { cover: 'data:image/webp;base64,' + readFileSync('src/assets/home-scene.webp').toString('base64') });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await expect.poll(() => page.locator('.resource-preview img').evaluateAll(images => images.length >= 2 && images.slice(0, 2).every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

test('cover tags fit all card sizes and retain hidden tags and independent actions', async ({ page }) => {
  await openLibrary(page);
  const book = page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) });
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [scale, size] of [[40, 'small'], [55, 'small'], [75, 'medium'], [100, 'large']] as const) {
      await page.locator('.view-options-menu > summary').click();
      await setCardScale(page.getByRole('slider', { name: '缩略图大小', exact: true }), scale);
      await page.locator('.view-options-menu > summary').click();
      await expect(page.locator('.resource-list')).toHaveClass(new RegExp(`size-${size}`));
      const row = book.locator('.preview-tag-row');
      const more = row.getByRole('button', { name: /^显示其余/ });
      await expect.poll(async () => {
        return row.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          const chips = Array.from(element.querySelectorAll<HTMLElement>(':scope > .preview-tag-chip'));
          return chips.flatMap(chip => {
            const box = chip.getBoundingClientRect();
            const fits = box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;
            return fits ? [] : [{ text: chip.textContent, row: bounds.toJSON(), chip: box.toJSON() }];
          });
        });
      }).toEqual([]);
      const visible = await row.locator(':scope > .preview-tag-chip:not(.preview-tag-more)').count();
      // 最密档在窄窗口可将全部标签收入浮层，但入口必须完整可见且可操作。
      if (width === 1440 || scale === 100) expect(visible).toBeGreaterThan(0);
      await expect(more).toHaveText(`+${8 - visible}`);
      expect(await more.evaluate(element => element.scrollWidth <= element.clientWidth), 'hidden tag count stays readable').toBe(true);
      const tagBounds = (await row.boundingBox())!;
      const favoriteBounds = (await book.locator('.favorite-button').boundingBox())!;
      expect(tagBounds.x + tagBounds.width).toBeLessThan(favoriteBounds.x);
      const covers = await page.locator('.resource-card').filter({ has: page.locator('.preview-tag-row') }).evaluateAll(cards => cards.map(card => {
        const cover = card.querySelector('.resource-preview')!.getBoundingClientRect();
        const image = card.querySelector('.resource-preview img')!.getBoundingClientRect();
        const tag = card.querySelector('.preview-tag-row > .preview-tag-chip')!.getBoundingClientRect();
        const favorite = card.querySelector('.favorite-button')!.getBoundingClientRect();
        const glass = Array.from(card.querySelectorAll('.preview-tag-row > .preview-tag-chip, .favorite-button, .resource-info-button')).map(element => {
          const style = getComputedStyle(element);
          return [style.backgroundColor, style.backgroundImage, style.borderColor, style.backdropFilter, style.opacity, style.boxShadow];
        });
        return { imageWidth: image.width, imageHeight: image.height, coverWidth: cover.width, coverHeight: cover.height, tagBottomGap: cover.bottom - tag.bottom, bottomDifference: tag.bottom - favorite.bottom, glass };
      }));
      for (const cover of covers) {
        expect(cover.imageWidth).toBeCloseTo(cover.coverWidth, 1);
        expect(cover.imageHeight).toBeCloseTo(cover.coverHeight, 1);
        expect(cover.tagBottomGap).toBeCloseTo(covers[0].tagBottomGap, 1);
        expect(cover.bottomDifference).toBeCloseTo(0, 1);
        for (const surface of cover.glass) expect(surface).toEqual(cover.glass[0]);
      }
      await more.focus();
      await page.keyboard.press('Space');
      const popover = page.getByRole('dialog', { name: '隐藏标签列表' });
      await expect(popover.locator('.preview-tag-popover-chip')).toHaveCount(8 - visible);
      await expect(popover).toContainText('这是一个很长的标签名称需要在浮层中完整显示');
      await popover.dispatchEvent('wheel', { deltaY: 20 });
      await expect(popover).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await more.dblclick();
      await expect(popover).toBeVisible();
      await expect(page.locator('.reader-layout')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await more.evaluate(element => (element as HTMLElement).blur());
      await page.mouse.move(220, 45);
      await page.screenshot({ path: `test-results/library-polish-${width}-${scale}.png` });
    }
  }
  const parent = page.locator('.resource-card').filter({ hasText: 'Parent' });
  await expect(parent.locator('.preview-tag-row > .preview-tag-chip')).toHaveText('米神');
  await expect(page.locator('.resource-card').filter({ hasText: 'page0.png' }).locator('.preview-tag-row')).toHaveCount(0);
  await book.getByRole('button', { name: '收藏', exact: true }).press('Space');
  await expect(book.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await book.getByRole('button', { name: '取消收藏', exact: true }).press('Enter');
  await expect(book.getByRole('button', { name: '收藏', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await book.getByRole('button', { name: '打开资源信息', exact: true }).click();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await expect(page.locator('.reader-layout')).toHaveCount(0);
});

test('simulated cover glass stays consistent over bright, dark and colored covers', async ({ page }) => {
  await openLibrary(page);
  await page.mouse.move(220, 45);
  const preview = await page.locator('.resource-preview').evaluateAll(covers => {
    const first = covers[0].getBoundingClientRect();
    const second = covers[1].getBoundingClientRect();
    return { x: first.left - 10, y: first.bottom - 160, width: second.right - first.left + 20, height: 206 };
  });
  await page.screenshot({ path: 'test-results/simulated-glass-preview.png', clip: preview });
  // 封面使用暖橙/冷蓝和纯白/纯黑区域，验证仿玻璃不会再受底图染色。
  await page.locator('.resource-card').filter({ has: page.locator('.preview-tag-row') }).evaluateAll(cards => {
    cards.forEach((card, index) => {
      const cover = card.querySelector('.resource-preview')!.getBoundingClientRect();
      const more = card.querySelector('.resource-info-button')!.getBoundingClientRect();
      const favorite = card.querySelector('.favorite-button')!.getBoundingClientRect();
      const split = (more.bottom + favorite.top) / 2 - cover.top;
      const upper = index === 0 ? '#de7044' : '#ffffff';
      const lower = index === 0 ? '#426eb4' : '#000000';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cover.width}" height="${cover.height}"><rect width="100%" height="100%" fill="${upper}"/><rect y="${split}" width="100%" height="${cover.height}" fill="${lower}"/></svg>`;
      card.querySelector('img')!.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    });
  });
  await expect.poll(() => page.locator('.resource-preview img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete))).toBe(true);
  const controls = page.locator('.resource-card').filter({ has: page.locator('.preview-tag-row') })
    .locator('.preview-tag-row > .preview-tag-chip:first-child, .resource-info-button, .favorite-button');
  const samples = await controls.evaluateAll(items => items.map(item => {
    const bounds = item.getBoundingClientRect();
    return { x: Math.round(bounds.left + 4), y: Math.round(bounds.top + bounds.height / 2) };
  }));
  for (const theme of ['mist', 'nord', 'sand', 'night']) {
    await page.evaluate(theme => { document.documentElement.dataset.colorTheme = theme; }, theme);
    const screenshot = await page.screenshot({ path: `test-results/simulated-glass-${theme}.png` });
    // Sample the painted browser pixels rather than just equal CSS values.
    const pixels = await page.evaluate(async ({ png, samples }) => {
      const image = new Image();
      image.src = 'data:image/png;base64,' + png;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return samples.map(({ x, y }) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3));
    }, { png: screenshot.toString('base64'), samples });
    const range = [0, 1, 2].map(channel => Math.max(...pixels.map(pixel => pixel[channel])) - Math.min(...pixels.map(pixel => pixel[channel])));
    expect(Math.max(...range), `${theme}: rendered colors ${JSON.stringify(pixels)}`).toBeLessThanOrEqual(6);
    await test.info().attach(`simulated-glass-${theme}`, { body: JSON.stringify({ pixels, maxChannelDifference: Math.max(...range) }), contentType: 'application/json' });
    for (const button of ['.favorite-button', '.resource-info-button', '.preview-tag-more']) {
      const control = page.locator('.resource-card').filter({ has: page.locator('.preview-tag-row') }).locator(button).first();
      const readMaterial = (element: Element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.backgroundImage, style.borderColor];
      };
      const restingBackground = await control.evaluate(readMaterial);
      await control.hover();
      await expect.poll(() => control.evaluate(readMaterial)).toEqual(restingBackground);
      await page.mouse.down();
      expect(await control.evaluate(readMaterial)).toEqual(restingBackground);
      await page.mouse.move(220, 45);
      await page.mouse.up();
    }
  }
});

test('grouped directory navigation preserves history, parent navigation and refresh busy feedback', async ({ page }) => {
  await openLibrary(page);
  const navigation = page.getByRole('group', { name: '目录导航' });
  const back = navigation.getByRole('button', { name: '返回', exact: true });
  const forward = navigation.getByRole('button', { name: '前进', exact: true });
  const up = navigation.getByRole('button', { name: '上一级', exact: true });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  await expect(up).toBeDisabled();
  await page.locator('.resource-card').filter({ hasText: 'Parent' }).dblclick();
  await expect(page.locator('.resource-card')).toHaveCount(1);
  await expect(back).toBeEnabled();
  await expect(up).toBeEnabled();
  await back.click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(page.locator('.resource-card')).toHaveCount(1);
  await up.click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await page.evaluate(() => { (window as any).__holdDirectory = true; });
  const refresh = navigation.getByRole('button', { name: '刷新并检测失效资源' });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(refresh).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseDirectory)).toBe('function');
  await page.evaluate(() => { (window as any).__holdDirectory = false; (window as any).__releaseDirectory(); });
  await expect(refresh).toBeEnabled();
  await expect(refresh).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.resource-card')).toHaveCount(10);
});
