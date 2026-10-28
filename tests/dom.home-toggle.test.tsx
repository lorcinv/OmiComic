import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import App from '../src/App';
import MobileSettings from '../src/components/MobileSettings';
import { androidCall } from '../src/android/bridge';
import { setUiLanguage } from '../src/i18n';
import { clearResourceThumbnailCache } from '../src/reader/thumbnailClient';
import { installMock } from './mock';

vi.mock('../src/android/bridge', () => ({ androidCall: vi.fn(async () => true), androidNotify: vi.fn(), hasAndroidRenderer: () => false }));
vi.mock('../src/pages/ReaderPage', async () => {
  const React = await import('react');
  return { default: (props: any) => { React.useEffect(() => { props.onReady?.(); }, []); return <section data-testid="startup-reader">{props.resource?.title}</section>; } };
});

async function seed(home?: boolean) {
  installMock({ count: 3 }); clearResourceThumbnailCache(); setUiLanguage('zh-CN');
  const result = await window.omicomic.getAppData(); if (!result.ok) throw new Error('Fixture failed');
  if (home !== undefined) result.data.settings.showHomePage = home;
  const data = vi.spyOn(window.omicomic, 'getAppData');
  const covers = vi.spyOn(window.omicomic, 'getThumbnail');
  const directory = vi.spyOn(window.omicomic, 'listDirectory');
  window.omicomic.minimizeWindow = vi.fn(async () => ({ ok: true, data: null }));
  return { initial: result, data, covers, directory };
}

afterEach(() => { delete document.documentElement.dataset.platform; setUiLanguage('zh-CN'); });

