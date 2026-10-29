import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DesktopDirectoryDrop from '../src/components/DesktopDirectoryDrop';
import { installMock } from './mock';
import { setUiLanguage } from '../src/i18n';

const file = () => new File(['native path is resolved by preload'], 'Comics');
const transfer = (files: File[]) => ({ types: ['Files'], files, dropEffect: 'none' });
afterEach(() => { delete document.documentElement.dataset.platform; setUiLanguage('zh-CN'); });

it('handles native file drops globally, displays feedback and preserves internal text drags', async () => {
  installMock({ count: 0 });
  const importDirectory = vi.fn(async () => ({ ok: true as const, data: { root: { path: 'D:/Comics', name: 'Comics', addedAt: 1, lastOpenedAt: 1 }, alreadyAdded: false } }));
  window.omicomic.importDroppedDirectory = importDirectory;
  const onAdded = vi.fn(); render(<DesktopDirectoryDrop onAdded={onAdded} />);
  const data = transfer([file()]);
  fireEvent.dragEnter(document.body, { dataTransfer: data });
  expect(document.querySelector('.directory-drop-overlay')).not.toBeNull();
  expect(fireEvent.dragOver(document.body, { dataTransfer: data })).toBe(false);
  fireEvent.drop(document.body, { dataTransfer: data });
  await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
  expect(importDirectory).toHaveBeenCalledWith(data.files[0]);
  expect(screen.getByRole('status').querySelector('span')?.textContent).toBe('目录已加入资源库');
  expect(document.querySelector('.directory-drop-overlay')).toBeNull();
  expect(fireEvent.dragOver(document.body, { dataTransfer: { types: ['text/plain'] } })).toBe(true);
  fireEvent.dragEnter(document.body, { dataTransfer: data }); fireEvent.blur(window);
  expect(document.querySelector('.directory-drop-overlay')).toBeNull();
});

it('rejects multiple drops and avoids overlapping writes; duplicates do not refresh or navigate', async () => {
  installMock({ count: 0 });
  let resolve!: (result: any) => void;
  const importDirectory = vi.fn(() => new Promise<any>(done => { resolve = done; }));
  window.omicomic.importDroppedDirectory = importDirectory;
  const onAdded = vi.fn(); render(<DesktopDirectoryDrop onAdded={onAdded} />);
  fireEvent.drop(document.body, { dataTransfer: transfer([file(), file()]) });
  expect(importDirectory).not.toHaveBeenCalled();
  expect(screen.getByRole('status').querySelector('span')?.textContent).toBe('请每次拖入一个文件夹');
  fireEvent.drop(document.body, { dataTransfer: transfer([file()]) });
  fireEvent.drop(document.body, { dataTransfer: transfer([file()]) });
  expect(importDirectory).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ ok: true, data: { root: {}, alreadyAdded: true } }));
  expect(onAdded).not.toHaveBeenCalled();
  expect(screen.getByRole('status').querySelector('span')?.textContent).toBe('该目录已在资源库中');
});

it('also handles EPUB frame drops and removes listeners when unmounted', async () => {
  installMock({ count: 0 });
  const importDirectory = vi.fn(async () => ({ ok: false as const, error: { code: 'INVALID', message: '请从文件管理器拖入单个文件夹。' } }));
  window.omicomic.importDroppedDirectory = importDirectory;
  const onAdded = vi.fn(), view = render(<DesktopDirectoryDrop onAdded={onAdded} />);
  const frame = document.createElement('iframe'); document.body.append(frame);
  await act(async () => { await Promise.resolve(); });
  fireEvent.load(frame);
  fireEvent.drop(frame.contentDocument!.body, { dataTransfer: transfer([file()]) });
  await waitFor(() => expect(importDirectory).toHaveBeenCalledTimes(1));
  expect(onAdded).not.toHaveBeenCalled();
  view.unmount();
  expect(fireEvent.dragOver(frame.contentDocument!.body, { dataTransfer: transfer([file()]) })).toBe(true);
  frame.remove();
});

it('leaves Android native gestures alone even if a desktop method is present', () => {
  installMock({ count: 0 }); document.documentElement.dataset.platform = 'android';
  window.omicomic.importDroppedDirectory = vi.fn(); render(<DesktopDirectoryDrop onAdded={vi.fn()} />);
  expect(fireEvent.drop(document.body, { dataTransfer: transfer([file()]) })).toBe(true);
  expect(window.omicomic.importDroppedDirectory).not.toHaveBeenCalled();
});
