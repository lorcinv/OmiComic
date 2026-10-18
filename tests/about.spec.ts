import { test, expect } from '@playwright/test';
import { installMock } from './mock';
import { version } from '../package.json';

for (const mobile of [false, true]) test.describe(mobile ? 'phone about' : 'desktop about', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  for (const language of ['zh-CN', 'en', 'ja']) test(`introduction and project link in ${language}`, async ({ page }) => {
    await page.addInitScript(installMock, { count: 12 });
    await page.addInitScript(async language => {
      const data = (await window.omicomic.getAppData() as any).data;
      data.settings.language = language;
    }, language);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (mobile) {
      await page.locator('.mobile-home-nav button').last().click();
      await page.locator('.mobile-setting-category').last().click();
    } else {
      await page.locator('.omi-home__library').click();
      await page.locator('.sidebar-settings-button').click();
      await page.locator('#settings-category-about').click();
    }
    const about = page.locator('.omi-about:visible');
    await expect(about).toContainText('OmiComic');
    await expect(about).toContainText(version);
    await expect(about.locator('.omi-about__intro')).toContainText(language === 'zh-CN' ? '本地漫画阅读器' : language === 'en' ? 'local comic reader' : 'ローカル漫画リーダー');
    await expect(about.getByRole('link')).toHaveAttribute('href', 'https://github.com/lorcinv/OmiComic');
    expect(await about.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });
});
