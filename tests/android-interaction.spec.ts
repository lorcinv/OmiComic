import { test, expect } from '@playwright/test';
import { installMock } from './mock';

// Android + fine pointer is the WebView case the old coarse-pointer/dblclick shim missed.
test.use({ viewport:{width:1000,height:760}, isMobile:false, hasTouch:false });
test.beforeEach(async({page})=>{
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(()=>{
    const api=(window as any).omicomic, original=api.getAppData;
    api.getAppData=async()=>{
      const result=await original();
      const book={resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',tags:[],note:'',addedAt:0,updatedAt:0,sortIndex:0};
      result.data.favorites=[book];
      result.data.bookmarks=[{...book,id:'mark',pageIndex:2,pageName:'page2.png',totalPages:12,createdAt:0}];
      result.data.bookshelves=[{id:'shelf',name:'默认书架',createdAt:0,updatedAt:0,sortIndex:0}];
      result.data.virtualFolders=[{id:'folder',bookshelfId:'shelf',name:'Phone Shelf',note:'',tags:[],items:[{...book,id:'item',folderId:'folder'}],createdAt:0,updatedAt:0,sortIndex:0}];
      return result;
    };
    api.getFavorites=async()=>({ok:true,data:(await api.getAppData()).data.favorites});
    api.getBookmarks=async()=>({ok:true,data:(await api.getAppData()).data.bookmarks});
    api.getBookmarkPagePreview=async()=>({ok:true,data:{dataUrl:(await api.getPageImage({})).data.url}});
    (window as any).__doubleClicks=0;
    window.addEventListener('dblclick',()=>{(window as any).__doubleClicks++;});
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.evaluate(()=>{document.documentElement.dataset.platform='android';});
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
});

test('Android cards open once with a fine pointer across library, history, favorites, bookmarks and shelves',async({page})=>{
  expect(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(false);
  const back=async()=>{await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));await expect(page.locator('.library-layout')).toBeVisible();};
  await page.locator('.resource-card').filter({hasText:'Book'}).click();
  await expect(page.locator('.reader-layout')).toBeVisible();await back();
  for(const name of ['最近阅读','收藏','书签']){
    await page.locator('.sidebar-primary-nav button').filter({hasText:name}).click();
    await page.locator('.resource-card').first().click();
    await expect(page.locator('.reader-layout')).toBeVisible();await back();
  }
  await page.locator('.sidebar-primary-nav button').filter({hasText:'书架'}).click();
  await page.locator('.bookshelf-folder-card').filter({hasText:'Phone Shelf'}).click();
  await expect(page.locator('.resource-card')).toHaveCount(1);
  await page.locator('.resource-card').click();await expect(page.locator('.reader-layout')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__doubleClicks)).toBe(0);
});

test('Android nested controls stay usable and a page preview opens with one click',async({page})=>{
  const book=page.locator('.resource-card').filter({hasText:'Book'});
  await book.getByRole('button',{name:'打开资源信息',exact:true}).click();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await expect(page.locator('.reader-layout')).toHaveCount(0);
  await page.locator('.resource-detail-thumbnail').nth(2).click();
  await expect(page.locator('.reader-layout')).toBeVisible();
  await page.locator('.reader-stage').click();
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','3');
  expect(await page.evaluate(()=>(window as any).__doubleClicks)).toBe(0);
});