describe('optional home screen startup', () => {
  it('keeps old settings on home and shares one startup settings read through StrictMode', async () => {
    const fixture = await seed(); render(<StrictMode><App /></StrictMode>);
    await waitFor(() => expect(document.querySelectorAll('.omi-home__book')).toHaveLength(3));
    expect(fixture.data).toHaveBeenCalledTimes(1); expect(fixture.directory).not.toHaveBeenCalled();
    expect(fixture.covers.mock.calls.map(([input]) => input.path).sort()).toEqual(['/comics/First','/comics/Second','/comics/Third']);
  });

  it('starts in the library without home cover work or a second settings read', async () => {
    const fixture = await seed(false); render(<StrictMode><App /></StrictMode>);
    await waitFor(() => expect(document.querySelector('.page-panel.is-visible .resource-card')).not.toBeNull());
    expect(document.querySelector('.omi-home')).toBeNull();
    expect(fixture.data).toHaveBeenCalledTimes(1); expect(fixture.directory).toHaveBeenCalledTimes(1);
    expect(fixture.covers.mock.calls.some(([input]) => /\/(First|Second|Third|Fourth)$/.test(input.path))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'OmiComic', exact: true }));
    expect(document.querySelector('.omi-home')).toBeNull();
  });

  it('does not restart home covers while the mobile library is being prepared', async () => {
    document.documentElement.dataset.platform = 'android';
    const fixture = await seed(), listing = await fixture.directory('/comics');
    fixture.directory.mockClear(); let release!: (value: typeof listing) => void;
    fixture.directory.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    render(<App />);
    await waitFor(() => expect(document.querySelectorAll('.omi-home__book')).toHaveLength(4));
    expect(fixture.data).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: '打开资源库', exact: true })[0]);
    await waitFor(() => expect(fixture.directory).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(document.querySelector('.omi-home')).not.toBeNull();
    expect(fixture.data).toHaveBeenCalledTimes(2);
    expect(fixture.covers.mock.calls.filter(([input]) => /\/(First|Second|Third|Fourth)$/.test(input.path))).toHaveLength(4);
    await act(async () => { release(listing); });
    await waitFor(() => expect(document.querySelector('.page-panel.is-visible .resource-card')).not.toBeNull());
  });

  it('waits for the initial directory before releasing the Android launch cover', async () => {
    document.documentElement.dataset.platform = 'android';
    const fixture = await seed(false), listing = await fixture.directory('/comics');
    fixture.directory.mockClear(); let release!: (value: typeof listing) => void;
    fixture.directory.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    vi.mocked(androidCall).mockClear(); render(<App />);
    await waitFor(() => expect(fixture.directory).toHaveBeenCalledTimes(1));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 65)); });
    expect(vi.mocked(androidCall).mock.calls.some(([method]) => method === 'finishLaunch')).toBe(false);
    await act(async () => { release(listing); });
    await waitFor(() => expect(vi.mocked(androidCall).mock.calls.filter(([method]) => method === 'finishLaunch')).toHaveLength(1));
    expect(vi.mocked(androidCall).mock.calls.some(([method]) => method === 'beginScene')).toBe(false);
    expect(fixture.data).toHaveBeenCalledTimes(1); expect(document.querySelector('.omi-home')).toBeNull();
  });

  it('handles an empty library and sends root Android Back to the background', async () => {
    document.documentElement.dataset.platform = 'android';
    const fixture = await seed(false); fixture.initial.data.library.roots = [];
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'OmiComic', exact: true }).hasAttribute('disabled')).toBe(false));
    act(() => { window.dispatchEvent(new Event('omi-back')); });
    expect(window.omicomic.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.omi-home')).toBeNull(); expect(fixture.directory).not.toHaveBeenCalled();
    expect(fixture.data).toHaveBeenCalledTimes(1);
  });

  it('does not let a delayed startup preference replace an external reader', async () => {
    const fixture = await seed(false); let release!: (value: typeof fixture.initial) => void;
    fixture.data.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const resource = { key:'archive:/outside/External.cbz', resourceKey:'archive:/outside/External.cbz', sourcePath:'/outside/External.cbz', sourceType:'archive' as const, title:'External', pages:[], total:1 };
    vi.spyOn(window.omicomic,'takeExternalOpen').mockResolvedValueOnce({ ok:true,data:{resource,initialPageIndex:0} }).mockResolvedValue({ok:true,data:null});
    render(<App />);
    await screen.findByTestId('startup-reader');
    await act(async () => { release(fixture.initial); });
    await waitFor(() => expect(document.querySelector('.app-content')?.getAttribute('aria-busy')).toBeNull());
    expect(screen.getByTestId('startup-reader').textContent).toBe('External');
    expect(document.querySelector('.omi-home')).toBeNull(); expect(fixture.directory).not.toHaveBeenCalled();
    expect(fixture.data).toHaveBeenCalledTimes(1);
  });

  it('keeps an external reader visible when the startup directory completes later', async () => {
    const fixture = await seed(false), listing = await fixture.directory('/comics');
    fixture.directory.mockClear(); let release!: (value: typeof listing) => void, receive!: () => void;
    fixture.directory.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    vi.spyOn(window.omicomic,'onExternalOpen').mockImplementation(callback => { receive = callback; return () => {}; });
    const take = vi.spyOn(window.omicomic,'takeExternalOpen').mockResolvedValue({ok:true,data:null});
    render(<App />); await waitFor(() => expect(fixture.directory).toHaveBeenCalledTimes(1));
    const resource = { key:'archive:/outside/Later.cbz',resourceKey:'archive:/outside/Later.cbz',sourcePath:'/outside/Later.cbz',sourceType:'archive' as const,title:'Later external',pages:[],total:1 };
    take.mockResolvedValueOnce({ok:true,data:{resource,initialPageIndex:0}});
    act(() => { receive(); }); await screen.findByTestId('startup-reader');
    await act(async () => { release(listing); });
    await waitFor(() => expect(document.querySelector('.library-layout [data-library-index]')).not.toBeNull());
    expect(document.querySelector('.page-panel.is-visible [data-testid="startup-reader"]')?.textContent).toBe('Later external');
    // One startup read plus the existing refresh triggered by the new external-open token.
    expect(document.querySelector('.omi-home')).toBeNull(); expect(fixture.data).toHaveBeenCalledTimes(2);
  });

  it('falls back to an actionable home screen after settings read failure', async () => {
    const fixture = await seed(); fixture.data.mockResolvedValueOnce({ ok:false,error:{code:'READ_FAILED',message:'无法读取设置'} });
    render(<App />);
    await waitFor(() => expect(document.querySelector('.omi-home')).not.toBeNull());
    expect(screen.getByRole('alert').textContent).toContain('无法读取设置');
    fireEvent.click(screen.getAllByRole('button',{name:'打开资源库',exact:true})[0]);
    await waitFor(() => expect(document.querySelector('.page-panel.is-visible .resource-card')).not.toBeNull());
  });

  it('offers the same opt-out in PC and mobile settings and persists changes before notifying', async () => {
    const fixture = await seed(false), saved = vi.spyOn(window.omicomic,'updateSettings'), changed = vi.fn();
    window.addEventListener('omi-home-visibility-changed',changed);
    const view = render(<App />);
    await waitFor(() => expect(document.querySelector('.page-panel.is-visible .resource-card')).not.toBeNull());
    fireEvent.click(screen.getByRole('button',{name:'设置',exact:true}));
    fireEvent.click(document.getElementById('settings-category-appearance')!);
    const checkbox = screen.getByRole('checkbox',{name:'显示主界面',exact:true});
    expect((checkbox as HTMLInputElement).checked).toBe(false); fireEvent.click(checkbox);
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1)); expect(saved).toHaveBeenCalledWith({showHomePage:true});
    view.unmount(); changed.mockClear();
    render(<MobileSettings settings={fixture.initial.data.settings} onSaved={()=>{}} onClose={()=>{}} bookSettings={null}/>);
    fireEvent.click(screen.getByRole('button',{name:/外观与主题/}));
    await waitFor(()=>expect(screen.getByRole('checkbox',{name:'显示主界面',exact:true})).not.toBeNull());
    const mobile = screen.getByRole('checkbox',{name:'显示主界面',exact:true}); expect((mobile as HTMLInputElement).checked).toBe(true); fireEvent.click(mobile);
    await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1)); expect(saved).toHaveBeenLastCalledWith({showHomePage:false});
    window.removeEventListener('omi-home-visibility-changed',changed);
  });

  it('synchronizes the retained library settings after a home-settings save without rereading data', async () => {
    const fixture = await seed(false); render(<App />);
    await waitFor(() => expect(document.querySelector('.page-panel.is-visible .resource-card')).not.toBeNull());
    await window.omicomic.updateSettings({showHomePage:true});
    act(() => { window.dispatchEvent(new CustomEvent('omi-home-visibility-changed',{detail:true})); });
    fireEvent.click(screen.getByRole('button',{name:'设置',exact:true}));
    fireEvent.click(document.getElementById('settings-category-appearance')!);
    expect((screen.getByRole('checkbox',{name:'显示主界面',exact:true}) as HTMLInputElement).checked).toBe(true);
    expect(fixture.data).toHaveBeenCalledTimes(1);
  });
});
