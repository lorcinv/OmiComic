import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function start(page: Page, language = 'zh-CN') {
  await page.addInitScript(installMock, { count: 16 });
  await page.addInitScript(async language => {
    const api = window.omicomic, data = await api.getAppData();
    if (data.ok) data.data.settings.language = (localStorage.getItem('language1119') ?? language) as 'en' | 'ja' | 'zh-CN';
    const update = api.updateSettings;
    api.updateSettings = async patch => { const result = await update(patch); if (result.ok && patch.language) localStorage.setItem('language1119', patch.language); return result; };
    (window as any).__directions = [];
    new MutationObserver(() => { const mode = document.documentElement.dataset.mobileNavigation; if (mode) (window as any).__directions.push(mode); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-mobile-navigation'] });
  }, language);
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(4);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

test('home settings opens directly and returns to home; reading and cache text is concise', async ({ page }) => {
  await start(page);
  await page.locator('.mobile-home-nav').getByRole('button', { name: '设置', exact: true }).tap();
  const settings = page.locator('.mobile-settings-surface');
  await expect(settings).toBeVisible();
  expect(await page.evaluate(() => (window as any).__directions)).not.toContain('home-expand');
  await expect(page.locator('.page-panel.is-visible .library-layout')).toHaveCount(0);
  await settings.getByRole('button', { name: /漫画阅读设置/ }).tap();
  await expect(settings.getByRole('slider', { name: '全景滚动速度' })).toBeVisible();
  await expect(settings.getByRole('combobox', { name: '当前漫画' })).toHaveCount(0);
  await expect(settings.locator('.settings-help')).toHaveCount(0);
  await settings.getByRole('button', { name: '返回设置' }).tap();
  await settings.getByRole('button', { name: /性能与缓存/ }).tap();
  await expect(settings.getByRole('slider', { name: '阅读图片内存缓存' })).toBeVisible();
  const hints = await settings.locator('.settings-hint').allTextContents();
  expect(hints.every(text => text.startsWith('已用：'))).toBe(true);
  await settings.getByRole('button', { name: '返回设置' }).tap();
  await settings.getByRole('button', { name: /关于 OmiComic/ }).tap();
  await expect(settings.locator('.omi-about__intro')).toContainText('离线阅读');
  await expect(settings.locator('.omi-about__github')).toHaveAttribute('href', 'https://github.com/lorcinv/OmiComic');
  await settings.getByRole('button', { name: '返回设置' }).tap();
  await settings.getByRole('button', { name: '关闭设置' }).tap();
  await expect(settings).toHaveCount(0);
  await expect(page.locator('.omi-home')).toBeVisible();
});

test('one linear scrim survives sheet replacement, nested dialogs and settings capture', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => { const data=await window.omicomic.getAppData(); if(data.ok){data.data.tagOrder=['Test tag'];data.data.resourceMeta['folder:/comics/Book']={resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',tags:['Test tag'],note:'',sortIndex:0,createdAt:1,updatedAt:1};}
    const animate=Element.prototype.animate;
    (window as any).__scrimEasing=[];
    Element.prototype.animate=function(frames,options){if(this.classList.contains('mobile-screen-dimmer'))(window as any).__scrimEasing.push((options as KeyframeAnimationOptions)?.easing);return animate.call(this,frames,options);};
  });
  await page.getByRole('button', { name: '打开资源库', exact: true }).tap();
  await page.getByRole('button', { name: '显示选项', exact: true }).tap();
  const scrim = page.locator('.mobile-screen-dimmer');
  await expect(scrim).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    (window as any).__scrimSamples = [];
    const sample = () => { const node = document.querySelector('.mobile-screen-dimmer'); (window as any).__scrimSamples.push(node ? Number(getComputedStyle(node).opacity) : -1); if ((window as any).__scrimSamples.length < 35) requestAnimationFrame(sample); }; sample();
  });
  await page.getByRole('button', { name: '标签管理', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: '标签管理', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  expect(Math.min(...await page.evaluate(() => (window as any).__scrimSamples))).toBeGreaterThan(.99);
  const manager=page.getByRole('dialog', { name: '标签管理', exact: true });
  await manager.getByRole('button', { name: 'Test tag', exact: true }).tap();
  await manager.getByRole('button', { name: /^删除\s*1$/ }).tap();
  const confirmation=page.getByRole('dialog', { name: '删除标签', exact: true });
  await expect(confirmation).toBeVisible();
  await expect(scrim).toHaveCSS('opacity','1');
  await expect(confirmation).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await confirmation.getByRole('button', { name: '取消', exact: true }).tap();
  await expect(manager).toBeVisible();
  await expect(scrim).toHaveCSS('opacity','1');
  await manager.getByRole('button', { name: '取消', exact: true }).tap();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mobile-sheet-overlay')).toHaveCount(0);
  await expect(scrim).toHaveCSS('opacity', '0');
  await page.getByRole('button', { name: '显示选项', exact: true }).tap();
  await expect(scrim).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '应用设置', exact: true }).tap();
  await expect(page.locator('.mobile-settings-surface')).toBeVisible();
  await expect(scrim).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: '关闭设置', exact: true }).tap();
  await expect(scrim).toHaveCSS('opacity', '0');
  const easing=await page.evaluate(()=>(window as any).__scrimEasing) as string[];
  expect(easing.length).toBeGreaterThan(0);expect(easing.every(value=>value==='linear')).toBe(true);
});

