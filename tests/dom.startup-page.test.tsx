import { describe, expect, it } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import type { NativeCall } from '../src/android/bridge';
import { effectiveStartupPage } from '../electron/shared/startupPage';

describe('Android startup preference storage', () => {
  it('retains legacy home visibility and saves each tab through a native storage restart', async () => {
    let stored: any = { settings: { showHomePage: false } };
    const native: NativeCall = async (method, args: any) => {
      if (method === 'loadData') return structuredClone(stored);
      if (method === 'saveData') stored = structuredClone(args.data);
      return null as any;
    };
    let api = await createAndroidApi(native);
    let result = await api.getAppData();
    if (!result.ok) throw Error('fixture');
    expect(effectiveStartupPage(result.data.settings)).toBe('directory');
    for (const startupPage of ['bookshelf','favorites','bookmarks','recent','directory','home'] as const) {
      await api.updateSettings({ startupPage, showHomePage: true });
      api = await createAndroidApi(native); result = await api.getAppData();
      if (!result.ok) throw Error('fixture');
      expect(result.data.settings.startupPage).toBe(startupPage);
      expect(effectiveStartupPage(result.data.settings)).toBe(startupPage);
    }
    stored.settings.startupPage = 'invalid'; stored.settings.showHomePage = false;
    api = await createAndroidApi(native); result = await api.getAppData();
    if (!result.ok) throw Error('fixture');
    expect(effectiveStartupPage(result.data.settings)).toBe('directory');
  });
});
