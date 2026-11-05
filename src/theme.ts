import type { 主题配色 } from "./types";
import { useSyncExternalStore } from 'react';
import { androidCall, hasAndroidRenderer } from './android/bridge';
import { effectiveColorTheme, normalizeThemePreferences, type ThemePreferences } from '../electron/shared/colorTheme';
export { effectiveColorTheme, normalizeThemePreferences } from '../electron/shared/colorTheme';
import { desktopTypography, mobileTypography, DESKTOP_FONT_STANDARD } from '../electron/shared/desktopTypography';

export const 主题选项: ReadonlyArray<{ id: 主题配色; label: string; description: string }> = [
  { id: "mist", label: "雾灰", description: "冷白底色 · 浅灰蓝按钮" },
  { id: "nord", label: "北境", description: "冰雪蓝灰 · 静谧冷色" },
  { id: "sand", label: "暖沙", description: "米白暖灰 · 纸张质感" },
  { id: "night", label: "夜色", description: "深蓝灰底 · 柔和暗色" },
];

export function 应用主题配色(输入: unknown): 主题配色 {
  const 配色 = 主题选项.find((选项) => 选项.id === 输入)?.id ?? "mist";
  if (document.documentElement.dataset.colorTheme !== 配色) document.documentElement.dataset.colorTheme = 配色;
  return 配色;
}

let preferences: ThemePreferences = {};
let systemDark = false;
let initialized: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSystemDark = () => systemDark;
function updateSystemDark(dark: boolean) {
  if (systemDark === dark) return;
  systemDark = dark;
  应用主题配色(effectiveColorTheme(preferences, systemDark));
  listeners.forEach(listener => listener());
}
export function initializeSystemTheme(): Promise<void> {
  return initialized ??= (async () => {
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
    systemDark = media?.matches === true;
    if (hasAndroidRenderer()) {
      // WebView reports the app's fixed light theme; query Android's actual uiMode.
      const refresh = () => androidCall<boolean>('isSystemDark').then(updateSystemDark).catch(() => undefined);
      window.addEventListener('omi-system-theme-changed', refresh);
      window.addEventListener('omi-app-resume', refresh);
      await refresh();
    } else if (media) {
      const change = () => updateSystemDark(media.matches);
      if (media.addEventListener) media.addEventListener('change', change);
      else media.addListener(change);
    }
  })();
}
export function useSystemDarkMode(): boolean {
  void initializeSystemTheme();
  return useSyncExternalStore(subscribe, getSystemDark, () => false);
}
export function 应用主题设置(settings: ThemePreferences): 主题配色 {
  void initializeSystemTheme();
  preferences = normalizeThemePreferences(settings);
  const root = document.documentElement;
  root.dataset.followSystemTheme = preferences.followSystemTheme ? 'true' : 'false';
  root.dataset.dayColorTheme = String(preferences.dayColorTheme);
  return 应用主题配色(effectiveColorTheme(preferences, systemDark));
}

export function applyDesktopTypography(settings: Parameters<typeof desktopTypography>[0] & Parameters<typeof mobileTypography>[0]) {
  const sizes = desktopTypography(settings);
  document.documentElement.style.setProperty('--desktop-info-size', sizes.desktopInfoFontSize + 'px');
  document.documentElement.style.setProperty('--desktop-font-factor', String(sizes.desktopGlobalFontSize / DESKTOP_FONT_STANDARD));
  const mobile = mobileTypography(settings);
  document.documentElement.style.setProperty('--mobile-info-size', mobile.mobileInfoFontSize + 'px');
  document.documentElement.style.setProperty('--mobile-font-factor', String(mobile.mobileGlobalFontSize / DESKTOP_FONT_STANDARD));
  return sizes;
}
