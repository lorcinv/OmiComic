import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for(const mobile of [false,true])test(`unsupported files never appear in ${mobile?'phone':'desktop'} library cards`,async({page})=>{
  await page.setViewportSize(mobile?{width:432,height:900}:{width:1440,height:960});
  await page.addInitScript(installMock,{count:1});
  await page.addInitScript(()=>{
    const entries=[['Folder.mp4','folder'],['Comic.cbz','archive'],['Page.png','image'],['Book.pdf','pdf'],['Book.epub','epub'],['Video.mp4','unknown'],['Audio.mp3','unknown'],['notes.txt','unknown'],['README','unknown']].map(([name,type])=>({id:'/comics/'+name,path:'/comics/'+name,name,type,extension:name.split('.').at(-1)!,size:1,modifiedAt:1}));
    window.omicomic.listDirectory=async path=>({ok:true,data:{path,parentPath:null,total:entries.length,items:entries as any}});
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  const cards=page.locator('.resource-card:visible,.mobile-resource-card:visible');await expect(cards).toHaveCount(5);
  for(const name of ['Folder.mp4','Comic.cbz','Page.png','Book.pdf','Book.epub'])await expect(cards.filter({hasText:name})).toHaveCount(1);
  for(const name of ['Video.mp4','Audio.mp3','notes.txt','README'])await expect(cards.filter({hasText:name})).toHaveCount(0);
  if(!mobile){const search=page.getByRole('textbox',{name:'搜索当前资源库',exact:true});await search.fill('Video');await expect(cards).toHaveCount(0);await search.fill('');await expect(cards).toHaveCount(5);}
});
