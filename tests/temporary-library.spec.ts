import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seed(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 70 });
  await page.addInitScript(async () => {
    const api = (window as any).omicomic;
    const data = (await api.getAppData()).data;
    data.temporaryOpened = ['Outside A', 'Outside B'].map((title, index) => ({
      resourceKey: `archive:/outside/${title}.cbz`, sourcePath: `/outside/${title}.cbz`, sourceType: 'archive',
      title, currentPageIndex: index + 1, totalPages: 70, updatedAt: index + 1,
    }));
    data.resourceMeta[data.temporaryOpened[0].resourceKey] = { ...data.temporaryOpened[0], tags: ['测试标签'], note: '临时简介' };
    (window as any).__temporaryData = data;
    api.removeTemporaryOpened = async (key: string) => {
      data.temporaryOpened = data.temporaryOpened.filter((item: any) => item.resourceKey !== key);
      return { ok: true, data: null };
    };
    api.promoteTemporaryOpened = async () => {
      data.library.roots.push({ path: '/outside', name: 'outside', addedAt: 1, lastOpenedAt: 1 });
      data.temporaryOpened = [];
      return { ok: true, data };
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.getByRole('button', { name: /^临时存放/ }).click();
}

test('temporary shelf reuses cards, search and details; deleting a reference preserves other records', async ({ page }) => {
  await seed(page);
  const cards = page.locator('[aria-label="临时存放资源列表"] .resource-card');
  await expect(cards).toHaveCount(2);
  const inbox = (await page.getByRole('button', { name: /^临时存放/ }).boundingBox())!;
  const recent = (await page.getByRole('button', { name: /^最近阅读/ }).boundingBox())!;
  expect(inbox.y).toBeLessThan(recent.y);
  await page.getByRole('textbox', { name: '搜索临时存放' }).fill('测试标签');
  await expect(cards).toHaveCount(1);
  await cards.first().getByRole('button', { name: '打开资源信息' }).click();
  await expect(page.getByRole('button',{name:'第 1 页：page0.png',exact:true})).toBeVisible();
  await expect(page.getByText('临时简介', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^临时存放/ }).click();
  await cards.filter({ hasText: 'Outside A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除临时引用', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除选中', exact: true });
  await expect(dialog).toContainText('只删除临时存放中的引用');
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect(cards).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__temporaryData.recentOpened.length)).toBe(4);
  expect(await page.evaluate(() => Object.values((window as any).__temporaryData.resourceMeta).length)).toBe(1);
  await page.screenshot({ path: 'test-results/temporary-library.png' });
});

test('adding the containing directory removes its temporary references and makes a library root', async ({ page }) => {
  await seed(page);
  const cards = page.locator('[aria-label="临时存放资源列表"] .resource-card');
  await cards.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '将所在目录加入资源库', exact: true }).click();
  await expect(page.getByRole('heading', { name: '暂无临时存放文件', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开文件', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__temporaryData.library.roots.some((root: any) => root.path === '/outside'))).toBe(true);
  await page.getByRole('button', { name: /^最近阅读/ }).click();
  await expect(page.locator('[aria-label="最近阅读资源列表"] .resource-card')).toHaveCount(4);
});

test('temporary references can browse unsaved directories without adding them to the library', async ({page})=>{
  await seed(page);
  await page.locator('[aria-label="临时存放资源列表"] .resource-card').first().click({button:'right'});
  await page.getByRole('menuitem',{name:'打开路径',exact:true}).click();
  await expect(page.locator('.resource-card').filter({hasText:'Nested'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__temporaryData.library.roots.map((root:any)=>root.path))).toEqual(['/comics']);
});

test('recent records outside the library offer promotion; records in saved roots do not',async({page})=>{
  await page.addInitScript(installMock,{count:8});
  await page.addInitScript(async()=>{const result=await window.omicomic.getAppData();if(!result.ok)throw Error();result.data.recentOpened.push({resourceKey:'archive:/outside/Recent.cbz',sourcePath:'/outside/Recent.cbz',sourceType:'archive',title:'Outside Recent',currentPageIndex:0,totalPages:8,updatedAt:1});});
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.getByRole('button',{name:/^最近阅读/}).click();
  await page.locator('[aria-label="最近阅读资源列表"] .resource-card').filter({hasText:'Outside Recent'}).click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'将所在目录加入资源库',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await page.locator('[aria-label="最近阅读资源列表"] .resource-card').filter({has:page.locator('strong',{hasText:/^First$/})}).click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'将所在目录加入资源库',exact:true})).toHaveCount(0);
});
