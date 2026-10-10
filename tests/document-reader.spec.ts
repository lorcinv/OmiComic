import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seedDocument(page: Page, fail = false, delay = false, colorTheme = 'mist') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 30 });
  await page.addInitScript(({ fail, delay, colorTheme }) => {
    const api = (window as any).omicomic, getData = api.getAppData;
    const key = 'epub:/comics/sample.epub';
    const progress: Record<string, any> = {};
    const marks = new Set<number>();
    (window as any).__chapterRequests = [];
    (window as any).__closedDocuments = [];
    (window as any).__fullscreen = [];
    api.getAppData = async () => {
      const result = await getData();
      result.data.recentOpened = [{ resourceKey: key, sourcePath: '/comics/sample.epub', sourceType: 'epub', title: 'EPUB 测试书', currentPageIndex: progress[key]?.currentPageIndex ?? 1, totalPages: 30, updatedAt: 1 }];
      result.data.readingProgress = progress;
      result.data.settings.colorTheme = colorTheme;
      return result;
    };
    api.getReadingProgress = async (id: string) => ({ ok: true, data: progress[id] ?? null });
    api.saveReadingProgress = async (input: any) => { progress[input.resourceKey] = input; (window as any).__saved.push(input); return { ok: true, data: input }; };
    api.getResourcePages = async () => ({ ok: true, data: { key, resourceKey: key, sourcePath: '/comics/sample.epub', sourceType: 'epub', title: 'EPUB 测试书', pages: [], total: 0 } });
    api.openDocument = async () => {
      if (delay) await new Promise(resolve => setTimeout(resolve, 500));
      return fail ? { ok: false, error: { message: 'EPUB 章节缺失。' } } : { ok: true, data: { size: 2000, chapters: Array.from({ length: 30 }, (_, index) => ({ index, name: `第 ${index + 1} 章` })) } };
    };
    api.readDocumentChapter = async (_id: string, index: number) => {
      (window as any).__chapterRequests.push(index);
      const paragraphs = Array.from({ length: index === 2 ? 80 : 8 }, (_, n) => `<p>段落 ${n + 1}：沿用同一套阅读窗口，文字与插图自然排列。</p>`).join('');
      return { ok: true, data: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{font:18px/1.8 system-ui;color:#202124}p{margin:1em 0}</style></head><body><h1>章节 ${index + 1}</h1>${paragraphs}</body></html>` };
    };
    api.closeDocument = async (id: string) => { (window as any).__closedDocuments.push(id); return { ok: true, data: null }; };
    api.isPageBookmarked = async (_key: string, index: number) => ({ ok: true, data: marks.has(index) });
    api.toggleBookmark = async (input: any) => { if (marks.has(input.pageIndex)) marks.delete(input.pageIndex); else marks.add(input.pageIndex); return { ok: true, data: { bookmarked: marks.has(input.pageIndex) } }; };
    api.setFullscreen = async (value: boolean) => { (window as any).__fullscreen.push(value); return { ok: true, data: value }; };
  }, { fail, delay, colorTheme });
  await page.goto('/');
  await page.getByRole('button', { name: /继续阅读 EPUB 测试书/ }).click();
}

test('dark EPUB text follows the soft dark theme and retains shared reading controls', async ({ page }) => {
  await seedDocument(page, false, false, 'night');
  const chapter = page.frameLocator('.reader-chapter iframe');
  await expect(chapter.getByRole('heading', { name: '章节 2', exact: true })).toBeVisible();
  await expect(chapter.locator('body')).toHaveCSS('background-color', 'rgb(54, 62, 76)');
  await expect(chapter.locator('body')).toHaveCSS('color', 'rgb(229, 233, 240)');
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await page.screenshot({ path: 'test-results/theme-night-epub.png' });
});

test('EPUB uses shared modes, outer scrolling, bookmarks and persisted view state', async ({ page }) => {
  await seedDocument(page);
  const jump = page.getByRole('textbox', { name: '跳转到章节' });
  await expect(jump).toHaveValue('2');
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '章节 2', exact: true })).toBeVisible();
  await expect(page.locator('.document-reader')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__chapterRequests[0])).toBe(1);
  await page.getByRole('button', { name: '添加当前章书签', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消当前章书签', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click();
  await expect(page.locator('.reader-chapter')).toHaveCount(2);
  await page.getByRole('button', { name: '当前双页，点击切换单页', exact: true }).click();
  await jump.fill('3'); await jump.press('Enter');
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '章节 3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '适应宽度', exact: true }).click();
  await expect.poll(() => page.locator('.reader-stage').evaluate(element => element.scrollHeight / element.clientHeight)).toBeGreaterThan(2);
  await page.locator('.reader-stage').hover(); await page.mouse.wheel(0, 650);
  await expect.poll(() => page.locator('.reader-stage').evaluate(element => element.scrollTop)).toBeGreaterThan(100);
  await expect(jump).toHaveValue('3');
  expect(await page.locator('.reader-chapter iframe').getAttribute('sandbox')).toBe('allow-same-origin');
  await page.getByRole('button', { name: '适应高度', exact: true }).click();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await jump.fill('20'); await jump.press('Enter');
  await expect(jump).toHaveValue('20');
  await expect(page.locator('[data-reader-page-index="19"]')).toHaveClass(/is-current-page/);
  await expect(page.frameLocator('[data-reader-page-index="19"] iframe').getByRole('heading', { name: '章节 20', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await page.getByRole('button', { name: '沉浸', exact: true }).click();
  await expect(page.locator('.reader-layout')).toHaveClass(/is-immersive/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.reader-layout')).not.toHaveClass(/is-immersive/);
  await page.screenshot({ path: 'test-results/epub-shared-reader.png' });
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__closedDocuments.length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await page.getByRole('button', { name: /继续阅读 EPUB 测试书/ }).click();
  await expect(jump).toHaveValue('20');
  await expect(page.locator('.reader-layout')).toHaveClass(/is-flow-vertical/);
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await expect(page.frameLocator('[data-reader-page-index="19"] iframe').getByRole('heading', { name: '章节 20', exact: true })).toBeVisible();
});

test('failed documents and cancellation retain the normal return path and release sessions', async ({ page }) => {
  await seedDocument(page, true);
  await expect(page.getByRole('heading', { name: '文档打开失败' })).toBeVisible();
  await expect(page.getByText('EPUB 章节缺失。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.page-panel.is-visible .library-layout')).toBeVisible();
  await page.reload();
  await page.evaluate(() => {
    (window as any).omicomic.openDocument = () => new Promise(resolve => setTimeout(() => resolve({ ok: true, data: { size: 10, chapters: [{ index: 0, name: '第 1 章' }] } }), 500));
  });
  await page.getByRole('button', { name: /继续阅读 EPUB 测试书/ }).click();
  await expect(page.getByRole('status').filter({ hasText: '正在打开文档' })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.reader-layout')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__closedDocuments.length)).toBeGreaterThan(0);
  await expect(page.locator('body > iframe')).toHaveCount(0);
});

test('panorama loads the visible chapter without waiting for a stalled prefetch batch', async ({ page }) => {
  await seedDocument(page);
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '章节 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.evaluate(() => {
    const api = (window as any).omicomic, chapter = api.readDocumentChapter, bookmark = api.toggleBookmark;
    api.readDocumentChapter = (id: string, index: number) => index === 2 ? new Promise(() => {}) : chapter(id, index);
    api.toggleBookmark = (input: any) => { (window as any).__lastBookmark = input; return bookmark(input); };
  });
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await page.getByRole('button', { name: /继续阅读 EPUB 测试书/ }).click();
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '章节 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await page.evaluate(async () => {
    const stage = document.querySelector('.reader-stage')!;
    for (let i = 0; i < 26; i++) {
      stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 380 }));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  });
  const chapter = await page.locator('.reader-page-jump input').inputValue();
  expect(Number(chapter)).toBeGreaterThan(8);
  const index = Number(chapter) - 1;
  await expect(page.frameLocator(`[data-reader-page-index="${index}"] iframe`).getByRole('heading', { name: `章节 ${chapter}`, exact: true })).toBeVisible({ timeout: 1500 });
  await page.getByRole('button', { name: '添加当前章书签', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__lastBookmark.pageIndex)).toBe(index);
  await expect(page.locator('.reader-filename-strip')).toContainText(`第 ${chapter} 章`);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__saved.at(-1)?.currentPageIndex)).toBe(index);
});

