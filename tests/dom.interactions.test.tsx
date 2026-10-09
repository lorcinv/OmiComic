import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../src/App';
import HomePage from '../src/pages/HomePage';
import { installMock } from './mock';

function seed(count = 10000) { installMock({ count }); }
async function openLibrary() {
  seed();
  const view = render(<App />);
  await waitFor(() => expect(document.querySelectorAll('.omi-home__book')).toHaveLength(3));
  fireEvent.click(screen.getByRole('button', { name: '打开资源库', exact: true }));
  await waitFor(() => expect(document.querySelectorAll('.resource-card')).toHaveLength(60));
  return view;
}
async function openDetails() {
  const view = await openLibrary();
  const book = Array.from(document.querySelectorAll<HTMLElement>('.resource-card')).find(card => card.textContent?.includes('Book'));
  expect(book).toBeTruthy();
  fireEvent.click(within(book!).getByRole('button', { name: '打开资源信息' }));
  await waitFor(() => expect(document.querySelectorAll('.resource-detail-thumbnail')).toHaveLength(48));
  return view;
}

describe('OmiComic actual React DOM regressions', () => {
  it('shows exactly the three latest books and branding returns to home', async () => {
    await openLibrary();
    expect(document.querySelector('.omi-home')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OmiComic', exact: true }));
    await waitFor(() => expect(document.querySelectorAll('.omi-home__book')).toHaveLength(3));
    const titles = Array.from(document.querySelectorAll('.omi-home__book-title')).map(node => node.textContent);
    expect(titles).toEqual(['First', 'Second', 'Third']);
  });

  it('navigates an image-less parent normally without showing NO_IMAGES', async () => {
    await openLibrary();
    const parent = Array.from(document.querySelectorAll<HTMLElement>('.resource-card')).find(card => card.textContent?.includes('Parent'));
    expect(parent).toBeTruthy();
    fireEvent.doubleClick(parent!);
    await waitFor(() => expect(document.querySelectorAll('.resource-card')).toHaveLength(1));
    expect(screen.queryByText('未在该文件夹中找到可阅读图片。', { exact: true })).toBeNull();
    expect(document.querySelector('.resource-card')?.textContent).toContain('Nested');
  });

  it('exposes add-tag immediately with no tags and opens its input', async () => {
    await openDetails();
    expect(screen.queryByRole('textbox', { name: '资源简介' })).toBeNull();
    const add = screen.getByRole('button', { name: '添加标签', exact: true });
    expect(add.closest('.resource-detail-direct-tags')).not.toBeNull();
    fireEvent.click(add);
    expect(screen.getByPlaceholderText('输入标签，逗号分隔')).toBeTruthy();
  });

  it('saves and exits the description editor on blank-area click, keeping summary container stable', async () => {
    await openDetails();
    const save = vi.spyOn(window.omicomic, 'updateResourceMeta');
    const container = document.querySelector('.resource-detail-direct-summary')!;
    const editorSection = document.querySelector('.resource-detail-direct-editor')!;
    const paragraph = container.querySelector('p')!;
    fireEvent.doubleClick(paragraph);
    const textarea = screen.getByRole('textbox', { name: '资源简介' });
    expect(textarea.parentElement).toBe(container);
    expect(container.querySelector('.resource-detail-field-label')?.textContent).toBe('简介');
    expect(textarea.getAttribute('rows')).toBe('3');
    fireEvent.change(textarea, { target: { value: '保存我的简介' } });
    fireEvent.pointerDown(editorSection);
    await waitFor(() => expect(screen.queryByRole('textbox', { name: '资源简介' })).toBeNull());
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ note: '保存我的简介' }));
    expect(document.querySelector('.resource-detail-direct-summary')).toBe(container);
    expect(container.querySelector('p')?.textContent).toBe('保存我的简介');
    // This verifies React structure and state, not browser geometry. Playwright covers geometry separately.
  });

  it('mounts only 48 previews for 10,000 pages and next group begins at page 49', async () => {
    await openDetails();
    const first = document.querySelector('.resource-detail-thumbnail')!;
    expect(first.getAttribute('aria-label')).toMatch(/第 1 页/);
    fireEvent.click(screen.getByRole('button', { name: '下一组预览' }));
    await waitFor(() => expect(document.querySelector('.resource-detail-thumbnail')?.getAttribute('aria-label')).toMatch(/第 49 页/));
    expect(document.querySelectorAll('.resource-detail-thumbnail')).toHaveLength(48);
    await waitFor(() => expect((window as any).__previewCalls).toBeGreaterThan(0));
    expect((window as any).__previewCalls).toBeLessThanOrEqual(96);
  });

  it('does not open stale home resume after leaving the page', async () => {
    seed();
    let resolveResource: (value: any) => void = () => {};
    window.omicomic.getResourcePages = () => new Promise(resolve => { resolveResource = resolve; });
    const onOpenReader = vi.fn();
    const view = render(<HomePage refreshToken={0} onBrowse={() => {}} onOpenReader={onOpenReader} />);
    const button = await screen.findByRole('button', { name: /继续阅读 First/ });
    fireEvent.click(button);
    view.unmount();
    resolveResource({ ok: true, data: { sourceType: 'folder', pages: [{ index: 0 }] } });
    await Promise.resolve();
    await Promise.resolve();
    expect(onOpenReader).not.toHaveBeenCalled();
  });

  it('offers a real library action with an empty reading history', async () => {
    seed();
    const original = await window.omicomic.getAppData();
    if (!original.ok) throw new Error('Fixture failed');
    window.omicomic.getAppData = async () => ({ ok: true, data: { ...original.data, recentOpened: [] } });
    const onBrowse = vi.fn();
    render(<HomePage refreshToken={0} onBrowse={onBrowse} onOpenReader={() => {}} />);
    await screen.findByText('你的故事，即将开始');
    expect(document.querySelectorAll('.omi-home__book')).toHaveLength(0);
    fireEvent.click(within(document.querySelector('.omi-home__empty') as HTMLElement).getByRole('button', { name: '打开资源库', exact: true }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });

  it('preserves a saved PDF page before document metadata is parsed', async () => {
    seed();
    const original = await window.omicomic.getAppData();
    if (!original.ok) throw new Error('Fixture failed');
    const recent = { ...original.data.recentOpened[0], sourceType: 'pdf' as const, currentPageIndex: 120 };
    window.omicomic.getAppData = async () => ({ ok: true, data: { ...original.data, recentOpened: [recent] } });
    window.omicomic.getResourcePages = async () => ({ ok: true, data: { key: 'pdf:test', resourceKey: 'pdf:test', title: 'First', sourceType: 'pdf', sourcePath: '/first.pdf', total: 0, pages: [] } });
    const onOpenReader = vi.fn();
    render(<HomePage refreshToken={0} onBrowse={() => {}} onOpenReader={onOpenReader} />);
    fireEvent.click(await screen.findByRole('button', { name: /继续阅读 First/ }));
    await waitFor(() => expect(onOpenReader).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'pdf' }), 120));
  });

});
