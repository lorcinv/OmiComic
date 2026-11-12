import type { NativeCall } from '../android/bridge';

export function connectIOS(): NativeCall {
  const handler = (window as unknown as { webkit?: { messageHandlers?: { omi?: { postMessage(body: unknown): Promise<unknown> } } } }).webkit?.messageHandlers?.omi;
  if (!handler) throw new Error('请在 OmiComic iOS 应用中打开。');
  // Custom-scheme pages do not expose randomUUID on every supported WebKit.
  if (!crypto.randomUUID) Object.defineProperty(crypto, 'randomUUID', { value: () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  } });
  const native: NativeCall = async <T>(method: string, args: unknown = {}) => await handler.postMessage({ method, args }) as T;
  const syncChrome = () => { void native('setColorTheme', { theme: document.documentElement.dataset.colorTheme ?? 'mist' }).catch(() => undefined); };
  new MutationObserver(syncChrome).observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-theme'] });
  syncChrome();
  return native;
}
