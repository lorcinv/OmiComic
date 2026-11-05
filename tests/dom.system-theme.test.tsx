import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { effectiveColorTheme, normalizeThemePreferences } from '../electron/shared/colorTheme';

beforeEach(() => { vi.resetModules(); delete document.documentElement.dataset.colorTheme; });

it('keeps old manual themes and defaults system following to off', () => {
  expect(normalizeThemePreferences({colorTheme:'night'})).toEqual({colorTheme:'night',dayColorTheme:'mist',followSystemTheme:false});
  expect(effectiveColorTheme({colorTheme:'sand'},true)).toBe('sand');
  expect(effectiveColorTheme({colorTheme:'night'},false)).toBe('night');
  expect(normalizeThemePreferences({followSystemTheme:'true',dayColorTheme:'night'}).followSystemTheme).toBe(false);
});

it('returns to the remembered daytime palette after automatic or manual night', () => {
  const preferences={colorTheme:'night',dayColorTheme:'nord',followSystemTheme:true};
  expect(effectiveColorTheme(preferences,false)).toBe('nord');
  expect(effectiveColorTheme(preferences,true)).toBe('night');
  expect(normalizeThemePreferences({...preferences,colorTheme:'sand'}).dayColorTheme).toBe('sand');
});

it('switches on a real system appearance event without overwriting the day choice', async () => {
  let change:()=>void=()=>{};
  const media={matches:false,addEventListener:vi.fn((_type,listener)=>{change=listener;})};
  vi.stubGlobal('matchMedia',()=>media);
  const theme=await import('../src/theme');
  await theme.initializeSystemTheme();
  theme.应用主题设置({colorTheme:'sand',followSystemTheme:true});
  const hook=renderHook(theme.useSystemDarkMode);
  expect(document.documentElement.dataset.colorTheme).toBe('sand');
  act(()=>{media.matches=true;change();});
  expect(hook.result.current).toBe(true);
  expect(document.documentElement.dataset.colorTheme).toBe('night');
  expect(document.documentElement.dataset.dayColorTheme).toBe('sand');
  act(()=>{media.matches=false;change();});
  expect(document.documentElement.dataset.colorTheme).toBe('sand');
  theme.应用主题设置({colorTheme:'nord',followSystemTheme:false});
  act(()=>{media.matches=true;change();});
  expect(document.documentElement.dataset.colorTheme).toBe('nord');
  hook.unmount();vi.unstubAllGlobals();
});

it('reads Android uiMode rather than the fixed light WebView theme', async () => {
  let nativeDark=true;
  vi.doMock('../src/android/bridge',()=>({hasAndroidRenderer:()=>true,androidCall:vi.fn(async()=>nativeDark)}));
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  const theme=await import('../src/theme');
  await theme.initializeSystemTheme();
  theme.应用主题设置({colorTheme:'nord',followSystemTheme:true});
  expect(document.documentElement.dataset.colorTheme).toBe('night');
  nativeDark=false;
  await act(async()=>{window.dispatchEvent(new Event('omi-system-theme-changed'));});
  expect(document.documentElement.dataset.colorTheme).toBe('nord');
  vi.doUnmock('../src/android/bridge');vi.unstubAllGlobals();
});
