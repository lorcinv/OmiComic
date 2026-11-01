import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test('mobile home loads settings on demand and keeps settings usable on reentry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 4 });
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto('/');
  const settings = page.getByRole('navigation', { name: '首页导航' }).getByRole('button', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  expect(requested.filter(url => /\/(?:MobileSettings|BookReaderSettings|UserGuide)\.tsx/.test(url))).toEqual([]);
  await settings.click();
  await expect(page.locator('.mobile-settings-surface')).toBeVisible();
  await page.getByRole('button', { name: /默认阅读/ }).click();
  await expect(page.getByRole('checkbox', { name: '默认开启全景连环画模式', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '返回设置', exact: true }).click();
  await page.getByRole('button', { name: /外观与主题/ }).click();
  const home = page.getByRole('checkbox', { name: '显示主界面', exact: true });
  await expect(home).toBeChecked();
  await page.getByRole('button', { name: '返回设置', exact: true }).click();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await expect(page.locator('.mobile-settings-surface')).toHaveCount(0);
  await settings.click();
  await expect(page.getByRole('button', { name: /关于 OmiComic/ })).toBeVisible();
  expect(requested.some(url => /\/UserGuide\.tsx/.test(url))).toBe(true);
});
