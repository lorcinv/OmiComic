import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { writeFileSync } from 'node:fs';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const back = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('omi-back')));
const book = (page: Page) => page.locator('.page-panel.is-visible .mobile-resource-card').filter({ has: page.getByText('Book', { exact: true }) });
async function setup(page: Page) {
  await page.addInitScript(installMock, { count: 12 });
  await page.addInitScript(() => {
    const original = document.startViewTransition?.bind(document);
    (window as any).__moves = [];
    if (original) document.startViewTransition = ((update: any) => {
      (window as any).__moves.push(document.documentElement.dataset.mobileNavigation);
      return original(update);
    }) as typeof document.startViewTransition;
  });
  await page.goto('/');
  await expect(page.locator('.omi-home__book').first()).toBeVisible();
}
async function library(page: Page) {
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(book(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mobileNavigation ?? '')).toBe('');
}

test('home tap never inserts a hover/continue overlay or dims the cover while opening', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const original = window.omicomic.getResourcePages;
    window.omicomic.getResourcePages = async input => {
      await new Promise<void>(resolve => (window as any).__releaseBook = resolve);
      return original(input);
    };
    (window as any).__coverActions = 0;
    new MutationObserver(() => { if (document.querySelector('.omi-home__cover-action')) (window as any).__coverActions++; }).observe(document.querySelector('.omi-home')!, { subtree: true, childList: true });
  });
  const card = page.locator('.omi-home__book').first();
  await card.tap();
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.omi-home__cover-action')).toHaveCount(0);
  expect(await card.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  expect(await page.evaluate(() => (window as any).__coverActions)).toBe(0);
  await page.screenshot({ path: 'test-results/mobile1113-home-tap.png' });
  await page.evaluate(() => (window as any).__releaseBook());
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
});

test('home long press displays continue without opening and movement cancels a pending hold', async ({ page }) => {
  await setup(page);
  const card = page.locator('.omi-home__book').first();
  await card.dispatchEvent('pointerdown', { button: 0, clientX: 80, clientY: 200, pointerType: 'touch' });
  await expect(card.locator('.omi-home__cover-action')).toBeVisible();
  await card.dispatchEvent('pointerup');
  await card.dispatchEvent('click');
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toHaveCount(0);
  await page.locator('.omi-home__section-label').tap();
  await expect(card.locator('.omi-home__cover-action')).toHaveCount(0);
  await card.dispatchEvent('pointerdown', { button: 0, clientX: 80, clientY: 200, pointerType: 'touch' });
  await card.dispatchEvent('pointermove', { clientX: 80, clientY: 230, pointerType: 'touch' });
  await page.waitForTimeout(500);
  await expect(card.locator('.omi-home__cover-action')).toHaveCount(0);
  await card.dispatchEvent('pointercancel');
});

test('bottom tabs follow their visual order while folders and details have distinct reversible transitions', async ({ page }) => {
  await setup(page); await library(page);
  const nav = page.getByRole('navigation', { name: '主导航' });
  await expect(nav.locator('[aria-current="page"]')).toHaveText('资源库');
  await nav.getByRole('button', { name: '书架', exact: true }).click();
  await expect(nav.getByRole('button', { name: '书架', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: '最近阅读', exact: true }).click();
  await expect(nav.getByRole('button', { name: '最近阅读', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(nav.getByRole('button', { name: '收藏', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('button', { name: '资源库', exact: true }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveText('资源库');
  await expect(book(page)).toBeVisible();
  await page.locator('.mobile-resource-card').filter({ has: page.getByText('Parent', { exact: true }) }).click();
  await expect(page.getByText('Nested', { exact: true })).toBeVisible();
  await back(page); await expect(book(page)).toBeVisible();
  await book(page).getByRole('button', { name: '打开资源信息' }).click();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await back(page); await expect(book(page)).toBeVisible();
  const moves = await page.evaluate(() => (window as any).__moves as string[]);
  expect(moves.filter(value => value.startsWith('tab-'))).toEqual(['tab-next', 'tab-next', 'tab-prev', 'tab-prev']);
  expect(moves.filter(value => value === 'folder')).toHaveLength(2);
  expect(moves).toContain('detail'); expect(moves).toContain('detail-back');
});

test('recent long press exposes a centered folder SVG and opens its parent directory', async ({ page }) => {
  await setup(page); await library(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '最近阅读', exact: true }).click();
  const card = page.locator('.page-panel.is-visible .mobile-resource-card').filter({ has: page.getByText('First', { exact: true }) });
  await expect(card).toBeVisible();
  await card.dispatchEvent('pointerdown', { button: 0, clientX: 80, clientY: 180, pointerType: 'touch' });
  const openPath = page.getByRole('button', { name: '打开路径', exact: true });
  await expect(openPath).toBeVisible(); await card.dispatchEvent('pointerup');
  const bounds = await openPath.locator('svg path').evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });
  expect(Math.abs(bounds.x - 12)).toBeLessThan(.6); expect(Math.abs(bounds.y - 12)).toBeLessThan(.6);
  await page.screenshot({ path: 'test-results/mobile1113-open-path.png' });
  await openPath.click();
  await expect(book(page)).toBeVisible();
  await expect(page.locator('.mobile-action-bar')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资源库', exact: true })).toHaveClass(/is-active/);
});

test('open path does not try to enumerate the parent of an Android single-file grant', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const result = await window.omicomic.getAppData();
    if (result.ok) result.data.recentOpened[0] = { ...result.data.recentOpened[0], sourcePath: '/local/123456789abcdef0/First.zip', sourceType: 'archive', resourceKey: 'archive:/local/123456789abcdef0/First.zip' };
    const list = window.omicomic.listDirectory;
    (window as any).__listed = [];
    window.omicomic.listDirectory = async path => { (window as any).__listed.push(path); return list(path); };
  });
  await library(page);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '最近阅读', exact: true }).click();
  const card = page.locator('.page-panel.is-visible .mobile-resource-card').filter({ has: page.getByText('First', { exact: true }) });
  await expect(card).toBeVisible(); await card.dispatchEvent('contextmenu');
  await page.getByRole('button', { name: '打开路径', exact: true }).click();
  await expect(page.getByText('这个文件通过单独授权打开，尚未授权所在目录。请先在资源库添加所在目录。', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__listed)).not.toContain('/local/123456789abcdef0');
  await expect(card).toBeVisible();
});

test('tapping the current tab cancels an older tab capture that has not committed', async ({ page }) => {
  await setup(page); await library(page);
  await page.evaluate(() => {
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: () => Promise<void>) => {
      document.startViewTransition = original;
      return original(async () => { await new Promise<void>(resolve => (window as any).__releaseTab = resolve); await update(); });
    }) as typeof document.startViewTransition;
  });
  const nav = page.getByRole('navigation', { name: '主导航' });
  await nav.getByRole('button', { name: '书架', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseTab)).toBe('function');
  await nav.getByRole('button', { name: '资源库', exact: true }).dispatchEvent('click');
  await page.evaluate(() => (window as any).__releaseTab());
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mobileNavigation ?? '')).toBe('');
  await expect(book(page)).toBeVisible();
  await expect(nav.getByRole('button', { name: '资源库', exact: true })).toHaveClass(/is-active/);
});

