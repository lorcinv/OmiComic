import './pressFeedback';
// System WebView can be much older than Android. Keep native implementations
// when present, and install the same small shims before document code in workers.
import './webviewCapabilities';
import 'core-js/actual/promise/with-resolvers';
import 'core-js/actual/promise/try';
import 'core-js/actual/structured-clone';

if (typeof AbortSignal !== 'undefined') {
  if (!('reason' in AbortSignal.prototype)) {
    const reasons = new WeakMap<AbortSignal, unknown>();
    const original = AbortController.prototype.abort;
    Object.defineProperty(AbortSignal.prototype, 'reason', {
      configurable: true, get(this: AbortSignal) { return this.aborted ? reasons.get(this) : undefined; },
    });
    AbortController.prototype.abort = function(reason = new DOMException('The operation was aborted.', 'AbortError')) {
      if (!this.signal.aborted) reasons.set(this.signal, reason);
      original.call(this, reason);
    };
  }
  if (!AbortSignal.prototype.throwIfAborted) {
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
      configurable: true, writable: true,
      value(this: AbortSignal) {
        if (this.aborted) throw this.reason ?? new DOMException('The operation was aborted.', 'AbortError');
      },
    });
  }
  if (!AbortSignal.any) {
    Object.defineProperty(AbortSignal, 'any', {
      configurable: true, writable: true,
      value(signals: Iterable<AbortSignal>) {
        const inputs = [...new Set(signals)];
        const controller = new AbortController();
        const listeners = new Map<AbortSignal, () => void>();
        const abort = (signal: AbortSignal) => {
          controller.abort(signal.reason);
          for (const [input, listener] of listeners) input.removeEventListener('abort', listener);
          listeners.clear();
        };
        for (const signal of inputs) {
          if (!(signal instanceof AbortSignal)) throw new TypeError('Expected an AbortSignal.');
        }
        const aborted = inputs.find(signal => signal.aborted);
        if (aborted) abort(aborted);
        else for (const signal of inputs) {
          const listener = () => abort(signal);
          listeners.set(signal, listener);
          signal.addEventListener('abort', listener, { once: true });
        }
        return controller.signal;
      },
    });
  }
}
