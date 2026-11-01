/** Coalesce archive bytes without making one reader own every subscriber.
 * Cancel the decoder only after the last interested consumer has left. */
export class SharedImageRead {
  private work?: { controller: AbortController; promise: Promise<Buffer>; users: number };
  read(load: (signal: AbortSignal) => Promise<Buffer>, signal?: AbortSignal): Promise<Buffer> {
    if (signal?.aborted) return Promise.reject(new DOMException('Image read cancelled', 'AbortError'));
    let work = this.work;
    if (!work || work.controller.signal.aborted) {
      const controller = new AbortController();
      const next = { controller, users: 0, promise: Promise.resolve().then(() => { controller.signal.throwIfAborted(); return load(controller.signal); }) };
      next.promise = next.promise.finally(() => { if (this.work === next) this.work = undefined; });
      this.work = work = next;
    }
    const current = work; current.users++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error?: unknown, buffer?: Buffer) => {
        if (finished) return; finished = true;
        signal?.removeEventListener('abort', abort);
        if (--current.users === 0 && this.work === current) current.controller.abort();
        if (error) reject(error); else resolve(buffer!);
      };
      const abort = () => finish(new DOMException('Image read cancelled', 'AbortError'));
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(buffer => finish(undefined, buffer), error => finish(error));
    });
  }
}