test('detail cover, folder and tab transitions retain visual content at their actual midpoint', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 900;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#8093ab'; ctx.fillRect(0, 0, 600, 900);
    ctx.fillStyle = '#d9e1e9'; ctx.fillRect(30, 30, 540, 840);
    ctx.fillStyle = '#46627e'; ctx.fillRect(75, 90, 450, 500);
    ctx.fillStyle = '#f0eee9'; ctx.font = 'bold 120px sans-serif'; ctx.fillText('OMI', 170, 365);
    ctx.fillStyle = '#46627e'; ctx.font = '50px sans-serif'; ctx.fillText('01', 265, 760);
    const url = canvas.toDataURL(); window.omicomic.getThumbnail = async () => ({ ok: true, data: { url } });
  });
  await library(page);
  const frames: unknown[] = [];
  async function midpoint(name: string, action: () => Promise<unknown>) {
    await page.evaluate(() => {
      const original = document.startViewTransition.bind(document);
      (window as any).__midpointReady = false;
      document.startViewTransition = ((update: () => Promise<void>) => {
        document.startViewTransition = original;
        const transition = original(update);
        transition.ready.then(() => {
          const animations = document.getAnimations();
          for (const animation of animations) { animation.pause(); animation.currentTime = Number(animation.effect?.getComputedTiming().duration ?? 0) / 2; }
          (window as any).__midpointAnimations = animations;
          (window as any).__midpointReady = true;
        });
        return transition;
      }) as typeof document.startViewTransition;
    });
    await action();
    await expect.poll(() => page.evaluate(() => (window as any).__midpointReady)).toBe(true);
    frames.push(await page.evaluate(() => ({ direction: document.documentElement.dataset.mobileNavigation,
      animations: ((window as any).__midpointAnimations as Animation[]).map(animation => ({ name: (animation as CSSAnimation).animationName, keyframes: animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : [] })) })));
    await page.screenshot({ path: `test-results/mobile1113-${name}-midpoint.png` });
    await page.evaluate(() => { for (const animation of (window as any).__midpointAnimations as Animation[]) animation.play(); });
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mobileNavigation ?? '')).toBe('');
  }
  await midpoint('detail', () => book(page).getByRole('button', { name: '打开资源信息' }).click());
  await midpoint('detail-back', () => back(page));
  await midpoint('folder', () => page.locator('.mobile-resource-card').filter({ has: page.getByText('Parent', { exact: true }) }).click());
  await back(page); await expect(book(page)).toBeVisible();
  await midpoint('tab-next', () => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '最近阅读', exact: true }).click());
  await midpoint('tab-prev', () => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资源库', exact: true }).click());
  expect(JSON.stringify(frames[0])).toContain('mobile-detail-cover');
  expect(JSON.stringify(frames[3])).toContain('mobile-primary-nav');
  writeFileSync('test-results/mobile1113-transition-keyframes.json', JSON.stringify(frames, null, 2));
});

test.describe('desktop behavior stays intact', () => {
  test.use({ viewport: { width: 1440, height: 960 }, isMobile: false, hasTouch: false });
  test('homepage still offers its existing hover continue affordance', async ({ page }) => {
    await setup(page);
    const card = page.locator('.omi-home__book').first(), overlay = card.locator('.omi-home__cover-action');
    await expect(overlay).toHaveCount(1);
    await card.hover();
    await expect(overlay).toHaveCSS('opacity', '1');
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: '主导航' }).locator('[aria-current]')).toHaveCount(0);
  });
});
