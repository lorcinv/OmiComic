import {test,expect,type Page} from '@playwright/test';
import {installMock} from './mock';
import {pdf} from './android/filmstrip-fixtures.cjs';
test.setTimeout(60000);
test.use({screenshot:'only-on-failure'});

async function fixture(page: Page, options: {
  rtl?: boolean;
  mobile?: boolean;
  document?: boolean;
  half?: 'L' | 'R';
  widePages?: boolean[];
} = {}) {
  const { rtl = false, mobile = false, document = false, half, widePages = [true, false, true] } = options;
  await page.addInitScript(installMock, { count: widePages.length });
  await page.addInitScript(async({rtl,document,bytes,half,widePages})=>{
    const api=window.omicomic,data=await api.getAppData();if(!data.ok)throw Error('fixture');
    Object.assign(data.data.settings,{readerDefaultFitMode:'fit-window',doublePageDirection:rtl?'right-to-left':'left-to-right',mobileReaderAutoHide:false,readerPreloadPages:2});
    const canvases=widePages.map((wide,index)=>{const c=window.document.createElement('canvas');c.width=wide?1200:600;c.height=900;const x=c.getContext('2d')!;x.fillStyle='#d84848';x.fillRect(0,0,c.width/2,c.height);x.fillStyle='#3984cc';x.fillRect(c.width/2,0,c.width/2,c.height);x.fillStyle='white';x.font='60px sans-serif';x.fillText(`${index+1} LEFT`,30,200);x.fillText(`${index+1} RIGHT`,c.width/2+20,600);return c;});
    (window as any).__reads=[];(window as any).__marks=[];
    api.getPageImage=async input=>{const n=Number(/page(\d+)/.exec(input.sourcePath)?.[1]??0);(window as any).__reads.push(n);const c=canvases[n];return{ok:true,data:{url:c.toDataURL(),width:c.width,height:c.height}};};
    api.getReadingProgress=async()=>({ok:true,data:(window as any).__saved.at(-1)??{currentPageIndex:0,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:rtl?'right-to-left':'left-to-right',flow:'horizontal',panorama:false,immersive:false,splitWidePages:true,splitPageHalf:half,autoRead:{intervalSeconds:1,scrollPixelsPerSecond:80}}}});
    api.toggleBookmark=async input=>{const a=(window as any).__marks,i=a.findIndex((x:any)=>x.pageId===input.pageId);if(i>=0)a.splice(i,1);else a.push(input);return{ok:true,data:{bookmarked:i<0}};};
    api.isPageBookmarked=async(_key,_index,id)=>({ok:true,data:(window as any).__marks.some((x:any)=>x.pageId===id)});
    if(document){
      api.getResourcePages=async()=>({ok:true,data:{key:'pdf:/spread.pdf',resourceKey:'pdf:/spread.pdf',sourcePath:'/spread.pdf',sourceType:'pdf',title:'Split PDF',pages:[],total:0}});
      api.openDocument=async()=>({ok:true,data:{size:bytes.length,chapters:[]}});
      api.readDocumentRange=async(_id,begin,end)=>({ok:true,data:new Uint8Array(bytes.slice(begin,end))});api.closeDocument=async()=>({ok:true,data:null});
    }
  },{rtl,document,bytes:[...Buffer.from(pdf(3).toString().replaceAll('/MediaBox [0 0 400 600]','/MediaBox [0 0 800 600]'))],half,widePages});
  await page.goto('/');
  if(mobile){await page.evaluate(()=>window.document.documentElement.dataset.platform='android');await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();}
  else await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const firstFrame = shown(page);
  await expect(document || widePages[0] ? firstFrame.locator('[data-reader-page-crop]') : firstFrame).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__saved.length)).toBeGreaterThan(0);
}
const shown=(page:Page)=>page.locator('.reader-page-frame:not([aria-hidden="true"])');

