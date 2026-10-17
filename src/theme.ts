import type { 主题配色 } from "./types";
import { desktopTypography, DESKTOP_FONT_STANDARD } from '../electron/shared/desktopTypography';

export const 主题选项: ReadonlyArray<{ id: 主题配色; label: string; description: string }> = [
  { id: "mist", label: "雾灰", description: "冷白底色 · 浅灰蓝按钮" },
  { id: "nord", label: "北境", description: "冰雪蓝灰 · 静谧冷色" },
  { id: "sand", label: "暖沙", description: "米白暖灰 · 纸张质感" },
  { id: "night", label: "夜色", description: "深蓝灰底 · 柔和暗色" },
];

export function 应用主题配色(输入: unknown): 主题配色 {
  const 配色 = 主题选项.find((选项) => 选项.id === 输入)?.id ?? "mist";
  document.documentElement.dataset.colorTheme = 配色;
  return 配色;
}

export function applyDesktopTypography(settings: Parameters<typeof desktopTypography>[0]) {
  const sizes = desktopTypography(settings);
  document.documentElement.style.setProperty('--desktop-info-size', sizes.desktopInfoFontSize + 'px');
  document.documentElement.style.setProperty('--desktop-font-factor', String(sizes.desktopGlobalFontSize / DESKTOP_FONT_STANDARD));
  return sizes;
}
