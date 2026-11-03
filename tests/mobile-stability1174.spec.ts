import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seed(page: Page) {
  await page.addInitScript(async install => {
    eval('(' + install + ')')({ count: 240 });
    const api = window.omicomic, result = await api.getAppData();
    if (!result.ok) throw Error('Missing fixture');
    const data = result.data;
    data.settings.showHomePage = false;
    data.settings.mobileReaderAutoHide = false;
    const list = api.listDirectory;
    api.listDirectory = async path => path === '/comics/Parent' ? { ok: true, data: {
      path, parentPath: '/comics', items: Array.from({ length: 240 }, (_, i) => ({
        id: 'nested' + i, name: `nested${String(i).padStart(3, '0')}.png`, path: `${path}/nested${i}.png`, type: 'image', extension: 'png',
      })), total: 240,
    } } : list(path);
    data.bookshelves = [{ id: 'c', name: '分类', sortIndex: 0, createdAt: 1, updatedAt: 1 }];
    data.virtualFolders = [{ id: 's', name: 'Shelf', bookshelfId: 'c', sortIndex: 0, createdAt: 1, updatedAt: 1, note: '', tags: [],
      items: Array.from({ length: 240 }, (_, i) => ({ id: 'v' + i, folderId: 's', resourceKey: 'image:' + i,
        sourcePath: `/shelf/${i}.png`, sourceType: 'image', title: `Shelf image ${String(i).padStart(3, '0')}`, sortIndex: i, addedAt: 1 })),
    }];
    api.updateLibraryState = async input => { Object.assign(data.library, input); return { ok: true, data: null }; };
  }, installMock.toString());
  await page.goto('/');
}

test.describe('phone stable entry and folder navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('directory re-entry starts at the top and folder transitions keep their size', async ({ page }) => {
    await seed(page);
    const parent = page.locator('.mobile-resource-card').filter({ has: page.locator('strong', { hasText: /^Parent$/ }) });
    const body = page.locator('.page-panel.is-visible .resource-list-scroll');
    for (let pass = 0; pass < 2; pass++) {
      await parent.tap();
      await expect(page.locator('.mobile-resource-card').first()).toContainText('nested000');
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeLessThan(1);
      await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
      await body.evaluate(el => { el.scrollTop = 2400; });
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(2350);
      await page.evaluate(() => window.dispatchEvent(new Event('omi-back')));
      await expect(parent).toBeVisible();
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeLessThan(1);
      await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
    }
    // Inspect the actual pseudo-element animations at an intermediate frame.
    const transforms = await page.evaluate(async () => {
      const { mobileNavigate } = await import('/src/hooks/mobileNavigation.ts');
      const navigation = mobileNavigate(() => {}, 'folder');
      await new Promise<void>(resolve => {
        const frame = () => {
          const animations = document.getAnimations().filter(animation => (animation.effect as KeyframeEffect)?.pseudoElement?.startsWith('::view-transition-'));
          if (!animations.length) { requestAnimationFrame(frame); return; }
          resolve();
        };
        requestAnimationFrame(frame);
      });
      const values = document.getAnimations().flatMap(animation => {
        const effect = animation.effect as KeyframeEffect;
        if (!effect?.pseudoElement?.startsWith('::view-transition-')) return [];
        return effect.getKeyframes().map(frame => String(frame.transform ?? 'none'));
      });
      await navigation;
      return values;
    });
    expect(transforms.length).toBeGreaterThan(0);
    expect(transforms.every(value => !/scale\(/.test(value))).toBe(true);
  });

  test('reopening a bookshelf folder starts at its first row', async ({ page }) => {
    await seed(page);
    await page.locator('.sidebar-primary-nav .sidebar-item').filter({ has: page.locator('span', { hasText: /^书架$/ }) }).click();
    const shelf = page.locator('.mobile-bookshelf-card').filter({ has: page.locator('strong', { hasText: /^Shelf$/ }) });
    for (let pass = 0; pass < 2; pass++) {
      await shelf.tap();
      const body = page.locator('.page-panel.is-visible .resource-list-scroll');
      await expect(page.locator('.mobile-resource-card').first()).toContainText('Shelf image 000');
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeLessThan(1);
      await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
      await body.evaluate(el => { el.scrollTop = 2000; });
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(1950);
      await page.evaluate(() => window.dispatchEvent(new Event('omi-back')));
      await expect(shelf).toBeVisible();
      await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
    }
  });

  test('progress rail stays unlit and still seeks by dragging', async ({ page }) => {
    await seed(page);
    await page.locator('.mobile-resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) }).tap();
    const reader = page.locator('.reader-layout');
    await expect(reader).toHaveAttribute('aria-busy', 'false');
    if (!(await reader.getAttribute('class'))?.includes('is-mobile-chrome-visible')) await page.locator('.reader-stage').tap();
    await expect(reader).toHaveClass(/is-mobile-chrome-visible/);
    const rail = page.getByRole('slider', { name: '阅读进度' });
    const box = (await rail.boundingBox())!;
    await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .55, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(100);
    await rail.focus();
    expect(await rail.evaluate(el => { const style = getComputedStyle(el); return { outline: style.outlineStyle, highlight: style.webkitTapHighlightColor }; }))
      .toEqual({ outline: 'none', highlight: 'rgba(0, 0, 0, 0)' });
  });
});