for (const rtl of [false, true]) {
  for (const immersive of [false, true]) {
    test(`desktop split keyboard turns each half once (${rtl ? 'RTL' : 'LTR'}, ${immersive ? 'immersive' : 'windowed'})`, async ({ page }) => {
      await fixture(page, { rtl, widePages: [false, true, false] });
      if (immersive) {
        await page.keyboard.press('f');
        await expect(page.locator('.reader-layout')).toHaveClass(/\bis-immersive\b/);
      }

      const next = rtl ? 'ArrowLeft' : 'ArrowRight';
      const previous = rtl ? 'ArrowRight' : 'ArrowLeft';
      const firstHalf = rtl ? 'R' : 'L';
      const secondHalf = rtl ? 'L' : 'R';
      const frame = shown(page);
      const steps = [
        [next, '1', firstHalf],
        [next, '1', secondHalf],
        [next, '2', undefined],
        [previous, '1', secondHalf],
        [previous, '1', firstHalf],
        [previous, '0', undefined],
      ] as const;
      for (const [key, sourceIndex, half] of steps) {
        await page.keyboard.press(key);
        await expect(frame).toHaveAttribute('data-reader-page-index', sourceIndex);
        if (half) await expect(frame).toHaveAttribute('data-reader-half', half);
      }
    });
  }
}

for(const rtl of [false,true])test(`desktop split mixed pages has reversible navigation and distinct bookmarks (${rtl?'RTL':'LTR'})`,async({page})=>{
  await fixture(page,{rtl});
  const first=rtl?'R':'L',second=rtl?'L':'R';
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(`1${first}`);
  await shown(page).locator('img.reader-image').evaluate(el=>(window as any).__sourceImage=el);
  await page.getByRole('button',{name:'添加当前页书签',exact:true}).click();
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(`1${second}`);
  await page.getByRole('textbox',{name:'跳转到页码'}).focus();await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(`1${second}`);
  expect(await shown(page).locator('img.reader-image').evaluate(el=>el===(window as any).__sourceImage)).toBe(true);
  await page.getByRole('button',{name:'添加当前页书签',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__marks.map((x:any)=>x.pageId))).toEqual([`omi-split:${first}:folder-image:page0.png`,`omi-split:${second}:folder-image:page0.png`]);
  await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('2');
  await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(`1${second}`);
  await page.getByRole('button',{name:'尾页',exact:true}).click();await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(`3${second}`);
  await expect.poll(()=>page.evaluate(()=>(window as any).__saved.at(-1)?.completed)).toBe(true);
  await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(`3${first}`);
  await expect.poll(()=>page.evaluate(()=>(window as any).__saved.at(-1)?.completed)).toBe(false);
});
test('desktop sidebar expands every control, preserves stage geometry, and modes bypass splitting',async({page})=>{
  await fixture(page,{half:'R'});await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('1R');
  const before=await page.locator('.reader-stage').boundingBox();
  await page.getByRole('button',{name:'阅读设置',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'阅读设置',exact:true});await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button',{name:'适应窗口',exact:true})).toBeVisible();await expect(drawer.getByRole('slider',{name:'亮度'})).toBeVisible();await expect(drawer.getByRole('slider',{name:'降噪'})).toBeVisible();
  expect(await page.locator('.reader-stage').boundingBox()).toEqual(before);
  await page.screenshot({path:'test-results/split-desktop-sidebar.png'});
  await drawer.getByRole('button',{name:'跨页拆分',exact:true}).click();await expect(shown(page).locator('[data-reader-page-crop]')).toHaveCount(0);
  await drawer.getByRole('button',{name:'跨页拆分',exact:true}).click();await expect(shown(page)).toHaveAttribute('data-reader-half','L');
  await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);
  await page.getByRole('button',{name:'当前单页，点击切换双页',exact:true}).click();await expect(shown(page).locator('[data-reader-page-crop]')).toHaveCount(0);
  await page.getByRole('button',{name:'当前双页，点击切换单页',exact:true}).click();await expect(shown(page)).toHaveAttribute('data-reader-half','L');
  await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();await expect(page.locator('[data-reader-page-crop]')).toHaveCount(0);
  await page.getByRole('button',{name:'关闭全景连环画',exact:true}).click();await expect(shown(page)).toHaveAttribute('data-reader-half','L');
});
test('PDF halves reuse the same canvas and restore the physical half',async({page})=>{
  await fixture(page,{document:true,half:'R'});await expect(shown(page)).toHaveAttribute('data-reader-half','R');
  await shown(page).locator('canvas.reader-pdf-canvas').evaluate(el=>(window as any).__sourceCanvas=el);
  await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(shown(page)).toHaveAttribute('data-reader-half','L');
  expect(await shown(page).locator('canvas.reader-pdf-canvas').evaluate(el=>el===(window as any).__sourceCanvas)).toBe(true);
  await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(shown(page)).toHaveAttribute('data-reader-half','R');
  await expect.poll(()=>page.evaluate(()=>(window as any).__saved.at(-1)?.readerViewState?.splitPageHalf)).toBe('R');
});

