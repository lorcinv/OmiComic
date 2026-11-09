import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { findReadableNeighbour, useReadableNeighbours } from '../src/hooks/useReadableNeighbours';
import type { 阅读打开上下文 } from '../src/types';

const context: 阅读打开上下文 = { source: 'directory', currentKey: 'current', items: [
  { key: 'left', path: '/01.cbz', type: 'archive', title: '01' },
  { key: 'empty', path: '/empty', type: 'folder', title: 'Empty' },
  { key: 'current', path: '/02.cbz', type: 'archive', title: '02' },
  { key: 'container', path: '/container', type: 'folder', title: 'Container' },
  { key: 'book', path: '/images', type: 'folder', title: 'Images' },
  { key: 'right', path: '/03.cbz', type: 'archive', title: '03' },
] };
const listing = (types: string[]) => ({ ok: true as const, data: { items: types.map(type => ({ type })) } });

describe('readable adjacent books', () => {
  it('skips organising folders but retains an actual image folder', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValueOnce(listing(['folder', 'archive'])).mockResolvedValueOnce(listing(['image'])) } as any;
    expect((await findReadableNeighbour(context, 2, 1, api))?.path).toBe('/images');
    expect(api.listDirectory.mock.calls).toEqual([['/container', { background: true }], ['/images', { background: true }]]);
  });
  it('skips empty folders in the reverse direction without changing queue order', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue(listing([])) } as any;
    expect((await findReadableNeighbour(context, 2, -1, api))?.path).toBe('/01.cbz');
  });
  it('continues past unavailable folders and reports no book at the end', async () => {
    const api = { listDirectory: vi.fn().mockResolvedValue({ ok: false, error: { code: 'DENIED' } }) } as any;
    expect((await findReadableNeighbour(context, 2, 1, api))?.path).toBe('/03.cbz');
    expect(await findReadableNeighbour(context, 5, 1, api)).toBeNull();
  });
  it('preserves exact bookmark entries without treating them as directory neighbours', async () => {
    const api = { listDirectory: vi.fn() } as any;
    expect((await findReadableNeighbour({ ...context, source: 'bookmarks' }, 2, 1, api))?.key).toBe('container');
    expect(api.listDirectory).not.toHaveBeenCalled();
  });
  it('does not expose an old neighbour while a different book is resolving', async () => {
    let finish!: (result: any) => void;
    const listDirectory = vi.fn().mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(listing(['image']));
    window.omicomic = { listDirectory } as any;
    const { result, rerender } = renderHook(({ index }) => useReadableNeighbours(context, index, true), { initialProps: { index: 0 } });
    expect(result.current.next).toBeNull(); rerender({ index: 2 });
    await waitFor(() => expect(result.current.next?.key).toBe('container'));
    await act(async () => finish(listing(['image'])));
    expect(result.current.next?.key).toBe('container');
  });
});
