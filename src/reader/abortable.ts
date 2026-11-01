/** Release the consumer when it leaves, even if an IPC reply or browser decode
 * never settles. The owner still cancels the underlying work through signal. */
export function abortable<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Reading cancelled', 'AbortError'));
  if (!signal) return run();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Reading cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw new DOMException('Reading cancelled', 'AbortError');
      return run();
    }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
