import { test, expect } from '@playwright/test';
import { installMock } from './mock';
import content from '../src/content/user-guide.json';

for (const mobile of [false, true]) test.describe(mobile ? 'mobile guide' : 'desktop guide', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  for (const [column, language] of ['zh-CN', 'en', 'ja'].entries()) test(`offline lookup and navigation in ${language}`, async ({ page }) => {
    await page.addInitScript(installMock, { count: 12 });
    await page.addInitScript(async language => { (await window.omicomic.getAppData() as any).data.settings.language = language; }, language);
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
    await page.locator('.omi-about__guide:visible').click();
    const guide = page.locator('.omi-guide:visible');
    await expect(guide).toBeVisible();
    await expect(guide.locator('h3')).toHaveText(content.ui.title[column]);
    await expect(guide.locator('.omi-guide__group')).toHaveCount(6);
    await expect(guide.locator('.omi-guide__answer:visible')).toHaveCount(0);
    await expect(guide.getByRole('button', { name: mobile ? 'Android' : 'Windows', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => document.fonts.ready);
    await page.context().setOffline(true);
    await guide.locator('#guide-start > summary').click();
    await guide.locator('#guide-start .omi-guide__topic > summary').first().click();
    await expect(guide.locator('.omi-guide__answer:visible')).toHaveCount(1);
    expect(await guide.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await guide.locator('.omi-guide__contents button').nth(3).click();
    await expect(guide.locator('#guide-shortcuts')).toHaveAttribute('open', '');
    const input = guide.getByRole('searchbox');
    await input.fill(mobile ? ['音量', 'volume', '音量'][column] : 'Ctrl');
    await expect(guide.locator('.omi-guide__answer:visible')).not.toHaveCount(0);
    await input.fill('zzq-no-matching-operation');
    await expect(guide.getByRole('status')).toHaveText(content.ui.empty[column]);
    await guide.getByRole('button', { name: content.ui.clear[column], exact: true }).click();
    await expect(guide.locator('.omi-guide__group')).toHaveCount(6);
    await guide.getByRole('button', { name: mobile ? 'Windows' : 'Android', exact: true }).click();
    await guide.locator('.omi-guide__contents button').nth(3).click();
    await expect(guide.locator('#guide-shortcuts .omi-guide__topic')).toHaveCount(mobile ? 2 : 1);
    await guide.getByRole('button', { name: mobile ? 'Android' : 'Windows', exact: true }).click();
    await expect.poll(() => guide.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    if (language === 'zh-CN') {
      await page.screenshot({ path: `test-results/guide-${mobile ? 'mobile' : 'desktop'}.png` });
      await page.evaluate(() => document.documentElement.dataset.colorTheme = 'night');
      await page.screenshot({ path: `test-results/guide-${mobile ? 'mobile' : 'desktop'}-night.png` });
    }
    if (mobile) await page.locator('.mobile-settings-page > header button').click();
    else await page.keyboard.press('Escape');
    await expect(page.locator('.omi-guide:visible')).toHaveCount(0);
    await expect(page.locator('.omi-about__guide:visible')).toBeVisible();
    if (!mobile) await expect(page.locator('.omi-about__guide:visible')).toBeFocused();
    if (mobile && language === 'zh-CN') {
      await page.locator('.omi-about__guide:visible').click();
      await page.evaluate(() => window.dispatchEvent(new Event('omi-library-back', { cancelable: true })));
      await expect(page.locator('.omi-about__guide:visible')).toBeVisible();
    }
  });
});
