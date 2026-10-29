import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

async function setup(page: Page, theme='mist') {
  page.on('pageerror',error=>console.log('PAGE ERROR',error.message));
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(async theme => {
    const api=window.omicomic, data=(await api.getAppData() as any).data;
    Object.assign(data.settings,{colorTheme:theme,readerDefaultFitMode:'fit-window',mobileReaderPreviews:true});
    const book={resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',tags:['科幻','彩色'],note:'阅读与收藏',sortIndex:0,addedAt:1,createdAt:1,updatedAt:1};
    data.resourceMeta[book.resourceKey]=book;data.tagOrder=book.tags;
    data.favorites=[book];data.bookmarks=[{...book,id:'mark',bookmarkTitle:'书签',pageName:'00000003.png',pageIndex:2,totalPages:12}];
    data.readingProgress[book.resourceKey]={...book,currentPageIndex:2,totalPages:12,hasStartedReading:true,percent:25};
    data.bookshelves=[{id:'cat',name:'我的分类',sortIndex:0}];
    data.virtualFolders=[{id:'shelf',name:'我的书架',bookshelfId:'cat',items:[book],tags:['科幻'],note:'书架简介',sortIndex:0,createdAt:1,updatedAt:1}];
    api.getFavorites=async()=>({ok:true,data:data.favorites});api.getBookmarks=async()=>({ok:true,data:data.bookmarks});
    const original=api.getThumbnail;api.getThumbnail=async input=>{const r=await original(input);if(r.ok)r.data.byteSize=24*1024*1024;return r;};
    const c=document.createElement('canvas');c.width=600;c.height=900;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#d6e3eb';ctx.fillRect(0,0,600,900);ctx.fillStyle='#2e4457';ctx.font='80px sans-serif';ctx.fillText('OMI',200,440);
    const image=c.toDataURL();api.getBookmarkPagePreview=async()=>({ok:true,data:{dataUrl:image}});api.getPageImage=async()=>({ok:true,data:{url:image,width:600,height:900}});
  },theme);
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
}
async function close(page:Page) {await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));}
async function roleColor(page:Page,role:string) {
  return page.evaluate(role=>{const el=document.createElement('i');el.style.color=`var(--${role})`;document.body.append(el);const color=getComputedStyle(el).color;el.remove();return color;},role);
}
async function audit(page:Page,label:string,results:any[]) {
  const result=await page.evaluate(label=>{
    const legacy=/47, 115, 101|141, 185, 173|250, 248, 243|255, 254, 251|244, 242, 236/;
    const bad=[...document.querySelectorAll<HTMLElement>('button,[role="button"],input,textarea,[role="dialog"],.tag-chip,.tag-filter-chip,.settings-panel')].filter(el=>el.getBoundingClientRect().width&&el.getBoundingClientRect().height&&getComputedStyle(el).visibility!=='hidden').flatMap(el=>{
      const s=getComputedStyle(el);return ['color','backgroundColor','borderColor'].filter(key=>legacy.test((s as any)[key])).map(key=>({element:el.className,key,value:(s as any)[key]}));
    });
    const gradients=[...document.querySelectorAll<HTMLElement>('.omi-home,.library-layout,.library-main.is-resource-detail,.reader-stage')].filter(el=>el.getBoundingClientRect().width&&getComputedStyle(el).backgroundImage!=='none').map(el=>el.className);
    return {screen:label,legacyColors:bad,gradients,overflow:document.documentElement.scrollWidth>innerWidth};
  },label);
  expect(result.legacyColors,label).toEqual([]);expect(result.gradients,label).toEqual([]);expect(result.overflow,label).toBe(false);results.push(result);
}

