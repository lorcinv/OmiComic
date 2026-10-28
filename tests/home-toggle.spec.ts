import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function openSettings(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: '显示选项', exact: true }).click();
    await page.getByRole('button', { name: '应用设置', exact: true }).click();
    await page.getByRole('button', { name: /外观与主题/ }).click();
  } else {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('#settings-category-appearance').click();
  }
}

async function closeSettings(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: '返回设置', exact: true }).click();
    await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  } else await page.keyboard.press('Escape');
}

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'PC'} home opt-out persists, starts directly and keeps root navigation usable`, async ({ page }) => {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 4 });
  await page.addInitScript(async () => {
    const api = window.omicomic, seed = await api.getAppData();
    if (!seed.ok) throw new Error('Missing fixture');
    const savedFlag = localStorage.getItem('test-home-flag');
    if (savedFlag !== null) seed.data.settings.showHomePage = savedFlag === 'on';
    const stats = (window as any).__homeToggle = { reads: 0, directories: 0, homeCovers: 0, everHome: false, minimized: 0, flags: [] as boolean[], began: performance.now() };
    const getData = api.getAppData, list = api.listDirectory, cover = api.getThumbnail, save = api.updateSettings;
    api.getAppData = async () => { stats.reads++; return getData(); };
    api.listDirectory = async path => { stats.directories++; return list(path); };
    api.getThumbnail = async input => { if (/\/(First|Second|Third|Fourth)$/.test(input.path)) stats.homeCovers++; return cover(input); };
    api.updateSettings = async input => {
      const result = await save(input);
      if (result.ok && input.showHomePage !== undefined) { localStorage.setItem('test-home-flag', input.showHomePage ? 'on' : 'off'); stats.flags.push(input.showHomePage); }
      return result;
    };
    api.minimizeWindow = async () => { stats.minimized++; return { ok: true, data: null }; };
    new MutationObserver(() => { if (document.querySelector('.omi-home')) stats.everHome = true; }).observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(mobile ? 4 : 3);
  expect(await page.evaluate(() => (window as any).__homeToggle.reads)).toBe(1);
  await page.getByRole('button', { name: '打开资源库', exact: true }).first().click();
  await expect(page.locator('.page-panel.is-visible .resource-card').first()).toBeVisible();
  await openSettings(page, mobile);
  const checkbox = page.getByRole('checkbox', { name: '显示主界面', exact: true });
  await expect(checkbox).toBeChecked(); await checkbox.uncheck();
  await expect.poll(() => page.evaluate(() => (window as any).__homeToggle.flags)).toEqual([false]);
  await closeSettings(page, mobile);
  await page.reload();
  await expect(page.locator('.page-panel.is-visible .resource-card').first()).toBeVisible();
  const startup = await page.evaluate(() => ({ ...(window as any).__homeToggle, readyMs: performance.now() - (window as any).__homeToggle.began }));
  expect(startup.reads).toBe(1); expect(startup.directories).toBe(1); expect(startup.homeCovers).toBe(0); expect(startup.everHome).toBe(false);
  await expect(page.locator('.omi-home')).toHaveCount(0);
  if (mobile) {
    await page.evaluate(() => window.dispatchEvent(new Event('omi-back', { cancelable: true })));
    expect(await page.evaluate(() => (window as any).__homeToggle.minimized)).toBe(1);
  } else await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.omi-home')).toHaveCount(0);
  await openSettings(page, mobile); await checkbox.check();
  await expect.poll(() => page.evaluate(() => (window as any).__homeToggle.flags)).toEqual([true]);
  await page.screenshot({ path: `output/implementation-1145/home-toggle-${mobile ? 'mobile' : 'pc'}.png` });
  await closeSettings(page, mobile);
  if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-back', { cancelable: true })));
  else await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.omi-home__book')).toHaveCount(mobile ? 4 : 3);
  if (mobile) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: /外观与主题/ }).click();
    await checkbox.uncheck();
    await expect.poll(() => page.evaluate(() => (window as any).__homeToggle.flags)).toEqual([true,false]);
    await closeSettings(page, mobile);
    await expect(page.locator('.page-panel.is-visible .resource-card').first()).toBeVisible();
    await openSettings(page, mobile);
    await expect(checkbox).not.toBeChecked();
  }
  await test.info().attach('direct-startup', { body: JSON.stringify(startup), contentType: 'application/json' });
});
