import { test, expect } from '@playwright/test';
import { installMock } from './mock';

async function open(page: import('@playwright/test').Page, stall: 'read' | 'decode') {
  await page.addInitScript(installMock, { count: 80 });
  await page.addInitScript(({ stall }) => {
    const api = window.omicomic, get = api.getAppData;
    api.getAppData = async () => { const r = await get(); if (r.ok) Object.assign(r.data.settings, { readerPreloadPages: 0, readerImageLoadConcurrency: 2 }); return r; };
    const c = document.createElement('canvas'); c.width = 600; c.height = 900;
    c.getContext('2d')!.fillRect(0, 0, 600, 900); const url = c.toDataURL();
    (window as any).__readerStall = true; (window as any).__pageReads = [];
    api.getPageImage = async input => {
      const index = Number(input.sourcePath.match(/page(\d+)/)?.[1]);
      (window as any).__pageReads.push(index);
      const held = (window as any).__readerStall && index > 0 && index < 10;
      if (held && stall === 'read') return new Promise(() => {});
      return { ok: true, data: { url: url + (held ? '#held' : '#clear') + index, width: 600, height: 900 } };
    };
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () { return this.src.includes('#held') ? new Promise(() => {}) : decode.call(this); };
  }, { stall });
  await page.goto('/'); await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  try { await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible(); }
  catch (error) {
    await test.info().attach('opening-state', { contentType: 'application/json', body: JSON.stringify(await page.evaluate(() => ({
      reads: (window as any).__pageReads,
      stages: [...document.querySelectorAll<HTMLElement>('.reader-stage')].map(stage => ({ width: stage.clientWidth, height: stage.clientHeight, text: stage.textContent?.slice(0, 250) })),
      frames: [...document.querySelectorAll<HTMLElement>('[data-reader-page-index]')].map(frame => ({ index: frame.dataset.readerPageIndex, hidden: frame.getAttribute('aria-hidden'), width: frame.clientWidth, height: frame.clientHeight, images: [...frame.querySelectorAll('img')].map(img => ({ width: img.naturalWidth, complete: img.complete })) })),
    })), null, 2) });
    throw error;
  }
  await expect.poll(() => page.locator('.reader-page-frame:not([aria-hidden="true"]) img.reader-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(600);
}

for (const stall of ['read', 'decode'] as const) test(`rapid turns release abandoned ${stall} jobs and reopening still works`, async ({ page }) => {
  await open(page, stall);
  await page.evaluate(async () => {
    const next = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '下一页')!;
    for (let i = 0; i < 12; i++) { next.click(); await new Promise(r => setTimeout(r, 40)); }
  });
  const shown = page.locator('.reader-page-frame:not([aria-hidden="true"])');
  await expect(shown).toHaveAttribute('data-reader-page-index', '12', { timeout: 2500 });
  await expect(shown.locator(':is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible();
  await expect(page.locator('.reader-page-error')).toHaveCount(0);
  await page.evaluate(() => { (window as any).__readerStall = false; });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '继续上次阅读', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  await expect(page.locator('.reader-page-frame:not([aria-hidden="true"]) :is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible({ timeout: 2500 });
});

test('a timed-out page can be retried without closing the book', async ({ page }) => {
  await open(page, 'read');
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.locator('.reader-page-error')).toBeVisible({ timeout: 13000 });
  await page.evaluate(() => { (window as any).__readerStall = false; });
  await page.getByRole('button', { name: '重试此页', exact: true }).click();
  const shown = page.locator('.reader-page-frame:not([aria-hidden="true"])');
  await expect(shown).toHaveAttribute('data-reader-page-index', '1', { timeout: 2500 });
  await expect(shown.locator(':is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible();
  await expect(page.locator('.reader-page-error')).toHaveCount(0);
});

test('rapid panorama navigation bypasses abandoned reads and displays the latest target', async ({ page }) => {
  await open(page, 'read');
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await page.evaluate(async () => {
    for (let i = 0; i < 12; i++) { [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '下一页')!.click(); await new Promise(r => setTimeout(r, 40)); }
  });
  await expect(page.getByRole('slider', { name: '阅读进度', exact: true })).toHaveAttribute('aria-valuenow', '13', { timeout: 3000 });
  await expect(page.locator('[data-reader-page-index="12"] :is(img.reader-image,.reader-display-raster,.reader-viewport-raster):visible').first()).toBeVisible();
});

test('handoff waits for the real DOM decode while ignoring a delayed optional display filter',async({page})=>{
  await page.addInitScript(installMock,{count:2});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=600;c.height=900;c.getContext('2d')!.fillRect(0,0,600,900);const url=c.toDataURL();
    window.omicomic.getPageImage=async input=>({ok:true,data:{url:url+'#'+input.sourcePath,width:600,height:900}});
    const decode=HTMLImageElement.prototype.decode,waiting:(()=>void)[]=[];let held=true;
    HTMLImageElement.prototype.decode=function(){return held&&this.classList.contains('reader-image')&&this.src.endsWith('page1.png')?new Promise<void>(resolve=>waiting.push(()=>{void decode.call(this).then(resolve);})):decode.call(this);};
    (window as any).__releaseDomDecode=()=>{held=false;waiting.splice(0).forEach(run=>run());};
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const shown=page.locator('.reader-page-frame:not([aria-hidden="true"])');await expect(shown).toHaveAttribute('data-reader-page-index','0');
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(page.locator('[data-reader-page-index="1"] img.reader-image')).toHaveJSProperty('naturalWidth',600);
  await expect(shown).toHaveAttribute('data-reader-page-index','0');
  await page.evaluate(()=>(window as any).__releaseDomDecode());
  await expect(shown).toHaveAttribute('data-reader-page-index','1');
});
