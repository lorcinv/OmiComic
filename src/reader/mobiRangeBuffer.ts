import { MAX_MOBI_BYTES } from './mobiLimits';

// Palm database offsets are unsigned 32-bit; Android's range endpoint currently
// uses signed integers. File size is separate from the resident parser budget.
export const MAX_MOBI_FILE_BYTES = 0x7fffffff;
export interface MobiBuffer { readonly byteLength: number; slice(begin?: number, end?: number): ArrayBuffer; }
class MissingRange extends Error {
  constructor(readonly begin: number) { super('MOBI range is not resident.'); }
}
const CHUNK = 64 * 1024;

/** An ArrayBuffer-shaped, read-only source for the pinned parser's slice API.
 * Only its record table, text and requested chapter resources become resident.
 * The pinned parser reads record signatures during startup; keep those tiny
 * signatures separately so a large book never has to load all of its images. */
export class MobiRangeBuffer implements MobiBuffer {
  private chunks = new Map<number, Uint8Array>();
  private signatures = new Map<number, ArrayBuffer>();
  private constructor(readonly byteLength: number, private read: (begin: number, end: number) => Promise<Uint8Array>) {}
  static async open(size: number, read: (begin: number, end: number) => Promise<Uint8Array>, signatures?: Uint8Array) {
    if (!Number.isSafeInteger(size) || size < 78 || size > MAX_MOBI_FILE_BYTES) throw Error('MOBI 文件大小无效或超过 2 GiB。');
    const source = new MobiRangeBuffer(size, read);
    const header = new DataView(await source.retry(() => source.slice(0, 78)));
    const count = header.getUint16(76);
    if (count < 2 || count > 20000 || 78 + count * 8 > size) throw Error('MOBI 记录表无效。');
    const table = new DataView(await source.retry(() => source.slice(78, 78 + count * 8)));
    const offsets = Array.from({ length: count }, (_, i) => table.getUint32(i * 8));
    if (offsets.some((offset, i) => offset < 78 + count * 8 || offset >= size || i > 0 && offset <= offsets[i - 1])) throw Error('MOBI 记录范围无效。');
    if(signatures) {
      if(signatures.length!==count*4)throw Error('MOBI 记录签名无效。');
      offsets.forEach((begin,index)=>source.signatures.set(begin,signatures.slice(index*4,index*4+4).buffer));
      return source;
    }
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(8, count) }, async () => {
      while (cursor < count) {
        const index = cursor++, begin = offsets[index], end = Math.min(begin + 4, offsets[index + 1] ?? size);
        const bytes = await read(begin, end);
        if (bytes.length !== end - begin) throw Error('MOBI 文件读取中断。');
        source.signatures.set(begin, Uint8Array.from(bytes).buffer);
      }
    }));
    return source;
  }
  slice(begin = 0, end = this.byteLength): ArrayBuffer {
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end < begin || end > this.byteLength) throw Error('MOBI 记录范围无效。');
    if (end - begin > 16 * 1024 * 1024) throw Error('MOBI 单个资源过大。');
    const signature = this.signatures.get(begin);
    if (end - begin === 4 && signature?.byteLength === 4) return signature.slice(0);
    const result = new Uint8Array(end - begin);
    for (let at = begin; at < end;) {
      const key = Math.floor(at / CHUNK) * CHUNK, chunk = this.chunks.get(key);
      if (!chunk) throw new MissingRange(key);
      this.chunks.delete(key); this.chunks.set(key, chunk);
      const length = Math.min(end - at, chunk.length - (at - key));
      result.set(chunk.subarray(at - key, at - key + length), at - begin); at += length;
    }
    return result.buffer;
  }
  async retry<T>(run: () => T | Promise<T>): Promise<T> {
    for (;;) {
      try { return await run(); }
      catch (error) {
        if (!(error instanceof MissingRange)) throw error;
        const end = Math.min(this.byteLength, error.begin + CHUNK), bytes = await this.read(error.begin, end);
        if (bytes.length !== end - error.begin) throw Error('MOBI 文件读取中断。');
        this.chunks.set(error.begin, bytes);
        while (this.chunks.size * CHUNK > MAX_MOBI_BYTES) this.chunks.delete(this.chunks.keys().next().value!);
      }
    }
  }
}
