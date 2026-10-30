import {test,expect} from '@playwright/test';
import {installMock} from './mock';
import {mobiFixture} from './helpers/mobiFixture.cjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC','base64');
for(const mobile of [false,true])test.describe(mobile?'phone':'desktop',()=>{
if(mobile)test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
test(`isolated ${mobile?'phone':'desktop'} MOBI reader keeps Chinese, images, paging and inert content`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const bytes=mobiFixture(['<p>第 1 页</p><img recindex="1" onerror="window.__mobiInjected=true">','<h1>第二章</h1><p>你好，Omi。</p><script>parent.__mobiInjected=true</script><iframe src="https://invalid.example"></iframe>'],[png]);
  await page.addInitScript(installMock,{count:3});
  await page.addInitScript(({bytes})=>{
    const api=window.omicomic;api.getResourcePages=async()=>({ok:true,data:{key:'mobi:/comics/Test.mobi',resourceKey:'mobi:/comics/Test.mobi',sourcePath:'/comics/Test.mobi',sourceType:'mobi',title:'MOBI test',pages:[],total:0}});
    api.openDocument=async()=>({ok:true,data:{size:bytes.length,chapters:[]}});api.readDocumentRange=async(_id,begin,end)=>({ok:true,data:new Uint8Array(bytes.slice(begin,end))});api.closeDocument=async()=>({ok:true,data:null});
  },{bytes:[...bytes]});
  await page.goto('/');
  if(mobile){await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();}
  else await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const iframe=page.locator('.reader-page-frame:not([aria-hidden]) iframe');await expect(iframe).toHaveCount(1,{timeout:20000});await expect(iframe.contentFrame().locator('img')).toHaveCount(1);
  expect(await iframe.contentFrame().locator('body').evaluate(body=>({padding:getComputedStyle(body).padding,image:body.dataset.omiImagePage}))).toEqual({padding:'0px',image:'true'});
  if(mobile)await page.locator('.reader-stage').tap({position:{x:350,y:300}});else await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(iframe.contentFrame().locator('body')).toContainText('你好，Omi。');await expect(iframe.contentFrame().locator('script,iframe')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__mobiInjected)).toBeUndefined();
});
});
