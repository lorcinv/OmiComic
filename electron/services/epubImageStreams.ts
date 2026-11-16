import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { Readable, Transform, pipeline } from 'node:stream';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';

export const MAX_EPUB_ANIMATION_BYTES = 256 * 1024 ** 2;
export interface EPUBImageReference { id: string; name: string; mime: string; bytes: number }
const stamp = (info: { size: number; mtimeMs: number; ctimeMs: number }) => `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
type Session = { file: string; signature: Promise<string>; images: Map<string, EPUBImageReference>; active: Set<Transform> };
const sessions = new Map<string, Session>();

/** Only resources validated by the EPUB worker get an opaque, session-scoped URL. */
export function createEpubImageSession(file: string) {
  const id = randomUUID(), session: Session = { file, signature: stat(file).then(stamp), images: new Map(), active: new Set() };
  session.signature.catch(() => undefined); sessions.set(id, session);
  return {
    base: `omicomic-image://epub/${id}/`,
    register(images: EPUBImageReference[]) {
      if (!sessions.has(id)) throw Error('EPUB 已关闭。');
      for (const image of images) {
        if (!/^[\da-f-]{36}$/.test(image.id) || !/^image\/(gif|webp|png)$/.test(image.mime) || !Number.isSafeInteger(image.bytes) || image.bytes < 1 || image.bytes > MAX_EPUB_ANIMATION_BYTES || image.name.split('/').some(part => part === '..') || /[\\\0]/.test(image.name) || image.name.startsWith('/')) throw Error('EPUB 图片引用无效。');
        if (!session.images.has(image.id) && session.images.size >= 20000) throw Error('EPUB 图片过多。');
        session.images.set(image.id, image);
      }
    },
    close() { sessions.delete(id); for (const stream of session.active) stream.destroy(Error('EPUB 已关闭。')); session.active.clear(); },
  };
}

export async function epubImageResponse(url: URL, signal?: AbortSignal): Promise<Response> {
  const [, sessionId, imageId, extra] = url.pathname.split('/');
  const session = sessions.get(sessionId), image = session?.images.get(imageId);
  if (url.hostname !== 'epub' || extra !== undefined || !session || !image) return new Response(null, { status: 404 });
  if (stamp(await stat(session.file)) !== await session.signature) return new Response(null, { status: 410 });
  signal?.throwIfAborted();
  const zip = await yauzl.openPromise(session.file, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true });
  try {
    let count = 0;
    for await (const entry of zip.eachEntry()) {
      if (++count > 20000) throw Error('EPUB 条目过多。');
      if (entry.fileName !== image.name) continue;
      if (entry.isEncrypted() || entry.uncompressedSize !== image.bytes || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 1000) throw Error('EPUB 图片已改变或超过安全上限。');
      signal?.throwIfAborted();
      const source = await zip.openReadStreamPromise(entry);
      let bytes = 0, checksum = 0;
      const stream = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          bytes += chunk.length;
          if (bytes > image.bytes || bytes > MAX_EPUB_ANIMATION_BYTES) { done(Error('EPUB 动图超过 256 MiB 读取上限。')); return; }
          checksum = crc32(chunk, checksum); done(null, chunk);
        },
        flush(done) { done(bytes === image.bytes && checksum === entry.crc32 ? undefined : Error('EPUB 图片数据不完整或校验失败。')); },
      });
      const abort = () => stream.destroy(Error('图片读取已取消。'));
      session.active.add(stream); signal?.addEventListener('abort', abort, { once: true });
      pipeline(source, stream, () => { signal?.removeEventListener('abort', abort); session.active.delete(stream); zip.close(); });
      if (signal?.aborted || !sessions.has(sessionId)) abort();
      return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers: {
        'Content-Type': image.mime, 'Content-Length': String(image.bytes), 'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    zip.close(); return new Response(null, { status: 404 });
  } catch (error) { zip.close(); throw error; }
}
