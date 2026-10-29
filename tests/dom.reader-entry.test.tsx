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
async function open() {
  installMock({ count: 3 }); setUiLanguage('zh-CN');
  render(<App />);
  await waitFor(() => expect(document.querySelector('.omi-home__book')).not.toBeNull());
  fireEvent.doubleClick(document.querySelector('.omi-home__book')!);
  await waitFor(() => expect(document.querySelector('.mobile-reader-preparing')).not.toBeNull());
  return document.querySelector('[data-testid="prepared-reader"]');
}
it('reveals the same prepared PC reader and records progress only after it becomes visible', async () => {
  const node = await open(); expect(control.progress).toBe(false);
  expect(document.querySelector('.omi-home')).not.toBeNull();
  await act(async () => control.ready?.());
  await waitFor(() => expect(document.querySelector('.page-panel.is-visible [data-testid="prepared-reader"]')).toBe(node));
  expect(control.progress).toBe(true); expect(document.querySelector('.mobile-reader-preparing')).toBeNull();
});
it('Escape cancels a pending PC entry and ignores a late readiness signal', async () => {
  await open(); const ready = control.ready;
  fireEvent.keyDown(window, { key: 'Escape' });
  await act(async () => ready?.());
  expect(document.querySelector('.omi-home')).not.toBeNull();
  expect(document.querySelector('[data-testid="prepared-reader"]')).toBeNull();
});
it('another pointer action cancels a pending PC entry', async () => {
  await open(); const ready = control.ready;
  fireEvent.pointerDown(document.body);
  await act(async () => ready?.());
  expect(document.querySelector('.omi-home')).not.toBeNull();
  expect(document.querySelector('.mobile-reader-preparing')).toBeNull();
});
