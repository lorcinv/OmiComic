import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { originalDirectoryContext, parentDirectory, resourcePosition } from '../src/reader/originalDirectoryContext';
import { useOriginalDirectoryContext } from '../src/hooks/useOriginalDirectoryContext';
import type { 阅读资源结果, 阅读打开上下文 } from '../src/types';

const resource = { resourceKey: 'archive:/series/02.cbz', sourcePath: '/series/02.cbz', sourceType: 'archive' } as 阅读资源结果;
const recent: 阅读打开上下文 = { source: 'recent', currentKey: resource.resourceKey, items: [{ key: 'wrong-history', path: '/other/book.cbz', type: 'archive', title: 'Wrong history' }] };
const entry = (name: string, type = 'archive') => ({ name, path: `/series/${name}`, type, id: name, extension: '' });
const directory = (items: any[]) => ({ ok: true as const, data: { path: '/series', parentPath: '/', items, total: items.length } });

describe('original-directory neighbours', () => {
  it('includes unread siblings in natural order, ignoring nested and non-book entries', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue(directory([entry('10.cbz'), entry('03.cbz'), entry('02.cbz'), entry('01.cbz'), entry('page.png', 'image'), entry('notes.txt', 'unknown'), { ...entry('nested.cbz'), path: '/series/sub/nested.cbz' }, { ...entry('empty', 'folder'), containsImages: false }])) };
    const result = await originalDirectoryContext(resource, api);
    expect(result?.items.map(i => i.title)).toEqual(['01.cbz', '02.cbz', '03.cbz', '10.cbz']);
    expect(result?.currentKey).toBe(resource.resourceKey);
    expect(result?.source).toBe('directory');
    expect(api.listDirectory).toHaveBeenCalledWith('/series', { background: true });
  });
  it('resolves sibling comic folders instead of pages within the current folder', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue(directory([entry('Vol 2', 'folder'), entry('Vol 10', 'folder')])) };
    const result = await originalDirectoryContext({ resourceKey: 'folder:/series/Vol 2', sourcePath: '/series/Vol 2', sourceType: 'folder' }, api);
    expect(result?.items[1].path).toBe('/series/Vol 10');
    expect(api.listDirectory).toHaveBeenCalledWith('/series', { background: true });
  });
  it('treats an image history entry as its comic folder, not as another individual page', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue(directory([entry('Vol 2', 'folder'), entry('Vol 10', 'folder')])) };
    const result = await originalDirectoryContext({ resourceKey: 'folder:/series/Vol 2', sourcePath: '/series/Vol 2/01.png', sourceType: 'image' }, api);
    expect(result?.currentKey).toBe('folder:/series/Vol 2');
    expect(result?.items[1].path).toBe('/series/Vol 10');
    expect(api.listDirectory).toHaveBeenCalledWith('/series', { background: true });
  });
  it('uses source-directory descending order and anchors the current path even with an obsolete context key', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue(directory([entry('10.cbz'), entry('01.cbz'), entry('02.cbz'), entry('03.cbz')])) };
    const context = (await originalDirectoryContext(resource, api, { sortMode: 'name-desc', folderFirst: false }))!;
    context.currentKey = context.items[0].key;
    const index = resourcePosition(resource, context);
    expect(context.items.map(i => i.title)).toEqual(['10.cbz', '03.cbz', '02.cbz', '01.cbz']);
    expect(index).toBe(2); expect(context.items[index + 1].title).toBe('01.cbz');
  });
  it('preserves the resource library timestamp ordering instead of restarting from its first entry', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue(directory([{ ...entry('01.cbz'), modifiedAt: 300 }, { ...entry('02.cbz'), modifiedAt: 100 }, { ...entry('03.cbz'), modifiedAt: 200 }, entry('04.cbz')])) };
    const context = (await originalDirectoryContext(resource, api, { sortMode: 'time-asc', folderFirst: false }))!;
    expect(context.items.map(i => i.title)).toEqual(['02.cbz', '03.cbz', '01.cbz', '04.cbz']);
    expect(context.items[resourcePosition(resource, context) + 1].title).toBe('03.cbz');
  });
  it('does not use an obsolete queue position when the current path is missing', () => {
    expect(resourcePosition(resource, { ...recent, source: 'directory', currentKey: 'wrong-history' })).toBe(-1);
  });
  it('does not invent neighbours when the grant is denied or current file has disappeared', async () => {
    expect(await originalDirectoryContext(resource, { listDirectory: vi.fn().mockResolvedValue({ ok: false }) })).toBeNull();
    expect(await originalDirectoryContext(resource, { listDirectory: vi.fn().mockResolvedValue(directory([entry('10.cbz')])) })).toBeNull();
  });
  it('handles Windows paths and roots without confusing drive roots with relative paths', () => {
    expect(parentDirectory('D:\\Comics\\Vol 2.cbz')).toBe('D:\\Comics');
    expect(parentDirectory('D:\\Vol 2')).toBe('D:\\');
    expect(parentDirectory('D:\\')).toBeNull();
    expect(parentDirectory('/local/grant/Series/Vol 2')).toBe('/local/grant/Series');
  });
  it('does not show history neighbours while loading and ignores a stale directory response', async () => {
    let finish!: (result: any) => void;
    window.omicomic = { listDirectory: vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(directory([entry('03.cbz'), entry('10.cbz')])) } as any;
    const { result, rerender } = renderHook(({ book }) => useOriginalDirectoryContext(book, recent, true), { initialProps: { book: resource } });
    expect(result.current).toBeNull();
    rerender({ book: { ...resource, sourcePath: '/series/03.cbz', resourceKey: 'archive:/series/03.cbz' } });
    await waitFor(() => expect(result.current?.currentKey).toBe('archive:/series/03.cbz'));
    await act(async () => finish(directory([entry('01.cbz'), entry('02.cbz')])));
    expect(result.current?.currentKey).toBe('archive:/series/03.cbz');
    expect(result.current?.items.at(-1)?.title).toBe('10.cbz');
  });
  it('preserves explicit favourite and bookshelf queues', () => {
    const listDirectory = vi.fn(); window.omicomic = { listDirectory } as any;
    const requested = { ...recent, source: 'favorites' as const };
    const { result } = renderHook(() => useOriginalDirectoryContext(resource, requested, true));
    expect(result.current).toBe(requested); expect(listDirectory).not.toHaveBeenCalled();
  });
});
