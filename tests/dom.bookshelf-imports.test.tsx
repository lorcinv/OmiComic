import { expect, it, vi } from 'vitest';
import { collectBookshelfItems } from '../src/library/bookshelfImports';
import type { OmiComicApi, VirtualFolderItemInput, 文件条目 } from '../src/types';

const book = (path: string, type: VirtualFolderItemInput['sourceType'] = 'folder'): VirtualFolderItemInput => ({
  resourceKey: `${type}:${path}`, sourcePath: path, sourceType: type, title: path.split('/').at(-1)!,
});
const file = (path: string, type: 文件条目['type']): 文件条目 => ({ id: path, path, name: path.split('/').at(-1)!, type, extension: '' });
function directories(tree: Record<string, 文件条目[]>) {
  return { listDirectory: vi.fn(async (path: string) => ({ ok: true, data: { path, parentPath: null, items: tree[path] ?? [], total: 0 } })) } as Pick<OmiComicApi, 'listDirectory'>;
}

it('flattens a collection across every book format, keeping loose image pages as one comic', async () => {
  const api = directories({
    '/series': [file('/series/cover.png', 'image'), file('/series/volumes', 'folder'), file('/series/readme.txt', 'unknown')],
    '/series/volumes': [file('/series/volumes/pages', 'folder'), ...['cbz', 'rar', '7z'].map(ext => file(`/series/volumes/book.${ext}`, 'archive')),
      ...(['pdf', 'epub', 'mobi'] as const).map(ext => file(`/series/volumes/book.${ext}`, ext))],
    '/series/volumes/pages': [file('/series/volumes/pages/1.jpg', 'image'), file('/series/volumes/pages/2.jpg', 'image')],
  });
  const result = await collectBookshelfItems([book('/series')], api);
  expect(result.map(item => item.sourcePath)).toEqual(['/series', '/series/volumes/pages', '/series/volumes/book.cbz', '/series/volumes/book.rar', '/series/volumes/book.7z', '/series/volumes/book.pdf', '/series/volumes/book.epub', '/series/volumes/book.mobi']);
  expect(result.some(item => item.sourcePath === '/series/volumes')).toBe(false);
});

it('deduplicates overlapping selections and skips empty branches', async () => {
  const api = directories({ '/series': [file('/series/pages', 'folder'), file('/series/empty', 'folder')], '/series/pages': [file('/series/pages/1.png', 'image')] });
  expect(await collectBookshelfItems([book('/series'), book('/series/pages'), book('/series/pages')], api)).toEqual([book('/series/pages')]);
  expect(api.listDirectory).toHaveBeenCalledTimes(3);
});

it('does not produce an empty nested folder or perform directory reads for independent books', async () => {
  const api = directories({});
  const pdf = book('/book.pdf', 'pdf');
  expect(await collectBookshelfItems([pdf, pdf], api)).toEqual([pdf]);
  expect(api.listDirectory).not.toHaveBeenCalled();
  expect(await collectBookshelfItems([book('/empty')], api)).toEqual([]);
});

it('reports an unreadable branch before any shelf write instead of silently omitting books', async () => {
  const api = { listDirectory: vi.fn(async () => ({ ok: false, error: { code: 'DENIED', message: '目录授权失效。' } })) } as Pick<OmiComicApi, 'listDirectory'>;
  await expect(collectBookshelfItems([book('/locked')], api)).rejects.toThrow('目录授权失效。');
});