test('desktop settings cover window controls and consume only the outside closing gesture',async({page})=>{
  await fixture(page);
  const more=page.getByRole('button',{name:'阅读设置',exact:true}),immersive=page.getByRole('button',{name:'沉浸',exact:true});
  expect((await more.boundingBox())!.x).toBeGreaterThan((await immersive.boundingBox())!.x);
  await more.click();const drawer=page.getByRole('dialog',{name:'阅读设置',exact:true});
  expect((await drawer.boundingBox())!.y).toBe(0);await expect(drawer.getByRole('button',{name:'关闭面板'})).toHaveCount(0);
  const covered=await page.evaluate(()=>document.elementFromPoint(innerWidth-22,22)?.closest('.reader-display-sidebar')!==null);expect(covered).toBe(true);
  for(const theme of ['mist','nord','sand','night']){
    await page.evaluate(theme=>document.documentElement.dataset.colorTheme=theme,theme);
    const colors=await drawer.evaluate(el=>{const active=el.querySelector('button[aria-pressed="true"]')!,idle=el.querySelector('button[aria-pressed="false"]')!,probe=document.createElement('span');probe.style.backgroundColor='var(--强调色)';el.append(probe);const a=getComputedStyle(active),b=getComputedStyle(idle),result={active:a.backgroundColor,idle:b.backgroundColor,accent:getComputedStyle(probe).backgroundColor,blur:getComputedStyle(el).backdropFilter};probe.remove();return result;});
    expect(colors.active).toBe(colors.accent);expect(colors.idle).not.toBe(colors.active);expect(colors.blur).toContain('blur');
  }
  await page.evaluate(()=>document.documentElement.dataset.colorTheme='mist');
  await page.screenshot({path:'test-results/reader-polish-sidebar.png'});
  const stage=(await page.locator('.reader-stage').boundingBox())!,x=stage.x+stage.width*.7,y=stage.y+stage.height*.55;
  await page.mouse.click(x,y);await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('1L');
  await page.mouse.click(x,y);await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('1R');
});

