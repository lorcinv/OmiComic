import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
async function seed(page: Page, count = 10000) {
 await page.addInitScript(installMock, {count});
}
test('home shows only three recent comics, brand returns home',async({page})=>{
 await seed(page);await page.goto('/');await expect(page.locator('.omi-home__book')).toHaveCount(3);
 await page.screenshot({path:'test-results/home-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'打开资源库',exact:true}).click();
 await expect(page.locator('.resource-card')).toHaveCount(60);
 await page.getByRole('button',{name:'OmiComic',exact:true}).click();
 await expect(page.locator('.omi-home__book')).toHaveCount(3);
});
test('image-less parent navigates without error banner',async({page})=>{
 await seed(page);await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
 await page.locator('.resource-card').filter({hasText:'Parent'}).dblclick();
 await expect(page.locator('.resource-card')).toHaveCount(1);
 await expect(page.getByText('未在该文件夹中找到可阅读图片。',{exact:true})).toHaveCount(0);
});
test('10,000-page details remain bounded, paging and editor are stable',async({page})=>{
 await seed(page);await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
 await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
 await expect(page.locator('.resource-detail-thumbnail')).toHaveCount(48);
 await expect(page.getByRole('button',{name:'添加标签',exact:true})).toBeVisible();
 const summary=page.locator('.resource-detail-direct-summary > p');const before=await summary.boundingBox();
 await summary.dblclick();await expect(page.getByRole('textbox',{name:'资源简介'})).toBeVisible();
 const after=await page.getByRole('textbox',{name:'资源简介'}).boundingBox();expect(after?.height).toBe(before?.height);expect(after?.y).toBe(before?.y);
 await page.getByRole('textbox',{name:'资源简介'}).fill('保存我的简介');
 await page.locator('.resource-detail-direct-editor').click({position:{x:100,y:180}});
 await expect(page.getByRole('textbox',{name:'资源简介'})).toHaveCount(0);
 await page.getByRole('button',{name:'下一组预览'}).click();
 await expect(page.locator('.resource-detail-thumbnail').first()).toHaveAttribute('aria-label',/第 49 页/);
 await expect(page.locator('.resource-detail-thumbnail')).toHaveCount(48);
 expect(await page.evaluate(()=>(window as any).__previewCalls)).toBeLessThanOrEqual(96);
 await page.screenshot({path:'test-results/detail-desktop.png',fullPage:true});
});

test('home stays within a narrow desktop viewport', async ({page}) => {
 await seed(page); await page.setViewportSize({width:1024,height:768}); await page.goto('/');
 await expect(page.locator('.omi-home__book')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/home-compact.png',fullPage:true});
});

test('real PDF worker renders, changes page and releases its session',async({page})=>{
 const {readFileSync}=await import('node:fs');
 const bytes=Array.from(readFileSync('tests/fixtures/documents/three-pages.pdf'));
 await seed(page,3);
 await page.addInitScript(({bytes})=>{
   const api=(window as any).omicomic;const getData=api.getAppData;
   api.getAppData=async()=>{const result=await getData();result.data.recentOpened=[{resourceKey:'pdf:/comics/sample.pdf',sourcePath:'/comics/sample.pdf',sourceType:'pdf',title:'Small PDF',currentPageIndex:1,totalPages:3,updatedAt:1}];return result;};
   api.getResourcePages=async()=>({ok:true,data:{key:'pdf:/comics/sample.pdf',resourceKey:'pdf:/comics/sample.pdf',sourcePath:'/comics/sample.pdf',sourceType:'pdf',title:'Small PDF',pages:[],total:0}});
   api.openDocument=async()=>({ok:true,data:{size:bytes.length,chapters:[]}});
   api.readDocumentRange=async(_id:string,begin:number,end:number)=>({ok:true,data:new Uint8Array(bytes.slice(begin,end))});
   (window as any).__closedDocuments=[];
   api.closeDocument=async(id:string)=>{(window as any).__closedDocuments.push(id);return {ok:true,data:null};};
 },{bytes});
 await page.goto('/');await page.getByRole('button',{name:/继续阅读 Small PDF/}).click();
 const canvas=page.locator('.document-reader canvas');await expect(canvas).toBeVisible({timeout:20000});
 await expect(page.getByRole('spinbutton',{name:'页码'})).toHaveValue('2');
 const hasInk=await canvas.evaluate((element:HTMLCanvasElement)=>{const pixels=element.getContext('2d')!.getImageData(0,0,element.width,element.height).data;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]>0&&pixels[i]<240)return true;}return false;});
 expect(hasInk).toBe(true);
 await page.getByRole('button',{name:'下一页',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'页码'})).toHaveValue('3');await expect(canvas).toBeVisible();
 await page.screenshot({path:'test-results/pdf-render.png',fullPage:true});
 await page.getByRole('button',{name:'返回资源库',exact:true}).click();await expect(page.locator('.document-reader')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__closedDocuments.length)).toBeGreaterThan(0);
});
