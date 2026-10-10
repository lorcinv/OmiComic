import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installMock } from './mock';

async function openThemeSettings(page: Page) {
  await page.locator('.sidebar-settings-button').click();
  await page.getByRole('tab', { name: /外观与主题/ }).click();
  await expect(page.getByRole('radiogroup', { name: '主题配色' })).toBeVisible();
}

test('themes preview globally, persist after reload and keep light and dark controls usable', async ({ page }) => {
  test.setTimeout(60000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(({ cover }) => {
    const api = (window as any).omicomic;
    const getAppData = api.getAppData;
    api.getAppData = async () => {
      const result = await getAppData();
      const stored = sessionStorage.getItem('theme-test-settings');
      if (stored) result.data.settings = { ...result.data.settings, ...JSON.parse(stored) };
      result.data.resourceMeta['folder:/comics/Book'] = {
        resourceKey: 'folder:/comics/Book', sourcePath: '/comics/Book', sourceType: 'folder', title: 'Book',
        tags: ['作画参考', '人物设计'], note: '', updatedAt: 1,
      };
      return result;
    };
    api.updateSettings = async (settings: any) => {
      sessionStorage.setItem('theme-test-settings', JSON.stringify(settings));
      return { ok: true, data: settings };
    };
    api.getThumbnail = async () => ({ ok: true, data: { url: cover } });
  }, { cover: 'data:image/webp;base64,' + readFileSync('src/assets/home-scene.webp').toString('base64') });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await openThemeSettings(page);
  await expect(page.getByRole('radio', { name: '经典雾灰', exact: true })).toBeChecked();
  await expect(page.getByRole('radio')).toHaveCount(4);

  for (const [id, name, background] of [
    ['nord', '北境雾蓝', 'rgb(236, 239, 244)'],
    ['sand', '暖砂', 'rgb(242, 240, 231)'],
    ['night', '暮夜灰', 'rgb(46, 52, 64)'],
    ['mist', '经典雾灰', 'rgb(241, 243, 246)'],
  ]) {
    await page.locator('.theme-option').filter({ has: page.getByRole('radio', { name, exact: true }) }).click();
    await expect(page.getByRole('radio', { name, exact: true })).toBeChecked();
    await expect(page.locator('html')).toHaveAttribute('data-color-theme', id);
    await expect(page.locator('html')).toHaveCSS('color-scheme', id === 'night' ? 'dark' : 'light');
    await expect(page.locator('.app-shell')).toHaveCSS('background-color', background);
    await page.screenshot({ path: `test-results/theme-${id}-settings.png` });
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
    const cover = page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) });
    await expect(cover.locator('.preview-tag-chip').first()).toBeVisible();
    const appearance = await cover.evaluate(card => {
      const items = ['.preview-tag-chip', '.favorite-button', '.resource-info-button'].map(selector => card.querySelector(selector)!);
      return items.map(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, gradient: style.backgroundImage, border: style.borderColor, filter: style.backdropFilter, shadow: style.boxShadow, bottom: element.getBoundingClientRect().bottom };
      });
    });
    expect(appearance[0]).toEqual(appearance[1]);
    expect(appearance[2].background).toEqual(appearance[0].background);
    expect(appearance[2].gradient).toEqual(appearance[0].gradient);
    expect(appearance[2].shadow).toBe('none');
    await expect(page.locator('.add-library-button')).toHaveCSS('box-shadow', 'none');
    const addButton = await page.locator('.add-library-button').evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, text: style.color, radius: style.borderRadius };
    });
    const channels = addButton.background.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(channels.every(value => id === 'night' ? value >= 40 && value <= 90 : value >= 220)).toBe(true);
    expect(addButton.radius).toBe('9px');
    await page.screenshot({ path: `test-results/theme-${id}-library.png` });
    if (id === 'night') {
      await expect(page.locator('.sidebar-item.is-active')).toHaveCSS('background-color', 'rgb(54, 62, 76)');
      await expect(page.locator('.sidebar-item.is-active')).toHaveCSS('color', 'rgb(229, 233, 240)');
      await page.locator('.view-options-menu > summary').click();
      await expect(page.locator('.view-options-popover')).toBeVisible();
      await page.screenshot({ path: 'test-results/theme-night-menu.png' });
      await page.locator('.view-options-menu > summary').click();
      await cover.getByRole('button', { name: '打开资源信息', exact: true }).click();
      await expect(page.locator('.resource-detail-intro h2')).toHaveCSS('color', 'rgb(229, 233, 240)');
      await expect(page.locator('.resource-detail-intro h2')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.resource-detail-read-button')).toHaveCSS('color', 'rgb(46, 52, 64)');
      await expect(page.locator('.resource-detail-read-button')).toHaveCSS('background-color', 'rgb(136, 192, 208)');
      expect(await page.locator('.resource-detail-cover').evaluate(element => element.getBoundingClientRect().width)).toBeLessThan(350);
      await page.screenshot({ path: 'test-results/theme-night-detail.png' });
      await page.locator('.resource-detail-back').click();
    }

    await page.locator('.page-panel.is-visible .brand-home-button').click();
    await expect(page.locator('.omi-home')).toHaveCSS('background-color', background);
    await page.screenshot({ path: `test-results/theme-${id}-home.png` });
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await cover.dblclick();
    await expect(page.locator('.reader-layout')).toBeVisible();
    const readerColors = await page.locator('.reader-layout').evaluate(element => {
      const style = getComputedStyle(element);
      const sample = document.createElement('span');
      sample.style.backgroundColor = style.getPropertyValue('--阅读背景');
      element.append(sample);
      const expected = getComputedStyle(sample).backgroundColor;
      sample.remove();
      return { actual: style.backgroundColor, expected };
    });
    expect(readerColors.actual).toBe(readerColors.expected);
    if (id === 'night') {
      await expect(page.locator('.reader-page-jump input')).toHaveCSS('background-color', 'rgb(54, 62, 76)');
      await expect(page.locator('.reader-page-jump input')).toHaveCSS('color', 'rgb(229, 233, 240)');
      await expect(page.locator('.reader-zoom-actions button.is-active').first()).toHaveCSS('color', 'rgb(46, 52, 64)');
      await page.screenshot({ path: 'test-results/theme-night-reader.png' });
    }
    await page.locator('.reader-back').click();
    await openThemeSettings(page);
  }

  await page.getByRole('radio', { name: '经典雾灰', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '北境雾蓝', exact: true })).toBeChecked();
  await page.setViewportSize({ width: 960, height: 640 });
  await page.getByRole('radio', { name: '暮夜灰', exact: true }).check();
  await expect(page.locator('.theme-option').last()).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'test-results/theme-settings-compact.png' });
  expect(await page.locator('.settings-window').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'night');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await openThemeSettings(page);
  await expect(page.getByRole('radio', { name: '暮夜灰', exact: true })).toBeChecked();
});
