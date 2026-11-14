const text = (data: Uint8Array, at: number, value: string) =>
  [...value].every((char, index) => data[at + index] === char.charCodeAt(0));
const uint32 = (data: Uint8Array, at: number) => new DataView(data.buffer, data.byteOffset + at, 4).getUint32(0);
const png = (data: Uint8Array) => data.length >= 8 && text(data, 0, '\x89PNG\r\n\x1a\n');

/** undefined means a PNG header is incomplete. Never scan compressed pixels for chunk names. */
export function imageAnimation(data: Uint8Array): boolean | undefined {
  if (text(data, 0, 'GIF87a') || text(data, 0, 'GIF89a')) return true;
  if (data.length >= 30 && text(data, 0, 'RIFF') && text(data, 8, 'WEBP'))
    return text(data, 12, 'VP8X') && (data[20] & 2) !== 0;
  if (!png(data)) return false;
  for (let offset = 8; offset + 8 <= data.length;) {
    const length = uint32(data, offset);
    if (text(data, offset + 4, 'acTL')) return length === 8;
    if (text(data, offset + 4, 'IDAT') || text(data, offset + 4, 'IEND')) return false;
    offset += length + 12;
  }
  return undefined;
}

/** Skip large PNG metadata without reading it into memory. */
export async function probeImageAnimation(read: (offset: number, size: number) => Promise<Uint8Array>, size: number) {
  const header = await read(0, Math.min(size, 32)), known = imageAnimation(header);
  if (known !== undefined) return known;
  for (let offset = 8, chunks = 0; offset + 12 <= size; chunks++) {
    // Pathological metadata should stay on the original-image path, without thousands of extra seeks.
    if (chunks >= 4096) return true;
    const chunk = await read(offset, 8);
    if (chunk.length < 8) return false;
    const length = uint32(chunk, 0);
    if (length > size - offset - 12) return false;
    if (text(chunk, 4, 'acTL')) return length === 8;
    if (text(chunk, 4, 'IDAT') || text(chunk, 4, 'IEND')) return false;
    offset += length + 12;
  }
  return false;
}
