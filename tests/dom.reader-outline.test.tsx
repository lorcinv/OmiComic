import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReaderOutlineSidebar from '../src/components/ReaderOutlineSidebar';
import type { DocumentSource } from '../src/reader/documentSource';
import { epubOutline, folderFilenameOutline, imageOutline, pdfOutline, readerPageCode } from '../src/reader/readerOutline';
import type { 阅读资源结果 } from '../src/types';

function book(names: string[], type: 'archive' | 'folder' | 'image' = 'archive'): 阅读资源结果 {
  return {
    sourcePath: '/comics/test', resourceKey: 'test', key: 'test', title: 'Test',
    sourceType: type, total: names.length,
    pages: names.map((name, index) => ({ name, index, sourcePath: '/comics/test', type: type === 'archive' ? 'archive-image' : 'folder-image' })),
  };
}

describe('reader outline', () => {
  it('skips the shared wrapper and lists archive chapter starting pages', () => {
    const resource = book(['Book/第01话/001.jpg', 'Book/第01话/002.jpg', 'Book/第02话.cbz / 001.jpg']);
    expect(imageOutline(resource.pages)).toEqual([
      { title: '第01话', depth: 0, target: { page: 0 } },
      { title: '第02话', depth: 0, target: { page: 2 } },
    ]);
    expect(imageOutline(book(['Book/001.jpg', 'Book/002.jpg']).pages)).toEqual([]);
  });

  it.each([
    ['第一话', '第二话'], ['第01章', '第02章'], ['第01話', '第02話'],
    ['Chapter 01', 'Chapter 02'], ['Episode 11', 'Episode 101'],
  ])('reads %s and %s from folder filenames in the supplied reading order', (first, second) => {
    const resource = book(['000.jpg', second + '-001.jpg', second + '-002.jpg', first + '-001.png'], 'folder');
    expect(folderFilenameOutline(resource.pages)).toEqual([
      { title: second, depth: 0, target: { page: 1 } },
      { title: first, depth: 0, target: { page: 3 } },
    ]);
  });

  it.each([
    ['001.jpg', '002.jpg', '卷3-001.jpg', '2026-01.jpg'],
    ['Chapter 1-001.jpg', 'chapter 01-002.jpg'],
    ['第01话-001.jpg', '第02话-001.jpg', '第01话-002.jpg'],
    ['漫画 Chapter 01-001.jpg', '漫画 Chapter 02-001.jpg'],
  ].map(names => [names]))('keeps a page list for names without clear chapter boundaries', (names) => {
    expect(folderFilenameOutline(book(names, 'folder').pages)).toEqual([]);
  });

  it.each(['folder', 'image'] as const)('jumps to a filename chapter from a %s entry point', (type) => {
    const resource = book(['第01话-001.jpg', '第01话-002.jpg', '第02话-001.jpg'], type);
    const onJump = vi.fn();
    render(<ReaderOutlineSidebar mobile={false} resource={resource} currentPage={0} onClose={vi.fn()} onJump={onJump} />);
    const dialog = within(screen.getByRole('dialog', { name: '章节' }));
    expect(dialog.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(dialog.getByRole('button', { name: '第02话 第 3 页' }));
    expect(onJump).toHaveBeenCalledWith(2, { title: '第02话', depth: 0, target: { page: 2 } });
  });

  it('keeps the original archive outline rules for flat image names', () => {
    const resource = book(['第01话-001.jpg', '第02话-001.jpg']);
    render(<ReaderOutlineSidebar mobile={false} resource={resource} currentPage={0} onClose={vi.fn()} onJump={vi.fn()} />);
    expect(within(screen.getByRole('dialog', { name: '章节' })).getByRole('button', { name: '001 1' })).toBeTruthy();
  });

  it('resolves EPUB 3 nested entries and percent-encoded anchors', () => {
    const entries = epubOutline({
      chapters: ['OPS/text/ch 1.xhtml', 'OPS/text/ch2.xhtml'],
      documents: [{
        path: 'OPS/navigation/nav.xhtml', kind: 'nav',
        xml: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><nav epub:type="toc"><ol><li><a href="../text/ch%201.xhtml">卷一</a><ol><li><a href="../text/ch2.xhtml#sec%202">第二话</a></li><li><a href="https://example.com">外部</a></li></ol></li></ol></nav></html>',
      }],
    });
    expect(entries).toEqual([
      { title: '卷一', depth: 0, target: { chapter: 0, anchor: undefined } },
      { title: '第二话', depth: 1, target: { chapter: 1, anchor: 'sec 2' } },
    ]);
  });

  it('reads the EPUB 2 NCX if the EPUB 3 nav has no usable links', () => {
    expect(epubOutline({
      chapters: ['OPS/text.xhtml'],
      documents: [
        { path: 'OPS/nav.xhtml', kind: 'nav', xml: '<html />' },
        { path: 'OPS/toc.ncx', kind: 'ncx', xml: '<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd"><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint><navLabel><text>序章</text></navLabel><content src="text.xhtml#start"/></navPoint></navMap></ncx>' },
      ],
    })).toEqual([{ title: '序章', depth: 0, target: { chapter: 0, anchor: 'start' } }]);
  });

  it('resolves PDF named and direct destinations in outline order', async () => {
    const pdf = {
      numPages: 12,
      getOutline: async () => [{ title: '第一章', dest: 'start', items: [{ title: '第二节', dest: [8], items: [] }] }],
      getDestination: async () => [{ num: 2, gen: 0 }],
      getPageIndex: async () => 3,
    } as unknown as Parameters<typeof pdfOutline>[0];
    expect(await pdfOutline(pdf)).toEqual([
      { title: '第一章', depth: 0, target: { page: 3 } },
      { title: '第二节', depth: 1, target: { page: 8 } },
    ]);
  });

  it('shows the page code and unpadded reading position, regardless of the image filename', () => {
    expect(readerPageCode(0, 1)).toBe('001');
    expect(readerPageCode(1, 1234)).toBe('0002');
    const onClose = vi.fn();
    const onJump = vi.fn();
    const resource = book(['001.jpg', '000.jpg', '000.webp'], 'folder');
    render(<ReaderOutlineSidebar mobile={false} resource={resource} currentPage={1} onClose={onClose} onJump={onJump} />);
    const dialog = screen.getByRole('dialog', { name: '章节' });
    expect(within(dialog).getByRole('button', { name: '002 2' }).getAttribute('aria-current')).toBe('page');
    expect(within(dialog).getByRole('button', { name: '003 3' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '001 1' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onJump).toHaveBeenCalledWith(0, undefined);
  });

  it('lists only chapter names and their starting pages in the mobile left drawer', () => {
    const resource = book(['第一话/1.jpg', '第一话/2.jpg', '第二话/1.jpg']);
    render(<ReaderOutlineSidebar mobile resource={resource} currentPage={0} onClose={vi.fn()} onJump={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: '章节' });
    const drawer = dialog.closest('.is-side-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer?.classList.contains('reader-outline-drawer')).toBe(true);
    expect(drawer?.classList.contains('is-right-drawer')).toBe(false);
    expect(dialog.querySelector('.mobile-sheet-grab-area')).toBeNull();
    expect(within(dialog).getAllByRole('button')).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: '第二话 第 3 页' })).toBeTruthy();
  });

  it('waits for the document outline before choosing the list to show', async () => {
    const resource: 阅读资源结果 = { ...book(['1', '2']), sourceType: 'pdf' };
    const source = {
      readOutline: async () => [{ title: '序章', depth: 0, target: { page: 1 } }],
      outlinePage: () => 1,
    } as unknown as DocumentSource;
    render(<ReaderOutlineSidebar mobile={false} resource={resource} source={source} currentPage={0} onClose={vi.fn()} onJump={vi.fn()} />);
    const dialog = within(screen.getByRole('dialog', { name: '章节' }));
    expect(dialog.queryAllByRole('button')).toHaveLength(0);
    expect(await dialog.findByRole('button', { name: '序章 第 2 页' })).toBeTruthy();
    expect(dialog.getAllByRole('button')).toHaveLength(1);
  });
});
