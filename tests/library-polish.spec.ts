import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installMock } from './mock';
import { setCardScale } from './card-scale-helpers';

test.use({ screenshot: 'only-on-failure' });

async function openLibrary(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(({ cover }) => {
    const api = (window as any).omicomic;
    const getAppData = api.getAppData;
    api.getAppData = async () => {
      const result = await getAppData();
      result.data.resourceMeta['folder:/comics/Book'] = {
        resourceKey: 'folder:/comics/Book', sourcePath: '/comics/Book', sourceType: 'folder', title: 'Book',
        tags: ['作画参考', '人物设计', '色彩', '线稿', '构图', '收藏', '待整理', '这是一个很长的标签名称需要在浮层中完整显示'],
        note: '', updatedAt: 1,
      };
      result.data.resourceMeta['folder:/comics/Parent'] = {
        resourceKey: 'folder:/comics/Parent', sourcePath: '/comics/Parent', sourceType: 'folder', title: 'Parent',
        tags: ['米神'], note: '', updatedAt: 1,
      };
      return result;
    };
    const portrait = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="640"><rect width="240" height="640" fill="#9eacbc"/><path d="M0 200 240 480V640H0Z" fill="#4f647c"/></svg>');
    api.getThumbnail = async ({ path }: { path: string }) => ({ ok: true, data: { url: path.endsWith('/Parent') ? portrait : cover } });
    api.updateSettings = async (settings: any) => ({ ok: true, data: settings });
    api.addFavorite = async (input: any) => ({ ok: true, data: { ...input, addedAt: 1, updatedAt: 1 } });
    const listDirectory = api.listDirectory;
    api.listDirectory = async (path: string) => {
      if ((window as any).__holdDirectory) {
        await new Promise<void>(resolve => { (window as any).__releaseDirectory = resolve; });
      }
      return listDirectory(path);
    };
  }, { cover: 'data:image/webp;base64,' + readFileSync('tests/fixtures/omi-icon.webp').toString('base64') });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await expect.poll(() => page.locator('.resource-preview img').evaluateAll(images => images.length >= 2 && images.slice(0, 2).every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

test('detail footer actions align with back and the inline tag button remains usable when wrapped', async ({ page }) => {
  await openLibrary(page);
  await page.locator('.resource-card').filter({has:page.locator('.resource-details strong',{hasText:/^Book$/})}).getByRole('button',{name:'打开资源信息'}).click();
  for(const width of [1440,960]) {
    await page.setViewportSize({width,height:900});
    const back=await page.getByRole('button',{name:'返回资源列表'}).boundingBox();
    const rename=await page.getByRole('button',{name:'重命名本地文件',exact:true}).boundingBox();
    const remove=await page.getByRole('button',{name:'删除…',exact:true}).boundingBox();
    expect(rename!.y).toBe(back!.y);expect(remove!.y).toBe(back!.y);expect(rename!.x+rename!.width).toBeLessThan(remove!.x);expect(back!.x+back!.width).toBeLessThan(rename!.x);
    const styles=await page.locator('.resource-detail-action').evaluateAll(buttons=>buttons.map(button=>{const css=getComputedStyle(button);return [css.backgroundColor,css.borderRadius,css.height,css.backdropFilter];}));expect(styles[0]).toEqual(styles[2]);expect(styles[1]).toEqual(styles[2]);
    await expect(page.locator('.resource-detail-tag-editor').getByRole('button',{name:'添加标签'})).toBeVisible();
    await page.getByRole('button',{name:'添加标签',exact:true}).click();await page.getByPlaceholder('输入标签，逗号分隔').fill('新增标签');await page.getByPlaceholder('输入标签，逗号分隔').press('Enter');
    await expect(page.getByRole('button',{name:'移除标签：新增标签',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'重命名本地文件',exact:true}).click();await expect(page.getByRole('dialog',{name:'重命名本地文件'})).toBeVisible();await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:'删除…',exact:true}).click();await expect(page.getByRole('radio',{name:/仅移除索引/})).toBeChecked();await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.mouse.move(250,35);await page.screenshot({path:`test-results/detail-actions-${width}.png`});
  }
});

test('compact cards keep details and favorite actions independent at every size', async ({ page }) => {
  await openLibrary(page);
  const book = page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) });
  for (const width of [1440, 960]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scale of [40, 55, 75, 100]) {
      await page.locator('.view-options-menu > summary').click();
      await setCardScale(page.getByRole('slider', { name: '缩略图大小', exact: true }), scale);
      await page.locator('.view-options-menu > summary').click();
      await expect(book.locator('.preview-tag-row,.recent-source,.resource-preview .resource-info-button')).toHaveCount(0);
      const cover = (await book.locator('.resource-preview').boundingBox())!;
      const card = (await book.boundingBox())!;
      const info = (await book.getByRole('button', { name: '打开资源信息' }).boundingBox())!;
      expect(info.y).toBeGreaterThan(cover.y + cover.height);
      expect(info.x + info.width).toBeGreaterThan(card.x + card.width - 12);
      expect(card.y + card.height - cover.y - cover.height).toBeLessThan(82);
      await expect(book.locator('.favorite-button')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(book.locator('.resource-card-page')).toHaveText('0/8 · 0%');
      await page.mouse.move(220, 45);
      await page.screenshot({ path: 'test-results/pc-ui-compact-' + width + '-' + scale + '.png' });
    }
  }
  await book.getByRole('button', { name: '收藏', exact: true }).press('Space');
  await expect(book.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await book.getByRole('button', { name: '取消收藏', exact: true }).press('Enter');
  await expect(book.getByRole('button', { name: '收藏', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await book.getByRole('button', { name: '打开资源信息', exact: true }).press('Enter');
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await expect(page.locator('.resource-detail-direct-tags')).toContainText('作画参考');
  await expect(page.locator('.reader-layout')).toHaveCount(0);
});

test('folder labels require subfolders and progress stays flush with the card bottom', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(async () => {
    const api = window.omicomic, data = (await api.getAppData() as any).data;
    data.readingProgress['folder:/comics/Book'] = { resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',currentPageIndex:3,totalPages:8,hasStartedReading:true,percent:50,updatedAt:1 };
    const original = api.getThumbnail;
    api.getThumbnail = async input => {
      const result = await original(input);
      if (result.ok) Object.assign(result.data, { itemCount:input.path.endsWith('/Parent')?2:undefined, childFolderCount:input.path.endsWith('/Parent')?1:0 });
      return result;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  const card = (title: string) => page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: new RegExp('^' + title + '$') }) });
  await expect(card('Parent').locator('.resource-card-page')).toHaveText('2 项');
  await expect(card('Parent').locator('.favorite-button,.resource-info-button')).toHaveCount(0);
  await expect(card('Book').locator('.resource-card-page')).toHaveText('4/8 · 50%');
  const bounds = (await card('Book').boundingBox())!, bar = (await card('Book').locator('.resource-progress-track').boundingBox())!;
  expect(Math.abs(bounds.y + bounds.height - bar.y - bar.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.x - bar.x)).toBeLessThanOrEqual(1);
  for (const theme of ['mist', 'nord', 'sand', 'night']) {
    await page.evaluate(theme => { document.documentElement.dataset.colorTheme = theme; }, theme);
    await page.screenshot({ path: 'test-results/pc-ui-progress-' + theme + '.png' });
  }
});

test('grouped directory navigation preserves history, parent navigation and refresh busy feedback', async ({ page }) => {
  await openLibrary(page);
  const navigation = page.getByRole('group', { name: '目录导航' });
  const back = navigation.getByRole('button', { name: '返回', exact: true });
  const forward = navigation.getByRole('button', { name: '前进', exact: true });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  await page.locator('.resource-card').filter({ hasText: 'Parent' }).dblclick();
  await expect(page.locator('.resource-card')).toHaveCount(1);
  await expect(back).toBeEnabled();
  await back.click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(page.locator('.resource-card')).toHaveCount(1);
  await back.click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
  await page.evaluate(() => { (window as any).__holdDirectory = true; });
  const refresh = page.locator('.library-controls').getByRole('button', { name: '刷新并检测失效资源' });
  await refresh.click();
  await expect(refresh).toBeDisabled();
  await expect(refresh).toHaveAttribute('aria-busy', 'true');
  await expect.poll(() => page.evaluate(() => typeof (window as any).__releaseDirectory)).toBe('function');
  await page.evaluate(() => { (window as any).__holdDirectory = false; (window as any).__releaseDirectory(); });
  await expect(refresh).toBeEnabled();
  await expect(refresh).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.resource-card')).toHaveCount(10);
});