for (const platform of ['win32', 'darwin']) test(`desktop ${platform} sidebars close from the top blank area and the rest of the window`, async ({ page }) => {
  await fixture(page);
  await page.evaluate(value => { document.documentElement.dataset.platform = value; }, platform);
  const layer = page.locator('.reader-sidebar-dismiss-layer');
  const viewport = page.viewportSize()!;
  for (const label of ['章节', '阅读设置']) {
    const toggle = page.getByRole('button', { name: label, exact: true });
    const sidebar = page.getByRole('dialog', { name: label, exact: true });
    const x = Math.round(viewport.width / 2);
    for (const y of [16, Math.round(viewport.height / 2), viewport.height - 12]) {
      await toggle.click();
      await expect(sidebar).toBeVisible();
      expect(await layer.boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      const target = await page.evaluate(([px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return hit?.matches('.reader-sidebar-dismiss-layer') && getComputedStyle(hit).getPropertyValue('app-region') === 'no-drag';
      }, [x, y]);
      expect(target).toBe(true);
      if (y === 16) {
        await sidebar.locator('.reader-sidebar-heading').click();
        await expect(sidebar).toBeVisible();
      }
      await page.mouse.click(x, y);
      await expect(sidebar).toHaveCount(0);
      await expect(layer).toHaveCount(0);
      await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('1L');
    }
    await toggle.click();
    await page.keyboard.press('Escape');
    await expect(sidebar).toHaveCount(0);
    await expect(toggle).toBeFocused();
  }
});

test('automatic reading advances through both halves and stops on the final half',async({page})=>{
  await fixture(page);await page.getByRole('button',{name:'开始自动阅读',exact:true}).click();
  const counter=page.getByRole('textbox',{name:'跳转到页码'});
  for(const label of ['1R','2','3L','3R'])await expect(counter).toHaveValue(label);
  await expect(page.getByRole('button',{name:'开始自动阅读',exact:true})).toBeVisible();
});
test.describe('mobile',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('immersive keeps its theme state and a touch release leaves no press or hover flash',async({page,context})=>{
    await fixture(page,{mobile:true});await page.locator('.reader-stage').click({position:{x:195,y:400}});await page.locator('.mobile-reader-more').click();
    const button=page.getByRole('button',{name:'沉浸',exact:true});
    await expect(button).toBeVisible();await button.click({trial:true});const rect=(await button.boundingBox())!,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2,id:1}]});
    await expect(button).toHaveAttribute('data-omi-pressed','true');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(button).toHaveAttribute('aria-pressed','true');
    expect(await button.getAttribute('data-omi-pressed')).toBeNull();
    const color=await button.evaluate(el=>{const probe=document.createElement('span');probe.style.backgroundColor='var(--强调色)';el.append(probe);const result={button:getComputedStyle(el).backgroundColor,accent:getComputedStyle(probe).backgroundColor,opacity:getComputedStyle(el).opacity};probe.remove();return result;});
    expect(color.button).toBe(color.accent);expect(color.opacity).toBe('1');
    await page.screenshot({path:'test-results/reader-polish-mobile.png'});await cdp.detach();
  });
  for(const rtl of [false,true])test(`split swipe previews follow halves without changing source index (${rtl?'RTL':'LTR'})`,async({page,context})=>{
    await fixture(page,{mobile:true,rtl});
    const box=(await page.locator('.reader-stage').boundingBox())!,sign=rtl?1:-1,x=box.x+box.width*(rtl?.2:.8),y=box.y+box.height*.55,cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+sign*50,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+sign*70,y,id:1}]});
    await expect(page.locator('.reader-swipe-preview[data-swipe-active="true"] [data-reader-page-crop]')).toHaveAttribute('data-reader-page-crop',rtl?'L':'R');
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+sign*190,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(shown(page)).toHaveAttribute('data-reader-half',rtl?'L':'R');await expect(shown(page)).toHaveAttribute('data-reader-page-index','0');
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await page.getByRole('button',{name:'阅读设置',exact:true}).click();
    const rows=page.locator('.mobile-sheet .reader-actions');
    await expect(rows.locator('.reader-zoom-actions').getByRole('button',{name:'跨页拆分',exact:true})).toBeVisible();
    await expect(rows.locator('.reader-extra-tools').getByRole('button',{name:'沉浸',exact:true})).toBeVisible();
    for(const row of ['.reader-reading-actions','.reader-zoom-actions','.reader-extra-tools']){
      await expect(rows.locator(row)).toBeVisible();
      expect(await rows.locator(row).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    }
    if(!rtl)await page.screenshot({path:'test-results/split-mobile-controls.png'});
    await page.setViewportSize({width:320,height:720});
    for(const row of ['.reader-reading-actions','.reader-zoom-actions','.reader-extra-tools'])
      expect(await rows.locator(row).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  });
});
