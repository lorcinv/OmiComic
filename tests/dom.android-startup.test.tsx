import { afterEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const control = vi.hoisted(() => ({
  connect: vi.fn(), createApi: vi.fn(), render: vi.fn(), moduleLoaded: false,
}));
vi.mock('../src/App', () => ({ default: () => null }));
vi.mock('react-dom/client', () => ({ default: { createRoot: () => ({ render: control.render }) } }));
vi.mock('../src/android/bridge', () => ({ connectAndroid: control.connect }));
vi.mock('../src/android/data', () => {
  control.moduleLoaded = true;
  return { createAndroidApi: control.createApi };
});

afterEach(() => { vi.unstubAllEnvs(); document.documentElement.removeAttribute('data-platform'); });

it('loads the Android API during the native connection without starting the UI early', async () => {
  vi.stubEnv('MODE', 'android');
  let finish!: (native: any) => void;
  control.connect.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const native = vi.fn(), api = {};
  control.createApi.mockResolvedValue(api);
  document.body.innerHTML = '<div id="root"></div>';
  await import('../src/main');
  await waitFor(() => expect(control.moduleLoaded).toBe(true));
  expect(control.connect).toHaveBeenCalledOnce();
  expect(control.createApi).not.toHaveBeenCalled();
  expect(control.render).not.toHaveBeenCalled();
  finish(native);
  await waitFor(() => expect(control.render).toHaveBeenCalledOnce());
  expect(control.createApi).toHaveBeenCalledWith(native);
  expect(window.omicomic).toBe(api);
});
