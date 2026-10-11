export type NativeCall = <T>(method: string, args?: unknown) => Promise<T>;

/** The native port is transferred only to the trusted top-level origin. No JS interface is exposed to EPUB frames. */
export function connectAndroid(): Promise<NativeCall> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Android 文件服务未连接，请重新打开应用。")), 15000);
    window.addEventListener("message", function receive(event: MessageEvent) {
      if (event.data !== "omi-native" || !event.ports[0]) return;
      window.removeEventListener("message", receive);
      clearTimeout(timer);
      const port = event.ports[0];
      let sequence = 0;
      const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: number }>();
      port.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.event) { window.dispatchEvent(new CustomEvent(`omi-${message.event}`)); return; }
        const callback = pending.get(message.id);
        if (!callback) return;
        clearTimeout(callback.timer); pending.delete(message.id);
        if (message.error) callback.reject(new Error(message.error));
        else callback.resolve(message.data);
      };
      port.start();
      resolve(<T>(method: string, args: unknown = {}) => new Promise<T>((resolveCall, rejectCall) => {
        const id = ++sequence;
        const timer = window.setTimeout(() => { pending.delete(id); rejectCall(new Error("操作超时，请重试。")); }, method.startsWith("choose") ? 600000 : 120000);
        pending.set(id, { resolve: value => resolveCall(value as T), reject: rejectCall, timer });
        port.postMessage(JSON.stringify({ id, method, args }));
      }));
    });
  });
}
