import { test, expect, type Locator, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seed(page: Page, layout: 'grid' | 'list') {
  page.on('pageerror', error => console.error(error.stack));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(async ({ source, layout }) => {
    eval(`(${source})`)({ count: 2 });
    const api = window.omicomic, result = await api.getAppData();
    if (!result.ok) throw Error('fixture');
    const data: any = result.data;
    data.tagOrder = Array.from({length:300},(_,i)=>`Tag ${String(i).padStart(3,'0')}`);
    data.resourceMeta['image:/tags-fixture.png'] = {resourceKey:'image:/tags-fixture.png',sourcePath:'/tags-fixture.png',sourceType:'image',title:'Tag fixture',tags:[...data.tagOrder],updatedAt:1};
    const saved = JSON.parse(localStorage.getItem('navigation-fixture') ?? '{}');
    Object.assign(data.settings, { showHomePage: false, startupPage: 'directory', cardScale: 60,
      mobileViewDisplays: Object.fromEntries(['directory','bookshelf','favorites','bookmarks','recent'].map(key => [key, { layout, columns: 2, coverSize: 82 }])) }, saved.settings);
    Object.assign(data.library, saved.library);
    const persist = () => localStorage.setItem('navigation-fixture', JSON.stringify({ settings: data.settings, library: data.library }));
    api.updateSettings = async patch => { Object.assign(data.settings, patch); persist(); return { ok: true, data: structuredClone(data.settings) }; };
    api.updateLibraryState = async patch => { Object.assign(data.library, patch); persist(); return { ok: true, data: null }; };
    const resource = (prefix: string, index: number) => ({ resourceKey: `image:/${prefix}/${index}.png`, sourcePath: `/${prefix}/${index}.png`, sourceType: 'image', title: `${prefix} ${String(index).padStart(3,'0')}`, currentPageIndex: 0, totalPages: 2, updatedAt: 1000-index, sortIndex: index, addedAt: 1 });
    data.recentOpened = Array.from({ length: 200 }, (_, i) => resource('Recent', i));
    data.temporaryOpened = Array.from({ length: 200 }, (_, i) => resource('Temporary', i));
    data.favorites = Array.from({ length: 200 }, (_, i) => resource('Favorite', i));
    data.bookmarks = Array.from({ length: 200 }, (_, i) => ({ ...resource('Bookmark', i), id: `mark${i}`, pageIndex: 0, createdAt: 1 }));
    data.bookshelves = [{ id: 'category', name: '分类', sortIndex: 0, createdAt: 1, updatedAt: 1 }];
    data.virtualFolders = Array.from({ length: 80 }, (_, shelf) => ({ id: `s${shelf}`, name: `Shelf ${String(shelf).padStart(3,'0')}`, bookshelfId: 'category', sortIndex: shelf, createdAt: 1, updatedAt: 1, note: '', tags: [],
      items: Array.from({ length: 120 }, (_, i) => ({ ...resource(`Shelf${shelf}`, i), id: `s${shelf}-b${i}`, folderId: `s${shelf}` })) }));
    api.getFavorites = async () => ({ ok: true, data: structuredClone(data.favorites) });
    api.getBookmarks = async () => ({ ok: true, data: structuredClone(data.bookmarks) });
    api.getBookmarkPagePreview = async () => { const result = await api.getThumbnail({path:'/Bookmark/0.png',type:'image'}); return result.ok ? {ok:true,data:{dataUrl:result.data.url}} : result; };
    api.listDirectory = async path => ({ ok: true, data: { path, parentPath: path === '/comics' ? null : '/comics', total: 200,
      items: Array.from({ length: 200 }, (_, i) => { const name = `${path === '/comics' ? 'Folder' : 'Image'} ${String(i).padStart(3,'0')}`; return { id: `${path}/${name}`, path: `${path}/${name}`, name, type: path === '/comics' ? 'folder' : 'image', extension: path === '/comics' ? '' : 'png' }; }) } });
    const getResource = api.getResourcePages;
    api.getResourcePages = input => input.type === 'folder' ? Promise.resolve({ ok: false, error: { code: 'NO_IMAGES', message: '没有图片' } }) : getResource(input);
  }, { source: installMock.toString(), layout });
  await page.goto('/');
  await expect(page.getByLabel('当前目录文件列表', { exact: true })).toBeVisible();
}

const nav = (page: Page, name: string) => page.locator('.sidebar-primary-nav .sidebar-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });
const directory = (page: Page) => page.getByLabel('当前目录文件列表', { exact: true });
const shelfRoot = (page: Page) => page.locator('.page-panel.is-visible .bookshelf-root-view');
const shelfBooks = (page: Page) => page.getByLabel('书架资源列表', { exact: true });
const body = (page: Page) => page.locator('.page-panel.is-visible .resource-list-scroll');
async function scroll(list: Locator, top: number) {
  await expect(list).toBeVisible();
  await list.evaluate((element, top) => { element.scrollTop = top; element.dispatchEvent(new Event('scroll')); }, top);
  await at(list, top);
}
async function at(list: Locator, top: number) {
  await expect.poll(() => list.evaluate((element, top) => Math.abs(element.scrollTop - top), top)).toBeLessThan(2);
}
async function visibleTitle(list: Locator, selector: string) {
  return list.evaluate((element, selector) => {
    const box = element.getBoundingClientRect();
    const card = [...element.querySelectorAll(selector)].find(card => { const rect = card.getBoundingClientRect(); return rect.top > box.top + 80 && rect.bottom < box.bottom - 40; });
    if (!card) throw Error('No visible card');
    return card.querySelector('strong')!.textContent!;
  }, selector);
}
async function enter(page: Page, mobile: boolean, title: string, shelf = false) {
  const card = page.locator(shelf ? mobile ? '.mobile-bookshelf-card' : '.bookshelf-folder-card' : '.resource-card').filter({ has: page.locator('strong', { hasText: new RegExp(`^${title}$`) }) });
  if (mobile) await card.tap(); else await card.dblclick();
}
async function openSettings(page: Page, mobile: boolean, reading = true) {
  if (mobile) {
    await page.getByRole('button', { name: '显示选项', exact: true }).click();
    await page.getByRole('button', { name: '应用设置', exact: true }).click();
    await page.getByRole('button', { name: reading ? /默认阅读/ : /外观与主题/ }).click();
  } else {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator(`#settings-category-${reading ? 'reader-default' : 'appearance'}`).click();
  }
}

for (const mode of ['desktop', 'mobile-grid', 'mobile-list'] as const) test.describe(mode, () => {
  const mobile = mode !== 'desktop';
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});

  test('physical folders retain both levels through Back but restart at the root top', async ({ page }) => {
    await seed(page, mode === 'mobile-list' ? 'list' : 'grid');
    await scroll(directory(page), 1200);
    const name = await visibleTitle(directory(page), '.resource-card');
    await enter(page, mobile, name);
    await expect(directory(page).locator('.resource-card').first()).toContainText('Image');
    await scroll(directory(page), 900);
    if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-back'))); else await page.keyboard.press('Escape');
    await at(directory(page), 1200);
    await enter(page, mobile, name);
    await at(directory(page), 900);
    await page.reload();
    await expect(directory(page).locator('.resource-card').first()).toContainText('Folder');
    await at(directory(page), 0);
    await enter(page, mobile, 'Folder 000'); await at(directory(page), 0);
  });

  test('tabs and bookshelves remember this session only; restart clears every position', async ({ page }) => {
    await seed(page, mode === 'mobile-list' ? 'list' : 'grid');
    await scroll(directory(page), 950);
    for (const [name, top] of [['收藏',900],['书签',1000],['最近阅读',1100]] as const) { await nav(page,name).click(); await scroll(body(page),top); }
    await nav(page,'书架').click(); await scroll(shelfRoot(page),1200);
    const name = await visibleTitle(shelfRoot(page), mobile ? '.mobile-bookshelf-card' : '.bookshelf-folder-card');
    await enter(page,mobile,name,true); await scroll(shelfBooks(page),950);
    for (const [label, top] of [['收藏',900],['书签',1000],['最近阅读',1100]] as const) { await nav(page,label).click(); await at(body(page),top); }
    await nav(page,'资源库').click(); await at(directory(page),950);
    await nav(page,'书架').click(); await at(shelfBooks(page),950);
    await windowBack(page,mobile); await at(shelfRoot(page),1200);
    await enter(page,mobile,name,true); await at(shelfBooks(page),950);
    await page.evaluate(async () => { await window.omicomic.updateSettings({ startupPage: 'bookshelf' }); });
    await page.reload(); await at(shelfRoot(page),0);
    await enter(page,mobile,'Shelf 000',true); await at(shelfBooks(page),0);
    for (const label of ['收藏','书签','最近阅读','资源库']) { await nav(page,label).click(); await at(body(page),0); }
  });

  test('reselecting the active navigation resets the top level; switching tabs and Back still remember', async ({page}) => {
    await seed(page,mode==='mobile-list'?'list':'grid');
    await scroll(directory(page),1200);
    const folder = await visibleTitle(directory(page),'.resource-card');
    await enter(page,mobile,folder); await scroll(directory(page),900);
    await nav(page,'收藏').click(); await nav(page,'资源库').click();
    await expect(directory(page).locator('.resource-card').first()).toContainText('Image'); await at(directory(page),900);
    await nav(page,'资源库').click();
    await expect(directory(page).locator('.resource-card').first()).toContainText('Folder'); await at(directory(page),0);
    await nav(page,'收藏').click(); await nav(page,'资源库').click(); await at(directory(page),0);
    await scroll(directory(page),1200); await enter(page,mobile,folder); await at(directory(page),900);
    await nav(page,'资源库').click(); await at(directory(page),0);
    await nav(page,'书架').click(); await scroll(shelfRoot(page),1200);
    const shelf = await visibleTitle(shelfRoot(page),mobile?'.mobile-bookshelf-card':'.bookshelf-folder-card');
    await enter(page,mobile,shelf,true); await scroll(shelfBooks(page),950);
    await windowBack(page,mobile); await at(shelfRoot(page),1200);
    await enter(page,mobile,shelf,true); await at(shelfBooks(page),950);
    await nav(page,'书架').click(); await at(shelfRoot(page),0);
    await nav(page,'收藏').click(); await nav(page,'书架').click(); await at(shelfRoot(page),0);
    await scroll(shelfRoot(page),1200); await enter(page,mobile,shelf,true); await at(shelfBooks(page),950);
    await nav(page,'书架').click(); await at(shelfRoot(page),0);
    for(const label of ['收藏','书签','最近阅读',...(!mobile?['临时存放']:[])]) {
      await nav(page,label).click();
      await scroll(body(page),900);
      await nav(page,label).click(); await at(body(page),0);
      await nav(page,'资源库').click(); await nav(page,label).click(); await at(body(page),0);
    }
  });

  test('startup choice is saved under default reading and opens every navigation tab directly', async ({ page }) => {
    await seed(page, mode === 'mobile-list' ? 'list' : 'grid');
    for (const label of ['书架','收藏','书签','最近阅读','资源库']) {
      await openSettings(page,mobile);
      await page.getByRole('combobox',{name:'启动页',exact:true}).click();
      await page.getByRole('option',{name:label,exact:true}).click();
      await expect(page.getByRole('combobox',{name:'启动页',exact:true})).toContainText(label);
      await page.reload();
      await expect(nav(page,label)).toHaveClass(/is-active/);
      await expect(page.locator('.omi-home')).toHaveCount(0);
    }
    await openSettings(page,mobile);
    await page.screenshot({path:`output/navigation-20261111/startup-${mode}.png`});
    await page.getByRole('combobox',{name:'启动页',exact:true}).click();
    await page.getByRole('option',{name:'主页',exact:true}).click();
    await page.reload(); await expect(page.locator('.omi-home')).toBeVisible();
    await page.getByRole('button',{name:'打开资源库',exact:true}).first().click();
    await openSettings(page,mobile,false);
    if (mobile) {
      await expect(page.getByRole('combobox',{name:'调整栏目布局',exact:true})).toBeVisible();
      await expect(page.getByText('显示设置页面',{exact:true})).toHaveCount(0);
      await page.screenshot({path:`output/navigation-20261111/layout-${mode}.png`});
    }
  });

  test('settings and resource details remember their scroll positions when reopened', async ({ page }) => {
    await seed(page, mode === 'mobile-list' ? 'list' : 'grid');
    await page.setViewportSize(mobile ? {width:390,height:600} : {width:1440,height:600});
    await openSettings(page,mobile,false);
    const settingsBody = page.locator(mobile ? '.mobile-settings-body' : '.settings-window-content');
    await scroll(settingsBody,150);
    if (mobile) {
      await page.getByRole('button',{name:'返回设置',exact:true}).click();
      await page.getByRole('button',{name:/外观与主题/}).click();
    } else {
      await page.locator('#settings-category-reader-default').click();
      await page.locator('#settings-category-appearance').click();
    }
    await at(settingsBody,150);
    if (mobile) { await page.getByRole('button',{name:'返回设置',exact:true}).click(); await page.getByRole('button',{name:'关闭设置',exact:true}).click(); }
    else await page.keyboard.press('Escape');
    await page.evaluate(() => {
      window.omicomic.getResourcePages = async input => ({ok:true,data:{resourceKey:`folder:${input.path}`,key:`folder:${input.path}`,sourcePath:input.path,sourceType:'folder',title:'Preview fixture',total:200,
        pages:Array.from({length:200},(_,index)=>({index,name:`${index}.png`,sourcePath:`${input.path}/${index}.png`,type:'folder-image' as const}))}});
    });
    const info = directory(page).locator('.resource-card').first().getByRole('button',{name:'打开资源信息',exact:true});
    await info.click(); await expect(page.locator('.resource-detail-thumbnail').first()).toBeVisible();
    const details = page.locator(mobile ? '.resource-detail-page' : '.resource-detail-thumbnail-grid');
    await scroll(details,700);
    if (mobile) await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
    else await page.getByRole('button',{name:'返回资源列表',exact:true}).click();
    await info.click(); await at(details,700);
  });

  test('the tag catalogue remembers reopening in this session and resets on restart', async ({page}) => {
    await seed(page,mode==='mobile-list'?'list':'grid');
    const openTags = async () => {
      if(mobile){await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('button',{name:'标签管理',exact:true}).click();}
      else await page.getByRole('button',{name:'标签',exact:true}).click();
    };
    const tags=page.locator(mobile?'.mobile-tag-catalogue':'.tag-all-section .tag-sort-list');
    await openTags();await scroll(tags,500);await page.keyboard.press('Escape');
    await expect(tags).toHaveCount(0);await openTags();await at(tags,500);
    await page.reload();await expect(directory(page)).toBeVisible();await openTags();await at(tags,0);
  });
});

async function windowBack(page: Page, mobile: boolean) {
  if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-back')));
  else await page.getByRole('button',{name:'返回书架',exact:true}).click();
}
