import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import LibraryPage from '../src/pages/LibraryPage';
import { useBoundedRecord } from '../src/hooks/useBoundedRecord';
import { installMock } from './mock';

async function fixture() {
  installMock({ count: 1 });
  const result = await window.omicomic.getAppData();
  if (!result.ok) throw new Error('Fixture failure');
  return result.data;
}
function mountLibrary() {
  return render(<LibraryPage onHome={() => {}} onOpenReader={() => {}} refreshToken={0} isActive />);
}
function navigation(name: RegExp) {
  return within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name });
}

describe('bounded cover and document metadata regressions', () => {
  it('reuses unchanged page counts across view activation and refreshes them explicitly', async()=>{
    await fixture();let modifiedAt=1;
    window.omicomic.listDirectory=async path=>({ok:true,data:{path,parentPath:null,total:1,items:[{id:'book',path:'/comics/counting.cbz',name:'Counting',type:'archive',extension:'cbz',size:20,modifiedAt}]}});
    const count=vi.spyOn(window.omicomic,'getReadablePageCount').mockResolvedValue({ok:true,data:7});
    let cover='data:image/png;base64,old';
    vi.spyOn(window.omicomic,'getThumbnail').mockImplementation(async()=>({ok:true,data:{url:cover}}));
    const props={onHome:()=>{},onOpenReader:()=>{},refreshToken:0,isActive:true};
    const view=render(<LibraryPage {...props}/>);
    await waitFor(()=>expect(count).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(document.querySelector('.resource-preview img')?.getAttribute('src')).toBe(cover));
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
    view.rerender(<LibraryPage {...props} isActive={false}/>);view.rerender(<LibraryPage {...props}/>);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});expect(count).toHaveBeenCalledTimes(1);
    modifiedAt=2;cover='data:image/png;base64,new';fireEvent.click(screen.getByRole('button',{name:'刷新并检测失效资源',exact:true}));
    await waitFor(()=>expect(count).toHaveBeenCalledTimes(2));
    await waitFor(()=>expect(document.querySelector('.resource-preview img')?.getAttribute('src')).toBe(cover));
  });
  it('600 bookshelves request only the visible page covers and every visible cover loads', async () => {
    const data = await fixture();
    data.bookshelves = [{ id: 'shelf', name: 'Collection', createdAt: 0, updatedAt: 0, sortIndex: 0 }];
    data.virtualFolders = Array.from({ length: 600 }, (_, index) => ({
      id: `shelf-${index}`, bookshelfId: 'shelf', name: `Shelf ${String(index).padStart(3, '0')}`, note: '', tags: [],
      coverResourceKey: `cover-${index}`, createdAt: index, updatedAt: index, sortIndex: index,
      items: [0, 1].map(item => ({ id: `item-${index}-${item}`, folderId: `shelf-${index}`, resourceKey: item ? `fallback-${index}` : `cover-${index}`, sourcePath: `/cover-fixture/${index}-${item}.cbz`, sourceType: 'archive' as const, title: `Comic ${index}-${item}`, addedAt: 0, sortIndex: item })),
    }));
    const thumbnail = vi.spyOn(window.omicomic, 'getThumbnail');
    mountLibrary();
    await waitFor(() => expect(navigation(/^书架/).textContent).toContain('600'));
    fireEvent.click(navigation(/^书架/));
    await waitFor(() => expect(document.querySelectorAll('.bookshelf-folder-card').length).toBeGreaterThan(0));
    const mounted = document.querySelectorAll('.bookshelf-folder-card').length;
    expect(mounted).toBeLessThan(60);
    await waitFor(() => expect(document.querySelectorAll('.bookshelf-folder-shell.has-preview')).toHaveLength(mounted));
    const requested = thumbnail.mock.calls.map(([input]) => input.path).filter(path => path.startsWith('/cover-fixture/'));
    // Demand follows the viewport independently of the logical page capacity.
    expect(new Set(requested).size).toBe(mounted);
    expect(requested.length).toBeLessThanOrEqual(mounted * 2);
    expect(document.querySelectorAll('.bookshelf-folder-cover > img')).toHaveLength(mounted);
  });

  it.each(['recent', 'favorites'] as const)('keeps PDF source type in %s cards and detail metadata', async view => {
    const data = await fixture();
    const pdf = { resourceKey: 'pdf:/comics/book.pdf', sourcePath: '/comics/book.pdf', sourceType: 'pdf' as const, title: 'PDF document', currentPageIndex: 8, totalPages: 100, updatedAt: 1 };
    data.recentOpened = [pdf];
    data.favorites = [{ ...pdf, addedAt: 1, sortIndex: 0 }];
    window.omicomic.getRecentOpened = async () => ({ ok: true, data: [pdf] });
    window.omicomic.getFavorites = async () => ({ ok: true, data: data.favorites });
    window.omicomic.getResourcePages = vi.fn(async () => ({ ok: true as const, data: { key: pdf.resourceKey, resourceKey: pdf.resourceKey, sourcePath: pdf.sourcePath, sourceType: 'pdf' as const, title: pdf.title, pages: [], total: 0 } }));
    const metadata = vi.spyOn(window.omicomic, 'updateResourceMeta');
    mountLibrary();
    await waitFor(() => expect(navigation(view === 'recent' ? /^最近阅读/ : /^收藏/).textContent).toContain('1'));
    fireEvent.click(navigation(view === 'recent' ? /^最近阅读/ : /^收藏/));
    const card = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.resource-card.resource-pdf');
      expect(found).not.toBeNull();
      return found!;
    });
    fireEvent.click(within(card).getByRole('button', { name: '打开资源信息' }));
    await waitFor(() => expect(window.omicomic.getResourcePages).toHaveBeenCalledWith({ path: pdf.sourcePath, type: 'pdf' }));
    fireEvent.doubleClick(document.querySelector('.resource-detail-direct-summary > p')!);
    fireEvent.change(screen.getByRole('textbox', { name: '资源简介' }), { target: { value: `PDF ${view} note` } });
    fireEvent.pointerDown(document.querySelector('.resource-detail-direct-editor')!);
    await waitFor(() => expect(metadata).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'pdf', resourceKey: pdf.resourceKey, note: `PDF ${view} note` })));
  });

  it('bounded records retain a visible key when the caller promotes it before trimming', () => {
    const { result } = renderHook(() => useBoundedRecord<number>(3));
    act(() => result.current[1]({ a: 1, b: 2, c: 3 }));
    act(() => result.current[1](previous => {
      const next = { ...previous, d: 4 };
      delete (next as Record<string, number>).a;
      (next as Record<string, number>).a = previous.a;
      return next;
    }));
    expect(result.current[0]).toEqual({ c: 3, d: 4, a: 1 });
    expect(Object.keys(result.current[0])).toHaveLength(3);
  });
});
