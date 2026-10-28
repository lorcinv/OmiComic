import { describe, it, expect } from 'vitest';
import { sampleRandom, collectRandomComics, secureRandomIndex } from '../src/library/randomBrowse';
import { vi } from 'vitest';
import type { 文件条目 } from '../src/types';

const file = (path: string, type: 文件条目['type']): 文件条目 => ({ id: path, path, name: path.split('/').at(-1)!, type, extension: '' });
describe('random comic browsing', () => {
  it('samples the requested count without duplicates, with independent redraws', () => {
    const items = Array.from({ length: 160 }, (_, index) => String(index));
    const first = sampleRandom([...items, '0'], 50, key => key);
    const second = sampleRandom(items, 50, key => key, first);
    expect(first).toHaveLength(50);
    expect(new Set(first).size).toBe(50);
    expect(new Set(second).size).toBe(50);
    // Previously drawn items keep the same eligibility as every other item.
    expect(sampleRandom(items, 2, key => key, items, () => 0)).toEqual(['0','1']);
    expect(sampleRandom(items, 500, key => key)).toHaveLength(160);
  });
  it('rejects the biased tail of 32-bit random values', () => {
    const values = [0xffffffff, 0xfffffffe, 8];
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array: any) => { array[0] = values.shift(); return array; });
    try { expect(secureRandomIndex(3)).toBe(2); expect(random).toHaveBeenCalledTimes(2); }
    finally { random.mockRestore(); }
  });
  it('recurses through nested directories, includes image books once and skips inaccessible children', async () => {
    const tree: Record<string, 文件条目[]> = {
      '/root': [file('/root/group', 'folder'), file('/root/images', 'folder'), file('/root/missing', 'folder'), file('/root/book.pdf', 'pdf')],
      '/root/group': [file('/root/group/book.cbz', 'archive'), file('/root/group/nested', 'folder')],
      '/root/group/nested': [file('/root/group/nested/story.epub', 'epub')],
      '/root/images': [file('/root/images/1.png', 'image'), file('/root/images/2.png', 'image')],
    };
    const result = await collectRandomComics('/root', async path => path in tree
      ? { ok: true, data: { path, parentPath: null, items: tree[path], total: tree[path].length } }
      : { ok: false, error: { code: 'NOT_FOUND', message: 'missing' } }, new AbortController().signal);
    expect(result.map(item => item.file.path).sort()).toEqual(['/root/book.pdf', '/root/group/book.cbz', '/root/group/nested/story.epub', '/root/images']);
  });
  it('stops scanning when canceled', async () => {
    const controller = new AbortController();
    let reads = 0;
    await expect(collectRandomComics('/root', async path => {
      reads++; controller.abort();
      return { ok: true, data: { path, parentPath: null, total: 1, items: [file('/root/child', 'folder')] } };
    }, controller.signal)).rejects.toThrow();
    expect(reads).toBe(1);
  });
});
