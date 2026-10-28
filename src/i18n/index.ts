import { useEffect, useSyncExternalStore } from 'react';
import { messages } from './messages';
export type AppLanguage = 'zh-CN' | 'en' | 'ja';
const listeners = new Set<() => void>();
const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translations]) => {
  const indices: number[] = [];
  const escaped = key.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { indices.push(Number(part.slice(1, -1))); return '(.*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { expression: new RegExp(`^${escaped}$`), indices, translations };
});
let language: AppLanguage = 'zh-CN';
export function normalizeLanguage(value: unknown): AppLanguage { return value === 'en' || value === 'ja' ? value : 'zh-CN'; }
export function setUiLanguage(value: unknown) {
  const next = normalizeLanguage(value);
  document.documentElement.lang = next;
  if (next === language) return;
  language = next;
  for (const notify of listeners) notify();
}
export function useUiLanguage(mobile: boolean, readSettings = true) {
  const current = useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => language);
  useEffect(() => {
    if (!readSettings) return;
    let live = true;
    void window.omicomic.getAppData().then(result => { if (live && result.ok) setUiLanguage(result.data.settings.language); });
    return () => { live = false; };
  }, [mobile, readSettings]);
  return current;
}
/** Only UI-owned strings enter this function. File names, tags, notes and
 * archive contents are rendered unchanged at their original call sites. */
export function t(text: string): string {
  if (language === 'zh-CN') return text;
  const key = text.trim(), column = language === 'en' ? 0 : 1;
  let translated = messages[key]?.[column];
  if (translated === undefined) for (const pattern of patterns) {
    const match = pattern.expression.exec(key);
    if (!match) continue;
    translated = pattern.translations[column].replace(/\{(\d+)\}/g, (_, index) => match[pattern.indices.indexOf(Number(index)) + 1] ?? '');
    break;
  }
  return translated === undefined ? text : text.replace(key, () => translated!);
}
export function tr(parts: TemplateStringsArray, ...values: unknown[]): string {
  const key = parts.reduce((result, part, index) => result + (index ? `{${index - 1}}` : '') + part, '');
  return t(key).replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)] ?? ''));
}
export function uiOptions<T extends { label: string }>(options: readonly T[]): T[] { return options.map(option => ({ ...option, label: t(option.label) })); }
