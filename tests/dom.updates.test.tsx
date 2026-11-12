import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { compareVersions, selectUpdate, checkForUpdates } from '../src/updates';
import UpdateCheck from '../src/components/UpdateCheck';
const base = 'https://github.com/lorcinv/OmiComic';
const release = (tag: string, asset: string, extra = {}) => ({ tag_name: tag, html_url: `${base}/releases/tag/${tag}`, body: 'Reading fixes', assets: [{ name: asset, size: 1024, browser_download_url: `${base}/releases/download/${tag}/${asset}` }], ...extra });
const info = { name:'OmiComic', version:'1.1.96', platform:'win32', arch:'x64' };
beforeEach(()=>{ localStorage.clear(); window.omicomic = { getAppInfo: async()=>info } as any; });
afterEach(()=>{ vi.unstubAllGlobals(); });
describe('platform-specific update reminders',()=>{
  it('compares numeric versions and ignores prereleases and missing platform packages',()=>{
    expect(compareVersions('1.1.100','1.1.99')).toBe(1);
    const rows = [release('v1.1.100','OmiComic-android.apk'),release('v1.1.99','OmiComic-Setup-1.1.99-x64.exe'),release('v2.0.0','OmiComic-Setup-2.0.0-x64.exe',{prerelease:true})];
    expect(selectUpdate(rows,info)).toMatchObject({kind:'available',update:{version:'1.1.99'}});
    expect(selectUpdate(rows,{...info,platform:'ios'})).toEqual({kind:'unavailable'});
    expect(selectUpdate(rows,{...info,version:'1.1.99'})).toEqual({kind:'current'});
    expect(selectUpdate([release('v1.1.99','OmiComic-1.1.99-mac-arm64.dmg')],{...info,platform:'darwin',arch:'x64'})).toEqual({kind:'unavailable'});
    expect(selectUpdate([release('v1.1.99','OmiComic-1.1.99-mac-arm64.dmg')],{...info,platform:'darwin',arch:'arm64'})).toMatchObject({kind:'available'});
  });
  it('checks once per day automatically while manual checks remain retryable',async()=>{
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([release('v1.1.99','OmiComic-Setup-1.1.99-x64.exe')])));
    fetcher.mockImplementation(async()=>new Response(JSON.stringify([release('v1.1.99','OmiComic-Setup-1.1.99-x64.exe')])));
    vi.stubGlobal('fetch',fetcher);
    expect((await checkForUpdates(true))?.kind).toBe('available'); expect(await checkForUpdates(true)).toBeNull();
    await checkForUpdates(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed sources and shows a recoverable manual network error',async()=>{
    expect(selectUpdate([release('v9.0.0','OmiComic-Setup-x64.exe',{html_url:'https://example.com'})],info)).toEqual({kind:'unavailable'});
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
    render(<UpdateCheck/>); fireEvent.click(screen.getByRole('button',{name:/检查更新/}));
    await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('请检查网络后重试'));
    expect(screen.getByRole('button',{name:/检查更新/})).not.toHaveProperty('disabled',true);
  });
});