test('theme role migration leaves no legacy light-only or green accent styling',()=>{
  const styles=readFileSync('src/styles/global.css','utf8')+readFileSync('src/styles/mobile.css','utf8')+readFileSync('src/styles/home.css','utf8');
  expect(styles).not.toMatch(/light-dark\(|#2f7365|#8db9ad|rgba\(47, 115, 101|#fffefb|#faf8f3/);
});

for(const mobile of [false,true]) test.describe(mobile?'phone theme audit':'PC theme audit',()=>{
  test.use(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
  for(const theme of ['mist','nord','sand','night']) test(`${theme}: dialogs, tags, all settings categories and reader tools`,async({page})=>{
    test.setTimeout(60000);page.setDefaultTimeout(8000);await setup(page,theme);const results:any[]=[];const prefix=`pc-ui-theme-${mobile?'phone':'pc'}-${theme}`;
    await audit(page,'home',results);await page.screenshot({path:`test-results/${prefix}-home.png`});
    await page.getByRole('button',{name:'打开资源库',exact:true}).click();await expect(page.locator('.resource-card').first()).toBeVisible();
    await audit(page,'library',results);
    await page.screenshot({path:`test-results/${prefix}-library.png`});
    const book=page.locator('.resource-card').filter({has:page.locator('.resource-details strong',{hasText:/^Book$/})});
    if(mobile){await expect(book.locator('.mobile-card-pages')).toHaveText('3/12 · 25% 24MB');await expect(book.locator('.mobile-card-pages')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');}
    await book.getByRole('button',{name:'打开资源信息'}).click();await expect(page.locator('#resource-detail-title')).toBeVisible();
    await expect(page.locator('.resource-detail-direct-tags .tag-chip').first()).toHaveCSS('color',await roleColor(page,mobile?'强调色':'控件文字'));
    await audit(page,'detail',results);await page.screenshot({path:`test-results/${prefix}-detail.png`});
    await page.getByRole('button',{name:'添加标签',exact:true}).click();const input=page.getByRole('textbox',{name:'新标签'});await input.focus();
    await expect(input).toHaveCSS('border-top-color',await roleColor(page,'强调色'));await audit(page,'add tag focused input',results);
    await page.screenshot({path:`test-results/${prefix}-add-tag.png`});
    if(mobile)await close(page);else await page.locator('#resource-detail-title').click();
    if(mobile)await page.getByRole('button',{name:'编辑简介'}).click();else await page.locator('.resource-detail-direct-summary > p').dblclick();await audit(page,'note editor',results);await page.locator('#resource-detail-title').click();
    if(mobile)await close(page);else await page.locator('.resource-detail-back').click();
    for(const label of ['收藏','书签','最近阅读','书架']){
      await page.locator('.page-panel.is-visible .library-sidebar button').filter({hasText:label}).first().click();await audit(page,label,results);
    }
    if(mobile)await page.getByRole('button',{name:'书架分类',exact:true}).click();
    await page.getByRole('button',{name:'新建书架',exact:true}).first().click();await expect(page.locator('.virtual-folder-dialog')).toBeVisible();
    const dialog=page.locator('.virtual-folder-dialog');
    await expect(dialog).toHaveCSS('background-color',await roleColor(page,'面板色'));
    await expect(dialog.locator('input')).toHaveCSS('border-top-color',await roleColor(page,'强调色'));
    await expect(dialog.locator('.primary-action')).toHaveCSS('background-color',await roleColor(page,'强调色'));
    await expect(dialog.locator('.primary-action')).toHaveCSS('color',await roleColor(page,'强调文字'));
    if(!mobile){await dialog.locator('.primary-action').hover();await expect(dialog.locator('.primary-action')).not.toHaveCSS('background-color',await roleColor(page,'控件悬停'));await page.mouse.move(230,60);}
    await audit(page,'create shelf',results);await page.screenshot({path:`test-results/${prefix}-new-shelf.png`});await dialog.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByRole('button',{name:/新建分类/}).first().click();await audit(page,'create shelf category',results);await page.locator('.root-delete-dialog').getByRole('button',{name:'取消',exact:true}).click();
    if(mobile){await close(page);await page.getByRole('button',{name:'显示选项'}).click();await audit(page,'display options',results);await page.getByRole('button',{name:/标签管理/}).click();}
    else await page.getByRole('button',{name:'标签',exact:true}).click();
    await audit(page,'tag management',results);await page.screenshot({path:`test-results/${prefix}-tags.png`});
    if(mobile)await close(page);else await page.keyboard.press('Escape');
    if(mobile){await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/应用设置/}).click();
      const categories=await page.locator('.mobile-setting-category').allTextContents();
      for(let i=0;i<categories.length;i++){await page.locator('.mobile-setting-category').nth(i).click();await audit(page,`settings: ${categories[i]}`,results);await close(page);await expect(page.locator('.mobile-setting-category')).toHaveCount(categories.length);}
      await page.getByRole('button',{name:'关闭设置',exact:true}).click();await expect(page.locator('.mobile-settings-page')).toHaveCount(0);
    }else{await page.locator('.sidebar-settings-button').click();const tabs=page.locator('.settings-window').getByRole('tab');const count=await tabs.count();for(let i=0;i<count;i++){await tabs.nth(i).click();await audit(page,`settings: ${await tabs.nth(i).innerText()}`,results);}await page.getByRole('button',{name:'关闭设置',exact:true}).click();}
    await page.locator('.page-panel.is-visible .library-sidebar button').filter({hasText:'资源库'}).first().click();await book.getByRole('button',{name:'打开资源信息'}).click();await page.locator('.resource-detail-read-button').click();await expectReaderPixels(page.locator('.reader-image').first());
    if(mobile){await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();}
    await audit(page,'reader controls',results);await page.getByRole('button',{name:'画面调整',exact:true}).click();if(!mobile){await expect(page.getByRole('button',{name:'画面调整',exact:true})).toHaveCSS('background-color',await roleColor(page,'强调色'));}await audit(page,'reader image adjustments',results);await page.screenshot({path:`test-results/${prefix}-reader.png`});if(mobile)await page.getByRole('button',{name:'关闭面板',exact:true}).click();else await page.keyboard.press('Escape');
    writeFileSync(`test-results/${prefix}-audit.json`,JSON.stringify(results,null,2));
  });
});

test.describe('phone motion and transparency',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('side panels animate on compositor, follow horizontal touch and keep vertical scrolling',async({page})=>{
    await setup(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'打开资源库',exact:true}).click();
    for(const right of [false,true]){
      if(right){await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/标签管理/}).click();}
      else await page.getByRole('button',{name:'资源库目录'}).click();
      const sheet=page.locator('.mobile-sheet');await expect(sheet).toBeVisible();await expect(sheet).toHaveCSS('backdrop-filter','none');
      await expect.poll(()=>sheet.evaluate(el=>el.getAnimations().length)).toBe(0);
      const content=page.locator('.mobile-sheet-content'),start=right?150:250,end=right?230:170;
      await content.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:start,clientY:300}]});await content.dispatchEvent('touchmove',{touches:[{identifier:1,clientX:end,clientY:302}]});
      await expect.poll(async()=>Math.abs(await sheet.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)-(right?80:-80))).toBeLessThan(1);
      await content.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:end,clientY:302}]});await expect(sheet).toHaveCount(0);
    }
  });
  test('filmstrip is transparent without blur; every jump frame remains below reader bars',async({page})=>{
    await setup(page);await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await expectReaderPixels(page.locator('.reader-image').first());await page.locator('.reader-stage').tap();
    await page.getByRole('button',{name:'阅读设置',exact:true}).click();await page.getByRole('button',{name:'开启全景连环画'}).click();await close(page);await expect(page.locator('.mobile-sheet')).toHaveCount(0);await page.emulateMedia({reducedMotion:'no-preference'});
    const rail=page.getByRole('slider',{name:'阅读进度'}),r=(await rail.boundingBox())!;
    await page.mouse.move(r.x+2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*.45,r.y+r.height/2,{steps:12});await page.mouse.up();
    const strip=page.locator('.mobile-reader-previews');await expect(strip).toBeVisible();await expect(strip).toHaveCSS('backdrop-filter','none');
    expect(await strip.evaluate(el=>getComputedStyle(el).backgroundColor)).toMatch(/\/ 0\.5\)/);
    const selected=strip.locator('.resource-detail-thumbnail.is-selected');await selected.hover();await expect(selected).toHaveCSS('transform','none');
    expect(await selected.evaluate(el=>getComputedStyle(el,'::after').borderTopWidth)).toBe('2px');
    expect(await selected.evaluate(el=>el.getBoundingClientRect().top-el.closest('.mobile-reader-filmstrip')!.getBoundingClientRect().top)).toBeGreaterThanOrEqual(1);
    await page.screenshot({path:'test-results/theme1110-transparent-preview.png'});await page.locator('.reader-stage').tap({position:{x:190,y:240}});await expect(strip).toHaveCount(0);await expect(page.locator('.reader-footer')).toBeVisible();
    await page.evaluate(()=>{
      (window as any).__layers={frames:0,violations:0,ghost:false};const check=()=>{const g=document.querySelector('.reader-panorama-jump-ghost'),out=(window as any).__layers;
        if(g){out.ghost=true;out.frames++;for(const bar of document.querySelectorAll<HTMLElement>('.reader-toolbar,.reader-footer')){const rect=bar.getBoundingClientRect();const hit=document.elementsFromPoint(rect.x+rect.width*.5,rect.y+rect.height*.5);if(hit.indexOf(bar)>hit.findIndex(el=>el.classList.contains('reader-stage')))out.violations++;}}
        if(out.frames<200)requestAnimationFrame(check);
      };requestAnimationFrame(check);
    });
    await page.mouse.click(r.x+r.width*.85,r.y+r.height/2);await expect(rail).toHaveAttribute('aria-valuenow','10');await expect(page.locator('.reader-panorama-jump-ghost')).toHaveCount(0);
    const result=await page.evaluate(()=>(window as any).__layers);expect(result.ghost).toBe(true);expect(result.frames).toBeGreaterThan(5);expect(result.violations).toBe(0);
    writeFileSync('test-results/theme1110-reader-layers.json',JSON.stringify(result));
  });
});
