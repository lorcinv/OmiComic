import { describe, it, expect, vi, afterEach } from 'vitest';
import { getResourceThumbnail, clearResourceThumbnailCache } from '../src/reader/thumbnailClient';
import { installMock } from './mock';
import { render, waitFor } from '@testing-library/react';
import LibraryPage from '../src/pages/LibraryPage';

describe('PC archive cover requests', () => {
  it('shares folder work across callers and invalidates it on a requested refresh', async () => {
    installMock({count:1});
    let finish!: (value:any)=>void;
    const thumbnail=vi.spyOn(window.omicomic,'getThumbnail').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const input={path:'/pc-shared-folder',type:'folder' as const};
    const first=getResourceThumbnail(input,undefined,'1:2'),second=getResourceThumbnail(input,undefined,'1:2');
    expect(thumbnail).toHaveBeenCalledTimes(1);
    finish({ok:true,data:{url:'cover'}});await Promise.all([first,second]);
    clearResourceThumbnailCache();thumbnail.mockResolvedValue({ok:true,data:{url:'fresh'}});
    await expect(getResourceThumbnail(input,undefined,'1:2')).resolves.toEqual({ok:true,data:{url:'fresh'}});
    expect(thumbnail).toHaveBeenCalledTimes(2);
  });
  it('shares an in-flight retry, recovers a temporary read failure and does not cache the failure', async () => {
    installMock({count:1});
    const thumbnail = vi.spyOn(window.omicomic, 'getThumbnail')
      .mockResolvedValueOnce({ok:true,data:{url:null,retryable:true}})
      .mockResolvedValue({ok:true,data:{url:'cover'}});
    const input = {path:'/comics/large.cbz',type:'archive' as const};
    const result = await Promise.all(Array.from({length:10},()=>getResourceThumbnail(input)));
    expect(thumbnail).toHaveBeenCalledTimes(2);
    expect(result.every(item=>item.ok&&item.data.url==='cover')).toBe(true);
    await getResourceThumbnail(input);
    expect(thumbnail).toHaveBeenCalledTimes(3);
  });
  it('does not retry a permanent rejection', async () => {
    installMock({count:1});
    const thumbnail = vi.spyOn(window.omicomic, 'getThumbnail').mockResolvedValue({ok:true,data:{url:null,retryable:false}});
    await getResourceThumbnail({path:'/comics/encrypted.cbz',type:'archive'});
    expect(thumbnail).toHaveBeenCalledTimes(1);
  });
  it('a failed library card can recover on revisiting the same unchanged file after the retry cooldown', async () => {
    installMock({count:1});
    window.omicomic.listDirectory = async path => ({ok:true,data:{path,parentPath:null,total:1,items:[
      {id:'scan',path:'/comics/scan.cbz',name:'Scan',type:'archive',extension:'cbz',size:900000000,modifiedAt:1},
    ]}});
    const thumbnail = vi.spyOn(window.omicomic,'getThumbnail').mockResolvedValue({ok:true,data:{url:null,retryable:true}});
    const props = {onHome:()=>{},onOpenReader:()=>{},refreshToken:0,isActive:true};
    const view = render(<LibraryPage {...props}/>);
    await waitFor(()=>expect(document.querySelector('.resource-preview.thumbnail-error')).not.toBeNull(),{timeout:3000});
    expect(thumbnail).toHaveBeenCalledTimes(2);
    thumbnail.mockResolvedValue({ok:true,data:{url:'data:image/png;base64,fixture'}});
    const now=Date.now(); vi.spyOn(Date,'now').mockReturnValue(now+11000);
    view.rerender(<LibraryPage {...props} isActive={false}/>);
    view.rerender(<LibraryPage {...props}/>);
    await waitFor(()=>expect(document.querySelector('.resource-preview.thumbnail-loaded')).not.toBeNull());
    expect(thumbnail).toHaveBeenCalledTimes(3);
  });
});

