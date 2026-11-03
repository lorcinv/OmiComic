import { afterEach, expect, it, vi } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import type { NativeCall } from '../src/android/bridge';

afterEach(() => vi.unstubAllGlobals());
const native = vi.fn(async () => null) as unknown as NativeCall;

it('reads exact binary document ranges without sending page bytes through the JSON bridge', async () => {
  const bytes = Uint8Array.from([0, 255, 128, 33]);
  const fetch = vi.fn(async () => new Response(bytes)); vi.stubGlobal('fetch', fetch);
  const api = await createAndroidApi(native);
  const result = await api.readDocumentRange('session/a', 12, 16);
  expect(result).toEqual({ ok: true, data: bytes });
  expect(fetch).toHaveBeenCalledWith('https://omi.local/documents/session%2Fa?begin=12&end=16');
  expect(vi.mocked(native).mock.calls.some(([method]) => method === 'readDocumentRange')).toBe(false);
});

it('rejects truncated binary ranges instead of giving PDF or MOBI a partial page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(2))));
  const api = await createAndroidApi(native);
  expect(await api.readDocumentRange('doc', 0, 3)).toMatchObject({ ok: false, error: { message: '文档读取中断，请重新打开。' } });
});

it('reports a closed native document session as a readable failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
  const api = await createAndroidApi(native);
  expect(await api.readDocumentRange('closed', 0, 1)).toMatchObject({ ok: false, error: { message: '文档读取失败，请重新打开。' } });
});
