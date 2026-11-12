import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { setCardScale } from './card-scale-helpers';

test.use({ screenshot: 'only-on-failure' });

test('details use the available workspace when maximizing and restoring the window', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 147 });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.locator('.resource-card').filter({ hasText: 'Book' }).getByRole('button', { name: '打开资源信息' }).click();
  const detail = page.locator('.resource-detail-page');
  const grid = page.locator('.resource-detail-thumbnail-grid');
  const columns: number[] = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 2559, height: 1392 }, { width: 1920, height: 1080 }, { width: 1920, height: 640 }, { width: 960, height: 640 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('.resource-detail-thumbnail').first()).toBeVisible();
    expect(await page.locator('.resource-detail-thumbnail').count()).toBeLessThan(147);
    const sizes: number[] = [];
    for (const size of [55, 75, 100]) {
      await setCardScale(page.getByRole('slider', { name: '缩略预览大小' }), size);
      const metrics = await detail.evaluate(surface => {
        const style = getComputedStyle(surface);
        const hero = surface.querySelector('.resource-detail-hero')!.getBoundingClientRect();
        const preview = surface.querySelector('.resource-detail-lower')!.getBoundingClientRect();
        const grid = surface.querySelector('.resource-detail-thumbnail-grid')!;
        const card = grid.querySelector('.resource-detail-thumbnail')!.getBoundingClientRect();
        return { available: surface.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), hero: hero.width, preview: preview.width,
          bottomGap: surface.getBoundingClientRect().bottom - preview.bottom - parseFloat(style.paddingBottom),
          overflow: grid.scrollWidth - grid.clientWidth, width: card.width, columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length };
      });
      expect(metrics.hero).toBeCloseTo(metrics.available, 0);
      expect(metrics.preview).toBeCloseTo(metrics.available, 0);
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      expect(Math.abs(metrics.bottomGap)).toBeLessThanOrEqual(1);
      sizes.push(metrics.width);
      if (size === 100) columns.push(metrics.columns);
    }
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[2]).toBeGreaterThan(sizes[1]);
    const status = (await page.locator('.resource-detail-reading-status').boundingBox())!;
    expect((await page.locator('.resource-detail-progress-track').boundingBox())!.width).toBeCloseTo(status.width, 0);
    const preview = (await page.locator('.resource-detail-lower').boundingBox())!;
    expect(preview.y + preview.height).toBeLessThanOrEqual((await page.locator('.resource-detail-back').boundingBox())!.y);
    if (viewport.width === 2559) {
      await expect(page.locator('.resource-detail-thumbnail').first()).toBeInViewport();
      await page.screenshot({ path: 'test-results/detail-preview-maximized.png' });
      // 最大化之后，仍然先收起详情，首排从工具栏下方开始。
      await page.locator('.resource-detail-cover').hover();
      await page.mouse.wheel(0, 120);
      await expect(detail).toHaveClass(/is-header-collapsed/);
      await expectFirstRowClear(page);
      await expect(page.locator('.resource-detail-compact-bar')).toHaveCSS('opacity', '1');
      expect((await page.locator('.resource-detail-compact-bar').boundingBox())!.width).toBeCloseTo((await page.locator('.resource-detail-lower').boundingBox())!.width, 0);
      await page.screenshot({ path: 'test-results/detail-preview-maximized-collapsed.png' });
      await grid.evaluate(element => { element.scrollTop = 500; });
      await page.getByRole('button', { name: '展开详情', exact: true }).click();
      await expect(detail).not.toHaveClass(/is-header-collapsed/);
    }
  }
  expect(columns[0]).toBe(4);
  expect(columns[1]).toBeGreaterThan(4);
  expect(columns[2]).toBeGreaterThan(4);
  expect(columns[3]).toBe(columns[2]);
  expect(columns[4]).toBeLessThan(4);
  expect(columns.at(-1)).toBe(columns[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function expectFirstRowClear(page: Page) {
  const first = page.locator('.resource-detail-thumbnail').first();
  await expect(first).toBeInViewport();
  await expect.poll(() => page.evaluate(() => {
    const title = document.querySelector('.resource-detail-compact-bar')!.getBoundingClientRect();
    const controls = document.querySelector('.resource-detail-section-heading')!.getBoundingClientRect();
    const first = document.querySelector('.resource-detail-thumbnail')!.getBoundingClientRect();
    const grid = document.querySelector('.resource-detail-thumbnail-grid')!.getBoundingClientRect();
    return controls.top >= title.bottom && first.top >= controls.bottom && first.top >= grid.top && first.top < grid.bottom;
  })).toBe(true);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 960, height: 640 }]) {
  test(`detail wheel folds first, scrolls anywhere and resists expansion at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: viewport.width === 960 ? 'reduce' : 'no-preference' });
    await page.addInitScript(installMock, { count: 147 });
    await page.goto('/');
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await page.locator('.resource-card').filter({ hasText: 'Book' }).getByRole('button', { name: '打开资源信息' }).click();
    const detail = page.locator('.resource-detail-page');
    const grid = page.locator('.resource-detail-thumbnail-grid');
    await expect(page.locator('.resource-detail-thumbnail').first()).toBeVisible();
    expect(await page.locator('.resource-detail-thumbnail').count()).toBeLessThan(48);
    await page.locator('.resource-detail-cover').hover();
    await page.mouse.wheel(0, 120);
    await expect(detail).toHaveClass(/is-header-collapsed/);
    expect(await grid.evaluate(element => element.scrollTop)).toBe(0);
    await page.mouse.wheel(0, 800);
    expect(await grid.evaluate(element => element.scrollTop)).toBe(0);
    // 等待收起动画结束，再在工具栏上滚动，缩略图也应跟随。
    await page.waitForTimeout(260);
    await page.locator('.resource-detail-section-heading').hover();
    await page.mouse.wheel(0, 460);
    await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.mouse.wheel(0, -2400);
    await expectFirstRowClear(page);
    await expect(detail).toHaveClass(/is-header-collapsed/);
    await expect(page.getByRole('button', { name: '展开详情', exact: true })).toBeVisible();

    // 到顶的余量不展开；一次额外上滚仍有阻力，继续上滚才恢复简介。
    await page.mouse.wheel(0, -120);
    await expectFirstRowClear(page);
    await expect(detail).toHaveClass(/is-header-collapsed/);
    await page.mouse.wheel(0, -120);
    await expect(detail).not.toHaveClass(/is-header-collapsed/);
    await expect(page.locator('.resource-detail-hero')).toBeVisible();
    await page.waitForTimeout(260);
    await page.locator('.resource-detail-direct-summary').hover();
    await page.mouse.wheel(0, 80);
    await expect(detail).toHaveClass(/is-header-collapsed/);
    await expectFirstRowClear(page);

    // 换组及调整尺寸保留浏览状态和第一排的空间。
    for (const size of [55, 75, 100]) {
      await setCardScale(page.getByRole('slider', { name: '缩略预览大小' }), size);
      await expectFirstRowClear(page);
    }
    await grid.evaluate(element=>{element.scrollTop=element.scrollHeight*.55;});
    await expect.poll(()=>page.locator('.resource-detail-thumbnail').first().getAttribute('aria-label')).not.toMatch(/第 1 页/);
    await expect(page.getByRole('button',{name:'下一组预览'})).toBeVisible();
    const label=await grid.locator('.resource-detail-thumbnail').evaluateAll(nodes=>{const root=nodes[0].parentElement!.getBoundingClientRect();return nodes.find(node=>{const rect=node.getBoundingClientRect();return rect.top>=root.top&&rect.top<root.bottom-40;})!.getAttribute('aria-label')!;});
    await page.getByRole('button',{name:label,exact:true}).click({position:{x:20,y:30}});
    await expect(page.getByText(/已选择第 \d+ 页/)).toHaveCount(0);
    await expect(page.locator('.resource-detail-thumbnail.is-selected')).toHaveCount(0);
    await expect(page.locator('.resource-detail-thumbnail[aria-pressed]')).toHaveCount(0);
    await expect(page.locator('.reader-layout')).toHaveCount(0);
    await grid.evaluate(element=>{element.scrollTop=0;});
    await expectFirstRowClear(page);
    await page.screenshot({ path: `test-results/detail-preview-first-row-${viewport.width}.png` });

    // 从深处手动展开，不能被程序复位产生的滚动事件再次收起。
    await grid.evaluate(element => { element.scrollTop = 500; });
    await page.getByRole('button', { name: '展开详情', exact: true }).click();
    await expect(detail).not.toHaveClass(/is-header-collapsed/);
    await expect(page.locator('.resource-detail-hero')).toBeVisible();
    await expect.poll(() => grid.evaluate(element => element.scrollTop)).toBe(0);
    await expect.poll(() => detail.evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.locator('.resource-detail-hero')).toHaveCSS('opacity', '1');
    await expect(page.locator('.resource-detail-compact-bar')).toBeHidden();
    await page.screenshot({ path: `test-results/detail-preview-expanded-${viewport.width}.png` });
    await expect(detail).not.toHaveClass(/is-header-collapsed/);
  });
}

test('detail thumbnails scroll continuously beyond groups 48 and 96 with bounded mounted images',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:224});
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
  const grid=page.locator('.resource-detail-thumbnail-grid');await expect(page.locator('.resource-detail-thumbnail').first()).toBeVisible();
  await grid.hover();await page.mouse.wheel(0,120);await page.waitForTimeout(280);await page.mouse.wheel(0,100000);
  await expect(page.getByRole('button',{name:/第 224 页：/})).toBeInViewport();
  expect(await page.locator('.resource-detail-thumbnail').count()).toBeLessThan(48);
  await page.mouse.wheel(0,-100000);await expect(page.getByRole('button',{name:/第 1 页：/})).toBeInViewport();
  const pager=page.getByRole('navigation',{name:'预览分页',exact:true});
  await expect(pager).toContainText('1 / 5');await pager.getByRole('button',{name:'下一组预览'}).click();
  await expect(pager).toContainText('2 / 5');await expect(page.getByRole('button',{name:/第 49 页：/})).toBeInViewport();
  await grid.hover();await page.mouse.wheel(0,800);await expect(pager).toContainText('2 / 5');
  expect(await page.locator('.resource-detail-thumbnail').count()).toBeLessThan(48);
  await pager.getByRole('button',{name:'上一组预览'}).click();await expect(pager).toContainText('1 / 5');
  await page.screenshot({path:'test-results/detail-pager-desktop.png'});
});

test.describe('phone continuous detail previews',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('page navigation follows the rendered phone density',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:224});await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await page.locator('.mobile-resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).getByRole('button',{name:'打开资源信息',exact:true}).click();
  const detail=page.locator('.resource-detail-page'),grid=page.locator('.resource-detail-thumbnail-grid');await expect(grid.locator('.resource-detail-thumbnail').first()).toBeVisible();
  for(const columns of[4,2,3]){
   await grid.evaluate((el,columns)=>{el.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;},columns);await detail.evaluate(el=>{el.scrollTop=0;});
   const pager=page.getByRole('navigation',{name:'预览分页',exact:true});await expect(pager).toContainText('1 / 5');await pager.getByRole('button',{name:'下一组预览'}).click();
   await expect(page.getByRole('navigation',{name:'浮动预览分页',exact:true})).toContainText('2 / 5');await expect(grid.getByRole('button',{name:/第 49 页：/}),`phone columns ${columns}`).toBeInViewport();
  }
 });
 test('original pager follows continuous scrolling and supports arrows and page input',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:224});
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await page.locator('.mobile-resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).getByRole('button',{name:'打开资源信息',exact:true}).click();
  const detail=page.locator('.resource-detail-page'),grid=page.locator('.resource-detail-thumbnail-grid');
  const inline=page.getByRole('navigation',{name:'预览分页',exact:true});await expect(inline).toContainText('1 / 5');
  await inline.getByRole('button',{name:'下一组预览'}).click();
  const floating=page.getByRole('navigation',{name:'浮动预览分页',exact:true});await expect(floating).toContainText('2 / 5');
  await expect(grid.getByRole('button',{name:/第 49 页：/})).toBeInViewport();
  const before=await detail.evaluate(el=>el.scrollTop);await detail.hover({position:{x:100,y:300}});await page.mouse.wheel(0,450);
  await expect.poll(()=>detail.evaluate(el=>el.scrollTop)).toBeGreaterThan(before);await expect(floating).toContainText('2 / 5');
  await floating.getByRole('button',{name:/跳转页码/}).click();await page.getByRole('textbox',{name:'跳转页码输入'}).fill('4');await page.getByRole('button',{name:'跳转',exact:true}).click();
  await expect(floating).toContainText('4 / 5');await expect(grid.getByRole('button',{name:/第 145 页：/})).toBeInViewport();
  await detail.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(grid.getByRole('button',{name:/第 224 页：/})).toBeInViewport();await expect(floating).toContainText('5 / 5');
  expect(await grid.locator('.resource-detail-thumbnail').count()).toBeLessThan(48);await expect(floating.getByRole('button',{name:'下一组预览'})).toBeDisabled();
  await page.screenshot({path:'test-results/detail-pager-mobile.png'});
 });
});

test('detail group navigation works at every thumbnail column setting',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:224});
 await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
 const grid=page.locator('.resource-detail-thumbnail-grid'),pager=page.getByRole('navigation',{name:'预览分页',exact:true});
 for(const scale of[40,55,75,100,125,150,200]){
  await setCardScale(page.getByRole('slider',{name:'缩略预览大小'}),scale);await grid.evaluate(el=>{el.scrollTop=0;});await expect(pager).toContainText('1 / 5');
  await pager.getByRole('button',{name:'下一组预览'}).click();await expect(pager,`scale ${scale}`).toContainText('2 / 5');
  await expect(grid.getByRole('button',{name:/第 49 页：/}),`scale ${scale}`).toBeInViewport();
  await pager.getByRole('button',{name:'下一组预览'}).click();await expect(pager,`scale ${scale}`).toContainText('3 / 5');
  await expect(grid.getByRole('button',{name:/第 97 页：/}),`scale ${scale}`).toBeInViewport();
  for(const button of await pager.locator('button').all()){
   const bounds=(await button.boundingBox())!,icon=(await button.locator('svg').boundingBox())!;
   expect(Math.abs(icon.y+icon.height/2-bounds.y-bounds.height/2)).toBeLessThan(.5);
  }
 }
});