test('EPUB details and home use chapter labels and the shared reading entry', async ({ page }) => {
  await seedDocument(page);
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await page.keyboard.press('PageDown');
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('3');
  await page.keyboard.press('PageUp');
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: /^最近阅读/ }).click();
  await page.locator('.resource-card').filter({ hasText: 'EPUB 测试书' }).getByRole('button', { name: '打开资源信息' }).click();
  await expect(page.locator('.resource-detail-progress-copy')).toContainText('第 2 章 / 共 30 章');
  await expect(page.getByRole('group', { name: '缩略预览大小' })).toHaveCount(0);
  await expect(page.getByText('已选择第 1 页', { exact: true })).toHaveCount(0);
  await page.locator('.resource-detail-reading-launch').getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '跳转到章节' })).toHaveValue('2');
  await expect(page.locator('.reader-toolbar')).toHaveCount(1);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: 'OmiComic', exact: true }).click();
  await expect(page.locator('.omi-home__book-progress').first()).toContainText('2 / 30 章');
});

test('panorama navigation and mode changes keep the page visible during scrolling', async ({ page }) => {
  await seedDocument(page);
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: '章节 2', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  const jump = page.getByRole('textbox', { name: '跳转到章节' });
  const scrollThenClick = (buttonName: string) => page.evaluate(async name => {
    const stage = document.querySelector('.reader-stage')!;
    for (let i = 0; i < 12; i++) {
      stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 180 }));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const viewport = stage.getBoundingClientRect(), center = (viewport.left + viewport.right) / 2;
    const visible = [...document.querySelectorAll<HTMLElement>('.reader-page-spread > figure')].find(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left <= center && bounds.right >= center;
    });
    if (!visible) throw new Error('No page at the viewport center');
    const chapter = Number(visible.dataset.readerPageIndex) + 1;
    const button = [...document.querySelectorAll<HTMLButtonElement>('.reader-layout button')].find(element => element.dataset.tooltip === name || element.title === name || element.textContent?.trim() === name);
    if (!button) throw new Error(`Missing button: ${name}`);
    // Act before the wheel's 120 ms settle timer can update the old anchor.
    button.click();
    return chapter;
  }, buttonName);
  const beforeNext = await scrollThenClick('下一页');
  expect(beforeNext).toBeGreaterThan(3);
  await expect(jump).toHaveValue(String(beforeNext + 1));
  const beforeExit = await scrollThenClick('关闭全景连环画');
  await expect(page.locator('.reader-stage')).not.toHaveClass(/(^|\s)is-panorama(\s|$)/);
  await expect(jump).toHaveValue(String(beforeExit));
  await expect(page.frameLocator('.reader-chapter iframe').getByRole('heading', { name: `章节 ${beforeExit}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  const beforeFit = await scrollThenClick('适应宽度');
  await expect(jump).toHaveValue(String(beforeFit));
  const beforeFlow = await scrollThenClick('当前横向阅读，点击切换纵向阅读');
  await expect(page.locator('.reader-layout')).toHaveClass(/is-flow-vertical/);
  await expect(jump).toHaveValue(String(beforeFlow));
});
