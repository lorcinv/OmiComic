import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function open(page: Page, theme: string, layout: 'grid' | 'list') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 4 });
  await page.addInitScript(async ({ theme, layout }) => {
    const api = window.omicomic, response = await api.getAppData();
    if (!response.ok) throw new Error('Missing test data');
    const data = response.data;
    data.settings.colorTheme = theme as any;
    data.settings.mobileViewDisplays = { directory: { layout, columns: 2, coverSize: 82 } };
    const stats = (window as any).__favoriteCorner = { added: 0, removed: 0, opened: 0 };
    api.addFavorite = async input => {
      stats.added++;
      const item = { ...input, sortIndex: 0, addedAt: 1, updatedAt: 1 };
      data.favorites.push(item); return { ok: true, data: item };
    };
    api.removeFavorite = async key => {
      stats.removed++; data.favorites = data.favorites.filter(item => item.resourceKey !== key);
      return { ok: true, data: null };
    };
    const read = api.getResourcePages, directory = api.listDirectory;
    api.getResourcePages = async input => { stats.opened++; return read(input); };
    api.listDirectory = async path => {
      const result = await directory(path);
      if (result.ok) result.data.items = result.data.items.map(item => item.name === 'Book' ? { ...item, name: 'Book ' + 'LongTitle'.repeat(18) } : item);
      return result;
    };
  }, { theme, layout });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).first().click();
  const card = page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Book / }) });
  await expect(card).toBeVisible();
  return card;
}

test.describe('mobile favorite corner', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const layout of ['grid', 'list'] as const) for (const theme of ['mist', 'nord', 'sand', 'night']) {
    test(`${layout} favorite stays at the top right and isolated from card gestures in ${theme}`, async ({ page }) => {
      const card = await open(page, theme, layout), favorite = card.locator('.mobile-card-favorite');
      const measurements = [];
      for (const width of theme === 'mist' ? [320, 390, 740] : [390]) {
        await page.setViewportSize({ width, height: 844 }); await expect(favorite).toBeVisible();
        const bounds = await card.boundingBox(), action = await favorite.boundingBox();
        expect(Math.abs(action!.y - bounds!.y - 2)).toBeLessThan(1);
        expect(Math.abs(action!.x + action!.width - bounds!.x - bounds!.width + 1)).toBeLessThan(1);
        expect(action!.height).toBe(40); expect(action!.width).toBe(40);
        if (layout === 'list') {
          const title = await card.locator('strong').boundingBox();
          expect(title!.x + title!.width).toBeLessThanOrEqual(action!.x);
          expect(await favorite.evaluate(element => element.parentElement!.classList.contains('mobile-resource-card'))).toBe(true);
        }
        measurements.push({ width, card: bounds, favorite: action });
        await page.screenshot({ path: `test-results/favorite-corner/${layout}-${theme}-${width}.png` });
      }
      await favorite.tap();
      await expect(favorite).toHaveAttribute('aria-pressed', 'true');
      const expectedColor = await page.evaluate(() => {
        const probe = document.createElement('span'); probe.style.color = 'var(--收藏色)'; document.body.append(probe);
        const color = getComputedStyle(probe).color; probe.remove(); return color;
      });
      await expect(favorite).toHaveCSS('color', expectedColor);
      await favorite.press('Enter'); await expect(favorite).toHaveAttribute('aria-pressed', 'false');
      await favorite.press('Space'); await expect(favorite).toHaveAttribute('aria-pressed', 'true');
      await favorite.dispatchEvent('pointerdown', { button: 0, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 });
      await page.waitForTimeout(500); // Cross the card's actual 450 ms hold threshold.
      await favorite.dispatchEvent('contextmenu');
      await favorite.dispatchEvent('pointerup', { button: 0, pointerId: 1, pointerType: 'touch', isPrimary: true });
      await expect(page.locator('.mobile-action-bar,.resource-detail-page,.reader-layout')).toHaveCount(0);
      expect(await page.evaluate(() => (window as any).__favoriteCorner)).toEqual({ added: 2, removed: 1, opened: 0 });
      await card.dispatchEvent('contextmenu');
      await expect(card.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
      await expect(card.locator('.mobile-card-favorite')).toHaveCount(0);
      await test.info().attach('favorite-corner-geometry', { body: JSON.stringify(measurements), contentType: 'application/json' });
    });
  }
});

test('desktop favorite keeps its existing cover corner', async ({ page }) => {
  const card = await open(page, 'mist', 'grid');
  await expect(card.locator('.mobile-card-favorite')).toHaveCount(0);
  const cover = await card.locator('.resource-preview').boundingBox(), action = await card.locator('.favorite-button').boundingBox();
  expect(action!.y).toBeGreaterThan(cover!.y + cover!.height / 2);
  expect(action!.x + action!.width).toBeLessThanOrEqual(cover!.x + cover!.width + 1);
});
