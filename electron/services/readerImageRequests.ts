/** IDs belong to a webContents. Cancelling one window cannot stop another's read. */
export class ReaderImageRequests {
  private requests = new Map<string, { session: number; controller: AbortController }>();
  begin(owner: number, id: number, session: number) {
    const key = `${owner}:${id}`, controller = new AbortController();
    this.requests.get(key)?.controller.abort();
    this.requests.set(key, { session, controller });
    return { signal: controller.signal, end: () => { if (this.requests.get(key)?.controller === controller) this.requests.delete(key); } };
  }
  cancel(owner: number, id: unknown) {
    if (typeof id === 'number' && Number.isSafeInteger(id)) { const key=`${owner}:${id}`;this.requests.get(key)?.controller.abort();this.requests.delete(key); }
  }
  retire(session: number) {
    for (const [key,entry] of this.requests) if (entry.session < session) { entry.controller.abort();this.requests.delete(key); }
  }
}