test('language changes live, persists and preserves user titles', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => { const data=await window.omicomic.getAppData(); if(data.ok)data.data.recentOpened[0].title='设置'; });
  await page.locator('.mobile-home-nav').getByRole('button', { name: '刷新', exact: true }).tap();
  await expect(page.locator('.omi-home__book-title').first()).toHaveText('设置');
  await page.locator('.mobile-home-nav').getByRole('button', { name: '设置', exact: true }).tap();
  await page.getByRole('button', { name: /外观与主题/ }).tap();
  await page.getByRole('combobox', { name: '语言 / Language', exact: true }).tap();
  await page.getByRole('option', { name: 'English', exact: true }).tap();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toContainText('Mist');
  await page.screenshot({ path: 'test-results/mobile1119-settings-en.png' });
  await page.getByRole('button', { name: 'Back to settings' }).tap();
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await expect(page.locator('.omi-home__book-title').first()).toHaveText('设置');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('.mobile-home-nav').getByRole('button', { name: 'Settings', exact: true }).tap();
  await page.getByRole('button', { name: /Appearance/ }).tap();
  await page.getByRole('combobox', { name: '语言 / Language', exact: true }).tap();
  await page.getByRole('option', { name: '日本語', exact: true }).tap();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { name: '外観とテーマ', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile1119-settings-ja.png' });
  await page.getByRole('combobox', { name: '语言 / Language', exact: true }).tap();
  await page.getByRole('option', { name: '简体中文', exact: true }).tap();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { name: '外观与主题', exact: true })).toBeVisible();
});

test('English interface coverage and compact screen layout', async ({ page }) => {
  await start(page, 'en');
  const leftovers = new Set<string>();
  async function inspect(label: string) {
    await page.waitForTimeout(300);
    const words = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), words: string[] = [];
      while (walker.nextNode()) { const n = walker.currentNode, p = n.parentElement; if (!p || !p.getClientRects().length || p.closest('script,style,.is-hidden,[aria-hidden="true"]')) continue; if (/[\u3400-\u9fff]/.test(n.textContent ?? '')) words.push(n.textContent!.trim()); }
      return words;
    });
    words.filter(word => !['简体中文','日本語','语言 / Language','默认书架'].includes(word)).forEach(word => leftovers.add(label + ': ' + word));
  }
  await inspect('home');
  await page.locator('.mobile-home-nav').getByRole('button', { name: 'Settings', exact: true }).tap();
  for (const category of ['Appearance','Library','Reading defaults','Book reading settings','Performance and cache','Safety and confirmations','About OmiComic']) {
    await page.locator('.mobile-setting-category').filter({ has: page.locator('strong', { hasText: new RegExp('^'+category+'$') }) }).tap();
    await inspect(category);
    await page.getByRole('button', { name: 'Back to settings' }).tap();
  }
  await page.getByRole('button', { name: 'Close settings' }).tap();
  await page.getByRole('button', { name: 'Open library', exact: true }).tap();
  await inspect('library');
  await page.getByRole('button', { name: 'Display options', exact: true }).tap();
  await inspect('options');
  await page.getByRole('button', { name: 'Manage tags', exact: true }).tap();
  await inspect('tags');
  await page.keyboard.press('Escape');
  for (const title of ['Shelves','Favorites','Bookmarks','Recent']) { await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: title, exact: true }).tap(); await inspect(title); }
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Library', exact: true }).tap();
  await page.locator('.mobile-resource-card').filter({ has: page.getByText('Book', { exact: true }) }).getByRole('button', { name: 'Open resource details', exact: true }).tap();
  await inspect('details');
  await page.screenshot({ path: 'test-results/mobile1119-detail-en.png' });
  await page.getByRole('button', { name: 'Start reading', exact: true }).tap();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  await page.locator('.reader-stage').tap();
  await page.getByRole('button', { name: 'Reading settings', exact: true }).tap();
  await inspect('reader');
  await page.getByRole('button', { name: 'Image adjustments', exact: true }).tap();
  await inspect('adjustments');
  expect([...leftovers]).toEqual([]);
});
