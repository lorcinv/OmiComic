import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});

async function setup(page:Page) {
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(()=>{
    const w=window as any; w.__audit=[];w.__phase='initial';w.__pageId=Math.random();
    const original=document.startViewTransition.bind(document);
    document.startViewTransition=((update:any)=>{
      w.__audit.push({kind:'transition',phase:w.__phase,direction:document.documentElement.dataset.mobileNavigation});
      return original(update);
    }) as any;
  });
  await page.goto('/');
  await expect(page.getByRole('button',{name:'打开资源库',exact:true})).toBeVisible();
  await expect(page.locator('.omi-home')).toBeVisible();
  await page.waitForTimeout(400);
}
async function cycle(page:Page) {
  await page.evaluate(()=>{(window as any).__phase='background';window.dispatchEvent(new Event('omi-app-pause'));});
  await page.waitForTimeout(200);
  await page.evaluate(()=>{(window as any).__phase='resume';window.dispatchEvent(new Event('omi-app-resume'));});
  await page.waitForTimeout(400);
}
test('stable home and library do not switch or start transitions on lifecycle events',async({page})=>{
  await setup(page);const id=await page.evaluate(()=>(window as any).__pageId);
  for(let n=0;n<3;n++)await cycle(page);
  expect(await page.evaluate(()=>(window as any).__audit)).toEqual([]);
  await expect(page.locator('.omi-home')).toBeVisible();
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect(page.locator('.page-panel.is-visible .mobile-resource-card').first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  await page.evaluate(()=>(window as any).__audit=[]);
  for(let n=0;n<3;n++)await cycle(page);
  expect(await page.evaluate(()=>(window as any).__audit)).toEqual([]);
  await expect(page.locator('.page-panel.is-visible .mobile-resource-card').first()).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__pageId)).toBe(id);
});
test('completes first library entry after resume without replaying the old animation',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const api=window.omicomic,original=api.getAppData;
    api.getAppData=async()=>{await new Promise<void>(r=>(window as any).__releaseData=r);return original();};
  });
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseData)).toBe('function');
  await cycle(page);
  await page.evaluate(()=>{const w=window as any;w.__phase='after-resume-data';w.__releaseData();});
  await expect(page.locator('.page-panel.is-visible .mobile-resource-card').first()).toBeVisible();
  await page.waitForTimeout(350);
  const evidence=await page.evaluate(()=>(window as any).__audit);
  console.log('DEFERRED_LIBRARY',JSON.stringify(evidence));
  expect(evidence).toEqual([]);
});
test('finishes a queued navigation without replaying it after resume',async({page})=>{
  await setup(page);
  const result=await page.evaluate(async()=>{
    const nav=await import('/src/hooks/mobileNavigation.ts');const w=window as any;
    let release!:()=>void;const held=new Promise<void>(r=>release=r);let prepared=false;
    const first=nav.mobileNavigate(()=>{},'home-expand',()=>{prepared=true;return held;});
    while(!prepared)await new Promise(r=>setTimeout(r,5));
    const second=nav.mobileNavigate(()=>{},'home-collapse');
    window.dispatchEvent(new Event('omi-app-pause'));
    w.__phase='resume';window.dispatchEvent(new Event('omi-app-resume'));
    release();await Promise.all([first,second]);return w.__audit;
  });
  console.log('QUEUED_WEB',JSON.stringify(result));
  expect(result).toEqual([{kind:'transition',phase:'initial',direction:'home-expand'}]);
});

test('a delayed home settings request opens without replay after resume',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const api=window.omicomic,original=api.getAppData;
    api.getAppData=async()=>{api.getAppData=original;await new Promise<void>(r=>(window as any).__releaseData=r);return original();};
  });
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseData)).toBe('function');
  await cycle(page);await page.evaluate(()=>(window as any).__releaseData());
  await expect(page.locator('.mobile-settings-surface')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__audit)).toEqual([]);
  await page.getByRole('button',{name:/外观与主题/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__audit.length)).toBe(1);
});

test('a recent comic requested before backgrounding opens once without a resumed transition',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const api=window.omicomic,original=api.getResourcePages;
    api.getResourcePages=async input=>{api.getResourcePages=original;await new Promise<void>(r=>(window as any).__releaseData=r);return original(input);};
  });
  await page.locator('.omi-home__book').first().click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseData)).toBe('function');
  await cycle(page);await page.evaluate(()=>(window as any).__releaseData());
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__audit)).toEqual([]);
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.locator('.page-panel.is-visible .mobile-resource-card').first()).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__audit.length)).toBe(1);
});

test('a slow folder listing commits after unlock without replaying its animation',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  const parent=page.locator('.page-panel.is-visible .mobile-resource-card').filter({has:page.locator('strong',{hasText:'Parent'})});
  await expect(parent).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  await page.evaluate(()=>{
    const api=window.omicomic,original=api.listDirectory;(window as any).__audit=[];
    api.listDirectory=async input=>{if(input.endsWith('/Parent'))await new Promise<void>(r=>(window as any).__releaseData=r);return original(input);};
  });
  await parent.click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseData)).toBe('function');
  await cycle(page);await page.evaluate(()=>(window as any).__releaseData());
  await expect(page.locator('.page-panel.is-visible .mobile-resource-card strong',{hasText:'Nested'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__audit)).toEqual([]);
});

test('switching to the next comic while data is pending does not replay after resume',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await page.getByRole('button',{name:'最近阅读',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  await page.evaluate(()=>{
    const api=window.omicomic,original=api.getResourcePages;
    api.getResourcePages=async input=>{
      if(input.path.endsWith('/Second'))await new Promise<void>(r=>(window as any).__releaseData=r);
      const result=await original(input);if(result.ok)result.data.title=input.path.split('/').at(-1)!;return result;
    };
  });
  await page.locator('.page-panel.is-visible .mobile-resource-card').filter({has:page.locator('strong',{hasText:'First'})}).click();
  await expect(page.locator('.page-panel.is-visible .mobile-reader-title')).toHaveText('First');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  await page.evaluate(()=>(window as any).__audit=[]);await page.keyboard.press('ArrowDown');
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseData)).toBe('function');
  await cycle(page);await page.evaluate(()=>(window as any).__releaseData());
  await expect(page.locator('.page-panel.is-visible .mobile-reader-title')).toHaveText('Second');
  expect(await page.evaluate(()=>(window as any).__audit)).toEqual([]);
});
