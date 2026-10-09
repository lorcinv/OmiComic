/** Reject oversized raster surfaces before passing untrusted EPUB images to Chromium. */
export function safeRasterImage(data: Buffer): boolean {
  let width = 0; let height = 0;
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (data.length >= 10 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString("ascii"))) {
    width = data.readUInt16LE(6); height = data.readUInt16LE(8);
  } else if (data.length >= 26 && data.subarray(0, 2).toString("ascii") === "BM") {
    width = Math.abs(data.readInt32LE(18)); height = Math.abs(data.readInt32LE(22));
  } else if (data.length >= 30 && data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") {
    const format = data.subarray(12, 16).toString();
    if (format === "VP8X") { width = 1 + data.readUIntLE(24, 3); height = 1 + data.readUIntLE(27, 3); }
    else if (format === "VP8 " && data[23] === 0x9d && data[24] === 1 && data[25] === 0x2a) { width = data.readUInt16LE(26) & 0x3fff; height = data.readUInt16LE(28) & 0x3fff; }
    else if (format === "VP8L" && data[20] === 0x2f) { width = 1 + data[21] + ((data[22] & 0x3f) << 8); height = 1 + (data[22] >> 6) + (data[23] << 2) + ((data[24] & 15) << 10); }
  } else if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
    while (offset + 8 < data.length) {
      if (data[offset++] !== 0xff) continue;
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > data.length) break;
      const size = data.readUInt16BE(offset);
      if (size < 2 || offset + size > data.length) break;
      if (sof.has(marker) && size >= 7) { height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break; }
      offset += size;
    }
  }
  return width > 0 && height > 0 && width <= 16384 && height <= 16384 && width * height <= 16_000_000;
}
