import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';
import { installMock } from './mock';
import { setUiLanguage } from '../src/i18n';

const control = vi.hoisted(() => ({ ready: null as null | (() => void), progress: true }));
vi.mock('../src/pages/ReaderPage', async () => {
  const React = await import('react');
  return { default: (props: any) => {
    React.useEffect(() => { control.ready = props.onReady; }, [props.onReady]);
    control.progress = props.recordProgress;
    return <section data-testid="prepared-reader">{props.resource?.title}</section>;
  } };
});
afterEach(() => { control.ready = null; delete document.documentElement.dataset.randomBrowse; });
async function open(sourceType = 'folder') {
  installMock({ count: 3 }); setUiLanguage('zh-CN');
  if (sourceType !== 'folder') {
    const getPages = window.omicomic.getResourcePages;
    window.omicomic.getResourcePages = async input => {
      const result = await getPages(input);
      if (result.ok) result.data.sourceType = sourceType as any;
      return result;
    };
  }
  render(<App />);
  await waitFor(() => expect(document.querySelector('.omi-home__book')).not.toBeNull());
  fireEvent.doubleClick(document.querySelector('.omi-home__book')!);
  await waitFor(() => expect(document.querySelector('[data-testid="prepared-reader"]')).not.toBeNull());
  return document.querySelector('[data-testid="prepared-reader"]');
}
it('keeps the outgoing PC screen until the image is ready, then reveals the same reader node', async () => {
  const node = await open(); expect(control.progress).toBe(false);
  expect(document.querySelector('.omi-home')).not.toBeNull();
  expect(document.querySelector('.mobile-reader-preparing')).not.toBeNull();
  await act(async () => control.ready?.());
  await waitFor(() => expect(document.querySelector('.page-panel.is-visible [data-testid="prepared-reader"]')).toBe(node));
  expect(control.progress).toBe(true); expect(document.querySelector('.mobile-reader-preparing')).toBeNull();
});
it('preserves the prepared entry flow for documents', async () => {
  const node = await open('pdf');
  expect(control.progress).toBe(false);
  expect(document.querySelector('.mobile-reader-preparing')).not.toBeNull();
  expect(document.querySelector('.omi-home')).not.toBeNull();
  await act(async () => control.ready?.());
  await waitFor(() => expect(document.querySelector('.page-panel.is-visible [data-testid="prepared-reader"]')).toBe(node));
  expect(control.progress).toBe(true);
});
it('Escape cancels a pending PC entry and ignores a late readiness signal', async () => {
  await open(); const ready = control.ready;
  fireEvent.keyDown(window, { key: 'Escape' });
  await act(async () => ready?.());
  expect(document.querySelector('.omi-home')).not.toBeNull();
  expect(document.querySelector('[data-testid="prepared-reader"]')).toBeNull();
});
it('new pointer input can cancel a PC entry while its outgoing screen is retained', async () => {
  await open(); const ready = control.ready;
  fireEvent.pointerDown(document.querySelector('[data-testid="prepared-reader"]')!);
  expect(control.progress).toBe(false);
  await act(async () => ready?.());
  expect(document.querySelector('.page-panel.is-visible [data-testid="prepared-reader"]')).toBeNull();
  expect(document.querySelector('.omi-home')).not.toBeNull();
  expect(document.querySelector('.mobile-reader-preparing')).toBeNull();
});
