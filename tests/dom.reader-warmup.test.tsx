import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import HomePage from '../src/pages/HomePage';
import LibraryPage from '../src/pages/LibraryPage';
import { warmReader } from '../src/reader/loadReader';
import { setUiLanguage } from '../src/i18n';
import { installMock } from './mock';

vi.mock('../src/reader/loadReader', () => ({ warmReader: vi.fn() }));

for (const entry of ['home', 'library'] as const) it(`${entry} starts the reader module while the manifest is still pending`, async () => {
  installMock({ count: 3 }); setUiLanguage('zh-CN');
  vi.mocked(warmReader).mockClear();
  const getPages = window.omicomic.getResourcePages;
  let finish!: () => void;
  const held = new Promise<void>(resolve => { finish = resolve; });
  const read = vi.spyOn(window.omicomic, 'getResourcePages').mockImplementation(async input => {
    await held;
    return getPages(input);
  });
  const opened = vi.fn();
  if (entry === 'home') {
    render(<HomePage refreshToken={0} onBrowse={() => {}} onSettings={() => {}} onOpenReader={opened} />);
    const button = await screen.findByRole('button', { name: '继续上次阅读', exact: true });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
  } else {
    render(<LibraryPage refreshToken={0} isActive onHome={() => {}} onOpenReader={opened} />);
    await waitFor(() => expect(document.querySelector('.resource-card')).not.toBeNull());
    fireEvent.doubleClick(document.querySelector('.resource-card')!);
  }
  await waitFor(() => expect(read).toHaveBeenCalledOnce());
  expect(warmReader).toHaveBeenCalledOnce();
  expect(opened).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  await waitFor(() => expect(opened).toHaveBeenCalledOnce());
});
