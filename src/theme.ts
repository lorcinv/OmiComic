import type { 主题配色 } from "./types";

export const 主题选项: ReadonlyArray<{ id: 主题配色; label: string; description: string }> = [
  { id: "mist", label: "经典雾灰", description: "清透冷灰 · 原有配色" },
  { id: "nord", label: "北境雾蓝", description: "冰川蓝灰 · 安静清爽" },
  { id: "sand", label: "暖砂", description: "米白暖灰 · 纸张质感" },
  { id: "night", label: "暮夜灰", description: "深蓝灰底 · 柔和暗色" },
];

export function 应用主题配色(输入: unknown): 主题配色 {
  const 配色 = 主题选项.find((选项) => 选项.id === 输入)?.id ?? "mist";
  document.documentElement.dataset.colorTheme = 配色;
  return 配色;
}