describe('Android incremental covers', () => {
  afterEach(() => { clearResourceThumbnailCache(); delete document.documentElement.dataset.platform; });
  it('retains Android covers across callers, invalidates changed files and shares active consumers', async () => {
    document.documentElement.dataset.platform = 'android'; installMock({count:1});
    const thumbnail = vi.spyOn(window.omicomic,'getThumbnail').mockResolvedValue({ok:true,data:{url:'cached-cover'}});
    const input = {path:'/cached/book.zip',type:'archive' as const};
    await Promise.all([getResourceThumbnail(input,undefined,'100:1'),getResourceThumbnail(input,undefined,'100:1')]);
    await getResourceThumbnail(input,undefined,'100:1');
    expect(thumbnail).toHaveBeenCalledTimes(1);
    await getResourceThumbnail(input,undefined,'101:2');
    expect(thumbnail).toHaveBeenCalledTimes(2);
    clearResourceThumbnailCache('/cached');
    await getResourceThumbnail(input,undefined,'101:2');
    expect(thumbnail).toHaveBeenCalledTimes(3);
  });
  it('one cancelled subscriber cannot cancel another view sharing the same cover', async () => {
    document.documentElement.dataset.platform = 'android'; installMock({count:1});
    let finish!: (value: any) => void;
    const thumbnail = vi.spyOn(window.omicomic,'getThumbnail').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController(), input = {path:'/shared',type:'folder' as const};
    const first = getResourceThumbnail(input,controller.signal), second = getResourceThumbnail(input);
    await waitFor(()=>expect(thumbnail).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(first).rejects.toThrow();
    finish({ok:true,data:{url:'shared-cover'}});
    await expect(second).resolves.toEqual({ok:true,data:{url:'shared-cover'}});
  });
  it('a changed file does not reuse or cache the previous in-flight native result', async () => {
    document.documentElement.dataset.platform = 'android'; installMock({count:1});
    let finish!: (value: any) => void;
    const thumbnail = vi.spyOn(window.omicomic,'getThumbnail')
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ok:true,data:{url:'new-cover'}});
    const input = {path:'/changed',type:'archive' as const};
    const old = getResourceThumbnail(input,undefined,'1');
    const rejected = expect(old).rejects.toThrow();
    await waitFor(()=>expect(thumbnail).toHaveBeenCalledTimes(1));
    await expect(getResourceThumbnail(input,undefined,'2')).resolves.toEqual({ok:true,data:{url:'new-cover'}});
    finish({ok:true,data:{url:'old-cover'}}); await rejected;
    await expect(getResourceThumbnail(input,undefined,'2')).resolves.toEqual({ok:true,data:{url:'new-cover'}});
    expect(thumbnail).toHaveBeenCalledTimes(2);
  });
  it('continues a deep search instead of treating a budget yield as a missing cover', async () => {
    document.documentElement.dataset.platform = 'android'; installMock({ count: 1 });
    const thumbnail = vi.spyOn(window.omicomic, 'getThumbnail')
      .mockResolvedValueOnce({ ok: true, data: { url: null, pending: true } })
      .mockResolvedValueOnce({ ok: true, data: { url: null, pending: true } })
      .mockResolvedValue({ ok: true, data: { url: 'deep-cover', itemCount: 1 } });
    const result = await getResourceThumbnail({ path: '/deep', type: 'folder' });
    expect(result).toEqual({ ok: true, data: { url: 'deep-cover', itemCount: 1 } });
    expect(thumbnail).toHaveBeenCalledTimes(3);
  });
  it('stops scheduling native work as soon as the view leaves', async () => {
    document.documentElement.dataset.platform = 'android'; installMock({ count: 1 });
    const controller = new AbortController();
    const thumbnail = vi.spyOn(window.omicomic, 'getThumbnail').mockImplementation(async () => {
      controller.abort(); return { ok: true, data: { url: null, pending: true } };
    });
    await expect(getResourceThumbnail({ path: '/cancelled', type: 'folder' }, controller.signal)).rejects.toThrow();
    expect(thumbnail).toHaveBeenCalledTimes(1);
  });
});
